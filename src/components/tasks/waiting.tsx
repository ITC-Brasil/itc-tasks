"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { shortDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  WAITING_NEEDED,
  WAITING_NOTE_NEEDED,
  WAITING_REASONS,
  type WaitingReason,
  waitingReasonLabel,
} from "@/lib/validation/tasks";
import { Pick } from "./fields";

// ADR-078: motivo e data prevista ao entrar no Aguardando

export type WaitingValue = {
  waitingReason: WaitingReason;
  waitingNote: string | null;
  waitingUntil: string;
};
type Initial = Partial<{
  waitingReason: WaitingReason | null;
  waitingNote: string | null;
  waitingUntil: string | null;
}>;

const REASON_ITEMS = WAITING_REASONS.map((r) => ({ value: r, label: waitingReasonLabel(r)! }));

function WaitingDialog({
  initial,
  onDone,
}: {
  initial?: Initial;
  onDone: (value: WaitingValue | null) => void;
}) {
  const [reason, setReason] = useState<string>(initial?.waitingReason ?? "");
  const [note, setNote] = useState(initial?.waitingNote ?? "");
  const [until, setUntil] = useState(initial?.waitingUntil ?? "");
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason || !until) return setError(WAITING_NEEDED);
    if (reason === "other" && !note.trim()) return setError(WAITING_NOTE_NEEDED);
    onDone({
      waitingReason: reason as WaitingReason,
      waitingNote: reason === "other" ? note.trim() : null,
      waitingUntil: until,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aguardando o quê?</DialogTitle>
          <DialogDescription>Informe o motivo e quando deve se resolver.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 font-medium">
            Motivo
            <Pick
              label="Motivo"
              items={REASON_ITEMS}
              value={reason}
              onChange={setReason}
              invalid={!!error && !reason}
            />
          </div>
          {reason === "other" && (
            <label className="flex flex-col gap-1.5 font-medium">
              Descreva
              <Input
                value={note}
                maxLength={120}
                required
                onChange={(e) => setNote(e.currentTarget.value)}
                autoComplete="off"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 font-medium">
            Data prevista
            <Input
              type="date"
              min={today}
              required
              value={until}
              onChange={(e) => setUntil(e.currentTarget.value)}
              className="tabular-nums"
            />
          </label>
          {error && (
            <p role="alert" className="text-err">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onDone(null)}>
              Cancelar
            </Button>
            <Button type="submit">Confirmar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** `ask()` abre o diálogo e resolve com os campos, ou `null` se a pessoa cancelar. */
export function useWaitingPrompt() {
  const [state, setState] = useState<{
    initial?: Initial;
    resolve: (v: WaitingValue | null) => void;
  } | null>(null);
  const ask = (initial?: Initial) =>
    new Promise<WaitingValue | null>((resolve) => setState({ initial, resolve }));
  const dialog = state && (
    <WaitingDialog
      initial={state.initial}
      onDone={(v) => {
        state.resolve(v);
        setState(null);
      }}
    />
  );
  return [ask, dialog] as const;
}

/** Card e detalhe: "Compra · 20 nov"; previsão vencida com o ícone em `warn` (não é atraso). */
export function WaitingInfo({
  reason,
  note,
  until,
  className,
}: {
  reason: string | null;
  note?: string | null;
  until: string | null;
  className?: string;
}) {
  const late = !!until && until < todayISO();
  const label = waitingReasonLabel(reason);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs tabular-nums text-muted", className)}
      title={note ?? undefined}
    >
      <CalendarClock
        className={cn("size-3.5 flex-none", late && "text-warn")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="sr-only">Aguardando:</span>
      {label || until ? (
        <>
          {label ?? "Sem motivo"}
          {note && <span className="sr-only"> ({note})</span>}
          {" · "}
          {until ? shortDate(until) : "sem previsão"}
          {late && <span className="sr-only">(previsão vencida)</span>}
        </>
      ) : (
        "Sem previsão"
      )}
    </span>
  );
}
