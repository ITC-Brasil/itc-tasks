import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apikey,
  labels,
  mobileUnits,
  projects,
  taskEvents,
  tasks,
  user,
  workflowStatuses,
} from "@/db/schema";
import { glpiUrl } from "@/components/tasks/badges";
import { isOverdue } from "@/lib/dates";
import { env } from "@/lib/env";
import {
  type McpCreateTask,
  type McpListTasks,
  type McpUpdateTask,
  createAgentKeySchema,
} from "@/lib/validation/agents";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validation/tasks";
import { type Actor, ForbiddenError, type Role, isAdmin } from "@/server/permissions";
import { auth } from "@/server/auth";
import { listComments } from "./comments";
import { activeCycle, getCycleByNumber, listCycles } from "./planning";
import { TaskError, docText, getTaskByNumber, listTasks, visibleTo } from "./tasks";

// ADR-049: tokens MCP e tradução entre o contrato do MCP (códigos legíveis) e os services

export type AgentActor = Extract<Actor, { kind: "agent" }>;
export type Access = "read" | "write";

// ── Autenticação do /mcp ────────────────────────────────────────────

/** Bearer → agente com as permissões do token; senão o status HTTP (401 ou 429). */
export async function agentFromKey(
  key: string,
): Promise<{ actor: AgentActor; access: Access[] } | { status: 401 | 429 }> {
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key)
    return { status: result.error?.code === "RATE_LIMITED" ? 429 : 401 };
  const [owner] = await db
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, result.key.referenceId));
  if (!owner || owner.banned) return { status: 401 };
  const role: Role = owner.role === "admin" ? "admin" : "member";
  const access = (result.key.permissions?.tasks ?? []).filter(
    (p): p is Access => p === "read" || p === "write",
  );
  return { actor: { kind: "agent", userId: owner.id, role, apiKeyId: result.key.id }, access };
}

// ── Tokens (Configurações › Agentes e MCP) ──────────────────────────

const ownerOf = (actor: Actor) => {
  if (actor.kind !== "user") throw new ForbiddenError();
  return actor.userId;
};

/** Membro vê os próprios tokens; admin vê todos. */
export async function listAgentKeys(actor: Actor) {
  const self = ownerOf(actor);
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      ownerId: apikey.referenceId,
      ownerName: user.name,
      enabled: apikey.enabled,
      permissions: apikey.permissions,
      requestCount: apikey.requestCount,
      lastRequest: apikey.lastRequest,
      createdAt: apikey.createdAt,
    })
    .from(apikey)
    .innerJoin(user, eq(user.id, apikey.referenceId))
    .where(isAdmin(actor) ? undefined : eq(apikey.referenceId, self))
    .orderBy(desc(apikey.createdAt));
  return rows.map(({ permissions, ...r }) => ({
    ...r,
    write:
      (JSON.parse(permissions ?? "{}") as { tasks?: string[] }).tasks?.includes("write") ?? false,
  }));
}

export const MAX_ACTIVE_AGENT_KEYS = 10;

/** Cria o token; o segredo volta só aqui, uma vez. */
export async function createAgentKey(actor: Actor, input: unknown) {
  const self = ownerOf(actor);
  const data = createAgentKeySchema.parse(input);
  const userId = data.userId ?? self;
  if (userId !== self && !isAdmin(actor)) throw new ForbiddenError();
  // o limite de 60/min é por token (ADR-009): sem teto, mais tokens = mais vazão (issue #25)
  const [{ active }] = await db
    .select({ active: count() })
    .from(apikey)
    .where(and(eq(apikey.referenceId, userId), eq(apikey.enabled, true)));
  if (active >= MAX_ACTIVE_AGENT_KEYS)
    throw new TaskError(
      "VALIDATION",
      `Limite de ${MAX_ACTIVE_AGENT_KEYS} tokens ativos; revogue um antes`,
    );
  const created = await auth.api.createApiKey({
    body: {
      name: data.name,
      userId,
      permissions: { tasks: data.access === "write" ? ["read", "write"] : ["read"] },
    },
  });
  return { id: created.id, key: created.key };
}

