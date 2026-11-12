import { Inbox, Lock } from "lucide-react";
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
// ADR-069: a aba vai na URL (?aba=); sem o parâmetro, "Minhas tarefas"
const TABS = [
  { aba: "", label: "Minhas tarefas" },
  { aba: "pessoais", label: "Pessoais" },
  { aba: "atribuidas", label: "Atribuídas" },
  { aba: "criadas", label: "Criadas" },
  { aba: "mencoes", label: "Menções" },
];
type Scope = NonNullable<Parameters<typeof listTasks>[2]>;
/** O que cada aba lista; o service ainda aplica o visibleTo(actor) em todas. */
function scopeOf(aba: unknown, userId: string): Scope {
  switch (aba) {
    case "pessoais": // criadas pela pessoa e visíveis só para ela
      return { visibility: "personal" };
    case "atribuidas": // da equipe, atribuídas à pessoa
      return { assigneeId: userId };
    case "criadas": // da equipe, criadas pela pessoa (as pessoais ficam na aba própria)
      return { creatorId: userId };
    case "mencoes":
      return { mentionedUserId: userId };
    default: // tudo o que a pessoa tem de resolver: as pessoais (sempre dela) e as da equipe com ela
      return { visibility: "all", assigneeId: userId };
  }
}

async function Mine({ searchParams }: PageProps<"/">) {
  const { actor } = await requireUser();
  const aba = (await searchParams).aba;
  const scope = scopeOf(aba, actor.userId);
  const today = todayISO();
  const { tasks } = await listTasks(actor, {}, { ...scope, openOnly: true });
  tasks.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const groups = Map.groupBy(tasks, (t) => dueBucket(t.dueDate, today));
  return (
    <main className="p-4 md:p-6">
      <nav aria-label="Abas" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => {
          const active = t.aba === (TABS.some((x) => x.aba === aba) ? aba : "");
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
        aba === "pessoais" ? (
          <EmptyState
            icon={Lock}
            title="Nenhuma tarefa pessoal aberta"
            action={<CreateTaskButton />}
          >
            Tarefa pessoal só você vê. Marque “Tarefa pessoal” ao criar.
          </EmptyState>
        ) : (
          <EmptyState icon={Inbox} title="Nada pendente por aqui" action={<CreateTaskButton />}>
            Você não tem tarefas abertas neste ciclo. Crie uma ou puxe algo do backlog.
          </EmptyState>
        )
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
