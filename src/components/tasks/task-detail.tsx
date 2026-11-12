"use client";

import { Calendar, ListChecks, MessageSquare, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Priority, UpdateTaskInput } from "@/lib/validation/tasks";
import {
  type TaskFormOptions,
  type TaskResult,
  addChecklistItemAction,
  addCommentAction,
  editCommentAction,
  removeChecklistItemAction,
  setLinkAction,
  updateChecklistItemAction,
  updateTaskAction,
} from "@/server/actions/tasks";
import type { listActivity } from "@/server/services/activity";
import type { listAttachments } from "@/server/services/attachments";
import type { listComments } from "@/server/services/comments";
import type { getTaskByNumber } from "@/server/services/tasks";
import { GlpiChip, LabelChip, ProjectChip, StatusIcon, UnitChip, glpiUrl } from "./badges";
import { CommentBody, CommentEditor } from "./comment-editor";
import { DeleteTasksDialog } from "./delete-tasks-dialog";
import { DescriptionEditor } from "./description-editor";
import { type PickItem, Pick, PickMany, optionItems } from "./fields";
import { Card } from "@/components/ui/card";

type Task = NonNullable<Awaited<ReturnType<typeof getTaskByNumber>>>;
type Comment = Awaited<ReturnType<typeof listComments>>[number];
type Event = Awaited<ReturnType<typeof listActivity>>[number];
type Attachment = Awaited<ReturnType<typeof listAttachments>>[number];
type Patch = Partial<
  Pick<Task, "title" | "statusId" | "priority" | "assigneeId" | "glpiTicket" | "dueDate">
> & {
  labelIds?: string[];
  projectIds?: string[];
  mobileUnitIds?: string[];
  check?: { id: string; done: boolean };
};

const LINK_GROUPS = [
  { kind: "blocks", label: "Bloqueia" },
  { kind: "blocked_by", label: "Bloqueada por" },
  { kind: "relates", label: "Relacionada" },
] as const;

/** Item atual mesmo se arquivado (fora da lista de ativos). */
const withCurrent = (items: PickItem[], value: string | null, label: string | null) =>
  value && label && !items.some((i) => i.value === value) ? [...items, { value, label }] : items;

