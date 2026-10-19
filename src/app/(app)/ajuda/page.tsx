import type { Metadata } from "next";
import { connection } from "next/server";
import { Topbar } from "@/components/layout/topbar";
import { SECTIONS } from "./sections";

export const metadata: Metadata = { title: "Ajuda · ITC Tasks" };

// ADR-065: manual de uso para qualquer papel logado; o (app)/layout já exige a sessão
export default async function HelpPage() {
  await connection(); // endereço do MCP e base do GLPI vêm do env de produção, não do build
  return (
    <>
      <Topbar title="Ajuda" />
      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 p-4 md:p-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-3 rounded-xl bg-accent-dark p-6 text-on-accent-dark lg:col-span-2">
          <p className="text-h2">Manual de uso</p>
          <p className="max-w-2xl">
            Tudo o que o time de TI precisa para registrar, acompanhar e concluir o trabalho do dia
            a dia no ITC Tasks. Toda tarefa tem um Projeto/Cliente; Unidade Móvel e chamado GLPI são
            opcionais. O resto é status, prazo e quem está com ela.
          </p>
        </div>
        <nav aria-label="Sumário" className="min-w-0 lg:sticky lg:top-4">
          <p className="mb-2 text-caption text-muted uppercase">Sumário</p>
          <ol className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-2 lg:grid-cols-1">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex gap-2 py-0.5 hover:text-accent-text">
                  <span className="text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex min-w-0 flex-col gap-12 text-body">
          {SECTIONS.map(({ id, C }) => (
            <C key={id} />
          ))}
        </div>
      </main>
    </>
  );
}
