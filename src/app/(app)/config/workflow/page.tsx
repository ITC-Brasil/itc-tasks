import type { Metadata } from "next";
import { Suspense } from "react";
import { listStatuses } from "@/server/services/catalog";
import { AdminConfigPage } from "../admin-only";
import { StatusDialog, StatusesTable } from "./workflow-client";

export const metadata: Metadata = { title: "Workflow · ITC Tasks" };

export default function WorkflowPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Workflow"
        render={async (actor) => {
          const statuses = await listStatuses(actor, { includeArchived: true });
          return {
            actions: <StatusDialog />,
            content: (
              <>
                <p className="text-sm text-muted">
                  A ordem vale para o Kanban. A categoria não muda depois de criada: entrar num
                  status Concluído marca a tarefa como concluída, sair dele desmarca.
                </p>
                {/* arquivados por último; a ordem dos ativos é a do quadro */}
                <StatusesTable
                  statuses={[
                    ...statuses.filter((s) => !s.archivedAt),
                    ...statuses.filter((s) => s.archivedAt),
                  ]}
                />
              </>
            ),
          };
        }}
      />
    </Suspense>
  );
}
