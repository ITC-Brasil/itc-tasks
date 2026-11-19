import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { FilterBar } from "@/components/tasks/filter-bar";
import { LimitNotice, NoResults } from "@/components/tasks/no-results";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { TaskTable } from "@/components/tasks/task-table";
import { requireActor } from "@/server/actor";
import { loadView } from "@/server/views";

export const metadata: Metadata = { title: "Lista · Equipe · ITC Tasks" };

async function View({ searchParams }: PageProps<"/tarefas/lista">) {
  const [{ filters, tasks, truncated, options, saved, today }, actor] = await Promise.all([
    loadView(searchParams),
    requireActor(),
  ]);
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <FilterBar view="list" filters={filters} options={options} saved={saved} />
      <LimitNotice truncated={truncated} />
      {tasks.length ? (
        <TaskTable tasks={tasks} options={options} today={today} viewer={actor} />
      ) : (
        <NoResults href="/tarefas/lista" />
      )}
    </main>
  );
}

export default function ListPage(props: PageProps<"/tarefas/lista">) {
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
