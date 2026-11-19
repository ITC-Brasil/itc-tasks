import { CalendarDays, Columns3, Inbox, List, ListChecks, Lock, Sun } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { MonthCalendar } from "@/components/tasks/calendar";
import { Board } from "@/components/tasks/board";
import { NoResults } from "@/components/tasks/no-results";
import { SearchField } from "@/components/tasks/search-field";
import { TaskTable } from "@/components/tasks/task-table";
import { EmptyState } from "@/components/ui/empty-state";
import { dueKey, isOverdue, shortDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listStatuses } from "@/server/services/catalog";
import { listChecklistDue, listTasks } from "@/server/services/tasks";

// ADR-069: a aba vai na URL (?aba=); Módulo 16: sem o parâmetro, "Hoje"
const TABS = [
  { aba: "", label: "Hoje" },
  { aba: "minhas", label: "Minhas tarefas" },
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
    default: // Hoje e Minhas tarefas: as pessoais (sempre dela) e as da equipe com ela
      return { visibility: "all", assigneeId: userId };
  }
}

// Módulo 16: o modo vai na URL (?visao=); sem o parâmetro, Kanban (substitui os Cards por prazo)
const VIEWS = [
  { visao: "", label: "Kanban", icon: Columns3 },
  { visao: "lista", label: "Lista", icon: List },
  { visao: "calendario", label: "Calendário", icon: CalendarDays },
] as const;
type Visao = (typeof VIEWS)[number]["visao"];

/** `/?aba=…&visao=…&q=…`, sem os valores padrão; a busca (Módulo 18) segue entre abas e visões. */
const hrefOf = (aba: string, visao: string, search = "") => {
  const q = new URLSearchParams();
  if (aba) q.set("aba", aba);
  if (visao) q.set("visao", visao);
  if (search) q.set("q", search);
  const s = q.toString();
  return s ? `/?${s}` : "/";
};

async function Mine({ searchParams }: PageProps<"/">) {
  const { actor } = await requireUser();
  const params = await searchParams;
  const aba = TABS.find((t) => t.aba === params.aba)?.aba ?? "";
  const visao: Visao = VIEWS.find((v) => v.visao === params.visao)?.visao ?? "";
  const today = todayISO();
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  // Kanban e Lista: só o que falta resolver; o Calendário mostra também o que já foi concluído
  const { tasks: scoped } = await listTasks(actor, search ? { q: [search] } : {}, {
    ...scopeOf(aba, actor.userId),
    openOnly: visao !== "calendario",
  });
  // Módulo 16, aba Hoje: com prazo até hoje (atrasadas e de hoje) e as subtarefas abertas idem
  const hoje = aba === "";
  const tasks = hoje
    ? scoped.filter((t) => t.category !== "done" && t.dueDate && t.dueDate <= today)
    : scoped;
  const todaySubtasks =
    hoje && !search
      ? (
          await listChecklistDue(
            actor,
            scoped.filter((t) => t.category !== "done").map((t) => t.id),
          )
        )
          .filter((s) => s.dueDate <= today)
          .sort((a, b) => dueKey(a.dueDate, a.dueTime).localeCompare(dueKey(b.dueDate, b.dueTime)))
      : [];
  tasks.sort((a, b) => dueKey(a.dueDate, a.dueTime).localeCompare(dueKey(b.dueDate, b.dueTime)));

  const nav = (
    <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2 border-b">
      <nav aria-label="Abas" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.label}
            href={hrefOf(t.aba, visao, search)}
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
      <div className="mb-1.5">
        <SearchField />
      </div>
      <nav aria-label="Visões" className="mb-1.5 flex gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.label}
            href={hrefOf(aba, v.visao, search)}
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
          query={hrefOf(aba, visao, search).slice(2)}
        />
      </main>
    );
  }

  const empty = search ? (
    <NoResults href={hrefOf(aba, visao)} query={search} />
  ) : hoje ? (
    <EmptyState icon={Sun} title="Nada para hoje" action={<CreateTaskButton />}>
      Nenhuma tarefa ou subtarefa sua vence hoje ou está atrasada.
    </EmptyState>
  ) : aba === "pessoais" ? (
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
        {hoje && todaySubtasks.length > 0 && (
          <div className="px-4 pt-4 md:px-6">
            <TodaySubtasks subtasks={todaySubtasks} />
          </div>
        )}
        {options ? (
          // na aba Hoje a ordem por prazo já põe as atrasadas primeiro
          <TaskTable tasks={tasks} options={options} today={today} viewer={actor} />
        ) : (
          !(hoje && todaySubtasks.length) && <div className="p-4 md:p-6">{empty}</div>
        )}
      </main>
    );
  }

  // Kanban com colunas por status, como em Tarefas (também na aba Hoje); arrastar muda o status
  const statuses = tasks.length ? await listStatuses(actor) : [];
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="px-4 pt-4 md:px-6 md:pt-6 [&>div]:mb-0">{nav}</div>
      {hoje && todaySubtasks.length > 0 && (
        <div className="px-4 pt-4 md:px-6">
          <TodaySubtasks subtasks={todaySubtasks} />
        </div>
      )}
      {tasks.length ? (
        <Board statuses={statuses} tasks={tasks} today={today} />
      ) : (
        !(hoje && todaySubtasks.length) && <div className="p-4 md:p-6">{empty}</div>
      )}
    </main>
  );
}

type DueSubtask = Awaited<ReturnType<typeof listChecklistDue>>[number];

/** Aba Hoje: subtarefas com prazo hoje ou atrasadas, com rótulo e link para a tarefa. */
function TodaySubtasks({ subtasks }: { subtasks: DueSubtask[] }) {
  const groups = Map.groupBy(subtasks, (s) => (isOverdue(s.dueDate, s.dueTime) ? 0 : 1));
  return (
    <section aria-labelledby="g-subtarefas" className="mb-6">
      <h2 id="g-subtarefas" className="mb-2 text-sm font-semibold">
        Subtarefas <span className="font-normal text-muted tabular-nums">{subtasks.length}</span>
      </h2>
      {([0, 1] as const).map((g) => {
        const list = groups.get(g);
        if (!list) return null;
        return (
          <div key={g} className="mb-2">
            <h3 className="mb-1 text-xs font-medium text-muted">{g ? "Hoje" : "Atrasadas"}</h3>
            <ul className="flex flex-col gap-1">
              {list.map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border bg-surface px-3 py-2 text-sm",
                    !g && "border-l-2 border-l-err",
                  )}
                >
                  <ListChecks
                    className="size-4 flex-none text-muted"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-muted">Subtarefa</span>
                  <span className="min-w-0 flex-1 truncate">{s.text}</span>
                  {!g && <span className="sr-only">(vencida)</span>}
                  {(s.dueTime || s.dueDate !== todayISO()) && (
                    <span className="text-xs text-muted tabular-nums">
                      {[s.dueDate !== todayISO() && shortDate(s.dueDate), s.dueTime]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  )}
                  <Link
                    href={`/tarefas/${s.number}`}
                    className="text-xs text-accent-text tabular-nums hover:underline"
                  >
                    TI-{s.number}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// Módulo 18: "Início" virou "Minhas Tarefas"; a URL continua "/" (sem redirect a manter)
export const metadata: Metadata = { title: "Minhas Tarefas · ITC Tasks" };

export default function Home(props: PageProps<"/">) {
  return (
    <>
      <Topbar title="Minhas Tarefas">
        <CreateTaskButton />
      </Topbar>
      <Suspense>
        <Mine {...props} />
      </Suspense>
    </>
  );
}
