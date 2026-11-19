import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { MonthCalendar } from "@/components/tasks/calendar";
import { LimitNotice } from "@/components/tasks/no-results";
import { FilterBar } from "@/components/tasks/filter-bar";
import { filtersQuery } from "@/lib/validation/tasks";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { monthGrid } from "@/lib/dates";
import { milestonesDue } from "@/server/services/planning";
import { loadView } from "@/server/views";

export const metadata: Metadata = { title: "Calendário · Equipe · ITC Tasks" };

async function View({ searchParams }: PageProps<"/tarefas/calendario">) {
  const { filters, tasks, truncated, options, saved, today } = await loadView(searchParams);
  const mes = (await searchParams).mes;
  const month =
    typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today.slice(0, 7);
  const days = monthGrid(month);
  const marks = (await milestonesDue(days[0], days.at(-1)!)).filter(
    (m) => !filters.projectIds.length || filters.projectIds.includes(m.projectId),
  );
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <FilterBar view="calendar" filters={filters} options={options} saved={saved} />
      <LimitNotice truncated={truncated} />
      <MonthCalendar
        month={month}
        tasks={tasks}
        milestones={marks}
        today={today}
        query={filtersQuery(filters)}
      />
    </main>
  );
}

export default function CalendarPage(props: PageProps<"/tarefas/calendario">) {
  return (
    <>
      <Topbar title="Equipe">
        <CreateTaskButton />
      </Topbar>
      <Suspense>
        <View {...props} />
      </Suspense>
    </>
  );
}
