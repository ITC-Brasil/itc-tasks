import type { Metadata } from "next";
import { Suspense } from "react";
import { listLabels } from "@/server/services/catalog";
import { AdminConfigPage } from "../admin-only";
import { LabelDialog, LabelsTable } from "./labels-client";

export const metadata: Metadata = { title: "Etiquetas · ITC Tasks" };

export default function LabelsPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Etiquetas"
        render={async (actor) => ({
          actions: <LabelDialog />,
          content: (
            <>
              <p className="text-sm text-muted">
                Etiquetas arquivadas somem dos seletores e continuam nas tarefas que já as têm.
              </p>
              <LabelsTable labels={await listLabels(actor, { includeArchived: true })} />
            </>
          ),
        })}
      />
    </Suspense>
  );
}
