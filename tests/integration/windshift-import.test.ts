import { eq, inArray, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { projects, taskEvents, taskImports, taskProjects, tasks } from "@/db/schema";
import type { Actor } from "@/server/actor";
import {
  createMobileUnit,
  createProject,
  createStatus,
  listStatuses,
} from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { createTask, docText } from "@/server/services/tasks";
import { type WsExport, type WsItem, importWindshift } from "@/server/services/windshift-import";

// ADR-056 — exportação fictícia; ids de origem únicos por execução (o banco de teste persiste)
const system: Actor = { kind: "system" };
const run = Date.now();
const p1 = `WA${run % 1e8}`;
const p2 = `WB${run % 1e8}`;
const u1 = `UA${run % 1e8}`;
const u2 = `UB${run % 1e8}`;
let email: string;
let next = run * 10;

const fields: WsExport["customFields"] = [
  {
    id: 1,
    name: "Projetos/Clientes",
    // como na REST v1: texto JSON
    options: JSON.stringify({
      items: [
        { id: 1, label: p1 },
        { id: 2, label: p2 },
        { id: 3, label: "NAOEXISTE" },
      ],
    }),
  },
  {
    id: 4,
    name: "Unidade Móvel",
    options: {
      items: [
        { id: 1, label: u1 },
        { id: 2, label: u2 },
      ],
    },
  },
];
const ref = (name: string, builtin_key = name.toLowerCase()) => ({ id: 1, name, builtin_key });
const item = (over: Partial<WsItem> = {}): WsItem => {
  const id = next++;
  return {
    id,
    key: `TI-${id}`,
    title: `Importada ${id}`,
    description: "Linha um\n\nLinha dois\n",
    created_at: "2026-10-14T19:10:17Z",
    status: ref("Backlog"),
    priority: ref("Medium"),
    item_type: ref("Story"),
    assignee: { email, full_name: "Fulana" },
    custom_fields: { "1": [1], "2": "", "3": "", "4": [1] },
    ...over,
  };
};
const exp = (items: WsItem[]): WsExport => ({ items, customFields: fields });

async function jobsFor(taskIds: string[]) {
  const events = await db
    .select({ id: taskEvents.id })
    .from(taskEvents)
    .where(inArray(taskEvents.taskId, taskIds));
  const ids = events.map((e) => e.id);
  // sem nenhuma escrita anterior o schema pgboss ainda não existe: nada enfileirado
  const { rows: exists } = await db.execute<{ t: string | null }>(
    sql`SELECT to_regclass('pgboss.job')::text AS t`,
  );
  if (!exists[0].t) return 0;
  const { rows } = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM pgboss.job
        WHERE name IN ('notification.fanout', 'automation.evaluate')
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(data->'eventIds') e WHERE e = ANY(${`{${ids.join(",")}}`}::text[]))`,
  );
  return rows[0].n;
}
const taskOf = async (sourceId: number) => {
  const [row] = await db
    .select({ task: tasks })
    .from(taskImports)
    .innerJoin(tasks, eq(tasks.id, taskImports.taskId))
    .where(eq(taskImports.sourceId, String(sourceId)));
  return row?.task ?? null;
};

beforeAll(async () => {
  email = `importada-${run}@t.test`;
  await createMember(system, {
    name: "Fulana",
    email,
    password: "senha-de-teste-123",
    role: "member",
  });
  // creatorFor(system) precisa de um admin
  await createMember(system, {
    name: "Admin Import",
    email: `admin-import-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "admin",
  });
  const a = await createProject(system, { code: p1, name: `Import ${p1}`, kind: "project" });
  const b = await createProject(system, { code: p2, name: `Import ${p2}`, kind: "project" });
  await createMobileUnit(system, { code: u1, projectId: a.id });
  await createMobileUnit(system, { code: u2, projectId: b.id });
  const [acl] = await db.select().from(projects).where(eq(projects.code, "ACL"));
  if (!acl) await createProject(system, { code: "ACL", name: "A classificar", kind: "internal" });
  const existing = await listStatuses(system);
  for (const category of ["backlog", "todo", "in_progress", "done"] as const)
    if (!existing.some((s) => s.category === category && !s.archivedAt))
      await createStatus(system, { name: `${category} ${run}`, category });
});

