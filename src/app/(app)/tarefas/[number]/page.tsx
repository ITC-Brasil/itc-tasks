import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { TaskDetail } from "@/components/tasks/task-detail";
import { env } from "@/lib/env";
import { taskNumberSchema } from "@/lib/validation/tasks";
import { canDeleteTask, requireActor } from "@/server/actor";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listActivity } from "@/server/services/activity";
import { listAttachments } from "@/server/services/attachments";
import { listComments } from "@/server/services/comments";
import { getTaskByNumber } from "@/server/services/tasks";

export async function generateMetadata({
  params,
}: PageProps<"/tarefas/[number]">): Promise<Metadata> {
  return { title: `TI-${(await params).number} · ITC Tasks` };
}

async function Detail({ params }: { params: PageProps<"/tarefas/[number]">["params"] }) {
  const number = taskNumberSchema.safeParse((await params).number);
  if (!number.success) notFound();
  const actor = await requireActor();
  const [task, options] = await Promise.all([
    getTaskByNumber(actor, number.data),
    getTaskFormOptionsAction(),
  ]);
  if (!task) notFound();
  const [comments, activity, attachments] = await Promise.all([
    listComments(task.id),
    listActivity(task.id),
    listAttachments(task.id),
  ]);
  return (
    <>
      <Topbar title={`TI-${task.number}`} />
      <TaskDetail
        task={task}
        comments={comments}
        activity={activity}
        attachments={attachments}
        options={options}
        glpiBaseUrl={env.GLPI_BASE_URL}
        canDelete={canDeleteTask(actor, task)}
      />
    </>
  );
}

export default function TaskPage({ params }: PageProps<"/tarefas/[number]">) {
  return (
    <Suspense>
      <Detail params={params} />
    </Suspense>
  );
}
