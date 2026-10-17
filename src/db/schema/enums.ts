import { pgEnum } from "drizzle-orm/pg-core";

// Os outros enums de docs/SCHEMA.md entram com as tabelas que os usam
export const statusCategory = pgEnum("status_category", ["backlog", "todo", "in_progress", "done"]);
export const projectKind = pgEnum("project_kind", ["client", "internal"]);
export const taskPriority = pgEnum("task_priority", ["none", "low", "medium", "high", "urgent"]);
export const actorKind = pgEnum("actor_kind", ["user", "agent", "automation", "system"]);
export const linkKind = pgEnum("link_kind", ["blocks", "relates"]);
export const cycleState = pgEnum("cycle_state", ["planned", "active", "closed"]);
export const templateKind = pgEnum("template_kind", ["task", "project"]);
