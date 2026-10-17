import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import webpush from "web-push";
import { db } from "@/db";
import {
  apikey,
  comments,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  taskEvents,
  tasks,
  user,
  workflowStatuses,
} from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { env } from "@/lib/env";
import {
  type Channels,
  DEFAULT_CHANNELS,
  type NotificationData,
  type NotificationEvent,
  describe,
  withinHours,
} from "@/lib/notifications";
import {
  notificationPreferencesSchema,
  pushSubscriptionSchema,
  quietHoursSchema,
} from "@/lib/validation/notifications";
import type { Actor } from "@/server/actor";
import { type PushJob, QUEUES, enqueue } from "@/server/jobs";
import { type Tx, mentionIds } from "./tasks";

// ADR-050: quem recebe o quê, por qual canal. Só o worker chama fanout/push/daily.

type UserActor = Extract<Actor, { kind: "user" }>;
type Pending = { userId: string; event: NotificationEvent; data: NotificationData };

const quote = (text: string) => (text.length > 200 ? `${text.slice(0, 199)}…` : text);

async function channelsFor(tx: Tx | typeof db, userIds: string[]) {
  const rows = userIds.length
    ? await tx
        .select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, userIds))
    : [];
  return (userId: string, event: NotificationEvent): Channels => {
    const r = rows.find((r) => r.userId === userId && r.event === event);
    return r ? { inApp: r.inApp, push: r.push, email: r.email } : DEFAULT_CHANNELS[event];
  };
}

/** Grava as notificações (só pessoas ativas), avisa o sino e enfileira o push. */
async function deliver(tx: Tx, taskId: string | null, actorLabel: string, pending: Pending[]) {
  const ids = [...new Set(pending.map((p) => p.userId))];
  if (!ids.length) return;
  const active = (
    await tx
      .select({ id: user.id })
      .from(user)
      .where(and(inArray(user.id, ids), or(isNull(user.banned), eq(user.banned, false))))
  ).map((r) => r.id);
  const channels = await channelsFor(tx, active);
  for (const p of pending) {
    if (!active.includes(p.userId)) continue;
    const c = channels(p.userId, p.event);
    if (!c.inApp && !c.push && !c.email) continue;
    const [row] = await tx
      .insert(notifications)
      .values({ userId: p.userId, event: p.event, taskId, actorLabel, data: p.data, ...c })
      .returning({ id: notifications.id });
    if (c.inApp)
      await tx.execute(
        sql`SELECT pg_notify('notification_created', json_build_object('id', ${row.id}::text, 'userId', ${p.userId}::text, 'event', ${p.event}::text, 'unreadCount', (SELECT count(*) FROM notifications WHERE user_id = ${p.userId} AND in_app AND read_at IS NULL))::text)`,
      );
    if (c.push) await enqueue(tx, QUEUES.push, { notificationId: row.id } satisfies PushJob);
  }
}

async function actorLabel(tx: Tx, e: typeof taskEvents.$inferSelect) {
  if (e.actorKind === "agent" && e.apiKeyId) {
    const [k] = await tx
      .select({ name: apikey.name })
      .from(apikey)
      .where(eq(apikey.id, e.apiKeyId));
    if (k?.name) return k.name;
  }
  if (e.actorUserId) {
    const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, e.actorUserId));
    if (u) return u.name.split(" ")[0];
  }
  return e.actorKind === "automation" ? "Automação" : "Sistema";
}

/** Job notification.fanout: os eventos de uma escrita → avisos (tabela do ADR-050). */
export async function fanout(eventIds: string[]) {
  await db.transaction(async (tx) => {
    const events = await tx.select().from(taskEvents).where(inArray(taskEvents.id, eventIds));
    if (!events.length) return;
    const first = events[0];
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, first.taskId));
    if (!task) return;
    // N4: o autor não recebe; o agente conta como o dono do token
    const author = first.actorUserId;
    const out = new Map<string, Pending>();
    const add = (userId: string | null, event: NotificationEvent, data: NotificationData = {}) => {
      if (!userId || userId === author) return;
      const key = `${userId}:${event}`;
      if (!out.has(key)) out.set(key, { userId, event, data });
    };
    const has = (userId: string) => [...out.values()].some((p) => p.userId === userId);

    for (const e of events) {
      const payload = e.payload as Record<string, unknown>;
      switch (e.type) {
        case "created":
          add(task.assigneeId, "assigned");
          for (const id of mentionIds(task.descriptionJson)) add(id, "mentioned");
          break;
        case "assigned":
          add((payload.to as string | null) ?? null, "assigned");
          break;
        case "field_changed":
          if (payload.field === "description")
            for (const id of (payload.mentions as string[] | undefined) ?? []) add(id, "mentioned");
          break;
        case "commented": {
          const [c] = await tx
            .select({ bodyJson: comments.bodyJson, bodyText: comments.bodyText })
            .from(comments)
            .where(eq(comments.id, payload.commentId as string));
          if (!c) break;
          const mentioned = mentionIds(c.bodyJson);
          for (const id of mentioned) add(id, "mentioned", { quote: quote(c.bodyText) });
          for (const id of [task.assigneeId, task.creatorId])
            if (id && !mentioned.includes(id)) add(id, "commented", { quote: quote(c.bodyText) });
          break;
        }
        case "status_changed": {
          const names = await tx
            .select({ id: workflowStatuses.id, name: workflowStatuses.name })
            .from(workflowStatuses)
            .where(inArray(workflowStatuses.id, [payload.from, payload.to] as string[]));
          const name = (id: unknown) => names.find((n) => n.id === id)?.name;
          add(task.creatorId, "status_changed", { from: name(payload.from), to: name(payload.to) });
          break;
        }
      }
    }
    if (first.actorKind === "agent")
      for (const id of [task.assigneeId, task.creatorId])
        if (id && !has(id)) add(id, "agent_action");

    await deliver(tx, task.id, await actorLabel(tx, first), [...out.values()]);
  });
}

