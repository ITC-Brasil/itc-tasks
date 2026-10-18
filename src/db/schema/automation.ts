// Automações (Módulo 09, ADR-052). Regras não são excluídas, só desligadas.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  trigger: text("trigger").notNull(), // AUTOMATION_TRIGGERS
  conditions: jsonb("conditions").notNull(), // automationConditionsSchema
  actions: jsonb("actions").notNull(), // automationActionsSchema
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_runs_rule_created_idx").on(t.ruleId, t.createdAt)],
);
