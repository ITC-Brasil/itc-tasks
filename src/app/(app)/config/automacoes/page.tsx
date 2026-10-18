import type { Metadata } from "next";
import { Suspense } from "react";
import { listRules } from "@/server/services/automations";
import { listLabels, listStatuses } from "@/server/services/catalog";
import { AdminConfigPage } from "../admin-only";
import { RuleDialog, RulesList } from "./automations-client";

export const metadata: Metadata = { title: "Automações · ITC Tasks" };

export default function AutomationsPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Automações"
        render={async (actor) => {
          const [rules, statuses, labels] = await Promise.all([
            listRules(actor),
            listStatuses(actor, { includeArchived: true }),
            listLabels(actor, { includeArchived: true }),
          ]);
          const refs = { statuses, labels };
          return {
            actions: <RuleDialog refs={refs} />,
            content: (
              <>
                <p className="max-w-160 text-sm text-muted">
                  Regras simples do tipo “quando acontecer isto, faça aquilo”. Rodam no servidor,
                  para tarefas criadas pela tela ou por agentes via MCP. Desligar uma regra não
                  apaga o histórico de execuções.
                </p>
                <RulesList rules={rules} refs={refs} />
              </>
            ),
          };
        }}
      />
    </Suspense>
  );
}
