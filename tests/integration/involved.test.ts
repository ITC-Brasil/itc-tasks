import { beforeAll, expect, it } from "vitest";
import { parseTaskFilters } from "@/lib/validation/tasks";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import {
  CatalogError,
  createInvolved,
  createProject,
  listInvolved,
  setInvolvedArchived,
  updateInvolved,
} from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { createTask, getTaskByNumber, listTasks, updateTask } from "@/server/services/tasks";

// ADR-073: cadastro de envolvidos e o vínculo com tarefas
const system: Actor = { kind: "system" };
const run = Date.now();
let me: Extract<Actor, { kind: "user" }>;
let projectId: string;

beforeAll(async () => {
  const u = await createMember(system, {
    name: "Envolve",
    email: `envolve-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  me = { kind: "user", userId: u.id, role: "member" };
  projectId = (
    await createProject(system, { code: `EV${String(run).slice(-6)}`, name: "Env", kind: "client" })
  ).id;
});

it("cadastro: admin cria, edita e arquiva; nome único sem diferenciar maiúsculas; membro não escreve", async () => {
  const p = await createInvolved(system, { name: `  Motorista ${run} ` });
  expect(p.name).toBe(`Motorista ${run}`);
  await expect(createInvolved(system, { name: `MOTORISTA ${run}` })).rejects.toThrow(CatalogError);
  await expect(createInvolved(me, { name: `Outro ${run}` })).rejects.toThrow();
  await expect(updateInvolved(me, p.id, { name: "x" })).rejects.toThrow();
  const renamed = await updateInvolved(system, p.id, { name: `Motorista UM ${run}` });
  expect(renamed.name).toBe(`Motorista UM ${run}`);
  await setInvolvedArchived(system, p.id, true);
  expect((await listInvolved(me)).map((r) => r.id)).not.toContain(p.id);
  expect((await listInvolved(me, { includeArchived: true })).map((r) => r.id)).toContain(p.id);
});

it("tarefa: vários envolvidos, evento no histórico, arquivado só fica se já estava, filtro", async () => {
  const [ana, beto] = await Promise.all(
    ["Ana", "Beto"].map((n) => createInvolved(system, { name: `${n} cliente ${run}` })),
  );
  const t = await createTask(me, {
    title: "Com envolvidos",
    projectIds: [projectId],
    involvedIds: [ana.id],
  });
  const pessoal = await createTask(me, {
    title: "Pessoal",
    projectIds: [],
    visibility: "personal",
    involvedIds: [beto.id],
  });
  await updateTask(me, t.id, { involvedIds: [ana.id, beto.id] });
  const detail = await getTaskByNumber(me, t.number);
  expect(detail?.involved.map((p) => p.name)).toEqual([
    `Ana cliente ${run}`,
    `Beto cliente ${run}`,
  ]);
  expect((await listActivity(me, t.id)).at(-1)?.text).toBe(
    `Envolvidos: adicionou Beto cliente ${run}`,
  );

  // arquivado continua na tarefa que já o tem; não entra numa nova
  await setInvolvedArchived(system, beto.id, true);
  await updateTask(me, t.id, { title: "Renomeada" });
  await expect(
    createTask(me, { title: "Nova", projectIds: [projectId], involvedIds: [beto.id] }),
  ).rejects.toThrow("Envolvido arquivado");

  // filtro "qualquer um de", também nas pessoais do dono
  const { tasks } = await listTasks(me, parseTaskFilters({ envolvido: beto.id }), {
    visibility: "all",
  });
  expect(tasks.map((r) => r.id).sort()).toEqual([t.id, pessoal.id].sort());
  await updateTask(me, t.id, { involvedIds: [] });
  expect((await getTaskByNumber(me, t.number))?.involved).toEqual([]);
});
