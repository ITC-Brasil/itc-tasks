"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveMobileUnitAction, setMobileUnitArchivedAction } from "@/server/actions/catalog";
import { ArchiveButton, FieldLabel, FormDialog, FormSelect, Situation } from "../config-ui";
import { Card } from "@/components/ui/card";

type MobileUnit = {
  id: string;
  code: string;
  projectId: string | null;
  projectName: string | null;
  archivedAt: Date | null;
};
type Option = { value: string; label: string };

export function MobileUnitDialog({ unit, clients }: { unit?: MobileUnit; clients: Option[] }) {
  // cliente atual arquivado continua na lista para não ser trocado sem querer
  const options =
    unit?.projectId && !clients.some((c) => c.value === unit.projectId)
      ? [...clients, { value: unit.projectId, label: `${unit.projectName} (arquivado)` }]
      : clients;
  return (
    <FormDialog
      trigger={
        unit ? (
          <Button variant="secondary" aria-label={`Editar ${unit.code}`}>
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Criar Unidade Móvel
          </Button>
        )
      }
      title={unit ? `Editar ${unit.code}` : "Criar Unidade Móvel"}
      submit={unit ? "Salvar" : "Criar Unidade Móvel"}
      done={unit ? "Unidade Móvel salva" : "Unidade Móvel criada"}
      save={(form) => saveMobileUnitAction(unit?.id ?? null, form)}
    >
      <FieldLabel label="UM">
        <Input
          name="code"
          required
          maxLength={20}
          placeholder="UM-07"
          className="uppercase tabular-nums"
          defaultValue={unit?.code}
          autoComplete="off"
        />
      </FieldLabel>
      <FormSelect
        name="projectId"
        label="Projeto"
        items={options}
        defaultValue={unit?.projectId ?? ""}
      />
    </FormDialog>
  );
}

export function MobileUnitsTable({ units, clients }: { units: MobileUnit[]; clients: Option[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">UM</th>
            <th className="px-4 py-3 font-medium">Projeto</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium tabular-nums">{u.code}</td>
              <td className="px-4 py-3 text-muted">{u.projectName ?? "—"}</td>
              <td className="px-4 py-3">
                <Situation archived={!!u.archivedAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <MobileUnitDialog unit={u} clients={clients} />
                  <ArchiveButton
                    archived={!!u.archivedAt}
                    name={u.code}
                    onToggle={(archived) => setMobileUnitArchivedAction(u.id, archived)}
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
