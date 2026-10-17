import { and, eq, inArray, sql } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";
import { db } from "@/db";
import { notifications, taskEvents, user } from "@/db/schema";
import { todayISO, addDays } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { createAgentKey } from "@/server/services/agents";
import { createProject } from "@/server/services/catalog";
import { addComment } from "@/server/services/comments";
import { createMember, setMemberActive } from "@/server/services/members";
import {
  daily,
  fanout,
  getPreferences,
  listNotifications,
  markRead,
  pushNotification,
  setChannel,
  unreadCount,
} from "@/server/services/notifications";
import { createTask, updateTask } from "@/server/services/tasks";

// o CI não tem SMTP: o env é lido no import, antes do mock do nodemailer valer
vi.hoisted(() => {
  process.env.SMTP_HOST ??= "localhost";
  process.env.MAIL_FROM ??= "ITC Tasks <tasks@t.test>";
});
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (m: { to: string; subject: string; text: string }) => sent.push(m),
    }),
  },
}));

const system: Actor = { kind: "system" };
const run = Date.now();
type U = Actor & { kind: "user" };
let ana: U, bia: U, caio: U;
let projectId: string;

const person = async (name: string): Promise<U> => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-n${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  return { kind: "user", userId: u.id, role: "member" };
};
const doc = (...content: object[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });
const mention = (u: U, label: string) => ({ type: "mention", attrs: { id: u.userId, label } });
const text = (t: string) => ({ type: "text", text: t });

/** Roda o fanout que o worker rodaria para os eventos ainda não processados da tarefa. */
const seen = new Set<string>();
async function drain(taskId: string) {
  const events = await db
    .select({ id: taskEvents.id, createdAt: taskEvents.createdAt })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(taskEvents.createdAt);
  const fresh = events.filter((e) => !seen.has(e.id));
  for (const e of fresh) seen.add(e.id);
  if (fresh.length) await fanout(fresh.map((e) => e.id));
}
const inbox = async (u: U, taskId: string) =>
  (
    await db
      .select({ event: notifications.event, actorLabel: notifications.actorLabel })
      .from(notifications)
      .where(and(eq(notifications.userId, u.userId), eq(notifications.taskId, taskId)))
  )
    .map((n) => n.event)
    .sort();

beforeAll(async () => {
  [ana, bia, caio] = [await person("Ana"), await person("Bia"), await person("Caio")];
  const code = `N${String(run).slice(-6)}`;
  projectId = (await createProject(system, { code, name: `Notif ${run}`, kind: "client" })).id;
  await db
    .update(user)
    .set({ quietHoursStart: "00:00", quietHoursEnd: "23:59" })
    .where(inArray(user.id, [ana.userId, bia.userId]));
});