// ── Push ────────────────────────────────────────────────────────────

const pushReady = () => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return true;
};

async function sendPush(userId: string, payload: { title: string; body: string; url: string }) {
  if (!pushReady()) return 0; // ponytail: sem VAPID (dev/CI) o push só é ignorado
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, s.id));
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // assinatura expirada ou revogada pelo navegador
      if (status === 404 || status === 410)
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else throw err;
    }
  }
  return sent;
}

/** Job notification.push: só dentro do expediente da pessoa; fora dele, fica só no app. */
export async function pushNotification(notificationId: string, now = new Date()) {
  const [n] = await db
    .select({
      userId: notifications.userId,
      event: notifications.event,
      actorLabel: notifications.actorLabel,
      data: notifications.data,
      number: tasks.number,
      title: tasks.title,
      start: user.quietHoursStart,
      end: user.quietHoursEnd,
    })
    .from(notifications)
    .innerJoin(user, eq(user.id, notifications.userId))
    .leftJoin(tasks, eq(tasks.id, notifications.taskId))
    .where(eq(notifications.id, notificationId));
  if (!n) return "gone" as const;
  if (!withinHours(now, n.start ?? "08:00", n.end ?? "18:00", env.APP_TIMEZONE))
    return "quiet" as const;
  const task = n.number === null ? null : { number: n.number, title: n.title ?? "" };
  await sendPush(n.userId, {
    title: task ? `TI-${task.number}` : "ITC Tasks",
    body: describe({ ...n, data: n.data as NotificationData }, task),
    url: task ? `/tarefas/${task.number}` : "/notificacoes",
  });
  return "sent" as const;
}

export async function sendTestPush(actor: UserActor) {
  return sendPush(actor.userId, {
    title: "ITC Tasks",
    body: "Push funcionando neste dispositivo.",
    url: "/config/preferencias",
  });
}

export async function subscribePush(actor: UserActor, input: unknown) {
  const s = pushSubscriptionSchema.parse(input);
  const [row] = await db
    .insert(pushSubscriptions)
    .values({ userId: actor.userId, endpoint: s.endpoint, ...s.keys, userAgent: s.userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: actor.userId, ...s.keys, userAgent: s.userAgent },
    })
    .returning({ id: pushSubscriptions.id });
  return row;
}

export async function unsubscribePush(actor: UserActor, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, actor.userId), eq(pushSubscriptions.endpoint, endpoint)),
    );
}

// ── 08:00: lembretes de prazo e resumo por e-mail ──────────────────

/** Abertas com prazo hoje (due_today) ou que venceram ontem (overdue), sem repetir no dia. */
async function reminders(now: Date) {
  const today = todayISO(now);
  const since = new Date(now.getTime() - 20 * 3600_000);
  const due = await db
    .select({ id: tasks.id, assigneeId: tasks.assigneeId, dueDate: tasks.dueDate })
    .from(tasks)
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
    .where(
      and(
        ne(workflowStatuses.category, "done"),
        isNull(tasks.archivedAt),
        inArray(tasks.dueDate, [today, addDays(today, -1)]),
      ),
    );
  for (const t of due) {
    if (!t.assigneeId) continue;
    const event = t.dueDate === today ? "due_today" : "overdue";
    await db.transaction(async (tx) => {
      const [dup] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, t.assigneeId!),
            eq(notifications.taskId, t.id),
            eq(notifications.event, event),
            gte(notifications.createdAt, since),
          ),
        );
      if (!dup) await deliver(tx, t.id, "Prazo", [{ userId: t.assigneeId!, event, data: {} }]);
    });
  }
}

