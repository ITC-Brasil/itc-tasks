import { CalendarDays, Inbox, LayoutGrid, List, Lock } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { MonthCalendar } from "@/components/tasks/calendar";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskTable } from "@/components/tasks/task-table";
import { EmptyState } from "@/components/ui/empty-state";
import { type DueBucket, dueBucket, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listChecklistDue, listTasks } from "@/server/services/tasks";

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

// Módulo 15: o modo também vai na URL (?visao=); sem o parâmetro, Cards
const VIEWS = [
  { visao: "", label: "Cards", icon: LayoutGrid },
  { visao: "lista", label: "Lista", icon: List },
  { visao: "calendario", label: "Calendário", icon: CalendarDays },
] as const;
type Visao = (typeof VIEWS)[number]["visao"];

/** `/?aba=…&visao=…`, sem os valores padrão. */
const hrefOf = (aba: string, visao: string) => {
  const q = [aba && `aba=${aba}`, visao && `visao=${visao}`].filter(Boolean).join("&");
  return q ? `/?${q}` : "/";
};

async function Mine({ searchParams }: PageProps<"/">) {
  const { actor } = await requireUser();
  const params = await searchParams;
  const aba = TABS.find((t) => t.aba === params.aba)?.aba ?? "";
  const visao: Visao = VIEWS.find((v) => v.visao === params.visao)?.visao ?? "";
  const today = todayISO();
  // Cards e Lista: só o que falta resolver; o Calendário mostra também o que já foi concluído
  const { tasks } = await listTasks(
    actor,
    {},
    { ...scopeOf(aba, actor.userId), openOnly: visao !== "calendario" },
  );
  tasks.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  const nav = (
    <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2 border-b">
      <nav aria-label="Abas" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.label}
            href={hrefOf(t.aba, visao)}
            aria-current={t.aba === aba ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              t.aba === aba
                ? "border-accent font-medium text-accent-text"
                : "border-transparent text-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <span className="flex-1" />
      <nav aria-label="Visões" className="mb-1.5 flex gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.label}
            href={hrefOf(aba, v.visao)}
            aria-current={v.visao === visao ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm",
              v.visao === visao ? "bg-accent-light font-medium text-accent-text" : "text-muted",
            )}
          >
            <v.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );

  if (visao === "calendario") {
    const mes = params.mes;
    const month =
      typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today.slice(0, 7);
    const subtasks = await listChecklistDue(
      actor,
      tasks.map((t) => t.id),
    );
    return (
      <main className="flex min-w-0 flex-1 flex-col">
        {/* o calendário e a tabela trazem o próprio respiro: a barra fica sem margem de baixo */}
        <div className="px-4 pt-4 md:px-6 md:pt-6 [&>div]:mb-0">{nav}</div>
        <MonthCalendar
          month={month}
          tasks={tasks}
          milestones={[]}
          subtasks={subtasks}
          today={today}
          path="/"
          query={hrefOf(aba, visao).slice(2)}
        />
      </main>
    );
  }

  const empty =
    aba === "pessoais" ? (
      <EmptyState icon={Lock} title="Nenhuma tarefa pessoal aberta" action={<CreateTaskButton />}>
        Tarefa pessoal só você vê. Marque “Tarefa pessoal” ao criar.
      </EmptyState>
    ) : (
      <EmptyState icon={Inbox} title="Nada pendente por aqui" action={<CreateTaskButton />}>
        Você não tem tarefas abertas neste ciclo. Crie uma ou puxe algo do backlog.
      </EmptyState>
    );

  if (visao === "lista") {
    const options = tasks.length ? await getTaskFormOptionsAction() : null;
    return (
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="px-4 pt-4 md:px-6 md:pt-6 [&>div]:mb-0">{nav}</div>
        {options ? (
          <TaskTable tasks={tasks} options={options} today={today} viewer={actor} />
        ) : (
          <div className="p-4 md:p-6">{empty}</div>
        )}
      </main>
    );
  }

  const groups = Map.groupBy(tasks, (t) => dueBucket(t.dueDate, today));
  return (
    <main className="p-4 md:p-6">
      {nav}
      {tasks.length === 0
        ? empty
        : BUCKETS.map(([bucket, label]) => {
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
          })}
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
