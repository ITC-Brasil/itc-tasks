import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  mcpAddComment,
  mcpCompleteTask,
  mcpCreateTask,
  mcpListCycles,
  mcpListMobileUnits,
  mcpListTasks,
  mcpTaskId,
  mcpUpdateTask,
} from "@/lib/validation/agents";
import { ForbiddenError } from "@/server/actor";
import {
  type Access,
  type AgentActor,
  checklistIdsAt,
  getTaskDetail,
  getTaskSummary,
  listCyclesForAgent,
  listTasksForAgent,
  markdownToDoc,
  taskIdOf,
  toCreateInput,
  toUpdateInput,
} from "@/server/services/agents";
import { listMobileUnits, listProjects } from "@/server/services/catalog";
import { addComment } from "@/server/services/comments";
import {
  TaskError,
  addChecklistItem,
  completeTask,
  createTask,
  updateChecklistItem,
  updateTask,
} from "@/server/services/tasks";

// ADR-009/ADR-049: as ferramentas só validam, chamam services e mapeiam erros (ADR-003)

const LIST_TASKS =
  "Lista tarefas com filtros; mais novas primeiro. Só as da equipe, salvo visibility personal ou all.";

const ok = (data: Record<string, unknown>): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

const fail = (code: string, message: string): CallToolResult => ({
  content: [{ type: "text", text: `${code}: ${message}` }],
  structuredContent: { code, message },
  isError: true,
});

function toResult(error: unknown): CallToolResult {
  if (error instanceof TaskError)
    return fail(
      error.code === "TOO_LARGE" || error.code === "UNSUPPORTED_TYPE" ? "VALIDATION" : error.code,
      error.message,
    );
  if (error instanceof z.ZodError) return fail("VALIDATION", error.issues[0].message);
  if (error instanceof ForbiddenError) return fail("FORBIDDEN", error.message);
  throw error;
}

export function createMcpServer(actor: AgentActor, access: Access[]) {
  const server = new McpServer({ name: "itc-tasks", version: "1.0.0" });
  // ponytail: o SDK devolve erro de schema só como texto; o contrato pede { code } (ADR-049)
  Reflect.set(server, "createToolError", (message: string) =>
    message.includes("Input validation error")
      ? fail("VALIDATION", message)
      : / disabled$/.test(message)
        ? fail("FORBIDDEN", "O token não tem a permissão tasks:write")
        : fail("INTERNAL", message),
  );

  const tool = <S extends z.ZodRawShape>(
    name: string,
    need: Access,
    description: string,
    inputSchema: S,
    run: (input: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>,
  ) => {
    const registered = server.registerTool(
      name,
      { description, inputSchema, annotations: { readOnlyHint: need === "read" } },
      // @ts-expect-error -- o tipo genérico do SDK não acompanha o ZodRawShape genérico
      async (input: z.output<z.ZodObject<S>>) => {
        if (!access.includes(need))
          return fail("FORBIDDEN", `O token não tem a permissão tasks:${need}`);
        try {
          return ok(await run(input));
        } catch (error) {
          return toResult(error);
        }
      },
    );
    // M-044: o token não lista o que não pode usar; chamar mesmo assim → FORBIDDEN
    if (!access.includes(need)) registered.disable();
  };

  // ── Leitura ──
  tool("list_tasks", "read", LIST_TASKS, mcpListTasks, (i) => listTasksForAgent(actor, i));
  tool("get_task", "read", "Detalhe de uma tarefa (TI-142, 142).", mcpTaskId, (i) =>
    getTaskDetail(actor, i.id),
  );
  tool("list_projects", "read", "Projetos/Clientes ativos.", {}, async () => ({
    projects: (await listProjects(actor)).map((p) => ({
      code: p.code,
      name: p.name,
      kind: p.kind,
      color: p.color ?? undefined, // ADR-068: chave da paleta
    })),
  }));
  tool("list_mobile_units", "read", "Unidades Móveis ativas.", mcpListMobileUnits, async (i) => {
    const [units, projects] = await Promise.all([
      listMobileUnits(actor),
      listProjects(actor, { includeArchived: true }),
    ]);
    const codeOf = (id: string | null) => projects.find((p) => p.id === id)?.code;
    return {
      mobileUnits: units
        .map((u) => ({
          code: u.code,
          project: codeOf(u.projectId),
        }))
        .filter((u) => !i.project || u.project?.toUpperCase() === i.project.toUpperCase()),
    };
  });
  tool("list_cycles", "read", "Ciclos com progresso.", mcpListCycles, async (i) => ({
    cycles: await listCyclesForAgent(i.state),
  }));

  // ── Escrita ──
  tool(
    "create_task",
    "write",
    "Cria tarefa. projectIds é obrigatório (códigos; o primeiro é o principal), menos com visibility 'personal' (tarefa que só o dono do token vê).",
    mcpCreateTask,
    async (i) => {
      const task = await createTask(actor, await toCreateInput(actor, i));
      return (await getTaskSummary(actor, task.number)).summary;
    },
  );
  tool(
    "update_task",
    "write",
    "Altera só os campos enviados. checklist acrescenta itens; checklistToggle.index e checklistDue.index contam sobre o checklist de antes desta chamada.",
    mcpUpdateTask,
    async ({
      id,
      checklist = [],
      checklistToggle: toggles = [],
      checklistDue: dues = [],
      ...rest
    }) => {
      // M-044: tudo resolvido e validado antes da primeira escrita; índices = checklist de antes
      const taskId = await taskIdOf(actor, id);
      const patch = await toUpdateInput(actor, rest);
      const itemIds = await checklistIdsAt(
        actor,
        id,
        toggles.map((t) => t.index),
      );
      const dueIds = await checklistIdsAt(
        actor,
        id,
        dues.map((d) => d.index),
      );
      // ponytail: campos, checklist e toggles em transações separadas; o histórico registra cada uma
      await updateTask(actor, taskId, patch);
      for (const text of checklist) await addChecklistItem(actor, taskId, text);
      for (const [n, itemId] of itemIds.entries())
        // eslint-disable-next-line security/detect-object-injection -- n é o índice do próprio array
        await updateChecklistItem(actor, itemId, { done: toggles[n].done });
      for (const [n, itemId] of dueIds.entries())
        // eslint-disable-next-line security/detect-object-injection -- n é o índice do próprio array
        await updateChecklistItem(actor, itemId, {
          dueDate: dues[n].dueDate,
          // eslint-disable-next-line security/detect-object-injection -- idem
          ...(dues[n].dueTime !== undefined && { dueTime: dues[n].dueTime }),
        });
      return (await getTaskSummary(actor, id)).summary;
    },
  );
  tool("complete_task", "write", "Conclui a tarefa; idempotente.", mcpCompleteTask, async (i) => {
    const taskId = await taskIdOf(actor, i.id);
    await completeTask(actor, taskId);
    if (i.comment?.trim()) await addComment(actor, taskId, await markdownToDoc(i.comment));
    return (await getTaskSummary(actor, i.id)).summary;
  });
  tool(
    "add_comment",
    "write",
    "Comenta na tarefa (markdown; @email menciona).",
    mcpAddComment,
    async (i) => {
      const row = await addComment(actor, await taskIdOf(actor, i.id), await markdownToDoc(i.body));
      return { commentId: row.id, createdAt: row.createdAt.toISOString() };
    },
  );

  return server;
}
