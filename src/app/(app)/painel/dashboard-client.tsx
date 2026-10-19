"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Pick } from "@/components/tasks/fields";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { shortDate } from "@/lib/dates";
import { DASHBOARD_DAYS } from "@/lib/validation/planning";
import { Card } from "@/components/ui/card";

export function DashboardFilters({
  projects,
  projectId,
  days,
}: {
  projects: { value: string; label: string }[];
  projectId: string;
  days: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // "" = Todos: sem ?projeto= na URL (M-139)
  const go = (p: string, d: number) =>
    router.replace(`${pathname}?${p ? `projeto=${p}&` : ""}dias=${d}`);
  return (
    <div className="flex flex-wrap gap-2">
      <div className="w-64">
        <Pick
          label="Projeto/Cliente"
          items={[{ value: "", label: "Todos os Projetos/Clientes" }, ...projects]}
          value={projectId}
          onChange={(p) => go(p, days)}
        />
      </div>
      <div className="w-40">
        <Pick
          label="Período"
          items={DASHBOARD_DAYS.map((d) => ({ value: String(d), label: `Últimos ${d} dias` }))}
          value={String(days)}
          onChange={(d) => go(projectId, Number(d))}
        />
      </div>
    </div>
  );
}

const config = { done: { label: "Concluídas", color: "var(--accent)" } };

/** P3: concluídas por semana (12 semanas); série única, sem legenda. */
export function WeeklyChart({ weeks }: { weeks: { week: string; done: number }[] }) {
  const data = weeks.map((w) => ({ ...w, label: shortDate(w.week) }));
  return (
    <Card as="section" padding="md">
      <h2 className="mb-3 text-sm font-medium">Concluídas por semana</h2>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="done" fill="var(--color-done)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>Concluídas por semana</caption>
        <tbody>
          {data.map((w) => (
            <tr key={w.week}>
              <th scope="row">Semana de {w.label}</th>
              <td>{w.done}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
