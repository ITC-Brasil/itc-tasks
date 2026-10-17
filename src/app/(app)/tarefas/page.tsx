import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Board } from "@/components/tasks/board";
import { LimitNotice } from "@/components/tasks/no-results";
import { FilterBar } from "@/components/tasks/filter-bar";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { loadView } from "@/server/views";

export const metadata: Metadata = { title: "Kanban · ITC Tasks" };

async function View({ searchParams }: PageProps<"/tarefas">) {
  const { filters, tasks, truncated, options, saved, today } = await loadView(searchParams, {
    recentDone: true,
  });
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <FilterBar view="kanban" filters={filters} options={options} saved={saved} />
      <LimitNotice truncated={truncated} />
      <Board statuses={options.statuses} tasks={tasks} today={today} />
    </main>
  );
}

export default function KanbanPage(props: PageProps<"/tarefas">) {
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