/** Revogar = desativar; o histórico continua apontando para o token (ADR-049). */
export async function revokeAgentKey(actor: Actor, keyId: string) {
  const self = ownerOf(actor);
  const [row] = await db
    .select({ ownerId: apikey.referenceId })
    .from(apikey)
    .where(eq(apikey.id, keyId));
  if (!row) throw new TaskError("NOT_FOUND", "Token não encontrado");
  if (row.ownerId !== self && !isAdmin(actor)) throw new ForbiddenError();
  await db
    .update(apikey)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(apikey.id, keyId));
}

/** Últimas escritas feitas por tokens visíveis para a pessoa. */
export async function listAgentActivity(actor: Actor, limit = 20) {
  const self = ownerOf(actor);
  return (
    db
      .select({
        id: taskEvents.id,
        type: taskEvents.type,
        createdAt: taskEvents.createdAt,
        tokenName: apikey.name,
        taskNumber: tasks.number,
        taskTitle: tasks.title,
      })
      .from(taskEvents)
      .innerJoin(apikey, eq(apikey.id, taskEvents.apiKeyId))
      .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
      // ADR-069: nem o admin vê a atividade de agente em tarefa pessoal de outra pessoa
      .where(and(isAdmin(actor) ? undefined : eq(apikey.referenceId, self), visibleTo(actor)))
      .orderBy(desc(taskEvents.createdAt))
      .limit(limit)
  );
}

// ── Referências legíveis → IDs ──────────────────────────────────────

const notFound = (what: string, refs: string[]) =>
  new TaskError("NOT_FOUND", `${what} não encontrado: ${refs.join(", ")}`);

/** Códigos na ordem enviada; arquivado passa adiante e o service recusa (ARCHIVED_REFERENCE). */
async function idsByCode(
  table: typeof projects | typeof mobileUnits,
  codes: string[],
  what: string,
) {
  if (codes.length === 0) return [];
  const wanted = codes.map((c) => c.toUpperCase());
  const rows = await db
    .select({ id: table.id, code: table.code })
    .from(table)
    .where(inArray(sql`upper(${table.code})`, wanted));
  const missing = wanted.filter((c) => !rows.some((r) => r.code.toUpperCase() === c));
  if (missing.length) throw notFound(what, missing);
  return wanted.map((c) => rows.find((r) => r.code.toUpperCase() === c)!.id);
}

async function idsByName(
  table: typeof labels | typeof workflowStatuses,
  names: string[],
  what: string,
) {
  if (names.length === 0) return [];
  const wanted = names.map((n) => n.toLowerCase());
  // ativo primeiro: um nome pode existir arquivado e ativo
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(inArray(sql`lower(${table.name})`, wanted))
    .orderBy(sql`${table.archivedAt} IS NOT NULL`);
  const missing = wanted.filter((n) => !rows.some((r) => r.name.toLowerCase() === n));
  if (missing.length) throw notFound(what, missing);
  return wanted.map((n) => rows.find((r) => r.name.toLowerCase() === n)!.id);
}

async function personId(actor: AgentActor, ref: string) {
  if (ref === "me") return actor.userId;
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, ref.trim().toLowerCase()));
  if (!row) throw notFound("Pessoa", [ref]);
  return row.id;
}

/** Markdown mínimo → Tiptap: parágrafos, quebras de linha e `@email` como menção (ADR-049). */
export async function markdownToDoc(md: string) {
  const text = md.replace(/\r\n/g, "\n").trim();
  const emails = [...new Set(text.match(/(?<=@)[^\s@]+@[^\s@]+\.[a-z]{2,}/gi) ?? [])];
  const people = emails.length
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(
          and(
            inArray(
              sql`lower(${user.email})`,
              emails.map((e) => e.toLowerCase()),
            ),
            or(isNull(user.banned), eq(user.banned, false)),
          ),
        )
    : [];
  const inline = (line: string) =>
    line.split(/@([^\s@]+@[^\s@]+\.[a-z]{2,})/i).flatMap((part, i): Record<string, unknown>[] => {
      const person =
        i % 2 ? people.find((p) => p.email.toLowerCase() === part.toLowerCase()) : null;
      if (person) return [{ type: "mention", attrs: { id: person.id, label: person.name } }];
      const value = i % 2 ? `@${part}` : part;
      return value ? [{ type: "text", text: value }] : [];
    });
  return {
    type: "doc" as const,
    content: text.split(/\n{2,}/).map((para) => ({
      type: "paragraph",
      content: para
        .split("\n")
        .flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...inline(line)]),
    })),
  };
}

