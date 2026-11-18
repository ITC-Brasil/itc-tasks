import type { Metadata } from "next";
import { Suspense } from "react";
import { listInvolved } from "@/server/services/catalog";
import { AdminConfigPage } from "../admin-only";
import { InvolvedDialog, InvolvedTable } from "./involved-client";

export const metadata: Metadata = { title: "Envolvidos · ITC Tasks" };

export default function InvolvedPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Envolvidos"
        render={async (actor) => ({
          actions: <InvolvedDialog />,
          content: (
            <>
              <p className="text-sm text-muted">
                Pessoas de fora do app ligadas a tarefas (motorista, contato no cliente,
                terceirizado). Não entram no app, não recebem aviso nem são mencionadas. Arquivadas
                somem dos seletores e continuam nas tarefas que já as têm.
              </p>
              <InvolvedTable people={await listInvolved(actor, { includeArchived: true })} />
            </>
          ),
        })}
      />
    </Suspense>
  );
}
