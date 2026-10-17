import type { Metadata } from "next";
import { Suspense } from "react";
import { listProjects } from "@/server/services/catalog";
import { listMembers } from "@/server/services/members";
import { AdminConfigPage } from "../admin-only";
import { ProjectDialog, ProjectsTable } from "./projects-client";

export const metadata: Metadata = { title: "Projetos/Clientes · ITC Tasks" };

export default function ProjectsPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Projetos/Clientes"
        render={async (actor) => {
          const [projects, members] = await Promise.all([
            listProjects(actor, { includeArchived: true }),
            listMembers(actor),
          ]);
          const people = members
            .filter((m) => !m.banned)
            .map((m) => ({ value: m.id, label: m.name }));
          return {
            actions: <ProjectDialog people={people} />,
            content: (
              <>
                <p className="text-sm text-muted">
                  Toda tarefa pertence a um Projeto/Cliente. Arquivados somem dos seletores, mas as
                  tarefas antigas continuam mostrando o nome.
                </p>
                <ProjectsTable
                  projects={projects}
                  people={people}
                  names={Object.fromEntries(members.map((m) => [m.id, m.name]))}
                />
              </>
            ),
          };
        }}
      />
    </Suspense>
  );
}