const mailer = () =>
  env.SMTP_HOST && env.MAIL_FROM
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 465,
        secure: env.SMTP_SECURE ?? true,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      })
    : null;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Um e-mail por pessoa com o que chegou por e-mail nas últimas 24 h; marca para não reenviar. */
async function digest(now: Date) {
  const transport = mailer();
  if (!transport) return 0;
  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      email: user.email,
      name: user.name,
      event: notifications.event,
      actorLabel: notifications.actorLabel,
      data: notifications.data,
      number: tasks.number,
      title: tasks.title,
    })
    .from(notifications)
    .innerJoin(user, eq(user.id, notifications.userId))
    .leftJoin(tasks, eq(tasks.id, notifications.taskId))
    .where(
      and(
        eq(notifications.email, true),
        isNull(notifications.emailedAt),
        gte(notifications.createdAt, new Date(now.getTime() - 24 * 3600_000)),
        or(isNull(user.emailDigest), eq(user.emailDigest, true)),
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
    .orderBy(desc(notifications.createdAt));
  const byUser = Map.groupBy(rows, (r) => r.userId);
  for (const items of byUser.values()) {
    const lines = items.map((r) => {
      const task = r.number === null ? null : { number: r.number, title: r.title ?? "" };
      return {
        text: describe({ ...r, data: r.data as NotificationData }, task),
        url: `${env.BETTER_AUTH_URL}${task ? `/tarefas/${task.number}` : "/notificacoes"}`,
      };
    });
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: items[0].email,
      subject: `Resumo do dia — ${items.length} ${items.length === 1 ? "aviso" : "avisos"}`,
      text: lines.map((l) => `• ${l.text}\n  ${l.url}`).join("\n"),
      html: `<p>Bom dia, ${escapeHtml(items[0].name.split(" ")[0])}.</p><ul>${lines
        .map((l) => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.text)}</a></li>`)
        .join("")}</ul>`,
    });
    await db
      .update(notifications)
      .set({ emailedAt: now })
      .where(
        inArray(
          notifications.id,
          items.map((r) => r.id),
        ),
      );
  }
  return byUser.size;
}

/** Job daily.morning (08:00): lembretes primeiro, para entrarem no resumo. */
export async function daily(now = new Date()) {
  await reminders(now);
  return digest(now);
}

// ── Central e preferências (tela) ──────────────────────────────────

export type InboxTab = "unread" | "all" | "mentions";

export async function listNotifications(actor: UserActor, tab: InboxTab) {
  return db
    .select({
      id: notifications.id,
      event: notifications.event,
      actorLabel: notifications.actorLabel,
      data: notifications.data,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      number: tasks.number,
      title: tasks.title,
    })
    .from(notifications)
    .leftJoin(tasks, eq(tasks.id, notifications.taskId))
    .where(
      and(
        eq(notifications.userId, actor.userId),
        eq(notifications.inApp, true),
        tab === "unread" ? isNull(notifications.readAt) : undefined,
        tab === "mentions" ? eq(notifications.event, "mentioned") : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(200); // ponytail: sem paginação; 200 avisos cobrem semanas de um time de 4
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.inApp, true),
        isNull(notifications.readAt),
      ),
    );
  return r.n;
}

/** Marca como lidas (só as da própria pessoa); sem `ids` = todas. */
export async function markRead(actor: UserActor, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, actor.userId),
        isNull(notifications.readAt),
        ids ? inArray(notifications.id, ids) : undefined,
      ),
    );
}

export async function getPreferences(actor: UserActor) {
  const channels = await channelsFor(db, [actor.userId]);
  const [u] = await db
    .select({
      quietHoursStart: user.quietHoursStart,
      quietHoursEnd: user.quietHoursEnd,
      emailDigest: user.emailDigest,
    })
    .from(user)
    .where(eq(user.id, actor.userId));
  return {
    channels: Object.fromEntries(
      (Object.keys(DEFAULT_CHANNELS) as NotificationEvent[]).map((e) => [
        e,
        channels(actor.userId, e),
      ]),
    ) as Record<NotificationEvent, Channels>,
    quietHoursStart: u.quietHoursStart ?? "08:00",
    quietHoursEnd: u.quietHoursEnd ?? "18:00",
    emailDigest: u.emailDigest !== false,
  };
}

export async function setChannel(actor: UserActor, input: unknown) {
  const { event, ...c } = notificationPreferencesSchema.parse(input);
  await db
    .insert(notificationPreferences)
    .values({ userId: actor.userId, event, ...c })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.event],
      set: c,
    });
}

export async function setSchedule(actor: UserActor, input: unknown) {
  const data = quietHoursSchema.parse(input);
  await db.update(user).set(data).where(eq(user.id, actor.userId));
}
