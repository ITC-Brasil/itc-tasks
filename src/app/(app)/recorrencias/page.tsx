import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { todayISO } from "@/lib/dates";
import { taskNumberSchema } from "@/lib/validation/tasks";
import { requireActor } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listRecurrences } from "@/server/services/recurrences";
import { getTaskByNumber } from "@/server/services/tasks";
import { type Draft, RecurrenceDialog, RecurrencesView } from "./recurrences-client";

export const metadata: Metadata = { title: "Recorrências · ITC Tasks" };

/** "Repetir esta tarefa": a tarefa (que o ator vê) vira o rascunho da regra. */
async function draftFrom(tarefa: string | string[] | undefined): Promise<Draft | undefined> {
  const n = taskNumberSchema.safeParse(tarefa);
  if (!n.success) return undefined;
  const task = await getTaskByNumber(await requireActor(), n.data);
  if (!task) return undefined;
  return {
    name: task.title.slice(0, 100),
    visibility: task.visibility,
    payload: {
      title: task.title,
      descriptionJson: task.descriptionJson as never,
      priority: task.priority,
      assigneeId: task.assigneeId,
      projectIds: task.projects.map((p) => p.id),
      mobileUnitIds: task.units.map((u) => u.id),
      labelIds: task.labels.map((l) => l.id),
      involvedIds: task.involved.map((p) => p.id),
      checklist: task.checklist.map((c) => c.text),
    },
  };
}

async function Recurrences({ searchParams }: PageProps<"/recorrencias">) {
  const actor = await requireActor();
  const [options, rules, draft] = await Promise.all([
    getTaskFormOptionsAction(),
    listRecurrences(actor),
    searchParams.then((p) => draftFrom(p.tarefa)),
  ]);
  return (
    <>
      <Topbar title="Recorrências">
        <RecurrenceDialog
          key={draft ? "draft" : "new"}
          options={options}
          draft={draft}
          today={todayISO()}
          meId={actor.userId}
        />
      </Topbar>
      <main className="flex flex-col gap-5 p-4 md:p-6">
        <RecurrencesView rules={rules} options={options} today={todayISO()} meId={actor.userId} />
      </main>
    </>
  );
}

export default function RecurrencesPage(props: PageProps<"/recorrencias">) {
  return (
    <Suspense>
      <Recurrences {...props} />
    </Suspense>
  );
}
