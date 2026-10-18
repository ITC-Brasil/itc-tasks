"use client";

import { Bot, Copy, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { relativeTime } from "@/lib/dates";
import { createApiKeyAction, revokeApiKeyAction } from "@/server/actions/agents";
import { FieldLabel, FormSelect } from "../config-ui";
import { Card } from "@/components/ui/card";

type AgentKey = {
  id: string;
  name: string | null;
  start: string | null;
  ownerName: string;
  enabled: boolean | null;
  write: boolean;
  requestCount: number | null;
  lastRequest: Date | null;
};
type Option = { value: string; label: string };

const ACCESS: Option[] = [
  { value: "read", label: "Só leitura (tasks:read)" },
  { value: "write", label: "Leitura e escrita (tasks:read, tasks:write)" },
];

/** Novo token; o segredo aparece uma única vez, no próprio diálogo. */
export function NewAgentKeyDialog({
  owners,
  label = "Novo token",
}: {
  owners: Option[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createApiKeyAction(form);
      if (!result.ok) return setError(result.error);
      setError(null);
      setKey(result.key);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
        if (!next) setKey(null);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus strokeWidth={1.75} /> {label}
      </DialogTrigger>
      <DialogContent>
        {key ? (
          <>
            <DialogHeader>
              <DialogTitle>Token criado</DialogTitle>
              <DialogDescription>Copie agora: ele não será mostrado de novo.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input readOnly value={key} aria-label="Token" className="font-mono text-xs" />
              <Button
                variant="secondary"
                aria-label="Copiar token"
                onClick={async () => {
                  await navigator.clipboard.writeText(key);
                  toast.success("Token copiado");
                }}
              >
                <Copy strokeWidth={1.75} />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Novo token</DialogTitle>
              <DialogDescription>
                O agente age em nome do dono do token, com as permissões escolhidas.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <FieldLabel label="Nome">
                <Input
                  name="name"
                  required
                  maxLength={60}
                  placeholder="Ex.: Claude do Matheus"
                  autoComplete="off"
                />
              </FieldLabel>
              <FormSelect name="access" label="Permissões" items={ACCESS} defaultValue="write" />
              {owners.length > 0 && (
                <FormSelect
                  name="userId"
                  label="Dono"
                  items={[{ value: "", label: "Eu" }, ...owners]}
                  defaultValue=""
                />
              )}
              {error && (
                <p role="alert" className="text-err">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Criando…" : "Criar token"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AgentKeysTable({ keys, showOwner }: { keys: AgentKey[]; showOwner: boolean }) {
  const [pending, startTransition] = useTransition();

  if (keys.length === 0)
    return (
      <Card>
        <EmptyState icon={Bot} title="Nenhum agente conectado">
          Crie um token para que um agente opere o ITC Tasks pelo MCP.
        </EmptyState>
      </Card>
    );

  function revoke(k: AgentKey) {
    startTransition(async () => {
      const result = await revokeApiKeyAction(k.id);
      if (result.ok) toast.success("Token revogado");
      else toast.error(result.error);
    });
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Nome</th>
            {showOwner && <th className="px-4 py-3 font-medium">Dono</th>}
            <th className="px-4 py-3 font-medium">Permissões</th>
            <th className="px-4 py-3 font-medium">Último uso</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-t border-border">
              <td className="px-4 py-3">
                <span className="font-medium">{k.name}</span>{" "}
                <span className="font-mono text-xs text-muted">{k.start}…</span>
              </td>
              {showOwner && <td className="px-4 py-3">{k.ownerName}</td>}
              <td className="px-4 py-3">{k.write ? "Leitura e escrita" : "Só leitura"}</td>
              <td className="px-4 py-3 text-muted tabular-nums">
                {k.lastRequest
                  ? `${relativeTime(new Date(k.lastRequest))} · ${k.requestCount ?? 0} req.`
                  : "Nunca"}
              </td>
              <td className="px-4 py-3">{k.enabled ? "Ativo" : "Revogado"}</td>
              <td className="px-4 py-3 text-right">
                {k.enabled && (
                  <Button
                    variant="destructive"
                    disabled={pending}
                    aria-label={`Revogar ${k.name}`}
                    onClick={() => revoke(k)}
                  >
                    Revogar
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
