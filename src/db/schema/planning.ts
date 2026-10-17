// Planejamento (Módulos 09 e 10). Criadas no Módulo 04 para as FKs de `tasks` (ADR-042).
import { sql } from "drizzle-orm";
import {
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { projects } from "./catalog";
import { cycleState, templateKind } from "./enums";

export const cycles = pgTable(
  "cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().unique(), // "Ciclo 42"
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    state: cycleState("state").notNull().default("planned"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("cycles_one_active_uq")
      .on(t.state)
      .where(sql`state = 'active'`),
  ],
);

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  dueOn: date("due_on"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: templateKind("kind").notNull(),
  payload: jsonb("payload").notNull(), // validado por templatePayloadSchema (Zod)
  usageCount: integer("usage_count").notNull().default(0),
  createdById: text("created_by_id")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ADR-046: filtros salvos por pessoa; `filters` = query string validada por taskFiltersSchema
export const savedFilters = pgTable("saved_filters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  view: text("view").notNull(), // 'kanban' | 'list' | 'calendar'
  filters: jsonb("filters").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