it("só as abertas entram; Epic fica fora e a filha leva o título dela; silencioso", async () => {
  const epic = item({ item_type: ref("Epic"), title: "Implantação" });
  const child = item({ parent_id: epic.id, parent_title: epic.title });
  const doing = item({ status: ref("In Progress"), priority: ref("High") });
  const closed = item({ status: ref("Done") });

  const r = await importWindshift(system, exp([epic, child, doing, closed]));
  expect(r.errors).toEqual([]);
  expect(r.imported).toBe(2);
  expect(r.ignored.map((i) => i.key)).toEqual([epic.key]);
  expect(await taskOf(epic.id)).toBeNull();
  expect(await taskOf(closed.id)).toBeNull();

  const t = (await taskOf(child.id))!;
  const text = docText(t.descriptionJson);
  expect(text).toContain("Linha dois");
  expect(text).toContain("Epic no Windshift: Implantação");
  expect(text).toContain(
    `Importada do Windshift — ${child.key} (ID ${child.id}), criada em 14/10/2026`,
  );
  expect(t.priority).toBe("medium");
  expect(t.assigneeId).not.toBeNull();
  expect((await taskOf(doing.id))!.priority).toBe("high");

  const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, t.id));
  expect(events.map((e) => [e.type, e.actorKind])).toEqual([
    ["created", "system"],
    ["imported", "system"],
  ]);
  expect(await jobsFor([t.id, (await taskOf(doing.id))!.id])).toBe(0);
  // controle: a mesma consulta enxerga os jobs de uma criação comum
  const normal = await createTask(system, { title: "Comum", projectIds: [t.projectId] });
  expect(await jobsFor([normal.id])).toBeGreaterThan(0);
});

it("sem Projeto/Cliente vai para ACL; responsável desconhecido não bloqueia", async () => {
  const orphan = item({
    custom_fields: { "Projetos/Clientes": [] },
    assignee: { email: "ninguem@t.test" },
  });
  const r = await importWindshift(system, exp([orphan]));
  expect(r.inFallback).toBe(1);
  expect(r.assigneeNotFound).toEqual([{ key: orphan.key, email: "ninguem@t.test" }]);
  const t = (await taskOf(orphan.id))!;
  const [acl] = await db.select().from(projects).where(eq(projects.code, "ACL"));
  expect(t.projectId).toBe(acl.id);
  expect(t.assigneeId).toBeNull();
});

it("um erro em qualquer tarefa não grava nenhuma", async () => {
  const ok = item();
  const badProject = item({ custom_fields: { "1": [3] } });
  const unitOutside = item({ custom_fields: { "1": [1], "4": [2] } }); // UB é de p2 (ADR-045)
  const badStatus = item({ status: ref("Revisão") });
  const before = await db.select({ n: sql<number>`count(*)::int` }).from(taskProjects);

  const r = await importWindshift(system, exp([ok, badProject, unitOutside, badStatus]));
  expect(r.errors.map((e) => e.key)).toEqual([badProject.key, unitOutside.key, badStatus.key]);
  expect(r.imported).toBe(0);
  expect(await taskOf(ok.id)).toBeNull();
  const after = await db.select({ n: sql<number>`count(*)::int` }).from(taskProjects);
  expect(after[0].n).toBe(before[0].n);
});

it("--dry-run não grava; a segunda execução pula as que já entraram", async () => {
  const a = item();
  const b = item();
  const preview = await importWindshift(system, exp([a, b]), { dryRun: true });
  expect(preview.rows).toHaveLength(2);
  expect(preview.imported).toBe(0);
  expect(await taskOf(a.id)).toBeNull();

  expect((await importWindshift(system, exp([a, b]))).imported).toBe(2);
  const again = await importWindshift(system, exp([a, b]));
  expect(again.imported).toBe(0);
  expect(again.skipped).toEqual([a.key, b.key]);
  const rows = await db
    .select()
    .from(taskImports)
    .where(eq(taskImports.sourceId, String(a.id)));
  expect(rows).toHaveLength(1);
});