it("a escrita enfileira o fanout na mesma transação; escrita recusada não enfileira", async () => {
  const jobs = async () =>
    (
      await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'notification.fanout'`,
      )
    ).rows[0].n;
  // a primeira escrita cria o schema pgboss se o worker ainda não rodou
  const task = await createTask(ana, { title: "Fila", projectIds: [projectId] });
  const before = await jobs();
  await updateTask(ana, task.id, { title: "Fila 2" });
  expect(await jobs()).toBe(before + 1);
  await expect(updateTask(ana, task.id, { projectIds: [] })).rejects.toThrow();
  expect(await jobs()).toBe(before + 1);
});

it("atribuir avisa o responsável; o autor nunca recebe (N4)", async () => {
  const task = await createTask(ana, {
    title: "Atribuída",
    projectIds: [projectId],
    assigneeId: bia.userId,
  });
  await drain(task.id);
  expect(await inbox(bia, task.id)).toEqual(["assigned"]);
  expect(await inbox(ana, task.id)).toEqual([]);

  // atribuir a si mesma não avisa ninguém
  const own = await createTask(ana, {
    title: "Minha",
    projectIds: [projectId],
    assigneeId: ana.userId,
  });
  await drain(own.id);
  expect(await inbox(ana, own.id)).toEqual([]);
});

it("comentário: mencionado recebe menção; responsável e criador, comentário", async () => {
  const task = await createTask(ana, {
    title: "Comentada",
    projectIds: [projectId],
    assigneeId: bia.userId,
  });
  await drain(task.id);
  await addComment(caio, task.id, doc(mention(bia, "Bia"), text(" veja o rack")));
  await drain(task.id);
  expect((await inbox(bia, task.id)).sort()).toEqual(["assigned", "mentioned"]);
  expect(await inbox(ana, task.id)).toEqual(["commented"]);
  const [m] = await listNotifications(bia, "mentions");
  expect(m.data).toEqual({ quote: "@Bia veja o rack" });
  expect(m.actorLabel).toBe("Caio");
});

it("descrição: só os mencionados novos recebem", async () => {
  const task = await createTask(ana, {
    title: "Descrição",
    projectIds: [projectId],
    descriptionJson: doc(mention(bia, "Bia")),
  });
  await drain(task.id);
  expect(await inbox(bia, task.id)).toEqual(["mentioned"]);
  await updateTask(ana, task.id, {
    descriptionJson: doc(mention(bia, "Bia"), mention(caio, "Caio")),
  });
  await drain(task.id);
  expect(await inbox(bia, task.id)).toEqual(["mentioned"]);
  expect(await inbox(caio, task.id)).toEqual(["mentioned"]);
});

it("status avisa o criador com os nomes; agente avisa responsável e criador", async () => {
  const task = await createTask(ana, {
    title: "Status",
    projectIds: [projectId],
    assigneeId: caio.userId,
  });
  await drain(task.id);
  const { listStatuses } = await import("@/server/services/catalog");
  const done = (await listStatuses(system)).find((s) => s.category === "done")!;
  await updateTask(bia, task.id, { statusId: done.id });
  await drain(task.id);
  expect(await inbox(ana, task.id)).toEqual(["status_changed"]);
  const [n] = await db
    .select({ data: notifications.data })
    .from(notifications)
    .where(and(eq(notifications.userId, ana.userId), eq(notifications.taskId, task.id)));
  expect((n.data as { to: string }).to).toBe(done.name);

  const key = await createAgentKey(bia, { name: "Triagem", access: "write" });
  const agent: Actor = { kind: "agent", userId: bia.userId, role: "member", apiKeyId: key.id };
  await updateTask(agent, task.id, { priority: "high" });
  await drain(task.id);
  expect((await inbox(caio, task.id)).sort()).toEqual(["agent_action", "assigned"]);
  // o agente da Bia conta como a Bia (N4)
  expect(await inbox(bia, task.id)).toEqual([]);
  const agentNote = await db
    .select({ label: notifications.actorLabel })
    .from(notifications)
    .where(and(eq(notifications.taskId, task.id), eq(notifications.event, "agent_action")));
  expect(agentNote[0].label).toBe("Triagem");
});

it("preferência desligada não grava; pessoa desativada não recebe", async () => {
  await setChannel(caio, { event: "assigned", inApp: false, push: false, email: false });
  expect((await getPreferences(caio)).channels.assigned).toEqual({
    inApp: false,
    push: false,
    email: false,
  });
  const task = await createTask(ana, {
    title: "Sem aviso",
    projectIds: [projectId],
    assigneeId: caio.userId,
  });
  await drain(task.id);
  expect(await inbox(caio, task.id)).toEqual([]);

  const dan = await person("Dan");
  await setMemberActive(system, dan.userId, false);
  const t2 = await createTask(ana, { title: "Desativado", projectIds: [projectId] });
  await addComment(ana, t2.id, doc(mention(dan, "Dan")));
  await drain(t2.id);
  expect(await inbox(dan, t2.id)).toEqual([]);
});

it("central: não lidas, marcar uma e todas; contador", async () => {
  const before = await unreadCount(bia.userId);
  expect(before).toBeGreaterThan(0);
  const [first] = await listNotifications(bia, "unread");
  await markRead(ana, [first.id]); // de outra pessoa: não mexe
  expect(await unreadCount(bia.userId)).toBe(before);
  await markRead(bia, [first.id]);
  expect(await unreadCount(bia.userId)).toBe(before - 1);
  await markRead(bia);
  expect(await unreadCount(bia.userId)).toBe(0);
  expect((await listNotifications(bia, "all")).length).toBeGreaterThan(0);
});

it("push fora do expediente fica só no app", async () => {
  const task = await createTask(ana, {
    title: "Push",
    projectIds: [projectId],
    assigneeId: bia.userId,
  });
  await drain(task.id);
  const [n] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.taskId, task.id), eq(notifications.userId, bia.userId)));
  await db
    .update(user)
    .set({ quietHoursStart: "08:00", quietHoursEnd: "18:00" })
    .where(eq(user.id, bia.userId));
  expect(await pushNotification(n.id, new Date("2026-10-19T22:00:00-03:00"))).toBe("quiet");
  expect(await pushNotification(n.id, new Date("2026-10-19T10:00:00-03:00"))).toBe("sent");
});

it("08:00: prazo hoje e vencida uma vez só, e resumo por e-mail sem reenviar", async () => {
  const now = new Date();
  const today = todayISO(now);
  const hoje = await createTask(ana, {
    title: "Vence hoje",
    projectIds: [projectId],
    assigneeId: bia.userId,
    dueDate: today,
  });
  const ontem = await createTask(ana, {
    title: "Venceu ontem",
    projectIds: [projectId],
    assigneeId: bia.userId,
    dueDate: addDays(today, -1),
  });
  await drain(hoje.id);
  await drain(ontem.id);
  sent.length = 0;
  await daily(now);
  await daily(now); // repetido: não duplica nem reenvia
  expect(await inbox(bia, hoje.id)).toEqual(["assigned", "due_today"]);
  expect(await inbox(bia, ontem.id)).toEqual(["assigned", "overdue"]);
  const mine = sent.filter((m) => m.to === `bia-n${run}@t.test`);
  expect(mine).toHaveLength(1);
  expect(mine[0].text).toContain(`TI-${hoje.number} Vence hoje`);
  expect(mine[0].text).toContain(`TI-${ontem.number} Venceu ontem`);
});
