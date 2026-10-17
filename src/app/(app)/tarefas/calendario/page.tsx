import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { MonthCalendar } from "@/components/tasks/calendar";
import { FilterBar } from "@/components/tasks/filter-bar";
import { filtersQuery } from "@/lib/validation/tasks";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { loadView } from "@/server/views";

export const metadata: Metadata = { title: "Calendário · ITC Tasks" };

async function View({ searchParams }: PageProps<"/tarefas/calendario">) {
  const { filters, tasks, options, saved, today } = await loadView(searchParams);
  const mes = (await searchParams).mes;
  const month =
    typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today.slice(0, 7);
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <FilterBar view="calendar" filters={filters} options={options} saved={saved} />
      <MonthCalendar month={month} tasks={tasks} today={today} query={filtersQuery(filters)} />
    </main>
  );
}

export default function CalendarPage(props: PageProps<"/tarefas/calendario">) {
  return (
    <>
      <Topbar title="Tarefas">
        <CreateTaskButton />
      </Topbar>
      <Suspense>
        <View {...props} />
      </Suspense>
    </>
  );
}
