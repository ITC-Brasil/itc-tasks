"use client";

import { ListChecks, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Priority, UpdateTaskInput } from "@/lib/validation/tasks";
import {
  type TaskFormOptions,
  type TaskResult,
  addChecklistItemAction,
  removeChecklistItemAction,
  setLinkAction,
  updateChecklistItemAction,
  updateTaskAction,
} from "@/server/actions/tasks";
import type { getTaskByNumber } from "@/server/services/tasks";
import { GlpiChip, LabelChip, ProjectChip, StatusIcon, UnitChip, glpiUrl } from "./badges";
import { DescriptionEditor } from "./description-editor";
import { type PickItem, Pick, PickMany, optionItems } from "./fields";

type Task = NonNullable<Awaited<ReturnType<typeof getTaskByNumber>>>;
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
  options,
  glpiBaseUrl,
}: {
  task: Task;
  options: TaskFormOptions;
  glpiBaseUrl: string;
}) {
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
              <ProjectChip key={p.id} code={p.code} name={p.name} />
            ))}
            {task.units.map((u) => (
              <UnitChip key={u.id} code={u.code} />
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
                <span className={c.done ? "text-muted line-through" : undefined}>{c.text}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
      </article>

      <aside
        aria-label="Propriedades"
        className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-1 lg:self-start"
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
      </aside>
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
