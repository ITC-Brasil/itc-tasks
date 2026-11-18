"use client";

import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FieldLabel, FormDialog } from "@/app/(app)/config/config-ui";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { closeCycleAction, saveCycleAction, startCycleAction } from "@/server/actions/planning";
import type { CycleRow } from "@/server/services/planning";
import { Card } from "@/components/ui/card";

type Pending = { id: string; number: number; title: string };

const range = (c: CycleRow) => `${shortDate(c.startsOn)} – ${shortDate(c.endsOn)}`;

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-base"
      >
        <div className="h-full rounded-full bg-accent-solid" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted tabular-nums">
        {done} de {total} concluídas · {pct}%
      </span>
    </div>
  );
}

export function CycleDialog({ cycle }: { cycle?: CycleRow }) {
  return (
    <FormDialog
      trigger={
        cycle ? (
          <Button variant="secondary" size="sm">
            Editar datas
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Novo ciclo
          </Button>
        )
      }
      title={cycle ? `Ciclo ${cycle.number}` : "Novo ciclo"}
      submit={cycle ? "Salvar" : "Criar ciclo"}
      done={cycle ? "Ciclo salvo" : "Ciclo criado"}
      save={(form) =>
        saveCycleAction(cycle?.id ?? null, {
          startsOn: String(form.get("startsOn") ?? ""),
          endsOn: String(form.get("endsOn") ?? ""),
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Início">
          <Input
            name="startsOn"
            type="date"
            required
            defaultValue={cycle?.startsOn}
            className="tabular-nums"
          />
        </FieldLabel>
        <FieldLabel label="Fim">
          <Input
            name="endsOn"
            type="date"
            required
            defaultValue={cycle?.endsOn}
            className="tabular-nums"
          />
        </FieldLabel>
      </div>
    </FormDialog>
  );
}

/** FLOWS §7: confirmação com a lista revisável; marcadas vão para o próximo ciclo. */
function CloseCycle({
  cycle,
  next,
  pending,
}: {
  cycle: CycleRow;
  next?: CycleRow;
  pending: Pending[];
}) {
  const [open, setOpen] = useState(false);
  const [carry, setCarry] = useState(() => new Set(pending.map((t) => t.id)));
  const [busy, start] = useTransition();

  function close() {
    start(async () => {
      const r = await closeCycleAction(cycle.id, next ? [...carry] : []);
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        r.data.next
          ? `Ciclo ${cycle.number} encerrado; ${r.data.carried} tarefas no Ciclo ${r.data.next}`
          : `Ciclo ${cycle.number} encerrado`,
      );
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" />}>
        Encerrar ciclo
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Encerrar Ciclo {cycle.number}</DialogTitle>
          <DialogDescription>
            {next
              ? `As tarefas marcadas vão para o Ciclo ${next.number}; as desmarcadas ficam sem ciclo.`
              : pending.length
                ? `Sem próximo ciclo planejado: as ${pending.length} tarefas pendentes ficam sem ciclo.`
                : "Sem próximo ciclo planejado. Nenhuma tarefa pendente neste ciclo."}
          </DialogDescription>
        </DialogHeader>
        {next && pending.length > 0 && (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {pending.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    checked={carry.has(t.id)}
                    onCheckedChange={(on) =>
                      setCarry((s) => {
                        const n = new Set(s);
                        if (on) n.add(t.id);
                        else n.delete(t.id);
                        return n;
                      })
                    }
                  />
                  <span className="text-muted tabular-nums">TI-{t.number}</span>
                  <span className="truncate">{t.title}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {next && pending.length === 0 && (
          <p className="text-sm text-muted">Nenhuma tarefa pendente neste ciclo.</p>
        )}
        <DialogFooter>
          <Button onClick={close} disabled={busy}>
            {busy ? "Encerrando…" : "Encerrar ciclo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartButton({ cycle, blocked }: { cycle: CycleRow; blocked: boolean }) {
  const [busy, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={busy || blocked}
      title={blocked ? "Encerre o ciclo ativo antes" : undefined}
      onClick={() =>
        start(async () => {
          const r = await startCycleAction(cycle.id);
          if (r.ok) toast.success(`Ciclo ${cycle.number} iniciado`);
          else toast.error(r.error);
        })
      }
    >
      Iniciar
    </Button>
  );
}

export function CyclesView({
  cycles,
  load,
  pending,
}: {
  cycles: CycleRow[];
  load: { name: string; open: number }[];
  pending: Pending[];
}) {
  if (!cycles.length)
    return (
      <EmptyState icon={RefreshCw} title="Nenhum ciclo ainda" action={<CycleDialog />}>
        Ciclos agrupam o trabalho de uma ou duas semanas. Crie o primeiro e inicie quando começar.
      </EmptyState>
    );
  const active = cycles.find((c) => c.state === "active");
  const planned = cycles.filter((c) => c.state === "planned").reverse(); // menor número primeiro
  const closed = cycles.filter((c) => c.state === "closed");
  const maxLoad = Math.max(1, ...load.map((l) => l.open));

  return (
    <>
      {active ? (
        <Card as="section" padding="lg" aria-labelledby="ciclo-ativo">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ciclo-ativo" className="text-h3 font-bold">
              Ciclo {active.number}
            </h2>
            <span className="rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium text-accent-text">
              Ativo
            </span>
            <span className="text-sm text-muted tabular-nums">{range(active)}</span>
            <span className="flex-1" />
            <Link
              href={`/tarefas?ciclo=${active.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ver no quadro
            </Link>
            <CycleDialog cycle={active} />
            <CloseCycle cycle={active} next={planned[0]} pending={pending} />
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <Progress
              done={active.done}
              total={active.total}
              label={`Progresso do Ciclo ${active.number}`}
            />
            <div>
              <h3 className="mb-2 text-sm font-medium">Carga por pessoa (abertas)</h3>
              {load.length ? (
                <ul className="flex flex-col gap-1.5">
                  {load.map((l) => (
                    <li
                      key={l.name}
                      className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-sm"
                    >
                      <span className="truncate">{l.name}</span>
                      <span className="h-2 rounded-full bg-base">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${(l.open / maxLoad) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums">{l.open}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nada aberto neste ciclo.</p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card as="p" padding="lg" className="text-sm text-muted">
          Nenhum ciclo ativo. Inicie um ciclo planejado.
        </Card>
      )}

      {planned.length > 0 && (
        <section aria-labelledby="planejados" className="flex flex-col gap-2">
          <h2 id="planejados" className="text-sm font-medium text-muted">
            Planejados
          </h2>
          {planned.map((c) => (
            <Card padding="sm" key={c.id} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">Ciclo {c.number}</span>
              <span className="text-sm text-muted tabular-nums">{range(c)}</span>
              <span className="text-sm text-muted tabular-nums">{c.total} tarefas</span>
              <span className="flex-1" />
              <CycleDialog cycle={c} />
              <StartButton cycle={c} blocked={!!active} />
            </Card>
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section aria-labelledby="encerrados" className="flex flex-col gap-2">
          <h2 id="encerrados" className="text-sm font-medium text-muted">
            Encerrados
          </h2>
          <Card as="ul" className="overflow-hidden">
            {closed.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
              >
                <Link href={`/tarefas/lista?ciclo=${c.id}`} className="font-medium hover:underline">
                  Ciclo {c.number}
                </Link>
                <span className="text-muted tabular-nums">{range(c)}</span>
                <span className="flex-1" />
                <span className="text-muted tabular-nums">
                  {c.done}/{c.total} concluídas
                </span>
              </li>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
