import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { notificationEvent } from "./enums";
import { tasks } from "./tasks";

// ADR-050: uma linha por pessoa e tipo quando algum canal está ligado
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    event: notificationEvent("event").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorLabel: text("actor_label").notNull(), // "Ana", "Triagem GLPI", "Prazo"
    data: jsonb("data").notNull(), // trecho do comentário, status de/para
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_unread_idx").on(t.userId, t.readAt, t.createdAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    event: notificationEvent("event").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    push: boolean("push").notNull().default(false),
    email: boolean("email").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.event] })],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint)],
);
