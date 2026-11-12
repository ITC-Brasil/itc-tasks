// Cadastros: arquivados, nunca excluídos (ADR-018)
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { projectKind, statusCategory } from "./enums";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // sigla 2–4 letras maiúsculas, ex. TRL
    name: text("name").notNull(),
    kind: projectKind("kind").notNull().default("client"),
    defaultAssigneeId: text("default_assignee_id").references(() => user.id),
    glpiEntity: text("glpi_entity"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_code_uq").on(t.code)],
);

export const mobileUnits = pgTable(
  "mobile_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // ex. UM-07
    projectId: uuid("project_id").references(() => projects.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("mobile_units_code_uq").on(t.code)],
);

export const workflowStatuses = pgTable("workflow_statuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: statusCategory("category").notNull(), // ADR-022
  position: integer("position").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    colorToken: text("color_token").notNull(), // nome do token, nunca hex
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("labels_name_uq").on(t.name)],
);
