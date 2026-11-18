"use client";

import { Bot, KeyRound, MoreHorizontal, Pencil, Plus, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ActionResult,
  createMemberAction,
  resetMemberPasswordAction,
  setMemberActiveAction,
  setMemberNameAction,
  setMemberRoleAction,
} from "@/server/actions/members";
import { revokeAllApiKeysAction } from "@/server/actions/agents";
import { Card } from "@/components/ui/card";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
};

const roles = [
  { value: "member", label: "Membro" },
  { value: "admin", label: "Admin" },
];

function RoleSelect({
  name,
  value,
  onValueChange,
  disabled,
  label,
}: {
  name?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select
      name={name}
      items={roles}
      defaultValue={value ?? "member"}
      onValueChange={(v) => v && onValueChange?.(v)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NewMemberDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const result = await createMemberAction(prev, form);
      if (result.ok) {
        setOpen(false);
        toast.success("Membro criado");
      }
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus strokeWidth={1.75} /> Criar membro
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar membro</DialogTitle>
          <DialogDescription>
            Passe a senha inicial para a pessoa por um canal seguro.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 font-medium">
            Nome
            <Input name="name" required minLength={2} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            E-mail
            <Input name="email" type="email" required autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Senha inicial
            <Input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <div className="flex flex-col gap-1.5 font-medium">
            Papel
            <RoleSelect name="role" label="Papel" />
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-err">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar membro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setOpen = onOpenChange;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    startTransition(async () => {
      const result = await resetMemberPasswordAction(member.id, password);
      if (!result.ok) return setError(result.error);
      setError(null);
      setOpen(false);
      toast.success("Senha redefinida");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha de {member.name}</DialogTitle>
          <DialogDescription>
            As sessões abertas são encerradas. Passe a senha nova por um canal seguro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 font-medium">
            Senha nova
            <Input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p role="alert" className="text-err">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Redefinindo…" : "Redefinir senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** ADR-074: o admin revoga todos os tokens do membro sem ver nenhum deles. */
function RevokeTokensDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await revokeAllApiKeysAction(member.id);
      if (!result.ok) return void toast.error(result.error);
      onOpenChange(false);
      toast.success(
        result.count === 0
          ? `${member.name} não tinha tokens ativos`
          : `${result.count} ${result.count === 1 ? "token revogado" : "tokens revogados"}`,
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revogar todos os tokens de {member.name}?</DialogTitle>
          <DialogDescription>
            Os agentes conectados com tokens dessa pessoa perdem o acesso na hora. Os tokens não
            aparecem para você; ela pode criar outros em Agentes e MCP.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Revogando…" : "Revogar todos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** M-087: o admin troca o nome de qualquer membro, inclusive o próprio. */
function RenameDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setOpen = onOpenChange;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    startTransition(async () => {
      const result = await setMemberNameAction(member.id, name);
      if (!result.ok) return setError(result.error);
      setError(null);
      setOpen(false);
      toast.success("Nome alterado");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar nome de {member.name}</DialogTitle>
          <DialogDescription>
            As iniciais do avatar acompanham o nome. O histórico antigo não muda.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 font-medium">
            Nome
            <Input
              name="name"
              required
              maxLength={80}
              defaultValue={member.name}
              autoComplete="off"
            />
          </label>
          {error && (
            <p role="alert" className="text-err">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Salvar nome"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** M-122: as ações da linha num menu, para a tabela caber sem rolagem a partir de 1024 px. */
function MemberActions({
  member,
  self,
  disabled,
  onToggleActive,
}: {
  member: Member;
  self: boolean;
  disabled: boolean;
  onToggleActive: () => void;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "password" | "tokens" | null>(null);
  const onOpenChange = (open: boolean) => !open && setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Ações de ${member.name}`} />}
        >
          <MoreHorizontal strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            <Pencil strokeWidth={1.75} />
            Editar nome
          </DropdownMenuItem>
          {self ? (
            <DropdownMenuItem onClick={() => router.push("/config/preferencias#h-password")}>
              <KeyRound strokeWidth={1.75} />
              Trocar senha
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => setDialog("password")}>
                <KeyRound strokeWidth={1.75} />
                Redefinir senha
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("tokens")}>
                <Bot strokeWidth={1.75} />
                Revogar todos os tokens
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={member.banned ? "default" : "destructive"}
                disabled={disabled}
                onClick={onToggleActive}
              >
                <Power strokeWidth={1.75} />
                {member.banned ? "Reativar" : "Desativar"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog member={member} open={dialog === "rename"} onOpenChange={onOpenChange} />
      {!self && (
        <ResetPasswordDialog
          member={member}
          open={dialog === "password"}
          onOpenChange={onOpenChange}
        />
      )}
      {!self && (
        <RevokeTokensDialog
          member={member}
          open={dialog === "tokens"}
          onOpenChange={onOpenChange}
        />
      )}
    </>
  );
}

export function MembersTable({ members, selfId }: { members: Member[]; selfId: string }) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, done: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(done);
      else toast.error(result.error);
    });
  }

  return (
    // rola na horizontal abaixo de 1024 px: focável pelo teclado mesmo sem botões na linha (axe)
    <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Membros">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium">Papel</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const self = m.id === selfId;
            return (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">
                  {m.name}
                  {self && <span className="text-muted"> (você)</span>}
                </td>
                <td className="px-4 py-3 text-muted">{m.email}</td>
                <td className="px-4 py-3">
                  <RoleSelect
                    value={m.role ?? "member"}
                    label={`Papel de ${m.name}`}
                    disabled={self || pending}
                    onValueChange={(role) =>
                      run(() => setMemberRoleAction(m.id, role), "Papel alterado")
                    }
                  />
                </td>
                <td className="px-4 py-3">{m.banned ? "Desativado" : "Ativo"}</td>
                <td className="px-4 py-3 text-right">
                  <MemberActions
                    member={m}
                    self={self}
                    disabled={pending}
                    onToggleActive={() =>
                      run(
                        () => setMemberActiveAction(m.id, !!m.banned),
                        m.banned ? "Membro reativado" : "Membro desativado",
                      )
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
