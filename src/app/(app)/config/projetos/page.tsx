import type { Metadata } from "next";
import { Suspense } from "react";
import { listProjects } from "@/server/services/catalog";
import { AdminConfigPage } from "../admin-only";
import { ProjectDialog, ProjectsTable } from "./projects-client";

export const metadata: Metadata = { title: "Projetos/Clientes · ITC Tasks" };

export default function ProjectsPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Projetos/Clientes"
        render={async (actor) => {
          const projects = await listProjects(actor, { includeArchived: true });
          return {
            actions: <ProjectDialog />,
            content: (
              <>
                <p className="text-sm text-muted">
                  Toda tarefa pertence a um Projeto/Cliente. Arquivados somem dos seletores, mas as
                  tarefas antigas continuam mostrando o nome.
                </p>
                <ProjectsTable projects={projects} />
              </>
            ),
          };
        }}
      />
    </Suspense>
  );
}
