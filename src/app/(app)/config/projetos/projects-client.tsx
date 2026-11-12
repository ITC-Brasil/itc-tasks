"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProjectAction, setProjectArchivedAction } from "@/server/actions/catalog";
import { ArchiveButton, FieldLabel, FormDialog, FormSelect, Situation } from "../config-ui";
import { Card } from "@/components/ui/card";
import { ProjectChip } from "@/components/tasks/badges";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES, type ProjectColor } from "@/lib/validation/catalog";

type Project = {
  id: string;
  code: string;
  name: string;
  kind: "project" | "client" | "internal";
  glpiEntity: string | null;
  color: ProjectColor | null;
  archivedAt: Date | null;
};

const KINDS = [
  { value: "project", label: "Projeto" },
  { value: "client", label: "Cliente" },
  { value: "internal", label: "Interno" },
];

export function ProjectDialog({ project }: { project?: Project }) {
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
      <FieldLabel label="Entidade no GLPI">
        <Input name="glpiEntity" defaultValue={project?.glpiEntity ?? ""} autoComplete="off" />
      </FieldLabel>
      <ColorPicker defaultValue={project?.color ?? null} />
    </FormDialog>
  );
}

/** ADR-068: amostras da paleta fechada; "Padrão" (valor vazio) volta ao chip ciano. */
function ColorPicker({ defaultValue }: { defaultValue: ProjectColor | null }) {
  const swatch =
    "flex h-7 min-w-9 cursor-pointer items-center justify-center rounded-sm border border-border px-2 text-xs font-medium peer-checked:ring-2 peer-checked:ring-accent peer-checked:ring-offset-2 peer-checked:ring-offset-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent";
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-medium">Cor nos cards</legend>
      <div className="flex flex-wrap gap-2">
        <label>
          <input
            type="radio"
            name="color"
            value=""
            defaultChecked={!defaultValue}
            aria-label="Padrão"
            className="peer sr-only"
          />
          <span className={`${swatch} bg-accent-light text-accent-text`}>Padrão</span>
        </label>
        {PROJECT_COLORS.map((c) => (
          <label key={c}>
            <input
              type="radio"
              name="color"
              value={c}
              defaultChecked={defaultValue === c}
              aria-label={PROJECT_COLOR_NAMES.get(c)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={swatch}
              style={{ background: `var(--project-${c}-bg)`, color: `var(--project-${c}-fg)` }}
            >
              Aa
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProjectsTable({ projects }: { projects: Project[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Sigla</th>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
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
              <td className="px-4 py-3">
                <ProjectChip code={p.code} name={p.name} color={p.color} />
              </td>
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">{KINDS.find((k) => k.value === p.kind)?.label}</td>
              <td className="px-4 py-3 text-muted">{p.glpiEntity ?? "—"}</td>
              <td className="px-4 py-3">
                <Situation archived={!!p.archivedAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <ProjectDialog project={p} />
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
    </Card>
  );
}
