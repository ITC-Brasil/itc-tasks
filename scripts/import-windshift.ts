// Importação das tarefas abertas do Windshift (ADR-056).
// Uso: node dist/import-windshift.mjs <pasta> [--dry-run]
import { pool } from "@/db";
import { importWindshift, loadExport } from "@/server/services/windshift-import";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("Uso: import-windshift <pasta da exportação> [--dry-run]");
    return 2;
  }
  const r = await importWindshift({ kind: "system" }, loadExport(dir), { dryRun });

  console.table(
    r.rows.map((row) => ({
      origem: row.key,
      título: row.title.slice(0, 50),
      projeto: row.projects.join(", "),
      UM: row.units.join(", "),
      status: row.status,
      prioridade: row.priority,
      responsável: row.assignee ?? "—",
    })),
  );
  for (const i of r.ignored) console.log(`ignorada ${i.key}: ${i.reason}`);
  for (const a of r.assigneeNotFound)
    console.log(`sem responsável ${a.key}: ${a.email} não é membro ativo`);
  for (const e of r.errors) console.error(`ERRO ${e.key}: ${e.reason}`);
  console.log(
    `\n${dryRun ? "Prévia (nada gravado)" : r.errors.length ? "Nada gravado" : "Importação concluída"}: ` +
      `${r.rows.length} a importar, ${r.imported} importadas, ${r.skipped.length} já importadas (puladas), ` +
      `${r.inFallback} em ACL, ${r.ignored.length} ignoradas, ${r.assigneeNotFound.length} sem responsável, ` +
      `${r.errors.length} erros.`,
  );
  return r.errors.length ? 1 : 0;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
