"use client";

import { Lock, Plus, Repeat, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FieldLabel, FormDialog, useRun } from "@/app/(app)/config/config-ui";
import { PriorityIcon, TextChip } from "@/components/tasks/badges";
import { Pick, PickMany, optionItems } from "@/components/tasks/fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { shortDate } from "@/lib/dates";
import type { RecurrenceFrequency } from "@/lib/recurrence";
import type { Priority, RecurrencePayload, Visibility } from "@/lib/validation/tasks";
import {
  deleteRecurrenceAction,
  saveRecurrenceAction,
  setRecurrencePausedAction,
} from "@/server/actions/recurrences";
import type { TaskFormOptions } from "@/server/actions/tasks";
import type { RecurrenceRow } from "@/server/services/recurrences";

// ADR-077: a regra é uma cópia; template e "Repetir esta tarefa" só preenchem o formulário
export type Draft = { name: string; visibility: Visibility; payload: Partial<RecurrencePayload> };

const FREQUENCIES = [
  { value: "weekdays", label: "Todo dia útil (seg a sex)" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal / a cada N meses" },
];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_DAYS = [
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` })),
  { value: "0", label: "Último dia do mês" },
];
const VISIBILITY_ITEMS = [
  { value: "team", label: "Da equipe" },
  { value: "personal", label: "Pessoal (só você vê)" },
];
const textarea =
  "min-h-24 w-full rounded-control border border-input bg-surface px-3 py-2 text-[16px] shadow-1 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light md:text-sm";

export function RecurrenceDialog({
  rule,
  draft,
  options,
  today,
  meId,
}: {
  rule?: RecurrenceRow;
  draft?: Draft;
  options: TaskFormOptions;
  today: string;
  meId: string;
}) {
  const start = rule ?? draft;
  const p: Partial<RecurrencePayload> = start?.payload ?? {};
  const items = optionItems(options);
  const [visibility, setVisibility] = useState<Visibility>(start?.visibility ?? "team");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    (rule?.frequency as RecurrenceFrequency) ?? "weekly",
  );
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [1]);
  const [monthDay, setMonthDay] = useState(String(rule?.monthDay ?? 1));
  const [title, setTitle] = useState(p.title ?? "");
  const [priority, setPriority] = useState<Priority>(p.priority ?? "none");
  const [assigneeId, setAssigneeId] = useState(p.assigneeId ?? "");
  const [projectIds, setProjectIds] = useState(p.projectIds ?? []);
  const [mobileUnitIds, setMobileUnitIds] = useState(p.mobileUnitIds ?? []);
  const [labelIds, setLabelIds] = useState(p.labelIds ?? []);
  const [checklist, setChecklist] = useState((p.checklist ?? []).join("\n"));
  const [dueInDays, setDueInDays] = useState(String(rule?.dueInDays ?? 0));
  const personal = visibility === "personal";

  /** Template de tarefa (Módulo 09) só preenche os campos. */
  function applyTemplate(id: string) {
    const t = options.templates.find((x) => x.id === id)?.payload;
    if (!t) return;
    if (t.title) setTitle(t.title.replaceAll("{UM}", "").trim());
    if (t.priority) setPriority(t.priority);
    if (t.labelIds) setLabelIds(t.labelIds);
    if (t.checklist) setChecklist(t.checklist.join("\n"));
    if (t.dueInDays !== undefined) setDueInDays(String(t.dueInDays));
  }

  function save(form: FormData) {
    return saveRecurrenceAction(rule?.id ?? null, {
      name: String(form.get("name") ?? ""),
      visibility,
      frequency,
      weekdays,
      monthDay: Number(monthDay),
      intervalMonths: Number(form.get("intervalMonths") || 1),
      startDate: String(form.get("startDate") ?? ""),
      dueInDays: Number(dueInDays || 0),
      dueTime: String(form.get("dueTime") ?? "") || null,
      payload: {
        ...p,
        title,
        priority,
        assigneeId: personal ? meId : assigneeId || null,
        projectIds,
        mobileUnitIds,
        labelIds,
        checklist: checklist
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      },
    });
  }

  return (
    <FormDialog
      defaultOpen={!!draft}
      trigger={
        rule ? (
          <Button variant="secondary" size="sm">
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Nova recorrência
          </Button>
        )
      }
      title={rule ? `Editar ${rule.name}` : "Nova recorrência"}
      description="Cada ocorrência cria uma tarefa nova. Mudanças valem só para as próximas."
      submit={rule ? "Salvar" : "Criar recorrência"}
      done={rule ? "Recorrência salva" : "Recorrência criada"}
      save={save}
    >
      <FieldLabel label="Nome da regra">
        <Input
          name="name"
          required
          maxLength={100}
          defaultValue={start?.name}
          placeholder="Backup semanal"
          autoComplete="off"
        />
      </FieldLabel>
      {!rule && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 font-medium">
            Visibilidade
            <Pick
              label="Visibilidade"
              items={VISIBILITY_ITEMS}
              value={visibility}
              onChange={(v) => setVisibility(v as Visibility)}
            />
          </div>
          {!draft && !!options.templates.length && (
            <div className="flex flex-col gap-1.5 font-medium">
              Preencher com template
              <Pick
                label="Template"
                items={options.templates.map((t) => ({ value: t.id, label: t.name }))}
                value=""
                onChange={applyTemplate}
              />
            </div>
          )}
        </div>
      )}

      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 font-medium">Quando</legend>
        <div className="flex flex-col gap-1.5 font-medium">
          Frequência
          <Pick
            label="Frequência"
            items={FREQUENCIES}
            value={frequency}
            onChange={(v) => setFrequency(v as RecurrenceFrequency)}
          />
        </div>
        {frequency === "weekly" && (
          <div role="group" aria-label="Dias da semana" className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5">
                <Checkbox
                  checked={weekdays.includes(i)}
                  onCheckedChange={(on) =>
                    setWeekdays((w) => (on ? [...w, i] : w.filter((x) => x !== i)))
                  }
                />
                {d}
              </label>
            ))}
          </div>
        )}
        {frequency === "monthly" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 font-medium">
              Dia do mês
              <Pick label="Dia do mês" items={MONTH_DAYS} value={monthDay} onChange={setMonthDay} />
            </div>
            <FieldLabel label="A cada quantos meses">
              <Input
                name="intervalMonths"
                type="number"
                min={1}
                max={12}
                defaultValue={rule?.intervalMonths ?? 1}
                className="tabular-nums"
              />
            </FieldLabel>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldLabel label="A partir de">
            <Input
              name="startDate"
              type="date"
              required
              defaultValue={rule?.startDate ?? today}
              className="tabular-nums"
            />
          </FieldLabel>
          <FieldLabel label="Vence em (dias)">
            <Input
              type="number"
              min={0}
              max={60}
              value={dueInDays}
              onChange={(e) => setDueInDays(e.currentTarget.value)}
              className="tabular-nums"
            />
          </FieldLabel>
          <FieldLabel label="Horário (opcional)">
            <Input
              name="dueTime"
              type="time"
              defaultValue={rule?.dueTime ?? ""}
              className="tabular-nums"
            />
          </FieldLabel>
        </div>
        <p className="text-small text-muted">
          A tarefa é criada às 06:00 do dia. “Vence em 0 dias” = no mesmo dia. Dia 29, 30 ou 31 num
          mês mais curto cai no último dia.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 font-medium">Tarefa criada</legend>
        <FieldLabel label="Título">
          <Input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            autoComplete="off"
          />
        </FieldLabel>
        <div className="flex flex-col gap-1.5 font-medium">
          Projeto/Cliente
          <PickMany
            label="Projeto/Cliente"
            items={items.projects}
            value={projectIds}
            onChange={(ids) => {
              setProjectIds(ids);
              const fits = new Set(items.units(ids).map((u) => u.value));
              setMobileUnitIds((units) => units.filter((id) => fits.has(id)));
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5 font-medium">
          Unidade Móvel
          <PickMany
            label="Unidade Móvel"
            items={items.units(projectIds)}
            value={mobileUnitIds}
            onChange={setMobileUnitIds}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {!personal && (
            <div className="flex flex-col gap-1.5 font-medium">
              Responsável
              <Pick
                label="Responsável"
                items={items.people}
                value={assigneeId}
                onChange={setAssigneeId}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5 font-medium">
            Prioridade
            <Pick
              label="Prioridade"
              items={items.priorities}
              value={priority}
              onChange={(v) => setPriority(v as Priority)}
            />
          </div>
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
            className={textarea}
            value={checklist}
            onChange={(e) => setChecklist(e.currentTarget.value)}
          />
        </FieldLabel>
      </fieldset>
    </FormDialog>
  );
}

function DeleteRecurrence({ rule }: { rule: RecurrenceRow }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function confirm() {
    start(async () => {
      const r = await deleteRecurrenceAction(rule.id);
      if (!r.ok) return void toast.error(r.error);
      setOpen(false);
      toast.success(`${rule.name} excluída`);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Excluir ${rule.name}`} />}
      >
        <Trash2 strokeWidth={1.75} aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {rule.name}?</DialogTitle>
          <DialogDescription>
            Nenhuma tarefa nova será criada. As que já foram criadas continuam, sem o selo de
            recorrência. Não dá para desfazer; para parar por um tempo, use Pausar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleCard(props: {
  rule: RecurrenceRow;
  options: TaskFormOptions;
  today: string;
  meId: string;
}) {
  const { rule, options } = props;
  const { pending, run } = useRun();
  const paused = !!rule.pausedAt;
  const projects = options.projects.filter((p) => rule.payload.projectIds.includes(p.id));
  const assignee = options.people.find((p) => p.id === rule.payload.assigneeId);
  return (
    <Card as="li" padding="md" aria-label={rule.name} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Repeat className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
        <h2 className="text-h4 font-semibold">{rule.name}</h2>
        {rule.visibility === "personal" && (
          <TextChip>
            <Lock
              className="mr-1 inline size-3.5 align-[-2px]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Pessoal
          </TextChip>
        )}
        {paused && <TextChip>Pausada</TextChip>}
        <span className="flex-1" />
        <RecurrenceDialog key={rule.updatedAt.toISOString()} {...props} />
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => setRecurrencePausedAction(rule.id, !paused), paused ? "Retomada" : "Pausada")
          }
        >
          {paused ? "Retomar" : "Pausar"}
        </Button>
        <DeleteRecurrence rule={rule} />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <PriorityIcon priority={rule.payload.priority} />
        <span className="font-medium">{rule.payload.title}</span>
        <span className="text-muted">
          · {projects.map((p) => p.code).join(", ") || "sem Projeto/Cliente"}
          {assignee && ` · ${assignee.name}`}
        </span>
      </p>
      <p className="text-sm text-muted tabular-nums">
        {rule.summary} · vence em {rule.dueInDays} {rule.dueInDays === 1 ? "dia" : "dias"}
        {rule.dueTime && ` às ${rule.dueTime}`}
        {" · "}
        {paused ? "pausada" : rule.nextOn ? `próxima em ${shortDate(rule.nextOn)}` : "sem próxima"}
        {rule.lastRunOn && ` · última em ${shortDate(rule.lastRunOn)}`}
        {` · criada por ${rule.ownerName}`}
      </p>
    </Card>
  );
}

export function RecurrencesView({
  rules,
  ...rest
}: {
  rules: RecurrenceRow[];
  options: TaskFormOptions;
  today: string;
  meId: string;
}) {
  if (!rules.length)
    return (
      <Card>
        <EmptyState icon={Repeat} title="Nenhuma recorrência">
          Rotinas como backup semanal ou conferência mensal viram tarefa sozinhas. Crie aqui ou use
          “Repetir esta tarefa” no detalhe de uma tarefa.
        </EmptyState>
      </Card>
    );
  return (
    <ul className="flex flex-col gap-3">
      {rules.map((r) => (
        <RuleCard key={r.id} rule={r} {...rest} />
      ))}
    </ul>
  );
}
