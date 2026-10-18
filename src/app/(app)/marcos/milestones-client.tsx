"use client";

import { Flag, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Progress } from "@/app/(app)/ciclos/cycles-client";
import { FieldLabel, FormDialog, FormSelect } from "@/app/(app)/config/config-ui";
import { ProjectChip } from "@/components/tasks/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { shortDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { saveMilestoneAction, setMilestoneClosedAction } from "@/server/actions/planning";
import type { MilestoneRow } from "@/server/services/planning";
import { Card } from "@/components/ui/card";

type Option = { value: string; label: string };

export function MilestoneDialog({
  milestone,
  projects,
}: {
  milestone?: MilestoneRow;
  projects: Option[];
}) {
  return (
    <FormDialog
      trigger={
        milestone ? (
          <Button variant="secondary" size="sm">
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Novo marco
          </Button>
        )
      }
      title={milestone ? `Editar ${milestone.name}` : "Novo marco"}
      description="O progresso vem das tarefas ligadas ao marco."
      submit={milestone ? "Salvar" : "Criar marco"}
      done={milestone ? "Marco salvo" : "Marco criado"}
      save={(form) =>
        saveMilestoneAction(milestone?.id ?? null, {
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          projectId: String(form.get("projectId") ?? ""),
          dueOn: String(form.get("dueOn") ?? ""),
        })
      }
    >
      <FieldLabel label="Nome">
        <Input
          name="name"
          required
          maxLength={120}
          defaultValue={milestone?.name}
          autoComplete="off"
        />
      </FieldLabel>
      <FormSelect
        name="projectId"
        label="Projeto/Cliente"
        items={projects}
        defaultValue={milestone?.projectId ?? ""}
      />
      <FieldLabel label="Prazo">
        <Input
          name="dueOn"
          type="date"
          defaultValue={milestone?.dueOn ?? ""}
          className="tabular-nums"
        />
      </FieldLabel>
      <FieldLabel label="Descrição">
        <Input name="description" maxLength={2000} defaultValue={milestone?.description ?? ""} />
      </FieldLabel>
    </FormDialog>
  );
}

function CloseButton({ milestone }: { milestone: MilestoneRow }) {
  const [busy, start] = useTransition();
  const closed = !!milestone.closedAt;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      aria-label={`${closed ? "Reabrir" : "Concluir"} ${milestone.name}`}
      onClick={() =>
        start(async () => {
          const r = await setMilestoneClosedAction(milestone.id, !closed);
          if (r.ok) toast.success(closed ? "Marco reaberto" : "Marco concluído");
          else toast.error(r.error);
        })
      }
    >
      {closed ? "Reabrir" : "Concluir"}
    </Button>
  );
}

export function MilestonesView({
  milestones,
  projects,
}: {
  milestones: MilestoneRow[];
  projects: Option[];
}) {
  if (!milestones.length)
    return (
      <EmptyState
        icon={Flag}
        title="Nenhum marco ainda"
        action={<MilestoneDialog projects={projects} />}
      >
        Marcos marcam entregas de um Projeto/Cliente. Ligue tarefas a eles pelo detalhe da tarefa.
      </EmptyState>
    );
  const today = todayISO();
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {milestones.map((m) => {
        const late = !m.closedAt && m.dueOn && m.dueOn < today;
        return (
          <Card
            as="li"
            padding="md"
            key={m.id}
            className={cn("flex flex-col gap-3", m.closedAt && "opacity-70")}
          >
            <div className="flex items-start gap-2">
              <Flag
                className="mt-0.5 size-4 flex-none text-accent-text"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{m.name}</h2>
                {m.description && <p className="text-sm text-muted">{m.description}</p>}
              </div>
              <ProjectChip code={m.projectCode} name={m.projectName} />
            </div>
            <Progress done={m.done} total={m.total} label={`Progresso de ${m.name}`} />
            <div className="flex items-center gap-2 text-sm">
              {m.closedAt ? (
                <span className="text-muted">Concluído</span>
              ) : m.dueOn ? (
                <span className={cn("tabular-nums", late ? "font-medium text-err" : "text-muted")}>
                  {late ? "Venceu" : "Prazo"} {shortDate(m.dueOn)}
                </span>
              ) : (
                <span className="text-muted">Sem prazo</span>
              )}
              <span className="flex-1" />
              <Link
                href={`/tarefas/lista?projeto=${m.projectId}`}
                className="text-accent-text hover:underline"
              >
                Tarefas do projeto
              </Link>
              <MilestoneDialog milestone={m} projects={projects} />
              <CloseButton milestone={m} />
            </div>
          </Card>
        );
      })}
    </ul>
  );
}
