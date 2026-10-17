"use client";

import { Plus } from "lucide-react";
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
  setMemberActiveAction,
  setMemberRoleAction,
} from "@/server/actions/members";

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
    <div className="overflow-x-auto rounded-xl bg-surface shadow-1">
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
                  {!self && (
                    <Button
                      variant={m.banned ? "secondary" : "destructive"}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setMemberActiveAction(m.id, !!m.banned),
                          m.banned ? "Membro reativado" : "Membro desativado",
                        )
                      }
                    >
                      {m.banned ? "Reativar" : "Desativar"}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