/** ADR-053: `'current'` = ciclo ativo; número = "Ciclo N". */
async function cycleId(cycle: "current" | number) {
  const c = cycle === "current" ? await activeCycle() : await getCycleByNumber(cycle);
  if (!c)
    throw new TaskError(
      "NOT_FOUND",
      cycle === "current" ? "Nenhum ciclo ativo" : `Ciclo ${cycle} não encontrado`,
    );
  return c.id;
}

type Fields = Omit<McpCreateTask, "title" | "checklist" | "visibility">;

/** Campos do MCP → entrada do tasksService; só os enviados. */
async function serviceFields(actor: AgentActor, input: Fields) {
  const out: UpdateTaskInput = {};
  if (input.cycle !== undefined) out.cycleId = await cycleId(input.cycle);
  if (input.projectIds)
    out.projectIds = await idsByCode(projects, input.projectIds, "Projeto/Cliente");
  if (input.mobileUnitIds)
    out.mobileUnitIds = await idsByCode(mobileUnits, input.mobileUnitIds, "Unidade Móvel");
  if (input.status) [out.statusId] = await idsByName(workflowStatuses, [input.status], "Status");
  if (input.labels) out.labelIds = await idsByName(labels, input.labels, "Etiqueta");
  if (input.assignee !== undefined)
    out.assigneeId = input.assignee === null ? null : await personId(actor, input.assignee);
  if (input.description !== undefined)
    out.descriptionJson = input.description.trim() ? await markdownToDoc(input.description) : null;
  if (input.priority) out.priority = input.priority;
  if (input.glpiTicket !== undefined) out.glpiTicket = input.glpiTicket;
  if (input.dueDate !== undefined) out.dueDate = input.dueDate;
  if (input.dueTime !== undefined) out.dueTime = input.dueTime; // ADR-072
  return out;
}

export async function toCreateInput(actor: AgentActor, input: McpCreateTask) {
  const { title, checklist, visibility, ...rest } = input;
  const fields = await serviceFields(actor, rest);
  return {
    ...fields,
    title,
    checklist,
    visibility,
    projectIds: fields.projectIds ?? [],
  } as CreateTaskInput;
}

export async function toUpdateInput(
  actor: AgentActor,
  input: Omit<McpUpdateTask, "id" | "checklist" | "checklistToggle" | "checklistDue">,
) {
  const { title, visibility, ...rest } = input;
  const fields: UpdateTaskInput = await serviceFields(actor, rest);
  if (visibility) fields.visibility = visibility; // ADR-069: pessoal → equipe
  return title === undefined ? fields : { ...fields, title };
}

/** Pessoa por ID → e-mail (saída do MCP). */
async function emails(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}

const taskUrl = (n: number) => `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/tarefas/${n}`;

// ── Leitura no formato do MCP ───────────────────────────────────────

export async function getTaskSummary(actor: Actor, number: number) {
  const task = await getTaskByNumber(actor, number);
  if (!task) throw new TaskError("NOT_FOUND", `TI-${number} não encontrada`);
  const mail = await emails([task.assigneeId]);
  return {
    task,
    summary: {
      id: `TI-${task.number}`,
      title: task.title,
      status: task.statusName,
      category: task.category,
      priority: task.priority,
      visibility: task.visibility, // ADR-069
      projects: task.projects.map((p) => p.code),
      mobileUnits: task.units.map((u) => u.code),
      glpiTicket: task.glpiTicket ?? undefined,
      assignee: (task.assigneeId && mail.get(task.assigneeId)) || undefined,
      dueDate: task.dueDate ?? undefined,
      dueTime: task.dueTime ?? undefined,
      url: taskUrl(task.number),
    },
  };
}

export async function getTaskDetail(actor: Actor, number: number) {
  const { task, summary } = await getTaskSummary(actor, number);
  const [allComments, mail] = await Promise.all([
    listComments(actor, task.id),
    emails(task.checklist.map((c) => c.assigneeId)),
  ]);
  return {
    ...summary,
    description: docText(task.descriptionJson),
    checklist: task.checklist.map((c) => ({
      text: c.text,
      done: c.done,
      dueDate: c.dueDate ?? undefined,
      dueTime: c.dueTime ?? undefined,
      assignee: (c.assigneeId && mail.get(c.assigneeId)) || undefined,
    })),
    links: task.links.map((l) => ({ kind: l.kind, id: `TI-${l.number}` })),
    labels: task.labels.map((l) => l.name),
    comments: allComments.slice(-20).map((c) => ({
      author: c.authorName,
      viaAgent: c.actorKind === "agent",
      body: docText(c.bodyJson),
      createdAt: c.createdAt.toISOString(),
    })),
    glpiUrl: task.glpiTicket ? glpiUrl(env.GLPI_BASE_URL, task.glpiTicket) : undefined,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
  };
}

