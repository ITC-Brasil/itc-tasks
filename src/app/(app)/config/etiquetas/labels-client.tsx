"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveLabelAction, setLabelArchivedAction } from "@/server/actions/catalog";
import { ArchiveButton, FieldLabel, FormDialog, FormSelect, Situation } from "../config-ui";
import { Card } from "@/components/ui/card";

type Label = { id: string; name: string; colorToken: string; archivedAt: Date | null };

// classes literais para o Tailwind enxergar; só fundo do ponto (ADR-041)
const COLORS: { value: string; label: string; dot: string }[] = [
  { value: "label-teal", label: "Verde-azulado", dot: "bg-label-teal" },
  { value: "label-blue", label: "Azul", dot: "bg-label-blue" },
  { value: "label-plum", label: "Ameixa", dot: "bg-label-plum" },
  { value: "label-rose", label: "Rosa", dot: "bg-label-rose" },
  { value: "label-olive", label: "Oliva", dot: "bg-label-olive" },
  { value: "label-brown", label: "Marrom", dot: "bg-label-brown" },
  { value: "label-slate", label: "Ardósia", dot: "bg-label-slate" },
];

function Swatch({ token }: { token: string }) {
  const color = COLORS.find((c) => c.value === token);
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`size-3 rounded-full ${color?.dot ?? "bg-muted"}`} />
      {color?.label ?? token}
    </span>
  );
}

export function LabelDialog({ label }: { label?: Label }) {
  return (
    <FormDialog
      trigger={
        label ? (
          <Button variant="secondary" aria-label={`Editar ${label.name}`}>
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Criar etiqueta
          </Button>
        )
      }
      title={label ? `Editar ${label.name}` : "Criar etiqueta"}
      submit={label ? "Salvar" : "Criar etiqueta"}
      done={label ? "Etiqueta salva" : "Etiqueta criada"}
      save={(form) => saveLabelAction(label?.id ?? null, form)}
    >
      <FieldLabel label="Nome">
        <Input name="name" required maxLength={30} defaultValue={label?.name} autoComplete="off" />
      </FieldLabel>
      <FormSelect
        name="colorToken"
        label="Cor"
        items={COLORS}
        defaultValue={label?.colorToken ?? "label-blue"}
      />
    </FormDialog>
  );
}

export function LabelsTable({ labels }: { labels: Label[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Cor</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {labels.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{l.name}</td>
              <td className="px-4 py-3">
                <Swatch token={l.colorToken} />
              </td>
              <td className="px-4 py-3">
                <Situation archived={!!l.archivedAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <LabelDialog label={l} />
                  <ArchiveButton
                    archived={!!l.archivedAt}
                    name={l.name}
                    onToggle={(archived) => setLabelArchivedAction(l.id, archived)}
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
