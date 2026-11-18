"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/actions/members";

const TABS = [
  { href: "/config/projetos", label: "Projetos/Clientes" },
  { href: "/config/unidades", label: "Unidades Móveis" },
  { href: "/config/workflow", label: "Workflow" },
  { href: "/config/etiquetas", label: "Etiquetas" },
  { href: "/config/envolvidos", label: "Envolvidos" },
  { href: "/config/membros", label: "Membros" },
  { href: "/config/automacoes", label: "Automações" },
  { href: "/config/agentes", label: "Agentes e MCP" },
  { href: "/config/preferencias", label: "Minhas preferências" },
];

export function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Configurações"
      className="flex gap-1 overflow-x-auto border-b bg-surface px-4 md:px-6"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
              active
                ? "border-accent text-accent-text"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Roda uma action e mostra o resultado em toast. */
export function useRun() {
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<ActionResult>, done: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(done);
      else toast.error(result.error);
    });
  }
  return { pending, run };
}

export function ArchiveButton({
  archived,
  name,
  onToggle,
}: {
  archived: boolean;
  name: string;
  onToggle: (archived: boolean) => Promise<ActionResult>;
}) {
  const { pending, run } = useRun();
  return (
    <Button
      variant={archived ? "secondary" : "destructive"}
      disabled={pending}
      aria-label={`${archived ? "Reativar" : "Arquivar"} ${name}`}
      onClick={() => run(() => onToggle(!archived), archived ? "Reativado" : "Arquivado")}
    >
      {archived ? "Reativar" : "Arquivar"}
    </Button>
  );
}

/** Diálogo de criar/editar: os campos vêm como children, o submit chama `save(form)`. */
export function FormDialog({
  trigger,
  title,
  description,
  submit,
  done,
  save,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  submit: string;
  done: string;
  save: (form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await save(form);
      if (!result.ok) return setError(result.error);
      setError(null);
      setOpen(false);
      toast.success(done);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {children}
          {error && (
            <p role="alert" className="text-err">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {label}
      {children}
    </label>
  );
}

/** Select de formulário (envia `name`); valor "" = nenhum. */
export function FormSelect({
  name,
  label,
  items,
  defaultValue,
}: {
  name: string;
  label: string;
  items: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 font-medium">
      {label}
      <Select name={name} items={items} defaultValue={defaultValue}>
        <SelectTrigger aria-label={label} className="w-full">
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
    </div>
  );
}

export function Situation({ archived }: { archived: boolean }) {
  return (
    <span className={archived ? "text-muted" : undefined}>{archived ? "Arquivado" : "Ativo"}</span>
  );
}
