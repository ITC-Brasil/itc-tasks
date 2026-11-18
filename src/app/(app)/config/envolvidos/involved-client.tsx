"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveInvolvedAction, setInvolvedArchivedAction } from "@/server/actions/catalog";
import { ArchiveButton, FieldLabel, FormDialog, Situation } from "../config-ui";

type Person = { id: string; name: string; archivedAt: Date | null };

export function InvolvedDialog({ person }: { person?: Person }) {
  return (
    <FormDialog
      trigger={
        person ? (
          <Button variant="secondary" aria-label={`Editar ${person.name}`}>
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Criar envolvido
          </Button>
        )
      }
      title={person ? `Editar ${person.name}` : "Criar envolvido"}
      submit={person ? "Salvar" : "Criar envolvido"}
      done={person ? "Envolvido salvo" : "Envolvido criado"}
      save={(form) => saveInvolvedAction(person?.id ?? null, form)}
    >
      <FieldLabel label="Nome">
        <Input name="name" required maxLength={80} defaultValue={person?.name} autoComplete="off" />
      </FieldLabel>
    </FormDialog>
  );
}

export function InvolvedTable({ people }: { people: Person[] }) {
  if (!people.length)
    return <p className="text-sm text-muted">Nenhum envolvido cadastrado ainda.</p>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">
                <Situation archived={!!p.archivedAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <InvolvedDialog person={p} />
                  <ArchiveButton
                    archived={!!p.archivedAt}
                    name={p.name}
                    onToggle={(archived) => setInvolvedArchivedAction(p.id, archived)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
