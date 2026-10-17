import { pgEnum } from "drizzle-orm/pg-core";

// Os outros enums de docs/SCHEMA.md entram com as tabelas que os usam
export const statusCategory = pgEnum("status_category", ["backlog", "todo", "in_progress", "done"]);
export const projectKind = pgEnum("project_kind", ["client", "internal"]);
