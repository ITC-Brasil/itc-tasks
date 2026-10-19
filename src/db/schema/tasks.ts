// Tarefas (docs/SCHEMA.md). task_events é só-inserção.
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { apikey, user } from "./auth";
import { labels, mobileUnits, projects, workflowStatuses } from "./catalog";
import { actorKind, linkKind, taskPriority } from "./enums";
import { cycles, milestones } from "./planning";

// índice fracionário (ADR-014/042): ordena por byte, não pela collation do banco
const position = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number")
      .notNull()
      .unique()
      .default(sql`nextval('task_number_seq')`), // TI-<number>, ADR-021
    title: text("title").notNull(),
    descriptionJson: jsonb("description_json"), // documento Tiptap
    descriptionText: text("description_text").notNull().default(""),
    statusId: uuid("status_id")
      .notNull()
      .references(() => workflowStatuses.id),
    priority: taskPriority("priority").notNull().default("none"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id), // obrigatório
    mobileUnitId: uuid("mobile_unit_id").references(() => mobileUnits.id),
    glpiTicket: integer("glpi_ticket"), // ADR-023
    assigneeId: text("assignee_id").references(() => user.id),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id),
    cycleId: uuid("cycle_id").references(() => cycles.id),
    milestoneId: uuid("milestone_id").references(() => milestones.id),
    dueDate: date("due_date"),
    position: position("position").notNull(),
    createdVia: actorKind("created_via").notNull().default("user"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('portuguese', unaccent_immutable(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('portuguese', unaccent_immutable(coalesce(description_text, ''))), 'B')`,
    ),
  },
  (t) => [
    index("tasks_status_position_idx").on(t.statusId, t.position),
    index("tasks_assignee_due_idx").on(t.assigneeId, t.dueDate),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_cycle_idx").on(t.cycleId),
    index("tasks_glpi_idx").on(t.glpiTicket),
    index("tasks_search_idx").using("gin", t.search),
  ],
);

// "Subtarefas" — ADR-019
export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  assigneeId: text("assignee_id").references(() => user.id),
  position: position("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskLinks = pgTable(
  "task_links",
  {
    fromTaskId: uuid("from_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    toTaskId: uuid("to_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: linkKind("kind").notNull(), // 'blocks' = from bloqueia to
  },
  (t) => [primaryKey({ columns: [t.fromTaskId, t.toTaskId, t.kind] })],
);

// ADR-045: todos os Projetos/Clientes e UMs da tarefa; tasks.project_id é o principal
export const taskProjects = pgTable(
  "task_projects",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.projectId] }),
    index("task_projects_project_idx").on(t.projectId),
  ],
);

export const taskMobileUnits = pgTable(
  "task_mobile_units",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    mobileUnitId: uuid("mobile_unit_id")
      .notNull()
      .references(() => mobileUnits.id),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.mobileUnitId] }),
    index("task_mobile_units_unit_idx").on(t.mobileUnitId),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

// tela no Módulo 06
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
  actorKind: actorKind("actor_kind").notNull().default("user"),
  apiKeyId: text("api_key_id").references(() => apikey.id),
  bodyJson: jsonb("body_json").notNull(),
  bodyText: text("body_text").notNull(),
  mentions: text("mentions")
    .array()
    .notNull()
    .default(sql`'{}'`), // user ids
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
});

// só-inserção; tipos e payload no ADR-042
export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorKind: actorKind("actor_kind").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id),
    apiKeyId: text("api_key_id").references(() => apikey.id),
    automationRuleId: uuid("automation_rule_id"),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`), // { field, from, to }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_events_task_created_idx").on(t.taskId, t.createdAt)],
);

// arquivo em UPLOADS_DIR — ADR-025; tela no Módulo 06
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  uploaderId: text("uploader_id")
    .notNull()
    .references(() => user.id),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(), // ≤ 26_214_400 (25 MB)
  storageKey: text("storage_key").notNull(), // uuid do arquivo no volume
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// origem de tarefas importadas — ADR-056; o único em (source, source_id) torna a importação idempotente
export const taskImports = pgTable(
  "task_imports",
  {
    taskId: uuid("task_id")
      .primaryKey()
      .references(() => tasks.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // "windshift"
    sourceId: text("source_id").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("task_imports_source_uq").on(t.source, t.sourceId)],
);

// rastro da exclusão definitiva — ADR-063; sem FK para `tasks`, sobrevive à tarefa
export const taskDeletions = pgTable("task_deletions", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: integer("number").notNull(), // TI-<number>, nunca reaproveitado
  title: text("title").notNull(),
  deletedBy: text("deleted_by")
    .notNull()
    .references(() => user.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});
