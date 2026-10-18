"use client";

import { LayoutTemplate, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArchiveButton, FieldLabel, FormDialog } from "@/app/(app)/config/config-ui";
import { LabelChip, PriorityIcon, priorityLabel, TextChip } from "@/components/tasks/badges";
import { Pick, PickMany, optionItems } from "@/components/tasks/fields";
import { openQuickCreate } from "@/components/tasks/quick-create";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type TemplateInput,
  formatTaskOutline,
  parseTaskOutline,
} from "@/lib/validation/templates";
import type { Priority } from "@/lib/validation/tasks";
import {
  applyProjectTemplateAction,
  saveTemplateAction,
  setTemplateArchivedAction,
} from "@/server/actions/templates";
import type { TaskFormOptions } from "@/server/actions/tasks";
import { Card } from "@/components/ui/card";

type TaskPayload = {
  title?: string;
  priority?: Priority;
  labelIds?: string[];
  checklist?: string[];
  dueInDays?: number;
};
type Template = {
  id: string;
  name: string;
  kind: "task" | "project";
  payload: unknown;
  usageCount: number;
  archivedAt: Date | null;
  createdBy: string;
};

const KINDS = [
  { value: "task", label: "Template de tarefa" },
  { value: "project", label: "Template de projeto" },
];
const textarea =
  "min-h-32 w-full rounded-control border border-input bg-surface px-3 py-2 text-[16px] shadow-1 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light md:text-sm";

const tasksOf = (t: Template) =>
  t.kind === "project"
    ? ((t.payload as { tasks?: TaskPayload[] }).tasks ?? [])
    : [t.payload as TaskPayload];
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function TemplateDialog({
  template,
  options,
}: {
  template?: Template;
  options: TaskFormOptions;
}) {
  const [kind, setKind] = useState<"task" | "project">(template?.kind ?? "task");
  const task = (template?.kind === "task" ? template.payload : {}) as TaskPayload;
  const [labelIds, setLabelIds] = useState(task.labelIds ?? []);
  const [priority, setPriority] = useState<Priority>(task.priority ?? "none");
  const items = optionItems(options);

  function input(form: FormData): TemplateInput {
    const name = String(form.get("name") ?? "");
    const due = String(form.get("dueInDays") ?? "");
    const dueInDays = due === "" ? undefined : Number(due);
    if (kind === "project")
      return {
        name,
        kind,
        payload: {
          tasks: parseTaskOutline(String(form.get("outline") ?? "")).map((t) => ({
            ...t,
            dueInDays,
          })),
        },
      };
    return {
      name,
      kind,
      payload: {
        title: String(form.get("title") ?? "") || undefined,
        priority,
        labelIds,
        checklist: lines(form.get("checklist")),
        dueInDays,
      },
    };
  }

  const projectTasks = template?.kind === "project" ? tasksOf(template) : [];
  return (
    <FormDialog
      trigger={
        template ? (
          <Button variant="secondary" size="sm">
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Novo template
          </Button>
        )
      }
      title={template ? `Editar ${template.name}` : "Novo template"}
      description="Projeto/Cliente e Unidade Móvel são pedidos na hora de usar."
      submit={template ? "Salvar" : "Criar template"}
      done={template ? "Template salvo" : "Template criado"}
      save={(form) => saveTemplateAction(template?.id ?? null, input(form))}
    >
      <FieldLabel label="Nome">
        <Input
          name="name"
          required
          maxLength={80}
          defaultValue={template?.name}
          autoComplete="off"
        />
      </FieldLabel>
      {!template && (
        <div className="flex flex-col gap-1.5 font-medium">
          Tipo
          <Pick
            label="Tipo"
            items={KINDS}
            value={kind}
            onChange={(v) => setKind(v as "task" | "project")}
          />
        </div>
      )}
      {kind === "task" ? (
        <>
          <FieldLabel label="Título da tarefa">
            <Input
              name="title"
              maxLength={200}
              defaultValue={task.title}
              placeholder="Preparar {UM} para operação"
              autoComplete="off"
            />
          </FieldLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 font-medium">
              Prioridade
              <Pick
                label="Prioridade"
                items={items.priorities}
                value={priority}
                onChange={(v) => setPriority(v as Priority)}
              />
            </div>
            <FieldLabel label="Prazo (dias úteis após criar)">
              <Input
                name="dueInDays"
                type="number"
                min={0}
                max={60}
                defaultValue={task.dueInDays}
                className="tabular-nums"
              />
            </FieldLabel>
          </div>
          {!!items.labels.length && (
            <div className="flex flex-col gap-1.5 font-medium">
              Etiquetas
              <PickMany
                label="Etiquetas"
                items={items.labels}
                value={labelIds}
                onChange={setLabelIds}
              />
            </div>
          )}
          <FieldLabel label="Subtarefas (uma por linha)">
            <textarea
              name="checklist"
              className={textarea}
              defaultValue={(task.checklist ?? []).join("\n")}
            />
          </FieldLabel>
        </>
      ) : (
        <>
          <FieldLabel label="Tarefas (uma por linha; “-” no início = subtarefa da de cima)">
            <textarea
              name="outline"
              required
              className={cn(textarea, "min-h-48")}
              placeholder={"Levantar rede do cliente\n- Switch\n- Cabeamento\nInstalar {UM}"}
              defaultValue={formatTaskOutline(
                projectTasks.map((t) => ({ ...t, title: t.title ?? "" })),
              )}
            />
          </FieldLabel>
          <FieldLabel label="Prazo de cada tarefa (dias úteis após criar)">
            <Input
              name="dueInDays"
              type="number"
              min={0}
              max={60}
              defaultValue={projectTasks[0]?.dueInDays}
              className="tabular-nums"
            />
          </FieldLabel>
        </>
      )}
      <p className="text-small text-muted">
        {"{UM}"} no título vira o código da Unidade Móvel escolhida.
      </p>
    </FormDialog>
  );
}

