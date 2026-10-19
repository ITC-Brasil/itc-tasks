"use client";

import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePreference } from "@/components/layout/save-preference";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type Channels,
  EVENT_LABELS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import {
  setNotificationChannelAction,
  setNotificationScheduleAction,
} from "@/server/actions/notifications";
import { changeMyPasswordAction, setMyNameAction } from "@/server/actions/members";
import { setThemeAction } from "@/server/actions/preferences";
import { FieldLabel } from "../config-ui";

const COLUMNS: { key: keyof Channels; label: string }[] = [
  { key: "inApp", label: "No app" },
  { key: "push", label: "Push" },
  { key: "email", label: "E-mail" },
];

/** Evento × canal; cada clique grava na hora (otimista, desfaz se falhar). */
export function ChannelMatrix({
  channels: initial,
}: {
  channels: Record<NotificationEvent, Channels>;
}) {
  const [channels, setChannels] = useState(initial);
  function toggle(event: NotificationEvent, key: keyof Channels, value: boolean) {
    const before = channels[event];
    const next = { ...before, [key]: value };
    setChannels((c) => ({ ...c, [event]: next }));
    savePreference(
      setNotificationChannelAction({ event, ...next }).then((r) => {
        if (!r.ok) throw new Error(r.error);
      }),
      () => setChannels((c) => ({ ...c, [event]: before })),
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted">
            <th className="py-2 font-medium">Evento</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="w-20 py-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_EVENTS.map((event) => (
            <tr key={event} className="border-b last:border-0">
              <td className="py-2.5">
                <div className="font-medium">{EVENT_LABELS[event].name}</div>
                <div className="text-xs text-muted">{EVENT_LABELS[event].hint}</div>
              </td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="text-center">
                  <Checkbox
                    className="mx-auto"
                    aria-label={`${c.label}: ${EVENT_LABELS[event].name}`}
                    checked={channels[event][c.key]}
                    onCheckedChange={(v) => toggle(event, c.key, v === true)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const THEMES = [
  ["light", "Claro"],
  ["dark", "Escuro"],
] as const;

/** Claro ou escuro (ADR-013), salvo em user.theme. */
export function ThemePicker({ initial }: { initial: "light" | "dark" }) {
  const { setTheme } = useTheme();
  // estado próprio: o resolvedTheme não existe no servidor e quebraria a hidratação
  const [current, setCurrent] = useState(initial);
  function pick(next: "light" | "dark") {
    const before = current;
    setCurrent(next);
    setTheme(next);
    savePreference(setThemeAction(next), () => {
      setCurrent(before);
      setTheme(before);
    });
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {THEMES.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          onClick={() => pick(value)}
          className={cn(
            "rounded-lg border bg-surface px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted",
            current === value && "border-2 border-accent",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Expediente do push e resumo diário por e-mail. */
export function ScheduleForm({
  start,
  end,
  emailDigest,
}: {
  start: string;
  end: string;
  emailDigest: boolean;
}) {
  const [pending, run] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const r = await setNotificationScheduleAction(form);
      if (r.ok) toast.success("Horário salvo");
      else toast.error(r.error);
    });
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted">Fora deste horário o push fica em silêncio.</p>
      <div className="grid grid-cols-2 gap-2.5">
        <FieldLabel label="Início">
          <Input name="quietHoursStart" type="time" defaultValue={start} required />
        </FieldLabel>
        <FieldLabel label="Fim">
          <Input name="quietHoursEnd" type="time" defaultValue={end} required />
        </FieldLabel>
      </div>
      <label className="flex items-center gap-2.5 font-medium">
        <Switch
          name="emailDigest"
          defaultChecked={emailDigest}
          aria-label="Resumo diário por e-mail, às 08:00"
        />
        Resumo diário por e-mail, às 08:00
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
        Salvar horário
      </Button>
    </form>
  );
}

/** M-087: o próprio nome; as iniciais do avatar são recalculadas no servidor. */
export function NameForm({ initial }: { initial: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    startTransition(async () => {
      const result = await setMyNameAction(name);
      if (!result.ok) return setError(result.error);
      setError(null);
      toast.success("Nome alterado");
    });
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <FieldLabel label="Nome">
        <Input name="name" required maxLength={80} defaultValue={initial} autoComplete="name" />
      </FieldLabel>
      {error && (
        <p role="alert" className="text-err">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="self-start" disabled={pending}>
        {pending ? "Salvando…" : "Salvar nome"}
      </Button>
    </form>
  );
}

/** M-117: troca a própria senha; as outras sessões são encerradas, esta continua. */
export function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      const result = await changeMyPasswordAction(new FormData(form));
      if (!result.ok) return setError(result.error);
      setError(null);
      form.reset();
      toast.success("Senha alterada. As outras sessões foram encerradas.");
    });
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <FieldLabel label="Senha atual">
        <Input name="current" type="password" required autoComplete="current-password" />
      </FieldLabel>
      <FieldLabel label="Nova senha">
        <Input
          name="next"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </FieldLabel>
      <FieldLabel label="Confirme a nova senha">
        <Input
          name="confirm"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </FieldLabel>
      {error && (
        <p role="alert" className="text-err">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="self-start" disabled={pending}>
        {pending ? "Salvando…" : "Trocar senha"}
      </Button>
    </form>
  );
}
