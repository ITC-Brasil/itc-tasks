import { Inbox, ListChecks, Lock, Sun } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { MonthCalendar } from "@/components/tasks/calendar";
import { Board } from "@/components/tasks/board";
import { NoResults } from "@/components/tasks/no-results";
import { ViewTabs } from "@/components/tasks/view-tabs";
import { OverdueToggle, ViewToolbar } from "@/components/tasks/view-toolbar";
import { TaskTable } from "@/components/tasks/task-table";
import { EmptyState } from "@/components/ui/empty-state";
import { dueKey, isOverdue, shortDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listStatuses } from "@/server/services/catalog";
import { listChecklistDue, listTasks } from "@/server/services/tasks";
import { mineScope } from "@/server/views";

// ADR-069: a aba vai na URL (?aba=); Módulo 16: sem o parâmetro, "Hoje"
// Módulo 18, item 14: `about` explica a aba (tooltip no desktop, "i" no celular)
const TABS = [
  { aba: "", label: "Hoje", about: "Tarefas com prazo para hoje e atrasadas." },
  {
    aba: "minhas",
    label: "Minhas tarefas",
    about: "Suas tarefas pessoais e as da equipe atribuídas a você.",
  },
  { aba: "pessoais", label: "Pessoais", about: "Tarefas só suas. Ninguém mais vê, nem o admin." },
  {
    aba: "atribuidas",
    label: "Atribuídas",
    about: "Tarefas da equipe em que você é o responsável.",
  },
  { aba: "criadas", label: "Criadas", about: "Tarefas da equipe que você criou." },
  {
    aba: "mencoes",
    label: "Menções",
    about: "Tarefas em que alguém mencionou você nos comentários.",
  },
];

// Módulo 16: o modo vai na URL (?visao=); sem o parâmetro, Kanban (substitui os Cards por prazo)
const VIEWS = [
  { visao: "", label: "Kanban", icon: "kanban" },
  { visao: "lista", label: "Lista", icon: "list" },
  { visao: "calendario", label: "Calendário", icon: "calendar" },
] as const;
type Visao = (typeof VIEWS)[number]["visao"];

/** `/?aba=…&visao=…&q=…`, sem os valores padrão; a busca (Módulo 18) segue entre abas e visões. */
const hrefOf = (aba: string, visao: string, search = "", late = false) => {
  const q = new URLSearchParams();
  if (aba) q.set("aba", aba);
  if (visao) q.set("visao", visao);
  if (search) q.set("q", search);
  if (late) q.set("atrasadas", "1");
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
  const doneOnly = visao === "lista" && params.concluidas === "1";
  const late = params.atrasadas === "1"; // Módulo 18: filtro Atrasadas (atalho no contador)
  const { tasks: listed } = await listTasks(
    actor,
    { q: search ? [search] : [], overdue: late ? ["1"] : [] },
    mineScope(aba, visao, actor.userId),
  );
  const scoped = doneOnly ? listed.filter((t) => t.category === "done") : listed;
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
    <ViewToolbar
      tabs={
        <ViewTabs
          tabs={TABS.map((t) => ({
            label: t.label,
            about: t.about,
            href: hrefOf(t.aba, visao, search, late),
            active: t.aba === aba,
          }))}
        />
      }
      views={VIEWS.map((v) => ({
        label: v.label,
        icon: v.icon,
        href: hrefOf(aba, v.visao, search, late),
        active: v.visao === visao,
      }))}
      filterCount={late ? 1 : 0}
    >
      <OverdueToggle />
    </ViewToolbar>
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
        {nav}
        <MonthCalendar
          month={month}
          tasks={tasks}
          milestones={[]}
          subtasks={subtasks}
          today={today}
          path="/"
          query={hrefOf(aba, visao, search, late).slice(2)}
        />
      </main>
    );
  }

  const empty = search ? (
    <NoResults href={hrefOf(aba, visao, "", late)} query={search} />
  ) : late ? (
    <NoResults href={hrefOf(aba, visao)} />
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
        {nav}
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
      {nav}
      {hoje && todaySubtasks.length > 0 && (
        <div className="px-4 pt-4 md:px-6">
          <TodaySubtasks subtasks={todaySubtasks} />
        </div>
      )}
      {tasks.length ? (
        <Board
          statuses={statuses}
          tasks={tasks}
          today={today}
          olderDoneHref={`${hrefOf(aba || "minhas", "lista", search, late)}&concluidas=1`}
        />
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