function UseProjectTemplate({
  template,
  options,
}: {
  template: Template;
  options: TaskFormOptions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [mobileUnitIds, setMobileUnitIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const items = optionItems(options);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await applyProjectTemplateAction(template.id, { projectIds, mobileUnitIds });
      if (!result.ok) return setError(result.error);
      const n = result.data;
      toast.success(`${n.length} tarefas criadas (TI-${n[0]} a TI-${n.at(-1)})`);
      setOpen(false);
      setError(null);
      router.push("/tarefas/lista");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Usar template</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usar {template.name}</DialogTitle>
          <DialogDescription>
            Cria {tasksOf(template).length} tarefas nestes Projetos/Clientes e Unidades Móveis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <PickMany
            label="Projeto/Cliente"
            items={items.projects}
            value={projectIds}
            onChange={(ids) => {
              setProjectIds(ids);
              const fits = new Set(items.units(ids).map((u) => u.value));
              setMobileUnitIds((units) => units.filter((id) => fits.has(id)));
            }}
            invalid={!!error}
          />
          <PickMany
            label="Unidade Móvel"
            items={items.units(projectIds)}
            value={mobileUnitIds}
            onChange={setMobileUnitIds}
          />
          {error && (
            <p role="alert" className="text-err">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar tarefas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ template, options }: { template: Template; options: TaskFormOptions }) {
  const archived = !!template.archivedAt;
  const list = tasksOf(template);
  const labelOf = (id: string) => options.labels.find((l) => l.id === id);
  return (
    <Card
      as="section"
      padding="lg"
      aria-label={template.name}
      className="flex min-w-0 flex-[999_1_480px] flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-h3 font-bold">{template.name}</h2>
        <TextChip>{KINDS.find((k) => k.value === template.kind)?.label}</TextChip>
        {archived && <TextChip>Arquivado</TextChip>}
        <span className="flex-1" />
        <TemplateDialog key={template.id} template={template} options={options} />
        <ArchiveButton
          archived={archived}
          name={template.name}
          onToggle={(a) => setTemplateArchivedAction(template.id, a)}
        />
        {!archived &&
          (template.kind === "task" ? (
            <Button size="sm" onClick={() => openQuickCreate({ templateId: template.id })}>
              Usar template
            </Button>
          ) : (
            <UseProjectTemplate template={template} options={options} />
          ))}
      </div>
      <p className="text-sm text-muted">
        {template.kind === "task"
          ? "Cria a tarefa com as subtarefas abaixo."
          : "Cria uma tarefa por item, com as subtarefas de cada uma."}{" "}
        Projeto/Cliente e Unidade Móvel são pedidos na hora de usar. Criado por {template.createdBy}
        ; usado {template.usageCount} {template.usageCount === 1 ? "vez" : "vezes"}.
      </p>
      {list.map((t, i) => (
        <div key={i} className="flex flex-col gap-2">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Título</dt>
            <dd className="font-medium">{t.title || "—"}</dd>
            {t.priority && t.priority !== "none" && (
              <>
                <dt className="text-muted">Prioridade</dt>
                <dd className="flex items-center gap-1.5">
                  <PriorityIcon priority={t.priority} />
                  {priorityLabel(t.priority)}
                </dd>
              </>
            )}
            {t.dueInDays !== undefined && (
              <>
                <dt className="text-muted">Prazo</dt>
                <dd className="tabular-nums">
                  {t.dueInDays} {t.dueInDays === 1 ? "dia útil" : "dias úteis"} após criar
                </dd>
              </>
            )}
            {!!t.labelIds?.length && (
              <>
                <dt className="text-muted">Etiquetas</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {t.labelIds.map((id) => {
                    const l = labelOf(id);
                    return l ? (
                      <LabelChip key={id} name={l.name} colorToken={l.colorToken} />
                    ) : null;
                  })}
                </dd>
              </>
            )}
          </dl>
          {!!t.checklist?.length && (
            <ul className="flex flex-col divide-y divide-border rounded-lg border text-sm">
              {t.checklist.map((c, j) => (
                <li key={j} className="px-3 py-2">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Card>
  );
}

export function TemplatesView({
  templates,
  options,
}: {
  templates: Template[];
  options: TaskFormOptions;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id);
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];
  if (!selected)
    return (
      <Card>
        <EmptyState
          icon={LayoutTemplate}
          title="Nenhum template"
          action={<TemplateDialog options={options} />}
        >
          Tarefas que se repetem viram template: subtarefas, prazo e etiquetas prontos.
        </EmptyState>
      </Card>
    );
  return (
    <div className="flex flex-wrap items-start gap-5">
      <Card
        as="ul"
        className="flex min-w-0 flex-[1_1_320px] flex-col divide-y divide-border overflow-hidden md:max-w-120"
      >
        {templates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-current={t.id === selected.id ? "true" : undefined}
              onClick={() => setSelectedId(t.id)}
              className={cn(
                "group flex w-full flex-col gap-0.5 px-4 py-3 text-left",
                t.id === selected.id ? "bg-accent-light" : "hover:bg-muted",
              )}
            >
              <span className={cn("font-medium", t.archivedAt && "text-muted")}>{t.name}</span>
              {/* text-muted sobre accent-light (escuro, 4,23:1) ou bg-muted (claro, 4,27:1) não passa: M-069 */}
              <span
                className={cn(
                  "text-small tabular-nums",
                  t.id === selected.id ? "text-base" : "text-muted group-hover:text-base",
                )}
              >
                {t.kind === "task"
                  ? `Tarefa · ${tasksOf(t)[0]?.checklist?.length ?? 0} subtarefas`
                  : `Projeto · ${tasksOf(t).length} tarefas`}{" "}
                · usado {t.usageCount} {t.usageCount === 1 ? "vez" : "vezes"}
                {t.archivedAt && " · arquivado"}
              </span>
            </button>
          </li>
        ))}
      </Card>
      <Detail template={selected} options={options} />
    </div>
  );
}
