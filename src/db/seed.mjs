// Seed idempotente (docs/SCHEMA.md "Seed planejado"). JS puro para rodar igual no dev e no
// container (copiado para dist/seed.mjs).
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import pg from "pg";

const { DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || SEED_ADMIN_PASSWORD.length < 12) {
  console.error(
    "Defina DATABASE_URL, SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mín. 12 caracteres).",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const userId = randomUUID();
  // mesmos parâmetros de src/server/auth.ts (ADR-008)
  const password = await hash(SEED_ADMIN_PASSWORD, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const { rowCount } = await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, role, initials)
     VALUES ($1, 'Administrador', lower($2), true, 'admin', 'AD')
     ON CONFLICT (email) DO NOTHING`,
    [userId, SEED_ADMIN_EMAIL],
  );
  if (rowCount) {
    await client.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
      [randomUUID(), userId, password],
    );
  }
  // status e etiquetas só na primeira vez: depois são do admin (renomear, arquivar, reordenar)
  await client.query(
    `INSERT INTO workflow_statuses (name, category, position)
     SELECT * FROM (VALUES ('Backlog', 'backlog'::status_category, 1), ('A fazer', 'todo', 2),
       ('Em andamento', 'in_progress', 3), ('Concluído', 'done', 4)) v
     WHERE NOT EXISTS (SELECT 1 FROM workflow_statuses)`,
  );
  await client.query(
    `INSERT INTO labels (name, color_token)
     SELECT * FROM (VALUES ('rede', 'label-blue'), ('hardware', 'label-plum'),
       ('segurança', 'label-rose'), ('campo', 'label-teal')) v
     WHERE NOT EXISTS (SELECT 1 FROM labels)`,
  );
  // destino das tarefas do Windshift sem projeto identificável (PRD §9)
  await client.query(
    `INSERT INTO projects (code, name, kind) VALUES ('ACL', 'A classificar', 'internal')
     ON CONFLICT (code) DO NOTHING`,
  );
  // cadastros reais da ITC (ADR-044); só insere o que falta, nunca sobrescreve o admin
  await client.query(
    `INSERT INTO projects (code, name, kind)
     VALUES ('BSBIA', 'BSBIA', 'project'), ('SEDET', 'SEDET', 'project'),
       ('CODHAB', 'CODHAB', 'project'), ('QDFM', 'QDFM', 'project'), ('QMPR', 'QMPR', 'project'),
       ('MOBILITY', 'Mobility', 'client'), ('INESQ', 'INESQ', 'client'),
       ('IGEPEX', 'IGEPEX', 'client'), ('ITC', 'ITC Brasil', 'internal')
     ON CONFLICT (code) DO NOTHING`,
  );
  await client.query(
    `INSERT INTO mobile_units (code, project_id)
     SELECT v.code, p.id
     FROM (VALUES ('BSBIA01', 'BSBIA'), ('BSBIA02', 'BSBIA'), ('BSBIA03', 'BSBIA'),
       ('BSBIA04', 'BSBIA'), ('SPV01', 'SEDET'), ('SPV02', 'SEDET'), ('CODHAB01', 'CODHAB'),
       ('QDFM01', 'QDFM'), ('QDFM02', 'QDFM'), ('QDFM03', 'QDFM'), ('QDFM04', 'QDFM'),
       ('QMPR01', 'QMPR')) v(code, project)
     JOIN projects p ON p.code = v.project
     ON CONFLICT (code) DO NOTHING`,
  );
  // as 6 regras da tela Automações (ADR-052), só na primeira vez; a última nasce desligada
  await client.query(
    `INSERT INTO automation_rules (name, trigger, conditions, actions, enabled)
     SELECT * FROM (VALUES
       ('Avisar quem criou quando concluir', 'task.status_changed',
        '{"statusCategory":"done"}'::jsonb, '[{"type":"notify","to":"creator"}]'::jsonb, true),
       ('Puxar para o ciclo ao atribuir', 'task.assigned', '{"statusCategory":"backlog"}',
        jsonb_build_array(
          jsonb_build_object('type', 'setStatus', 'statusId',
            (SELECT id FROM workflow_statuses WHERE category = 'todo' AND archived_at IS NULL
             ORDER BY position LIMIT 1)),
          '{"type":"moveToActiveCycle"}'::jsonb), true),
       ('Urgente vai para o topo', 'task.priority_changed', '{"priority":"urgent"}',
        '[{"type":"notify","to":"team"},{"type":"moveToTop"}]', true),
       ('Prazo vencido', 'task.overdue', '{}', '[{"type":"notify","to":"assignee"}]', true),
       ('Lembrar de atualizar o GLPI', 'task.status_changed',
        '{"statusCategory":"done","hasGlpi":true}',
        '[{"type":"comment","text":"Atualize o chamado #{GLPI}"}]', true),
       ('Etiquetar tarefas de UM', 'task.created', '{"hasMobileUnit":true}',
        jsonb_build_array(jsonb_build_object('type', 'addLabel', 'labelId',
          (SELECT id FROM labels WHERE name = 'campo' LIMIT 1))), false)
     ) v
     WHERE NOT EXISTS (SELECT 1 FROM automation_rules)`,
  );
  await client.query("COMMIT");
  console.log(
    rowCount ? `Admin ${SEED_ADMIN_EMAIL} criado.` : `Admin ${SEED_ADMIN_EMAIL} já existe.`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
