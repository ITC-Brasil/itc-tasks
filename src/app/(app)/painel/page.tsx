import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireActor } from "@/server/actor";
import { listProjects } from "@/server/services/catalog";
import { projectDashboard } from "@/server/services/planning";
import { DashboardFilters, WeeklyChart } from "./dashboard-client";

export const metadata: Metadata = { title: "Painel · ITC Tasks" };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface p-4 shadow-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-h2 font-bold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { name: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="rounded-xl bg-surface p-4 shadow-1">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {rows.length ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li
              key={r.name}
              className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm"
            >
              <span className="truncate">{r.name}</span>
              <span className="h-2 rounded-full bg-base">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${(r.n / max) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{r.n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nada aberto.</p>
      )}
    </section>
  );
}

async function Dashboard({ searchParams }: PageProps<"/painel">) {
  const actor = await requireActor();
  const params = await searchParams;
  const projects = await listProjects(actor);
  if (!projects.length)
    return (
      <EmptyState icon={ChartColumn} title="Nenhum Projeto/Cliente">
        Cadastre um Projeto/Cliente para ver o painel.
      </EmptyState>
    );
  const chosen = projects.find((p) => p.id === params.projeto) ?? projects[0];
  const d = await projectDashboard({ projectId: chosen.id, days: params.dias });
  return (
    <main className="flex flex-col gap-5 p-4 md:p-6">
      <DashboardFilters
        projects={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
        projectId={chosen.id}
        days={d.days}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Abertas" value={String(d.open)} />
        <Tile label={`Concluídas em ${d.days} dias`} value={String(d.done)} />
        <Tile label="Vencidas" value={String(d.overdue)} hint="Abertas com prazo antes de hoje" />
        <Tile
          label="Tempo médio até concluir"
          value={d.avgDays === null ? "—" : `${d.avgDays.toLocaleString("pt-BR")} d`}
          hint={`Concluídas em ${d.days} dias`}
        />
      </div>
      <WeeklyChart weeks={d.weeks} />
      <div className="grid gap-3 md:grid-cols-2">
        <Bars title="Abertas por status" rows={d.byStatus} />
        <Bars
          title="Abertas por Unidade Móvel"
          rows={d.byUnit.map((u) => ({ name: u.code, n: u.n }))}
        />
      </div>
    </main>
  );
}

export default function DashboardPage(props: PageProps<"/painel">) {
  return (
    <>
      <Topbar title="Painel" />
      <Suspense>
        <Dashboard {...props} />
      </Suspense>
    </>
  );
}