export function TaskDetail({
  task,
  comments,
  activity,
  attachments,
  options,
  glpiBaseUrl,
  canDelete,
  today,
}: {
  task: Task;
  comments: Comment[];
  activity: Event[];
  attachments: Attachment[];
  options: TaskFormOptions;
  glpiBaseUrl: string;
  canDelete: boolean;
  today: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // UI.md §4: atualização otimista; erro desfaz (fim da transição) e mostra toast
  const [view, apply] = useOptimistic(
    {
      ...task,
      labelIds: task.labels.map((l) => l.id),
      projectIds: task.projects.map((p) => p.id),
      mobileUnitIds: task.units.map((u) => u.id),
    },
    (t, { check, ...patch }: Patch) => ({
      ...t,
      ...patch,
      checklist: check
        ? t.checklist.map((c) => (c.id === check.id ? { ...c, done: check.done } : c))
        : t.checklist,
    }),
  );

  function act(patch: Patch, fn: () => Promise<TaskResult<unknown>>) {
    startTransition(async () => {
      apply(patch);
      const result = await fn();
      if (!result.ok) toast.error(result.error);
    });
  }
  const save = (patch: UpdateTaskInput & Patch) =>
    act(patch, () => updateTaskAction(task.id, task.number, patch));

  const items = optionItems(options);
  const labelsById = new Map([...task.labels, ...options.labels].map((l) => [l.id, l] as const));
  const done = view.checklist.filter((c) => c.done).length;

  return (
    <main className="grid gap-6 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_288px]">
      <article className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <InlineTitle value={view.title} onSave={(title) => save({ title })} />
          <div className="flex flex-wrap gap-1.5">
            {task.projects.map((p) => (
              <ProjectChip key={p.id} code={p.code} name={p.name} color={p.color} full />
            ))}
            {task.units.map((u) => (
              <UnitChip key={u.id} code={u.code} color={u.color} />
            ))}
            {view.glpiTicket && (
              <GlpiChip ticket={view.glpiTicket} href={glpiUrl(glpiBaseUrl, view.glpiTicket)} />
            )}
            {view.labelIds.map((id) => {
              const l = labelsById.get(id);
              return l && <LabelChip key={id} name={l.name} colorToken={l.colorToken} />;
            })}
          </div>
        </header>

        <section aria-labelledby="desc" className="flex flex-col gap-2">
          <h2 id="desc" className="text-h4 font-semibold">
            Descrição
          </h2>
          <DescriptionEditor
            content={task.descriptionJson as object | null}
            onSave={(descriptionJson) => save({ descriptionJson })}
          />
        </section>

        <section aria-labelledby="sub" className="flex flex-col gap-2">
          <h2 id="sub" className="flex items-center gap-2 text-h4 font-semibold">
            <ListChecks className="size-4 text-muted" aria-hidden="true" />
            Subtarefas
            {view.checklist.length > 0 && (
              <span className="text-sm font-normal text-muted tabular-nums">
                {done}/{view.checklist.length}
              </span>
            )}
          </h2>
          <ul className="flex flex-col gap-1">
            {view.checklist.map((c) => (
              <li key={c.id} className="group flex min-h-8 items-center gap-2">
                <Checkbox
                  aria-label={c.text}
                  checked={c.done}
                  onCheckedChange={(checked) =>
                    act({ check: { id: c.id, done: checked } }, () =>
                      updateChecklistItemAction(c.id, task.number, { done: checked }),
                    )
                  }
                />
                <span className={cn("min-w-0 flex-1", c.done && "text-muted line-through")}>
                  {c.text}
                </span>
                {/* mesmo padrão do prazo da tarefa: ícone em err, texto normal; concluída não atrasa */}
                {!c.done && c.dueDate && c.dueDate < today && (
                  <>
                    <Calendar
                      className="size-3.5 flex-none text-err"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="sr-only">(vencida)</span>
                  </>
                )}
                <Input
                  key={c.dueDate}
                  type="date"
                  aria-label={`Prazo de ${c.text}`}
                  className="h-7 w-auto flex-none px-1.5 text-xs tabular-nums"
                  defaultValue={c.dueDate ?? ""}
                  onChange={(e) => {
                    const dueDate = e.currentTarget.value || null;
                    act({}, () => updateChecklistItemAction(c.id, task.number, { dueDate }));
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0"
                  aria-label={`Remover ${c.text}`}
                  onClick={() => act({}, () => removeChecklistItemAction(c.id, task.number))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <AddForm
            label="Nova subtarefa"
            placeholder="Adicionar subtarefa"
            onAdd={(text) => addChecklistItemAction(task.id, task.number, text)}
          />
        </section>

        <Links task={task} />

        <Attachments task={task} attachments={attachments} />

        <Activity task={task} comments={comments} activity={activity} options={options} />
      </article>

      <Card
        as="aside"
        padding="md"
        aria-label="Propriedades"
        className="flex flex-col gap-3 lg:self-start"
      >
        <Prop label="Status">
          <Pick
            label="Status"
            items={withCurrent(items.statuses, task.statusId, task.statusName).map((i) =>
              i.value === task.statusId && !i.icon
                ? { ...i, icon: <StatusIcon category={task.category} /> }
                : i,
            )}
            value={view.statusId}
            onChange={(statusId) => save({ statusId })}
          />
        </Prop>
        <Prop label="Prioridade">
          <Pick
            label="Prioridade"
            items={items.priorities}
            value={view.priority}
            onChange={(v) => save({ priority: v as Priority })}
          />
        </Prop>
        <Prop label="Responsável">
          <Pick
            label="Responsável"
            items={withCurrent(items.people, task.assigneeId, task.assigneeName)}
            value={view.assigneeId ?? ""}
            onChange={(v) => save({ assigneeId: v || null })}
          />
        </Prop>
        <Prop label="Projeto/Cliente">
          <PickMany
            label="Projeto/Cliente"
            items={task.projects.reduce(
              (acc, p) => withCurrent(acc, p.id, `${p.code} · ${p.name}`),
              items.projects,
            )}
            value={view.projectIds}
            onChange={(projectIds) => projectIds.length && save({ projectIds })}
          />
        </Prop>
        <Prop label="Unidade Móvel">
          <PickMany
            label="Unidade Móvel"
            items={task.units.reduce(
              (acc, u) => withCurrent(acc, u.id, u.code),
              items.units(view.projectIds),
            )}
            value={view.mobileUnitIds}
            onChange={(mobileUnitIds) => save({ mobileUnitIds })}
          />
        </Prop>
        <Prop label="Chamado GLPI">
          <Input
            aria-label="Chamado GLPI"
            inputMode="numeric"
            pattern="\d{1,7}"
            className="tabular-nums"
            defaultValue={task.glpiTicket ?? ""}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v !== String(task.glpiTicket ?? "")) save({ glpiTicket: v ? Number(v) : null });
            }}
          />
        </Prop>
        <Prop label="Prazo">
          <Input
            type="date"
            aria-label="Prazo"
            className="tabular-nums"
            defaultValue={task.dueDate ?? ""}
            onChange={(e) => save({ dueDate: e.currentTarget.value || null })}
          />
        </Prop>
        <Prop label="Ciclo">
          <Pick
            label="Ciclo"
            items={withCurrent(
              items.cycles,
              task.cycleId,
              task.cycleNumber ? `Ciclo ${task.cycleNumber}` : null,
            )}
            value={view.cycleId ?? ""}
            onChange={(v) => save({ cycleId: v || null })}
          />
        </Prop>
        <Prop label="Marco">
          <Pick
            label="Marco"
            items={withCurrent(
              items.milestones(view.projectIds),
              task.milestoneId,
              task.milestoneName,
            )}
            value={view.milestoneId ?? ""}
            onChange={(v) => save({ milestoneId: v || null })}
          />
        </Prop>
        <Prop label="Etiquetas">
          <PickMany
            label="Etiquetas"
            items={withLabels(items.labels, task.labels)}
            value={view.labelIds}
            onChange={(labelIds) => save({ labelIds })}
          />
        </Prop>
        <p className="border-t pt-3 text-xs text-muted">
          Criada por {task.creatorName} em{" "}
          <time dateTime={task.createdAt.toISOString()} className="tabular-nums">
            {task.createdAt.toLocaleDateString("pt-BR")}
          </time>
          {task.completedAt && (
            <>
              {" · "}concluída em{" "}
              <time dateTime={task.completedAt.toISOString()} className="tabular-nums">
                {task.completedAt.toLocaleDateString("pt-BR")}
              </time>
            </>
          )}
        </p>
        {canDelete && (
          <DeleteTasksDialog
            tasks={[{ id: task.id, number: task.number, title: view.title }]}
            onDeleted={() => router.push("/tarefas/lista")}
            trigger={
              <Button variant="secondary" size="sm" className="self-start">
                <Trash2 strokeWidth={1.75} aria-hidden="true" />
                Excluir
              </Button>
            }
          />
        )}
      </Card>
    </main>
  );
}

const withLabels = (items: PickItem[], current: Task["labels"]) =>
  current.reduce((acc, l) => withCurrent(acc, l.id, l.name), items);

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

/** UI.md §4: clicar no título edita; Enter salva, Esc cancela. */
function InlineTitle({ value, onSave }: { value: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <h2 className="text-h2">
        <button
          type="button"
          className="w-full rounded-md text-left hover:bg-muted"
          onClick={() => setEditing(true)}
          title="Editar título"
        >
          {value}
        </button>
      </h2>
    );
  function finish(input: HTMLInputElement, commit: boolean) {
    const next = input.value.trim();
    setEditing(false);
    if (commit && next && next !== value) onSave(next);
  }
  return (
    <Input
      autoFocus
      aria-label="Título"
      defaultValue={value}
      maxLength={200}
      className="h-auto py-1 text-h2"
      onBlur={(e) => finish(e.currentTarget, true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget, true);
        if (e.key === "Escape") finish(e.currentTarget, false);
      }}
    />
  );
}

/** Campo + Enter que chama a action e limpa no sucesso. */
function AddForm({
  label,
  placeholder,
  onAdd,
  children,
}: {
  label: string;
  placeholder: string;
  onAdd: (text: string) => Promise<TaskResult<unknown>>;
  children?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const text = String(new FormData(form).get("text") ?? "").trim();
        if (!text) return;
        startTransition(async () => {
          const result = await onAdd(text);
          if (result.ok) form.reset();
          else toast.error(result.error);
        });
      }}
    >
      {children}
      <Input name="text" aria-label={label} placeholder={placeholder} autoComplete="off" />
      <Button type="submit" variant="secondary" disabled={pending}>
        Adicionar
      </Button>
    </form>
  );
}

function Links({ task }: { task: Task }) {
  const [kind, setKind] = useState<(typeof LINK_GROUPS)[number]["kind"]>("relates");
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="links" className="flex flex-col gap-2">
      <h2 id="links" className="text-h4 font-semibold">
        Vínculos
      </h2>
      {LINK_GROUPS.map((g) => {
        const rows = task.links.filter((l) => l.kind === g.kind);
        if (!rows.length) return null;
        return (
          <div key={g.kind} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-muted">{g.label}</h3>
            <ul>
              {rows.map((l) => (
                <li key={l.number} className="flex min-h-8 items-center gap-2">
                  <Link
                    href={`/tarefas/${l.number}`}
                    className="flex min-w-0 gap-2 hover:underline"
                  >
                    <span className="text-muted tabular-nums">TI-{l.number}</span>
                    <span
                      className={l.completedAt ? "truncate text-muted line-through" : "truncate"}
                    >
                      {l.title}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    disabled={pending}
                    aria-label={`Remover vínculo com TI-${l.number}`}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await setLinkAction(
                          task.id,
                          task.number,
                          { kind: g.kind, target: l.number },
                          false,
                        );
                        if (!r.ok) toast.error(r.error);
                      })
                    }
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <AddForm
        label="Número da tarefa"
        placeholder="TI-123"
        onAdd={(target) => setLinkAction(task.id, task.number, { kind, target }, true)}
      >
        <Pick
          label="Tipo de vínculo"
          items={LINK_GROUPS.map((g) => ({ value: g.kind, label: g.label }))}
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          className="w-44 flex-none"
        />
      </AddForm>
    </section>
  );
}

function When({ at }: { at: Date }) {
  return (
    <time
      dateTime={at.toISOString()}
      title={at.toLocaleString("pt-BR")}
      className="text-xs text-muted tabular-nums"
      suppressHydrationWarning
    >
      {relativeTime(at)}
    </time>
  );
}

const via = (kind: string, token: string | null) =>
  kind === "agent" && <span className="text-xs text-muted">via MCP · {token}</span>;

/** Comentários e histórico numa linha do tempo, mais recente embaixo (ADR-048). */
function Activity({
  task,
  comments,
  activity,
  options,
}: {
  task: Task;
  comments: Comment[];
  activity: Event[];
  options: TaskFormOptions;
}) {
  const entries = [
    ...comments.map((c) => ({ at: c.createdAt, comment: c, event: undefined })),
    ...activity.map((e) => ({ at: e.createdAt, event: e, comment: undefined })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const [editing, setEditing] = useState<string | null>(null);
  const done = (r: TaskResult) => {
    if (!r.ok) toast.error(r.error);
    return r.ok;
  };
  return (
    <section aria-labelledby="activity" className="flex flex-col gap-3">
      <h2 id="activity" className="flex items-center gap-2 text-h4 font-semibold">
        <MessageSquare className="size-4 text-muted" aria-hidden="true" />
        Atividade
      </h2>
      <ol className="flex flex-col gap-3">
        {entries.map(({ event: e, comment: c }) =>
          e ? (
            <li key={e.id} className="flex items-baseline gap-x-2 pl-1 text-sm text-muted">
              <span>
                <span className="font-medium text-foreground">{e.actor}</span> {e.text}
              </span>
              {via(e.actorKind, e.tokenName)}
              <When at={e.createdAt} />
            </li>
          ) : (
            <li key={c.id} className="flex gap-3">
              <Avatar initials={c.authorInitials ?? ""} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{c.authorName}</span>
                  {via(c.actorKind, c.tokenName)}
                  <When at={c.createdAt} />
                  {c.editedAt && <span className="text-xs text-muted">(editado)</span>}
                  {c.authorId === options.actorId && editing !== c.id && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setEditing(c.id)}
                    >
                      Editar
                    </Button>
                  )}
                </p>
                {editing === c.id ? (
                  <CommentEditor
                    people={options.people}
                    content={c.bodyJson as object}
                    submitLabel="Salvar"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (doc) => {
                      const ok = done(await editCommentAction(c.id, task.number, doc));
                      if (ok) setEditing(null);
                      return ok;
                    }}
                  />
                ) : (
                  <CommentBody key={String(c.editedAt)} content={c.bodyJson as object} />
                )}
              </div>
            </li>
          ),
        )}
      </ol>
      <CommentEditor
        people={options.people}
        submitLabel="Comentar"
        onSubmit={async (doc) => done(await addCommentAction(task.id, task.number, doc))}
      />
    </section>
  );
}

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

function Attachments({ task, attachments }: { task: Task; attachments: Attachment[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setPending(true);
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} passa de 25 MB`);
        continue;
      }
      const body = new FormData();
      body.set("taskId", task.id);
      body.set("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(`${file.name}: ${error ?? "falha no envio"}`);
      }
    }
    setPending(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <section aria-labelledby="files" className="flex flex-col gap-2">
      <h2 id="files" className="flex items-center gap-2 text-h4 font-semibold">
        <Paperclip className="size-4 text-muted" aria-hidden="true" />
        Anexos
      </h2>
      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex min-h-8 items-center gap-2 text-sm">
              <a
                href={`/api/attachments/${a.id}`}
                className="truncate text-accent-text hover:underline"
              >
                {a.fileName}
              </a>
              <span className="text-xs text-muted tabular-nums">{size(a.sizeBytes)}</span>
              <span className="ml-auto text-xs text-muted">
                {a.uploaderName} · <When at={a.createdAt} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Escolher arquivos"
          onChange={(e) => upload(e.currentTarget.files)}
        />
        <Button variant="secondary" disabled={pending} onClick={() => input.current?.click()}>
          <Upload aria-hidden="true" />
          {pending ? "Enviando…" : "Anexar arquivo"}
        </Button>
        <p className="mt-1 text-xs text-muted">
          Até 25 MB: imagens, PDF, texto, planilhas, documentos e ZIP.
        </p>
      </div>
    </section>
  );
}