/** IDs dos itens de checklist pelo índice (checklistToggle). */
export async function checklistIdsAt(actor: Actor, number: number, indexes: number[]) {
  const task = await getTaskByNumber(actor, number);
  if (!task) throw new TaskError("NOT_FOUND", `TI-${number} não encontrada`);
  return indexes.map((i) => {
    // eslint-disable-next-line security/detect-object-injection -- índice inteiro validado
    const item = task.checklist[i];
    if (!item) throw new TaskError("NOT_FOUND", `Subtarefa ${i} não existe`);
    return item.id;
  });
}

export async function taskIdOf(actor: Actor, number: number) {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.number, number), visibleTo(actor)));
  if (!row) throw new TaskError("NOT_FOUND", `TI-${number} não encontrada`);
  return row.id;
}

// ponytail: filtra em memória sobre o listTasks das visões (time de 4); consulta paginada se crescer
export async function listTasksForAgent(actor: AgentActor, input: McpListTasks) {
  const filters = {
    cycleIds: input.cycle !== undefined ? [await cycleId(input.cycle)] : [],
    statusIds: input.status ? await idsByName(workflowStatuses, input.status, "Status") : [],
    projectIds: input.project ? await idsByCode(projects, [input.project], "Projeto/Cliente") : [],
    mobileUnitIds: input.mobileUnit
      ? await idsByCode(mobileUnits, [input.mobileUnit], "Unidade Móvel")
      : [],
    assigneeIds:
      input.assignee && input.assignee !== "none" ? [await personId(actor, input.assignee)] : [],
  };
  // ADR-069: sem `visibility`, só as da equipe; as pessoais são sempre as do dono do token
  const { tasks: rows } = await listTasks(actor, filters, { visibility: input.visibility });
  const q = input.query?.trim().toLowerCase();
  const glpi = q?.match(/^#(\d+)$/)?.[1];
  const cursor = input.cursor ? Number(input.cursor) : Infinity;
  const limit = input.limit ?? 25;
  const matched = rows
    .filter(
      (t) =>
        t.number < cursor &&
        (input.assignee !== "none" || !t.assigneeId) &&
        (!input.category || input.category.includes(t.category)) &&
        (!input.dueBefore || (t.dueDate && t.dueDate < input.dueBefore)) &&
        (!input.overdue || (t.category !== "done" && isOverdue(t.dueDate, t.dueTime))) &&
        (!q || (glpi ? String(t.glpiTicket) === glpi : t.title.toLowerCase().includes(q))),
    )
    .sort((a, b) => b.number - a.number);
  const page = matched.slice(0, limit);
  const [statuses, mail] = await Promise.all([
    db.select({ id: workflowStatuses.id, name: workflowStatuses.name }).from(workflowStatuses),
    emails(page.map((t) => t.assigneeId)),
  ]);
  return {
    tasks: page.map((t) => ({
      id: `TI-${t.number}`,
      title: t.title,
      status: statuses.find((s) => s.id === t.statusId)?.name ?? "",
      category: t.category,
      priority: t.priority,
      visibility: t.visibility,
      projects: t.projects.map((p) => p.code),
      mobileUnits: t.units.map((u) => u.code),
      glpiTicket: t.glpiTicket ?? undefined,
      assignee: (t.assigneeId && mail.get(t.assigneeId)) || undefined,
      dueDate: t.dueDate ?? undefined,
      dueTime: t.dueTime ?? undefined,
      url: taskUrl(t.number),
    })),
    nextCursor: matched.length > limit ? String(page.at(-1)!.number) : undefined,
  };
}

export async function listCyclesForAgent(state?: "planned" | "active" | "closed") {
  return (await listCycles(state)).map(({ number, startsOn, endsOn, state, done, total }) => ({
    number,
    startsOn,
    endsOn,
    state,
    done,
    total,
  }));
}
