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
  model: string | null;
  plate: string | null;
  base: string | null;
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
      <FieldLabel label="Código">
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
      <FieldLabel label="Modelo">
        <Input name="model" defaultValue={unit?.model ?? ""} autoComplete="off" />
      </FieldLabel>
      <FieldLabel label="Placa">
        <Input
          name="plate"
          maxLength={10}
          className="uppercase"
          defaultValue={unit?.plate ?? ""}
          autoComplete="off"
        />
      </FieldLabel>
      <FieldLabel label="Base">
        <Input name="base" defaultValue={unit?.base ?? ""} autoComplete="off" />
      </FieldLabel>
      <FormSelect
        name="projectId"
        label="Projeto/Cliente"
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
            <th className="px-4 py-3 font-medium">Código</th>
            <th className="px-4 py-3 font-medium">Modelo</th>
            <th className="px-4 py-3 font-medium">Placa</th>
            <th className="px-4 py-3 font-medium">Base</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
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
              <td className="px-4 py-3">{u.model ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{u.plate ?? "—"}</td>
              <td className="px-4 py-3">{u.base ?? "—"}</td>
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
