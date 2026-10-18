"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  moveStatusAction,
  saveStatusAction,
  setStatusArchivedAction,
} from "@/server/actions/catalog";
import { ArchiveButton, FieldLabel, FormDialog, FormSelect, Situation, useRun } from "../config-ui";

type Category = "backlog" | "todo" | "in_progress" | "done";
type Status = { id: string; name: string; category: Category; archivedAt: Date | null };

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "A fazer" },
  { value: "in_progress", label: "Em andamento" },
  { value: "done", label: "Concluído" },
];
const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.value === c)?.label;

export function StatusDialog({ status }: { status?: Status }) {
  return (
    <FormDialog
      trigger={
        status ? (
          <Button variant="secondary" aria-label={`Renomear ${status.name}`}>
            Renomear
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Criar status
          </Button>
        )
      }
      title={status ? `Renomear ${status.name}` : "Criar status"}
      description={status ? undefined : "Entra no fim do quadro; depois ajuste a ordem."}
      submit={status ? "Salvar" : "Criar status"}
      done={status ? "Status renomeado" : "Status criado"}
      save={(form) => saveStatusAction(status?.id ?? null, form)}
    >
      <FieldLabel label="Nome">
        <Input name="name" required maxLength={40} defaultValue={status?.name} autoComplete="off" />
      </FieldLabel>
      {!status && (
        <FormSelect name="category" label="Categoria" items={CATEGORIES} defaultValue="todo" />
      )}
    </FormDialog>
  );
}

export function StatusesTable({ statuses }: { statuses: Status[] }) {
  const { pending, run } = useRun();
  const active = statuses.filter((s) => !s.archivedAt);
  const move = (s: Status, direction: -1 | 1) =>
    run(() => moveStatusAction(s.id, direction), "Ordem alterada");

  return (
    <div className="overflow-x-auto rounded-xl bg-surface shadow-1">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Ordem</th>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((s) => {
            const i = active.indexOf(s);
            return (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {i >= 0 && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Subir ${s.name}`}
                        disabled={pending || i === 0}
                        onClick={() => move(s, -1)}
                      >
                        <ArrowUp strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Descer ${s.name}`}
                        disabled={pending || i === active.length - 1}
                        onClick={() => move(s, 1)}
                      >
                        <ArrowDown strokeWidth={1.75} />
                      </Button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{categoryLabel(s.category)}</td>
                <td className="px-4 py-3">
                  <Situation archived={!!s.archivedAt} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <StatusDialog status={s} />
                    <ArchiveButton
                      archived={!!s.archivedAt}
                      name={s.name}
                      onToggle={(archived) => setStatusArchivedAction(s.id, archived)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
