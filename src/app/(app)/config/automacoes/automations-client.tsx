"use client";

import { Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { priorityLabel } from "@/components/tasks/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { relativeTime } from "@/lib/dates";
import type {
  AutomationAction,
  AutomationConditions,
  AutomationTrigger,
} from "@/lib/validation/automations";
import {
  PRIORITIES,
  WAITING_REASONS,
  WAITING_REASON_LABELS,
  type WaitingReason,
} from "@/lib/validation/tasks";
import {
  saveAutomationRuleAction,
  setAutomationRuleEnabledAction,
} from "@/server/actions/automations";
import { FieldLabel, FormDialog, FormSelect, useRun } from "../config-ui";
import { CATEGORIES } from "../workflow/workflow-client";
import { Card } from "@/components/ui/card";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  conditions: unknown;
  actions: unknown;
  runCount: number;
  lastRunAt: Date | null;
};
type Ref = { id: string; name: string; archivedAt: Date | null; category?: string };
type Refs = { statuses: Ref[]; labels: Ref[] };

const TRIGGERS: { value: AutomationTrigger; label: string }[] = [
  { value: "task.created", label: "Tarefa é criada" },
  { value: "task.status_changed", label: "Status muda" },
  { value: "task.assigned", label: "Responsável é definido" },
  { value: "task.priority_changed", label: "Prioridade muda" },
  { value: "task.overdue", label: "Prazo passa sem conclusão" },
];
const NOTIFY = [
  { value: "creator", label: "o criador" },
  { value: "assignee", label: "o responsável" },
  { value: "team", label: "o time" },
] as const;
const ACTION_TYPES: { value: AutomationAction["type"]; label: string }[] = [
  { value: "notify", label: "Notificar" },
  { value: "setStatus", label: "Mover para o status" },
  { value: "moveToActiveCycle", label: "Mover para o ciclo atual" },
  { value: "moveToTop", label: "Mover para o topo da coluna" },
  { value: "addLabel", label: "Adicionar etiqueta" },
  { value: "comment", label: "Comentar" },
];
const ANY = { value: "", label: "Qualquer" };
const YES_NO = [ANY, { value: "yes", label: "Tem" }, { value: "no", label: "Não tem" }];

const nameOf = (refs: Ref[], id: string) => refs.find((r) => r.id === id)?.name ?? "—";

function describeConditions(c: AutomationConditions) {
  return [
    c.statusCategory && `Status é ${CATEGORIES.find((x) => x.value === c.statusCategory)?.label}`,
    c.priority && `Prioridade é ${priorityLabel(c.priority)}`,
    c.hasGlpi !== undefined && (c.hasGlpi ? "Tem Chamado GLPI" : "Sem Chamado GLPI"),
    c.hasMobileUnit !== undefined && (c.hasMobileUnit ? "Tem Unidade Móvel" : "Sem Unidade Móvel"),
  ]
    .filter(Boolean)
    .join(" e ");
}

function describeAction(a: AutomationAction, refs: Refs) {
  switch (a.type) {
    case "notify":
      return `Notificar ${NOTIFY.find((n) => n.value === a.to)?.label}`;
    case "setStatus": {
      const w = a.waiting;
      const days =
        w && (w.inDays === 0 ? "hoje" : w.inDays === 1 ? "amanhã" : `em ${w.inDays} dias`);
      return w
        ? `Mover para ${nameOf(refs.statuses, a.statusId)} (${w.note || WAITING_REASON_LABELS[w.reason]}, previsão ${days})`
        : `Mover para ${nameOf(refs.statuses, a.statusId)}`;
    }
    case "moveToActiveCycle":
      return "Mover para o ciclo atual";
    case "moveToTop":
      return "Mover para o topo da coluna";
    case "addLabel":
      return `Adicionar etiqueta “${nameOf(refs.labels, a.labelId)}”`;
    case "comment":
      return `Comentar: “${a.text}”`;
  }
}

/** Ação nova com o primeiro valor possível de cada parâmetro. */
function blank(type: AutomationAction["type"], refs: Refs): AutomationAction {
  const active = (list: Ref[]) => list.find((r) => !r.archivedAt)?.id ?? "";
  switch (type) {
    case "notify":
      return { type, to: "assignee" };
    case "setStatus": {
      const statusId = active(refs.statuses);
      const waiting = refs.statuses.find((r) => r.id === statusId)?.category === "waiting";
      return { type, statusId, ...(waiting && { waiting: { reason: "supplier", inDays: 3 } }) };
    }
    case "addLabel":
      return { type, labelId: active(refs.labels) };
    case "comment":
      return { type, text: "" };
    default:
      return { type };
  }
}

function MiniSelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
      <SelectTrigger aria-label={label} className="min-w-0 flex-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActionsEditor({ initial, refs }: { initial: AutomationAction[]; refs: Refs }) {
  const [actions, setActions] = useState(initial.length ? initial : [blank("notify", refs)]);
  const set = (i: number, a: AutomationAction) =>
    setActions((list) => list.map((x, j) => (j === i ? a : x)));
  const isWaiting = (id: string) => refs.statuses.find((r) => r.id === id)?.category === "waiting";
  const options = (list: Ref[]) =>
    list.filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-medium">Então</legend>
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />
      {actions.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <MiniSelect
            label={`Tipo da ação ${i + 1}`}
            value={a.type}
            items={ACTION_TYPES}
            onChange={(type) => set(i, blank(type as AutomationAction["type"], refs))}
          />
          {a.type === "notify" && (
            <MiniSelect
              label={`Quem notificar na ação ${i + 1}`}
              value={a.to}
              items={[...NOTIFY]}
              onChange={(to) => set(i, { ...a, to: to as typeof a.to })}
            />
          )}
          {a.type === "setStatus" && (
            <MiniSelect
              label={`Status da ação ${i + 1}`}
              value={a.statusId}
              items={options(refs.statuses)}
              onChange={(statusId) =>
                set(i, {
                  type: "setStatus",
                  statusId,
                  // ADR-080: motivo e previsão só com destino Aguardando
                  ...(isWaiting(statusId) && {
                    waiting: a.waiting ?? { reason: "supplier", inDays: 3 },
                  }),
                })
              }
            />
          )}
          {a.type === "setStatus" && a.waiting && (
            <>
              <MiniSelect
                label={`Motivo do Aguardando da ação ${i + 1}`}
                value={a.waiting.reason}
                items={WAITING_REASONS.map((r) => ({ value: r, label: WAITING_REASON_LABELS[r] }))}
                onChange={(reason) =>
                  set(i, { ...a, waiting: { ...a.waiting!, reason: reason as WaitingReason } })
                }
              />
              {a.waiting.reason === "other" && (
                <Input
                  aria-label={`Descrição do motivo da ação ${i + 1}`}
                  placeholder="Descreva o motivo"
                  maxLength={120}
                  required
                  value={a.waiting.note ?? ""}
                  onChange={(e) =>
                    set(i, { ...a, waiting: { ...a.waiting!, note: e.target.value } })
                  }
                  className="min-w-0 flex-[2_1_180px]"
                />
              )}
              <label className="flex items-center gap-1.5 text-sm">
                Previsão em
                <Input
                  type="number"
                  min={0}
                  max={60}
                  required
                  aria-label={`Previsão em dias da ação ${i + 1}`}
                  value={a.waiting.inDays}
                  onChange={(e) =>
                    set(i, {
                      ...a,
                      waiting: { ...a.waiting!, inDays: e.target.valueAsNumber || 0 },
                    })
                  }
                  className="w-16 tabular-nums"
                />
                dias
              </label>
            </>
          )}
          {a.type === "addLabel" && (
            <MiniSelect
              label={`Etiqueta da ação ${i + 1}`}
              value={a.labelId}
              items={options(refs.labels)}
              onChange={(labelId) => set(i, { ...a, labelId })}
            />
          )}
          {a.type === "comment" && (
            <Input
              aria-label={`Texto do comentário da ação ${i + 1}`}
              placeholder="Atualize o chamado #{GLPI}"
              maxLength={2000}
              value={a.text}
              onChange={(e) => set(i, { ...a, text: e.target.value })}
              className="min-w-0 flex-[2_1_220px]"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remover ação ${i + 1}`}
            disabled={actions.length === 1}
            onClick={() => setActions((list) => list.filter((_, j) => j !== i))}
          >
            <Trash2 strokeWidth={1.75} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={actions.length >= 10}
        onClick={() => setActions((list) => [...list, blank("notify", refs)])}
      >
        <Plus strokeWidth={1.75} /> Adicionar ação
      </Button>
      <p className="text-small text-muted">
        No comentário, {"{ID}"} vira o ID da tarefa e {"{GLPI}"} o número do chamado.
      </p>
    </fieldset>
  );
}

export function RuleDialog({ rule, refs }: { rule?: Rule; refs: Refs }) {
  const c = (rule?.conditions ?? {}) as AutomationConditions;
  const yesNo = (v: boolean | undefined) => (v === undefined ? "" : v ? "yes" : "no");
  return (
    <FormDialog
      trigger={
        rule ? (
          <Button variant="ghost" size="sm" aria-label={`Editar ${rule.name}`}>
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Nova automação
          </Button>
        )
      }
      title={rule ? `Editar ${rule.name}` : "Nova automação"}
      description="Quando o gatilho acontecer e as condições baterem, as ações rodam em ordem."
      submit={rule ? "Salvar" : "Criar automação"}
      done={rule ? "Automação salva" : "Automação criada"}
      save={(form) => saveAutomationRuleAction(rule?.id ?? null, form)}
    >
      <FieldLabel label="Nome">
        <Input name="name" required maxLength={80} defaultValue={rule?.name} autoComplete="off" />
      </FieldLabel>
      <FormSelect
        name="trigger"
        label="Quando"
        items={TRIGGERS}
        defaultValue={rule?.trigger ?? "task.status_changed"}
      />
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1.5 font-medium">Se (opcional)</legend>
        <FormSelect
          name="statusCategory"
          label="Status"
          items={[ANY, ...CATEGORIES]}
          defaultValue={c.statusCategory ?? ""}
        />
        <FormSelect
          name="priority"
          label="Prioridade"
          items={[ANY, ...PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))]}
          defaultValue={c.priority ?? ""}
        />
        <FormSelect
          name="hasGlpi"
          label="Chamado GLPI"
          items={YES_NO}
          defaultValue={yesNo(c.hasGlpi)}
        />
        <FormSelect
          name="hasMobileUnit"
          label="Unidade Móvel"
          items={YES_NO}
          defaultValue={yesNo(c.hasMobileUnit)}
        />
      </fieldset>
      <ActionsEditor initial={(rule?.actions ?? []) as AutomationAction[]} refs={refs} />
    </FormDialog>
  );
}

function RuleToggle({ rule }: { rule: Rule }) {
  const { pending, run } = useRun();
  return (
    <Switch
      checked={rule.enabled}
      disabled={pending}
      aria-label={`Ativar ${rule.name}`}
      onCheckedChange={(on) =>
        run(
          () => setAutomationRuleEnabledAction(rule.id, on),
          on ? "Automação ligada" : "Automação desligada",
        )
      }
    />
  );
}

function Token({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={
        accent
          ? "rounded-md bg-accent-light px-2 py-0.5 text-accent-text"
          : "rounded-md bg-muted px-2 py-0.5"
      }
    >
      {children}
    </span>
  );
}

export function RulesList({ rules, refs }: { rules: Rule[]; refs: Refs }) {
  if (!rules.length)
    return (
      <Card>
        <EmptyState icon={Zap} title="Nenhuma automação" action={<RuleDialog refs={refs} />}>
          Regras “quando isto, faça aquilo” economizam cliques repetidos.
        </EmptyState>
      </Card>
    );
  return (
    <Card as="ul" className="divide-y divide-border">
      {rules.map((r) => {
        const when = TRIGGERS.find((t) => t.value === r.trigger)?.label ?? r.trigger;
        const cond = describeConditions((r.conditions ?? {}) as AutomationConditions);
        const then = ((r.actions ?? []) as AutomationAction[])
          .map((a) => describeAction(a, refs))
          .join(" e ");
        return (
          <li key={r.id} className="flex flex-wrap items-start gap-4 px-4 py-3.5">
            <span className="mt-0.5">
              <RuleToggle rule={r} />
            </span>
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
              <span className={r.enabled ? "font-semibold" : "font-semibold text-muted"}>
                {r.name}
              </span>
              <p className="flex flex-wrap items-center gap-1.5 text-small">
                <span className="text-muted">Quando</span>
                <Token>{when}</Token>
                {cond && (
                  <>
                    <span className="text-muted">Se</span>
                    <Token>{cond}</Token>
                  </>
                )}
                <span className="text-muted">Então</span>
                <Token accent>{then}</Token>
              </p>
            </div>
            <div className="min-w-35 text-right text-small text-muted tabular-nums">
              <div>
                {r.runCount} {r.runCount === 1 ? "execução" : "execuções"}
              </div>
              <div>última {r.lastRunAt ? relativeTime(new Date(r.lastRunAt)) : "—"}</div>
            </div>
            <RuleDialog rule={r} refs={refs} />
          </li>
        );
      })}
    </Card>
  );
}
