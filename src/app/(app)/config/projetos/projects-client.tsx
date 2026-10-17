"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProjectAction, setProjectArchivedAction } from "@/server/actions/catalog";
import { ArchiveButton, FieldLabel, FormDialog, FormSelect, Situation } from "../config-ui";

type Project = {
  id: string;
  code: string;
  name: string;
  kind: "project" | "client" | "internal";
  defaultAssigneeId: string | null;
  glpiEntity: string | null;
  archivedAt: Date | null;
};
type Option = { value: string; label: string };

const KINDS = [
  { value: "project", label: "Projeto" },
  { value: "client", label: "Cliente" },
  { value: "internal", label: "Interno" },
];

export function ProjectDialog({ project, people }: { project?: Project; people: Option[] }) {
  return (
    <FormDialog
      trigger={
        project ? (
          <Button variant="secondary" aria-label={`Editar ${project.name}`}>
            Editar
          </Button>
        ) : (
          <Button>
            <Plus strokeWidth={1.75} /> Criar Projeto/Cliente
          </Button>
        )
      }
      title={project ? `Editar ${project.name}` : "Criar Projeto/Cliente"}
      submit={project ? "Salvar" : "Criar Projeto/Cliente"}
      done={project ? "Projeto/Cliente salvo" : "Projeto/Cliente criado"}
      save={(form) => saveProjectAction(project?.id ?? null, form)}
    >
      <FieldLabel label="Nome">
        <Input name="name" required minLength={2} defaultValue={project?.name} autoComplete="off" />
      </FieldLabel>
      <FieldLabel label="Sigla (2 a 12 letras ou números)">
        <Input
          name="code"
          required
          pattern="[A-Za-z0-9]{2,12}"
          maxLength={12}
          className="uppercase tabular-nums"
          defaultValue={project?.code}
          autoComplete="off"
        />
      </FieldLabel>
      <FormSelect
        name="kind"
        label="Tipo"
        items={KINDS}
        defaultValue={project?.kind ?? "project"}
      />
      <FormSelect
        name="defaultAssigneeId"
        label="Responsável padrão"
        items={[{ value: "", label: "Ninguém" }, ...people]}
        defaultValue={project?.defaultAssigneeId ?? ""}
      />
      <FieldLabel label="Entidade no GLPI">
        <Input name="glpiEntity" defaultValue={project?.glpiEntity ?? ""} autoComplete="off" />
      </FieldLabel>
    </FormDialog>
  );
}

export function ProjectsTable({
  projects,
  people,
  names,
}: {
  projects: Project[];
  people: Option[];
  names: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-surface shadow-1">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Sigla</th>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Responsável padrão</th>
            <th className="px-4 py-3 font-medium">Entidade GLPI</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium tabular-nums">{p.code}</td>
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">{KINDS.find((k) => k.value === p.kind)?.label}</td>
              <td className="px-4 py-3 text-muted">
                {p.defaultAssigneeId ? names[p.defaultAssigneeId] : "—"}
              </td>
              <td className="px-4 py-3 text-muted">{p.glpiEntity ?? "—"}</td>
              <td className="px-4 py-3">
                <Situation archived={!!p.archivedAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <ProjectDialog project={p} people={people} />
                  <ArchiveButton
                    archived={!!p.archivedAt}
                    name={p.name}
                    onToggle={(archived) => setProjectArchivedAction(p.id, archived)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
