import { Inbox } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { TaskCard } from "@/components/tasks/task-card";
import { EmptyState } from "@/components/ui/empty-state";
import { type DueBucket, dueBucket, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/actor";
import { listTasks } from "@/server/services/tasks";

const BUCKETS: [DueBucket, string][] = [
  ["overdue", "Vencidas"],
  ["today", "Hoje"],
  ["week", "Esta semana"],
  ["later", "Depois"],
];
const TABS = [
  { aba: "", label: "Atribuídas" },
  { aba: "criadas", label: "Criadas" },
]; // ponytail: aba "Menções" chega com os comentários (Módulo 06)

async function Mine({ searchParams }: PageProps<"/">) {
  const { actor } = await requireUser();
  const created = (await searchParams).aba === "criadas";
  const today = todayISO();
  const { tasks } = await listTasks(
    actor,
    {},
    created
      ? { creatorId: actor.userId, openOnly: true }
      : { assigneeId: actor.userId, openOnly: true },
  );
  tasks.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const groups = Map.groupBy(tasks, (t) => dueBucket(t.dueDate, today));
  return (
    <main className="p-4 md:p-6">
      <nav aria-label="Abas" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => {
          const active = (t.aba === "criadas") === created;
          return (
            <Link
              key={t.label}
              href={t.aba ? `/?aba=${t.aba}` : "/"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                active
                  ? "border-accent font-medium text-accent-text"
                  : "border-transparent text-muted",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {tasks.length === 0 ? (
        <EmptyState icon={Inbox} title="Nada pendente por aqui" action={<CreateTaskButton />}>
          Você não tem tarefas abertas neste ciclo. Crie uma ou puxe algo do backlog.
        </EmptyState>
      ) : (
        BUCKETS.map(([bucket, label]) => {
          const list = groups.get(bucket);
          if (!list) return null;
          return (
            <section key={bucket} aria-labelledby={`g-${bucket}`} className="mb-6">
              <h2 id={`g-${bucket}`} className="mb-2 text-sm font-semibold">
                {label} <span className="font-normal text-muted tabular-nums">{list.length}</span>
              </h2>
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => (
                  <li key={t.id}>
                    <TaskCard task={t} today={today} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}

export default function MyTasks(props: PageProps<"/">) {
  return (
    <>
      <Topbar title="Minhas tarefas">
        <CreateTaskButton />
      </Topbar>
      <Suspense>
        <Mine {...props} />
      </Suspense>
    </>
  );
}
