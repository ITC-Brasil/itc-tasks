import type { Metadata } from "next";
import { Suspense } from "react";
import { listMobileUnits, listProjects } from "@/server/services/catalog";
import { AdminConfigPage } from "../admin-only";
import { MobileUnitDialog, MobileUnitsTable } from "./units-client";

export const metadata: Metadata = { title: "Unidades Móveis · ITC Tasks" };

export default function MobileUnitsPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Unidades Móveis"
        render={async (actor) => {
          const [units, projects] = await Promise.all([
            listMobileUnits(actor, { includeArchived: true }),
            listProjects(actor), // seletor: só ativos
          ]);
          const clients = projects.map((p) => ({ value: p.id, label: p.name }));
          return {
            actions: <MobileUnitDialog clients={clients} />,
            content: (
              <>
                <p className="text-sm text-muted">
                  Unidades atendidas pelo time. Arquivadas somem dos seletores.
                </p>
                <MobileUnitsTable units={units} clients={clients} />
              </>
            ),
          };
        }}
      />
    </Suspense>
  );
}
