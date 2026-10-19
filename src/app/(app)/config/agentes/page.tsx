import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { relativeTime } from "@/lib/dates";
import { MCP_URL } from "@/lib/env";
import { isAdmin } from "@/server/actor";
import { listAgentActivity, listAgentKeys } from "@/server/services/agents";
import { listMembers } from "@/server/services/members";
import { AdminConfigPage } from "../admin-only";
import { AgentKeysTable, NewAgentKeyDialog } from "./agents-client";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Agentes e MCP · ITC Tasks" };

const ACTIONS: Record<string, string> = {
  created: "criou",
  status_changed: "mudou o status de",
  assigned: "mudou o responsável de",
  commented: "comentou em",
  checklist_changed: "mexeu na checklist de",
};

const MCP_CONFIG = `{
  "mcpServers": {
    "itc-tasks": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer itct_SEU_TOKEN" }
    }
  }
}`;

// ADR-049: membro gerencia os próprios tokens; admin, os de qualquer pessoa
export default function AgentsPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Agentes e MCP"
        members
        render={async (actor) => {
          const admin = isAdmin(actor);
          const [keys, activity, people] = await Promise.all([
            listAgentKeys(actor),
            listAgentActivity(actor),
            admin ? listMembers(actor) : [],
          ]);
          const owners = people
            .filter((p) => !p.banned)
            .map((p) => ({ value: p.id, label: p.name }));
          return {
            actions: <NewAgentKeyDialog owners={owners} />,
            content: (
              <>
                <p className="text-sm text-muted">
                  Um token deixa um agente de IA operar o ITC Tasks pelo MCP em nome do dono, com as
                  mesmas regras da tela. Tudo o que ele fizer aparece no histórico com o selo “via
                  MCP”.
                </p>
                <AgentKeysTable keys={keys} showOwner={admin} />
                <section className="flex flex-col gap-2">
                  <h2 className="text-h3 font-bold">Atividade recente</h2>
                  {activity.length === 0 ? (
                    <p className="text-sm text-muted">Nenhuma ação de agente ainda.</p>
                  ) : (
                    <Card as="ul" className="flex flex-col divide-y divide-border text-sm">
                      {activity.map((a) => (
                        <li key={a.id} className="flex flex-wrap gap-x-1.5 px-4 py-2.5">
                          <span className="font-medium">{a.tokenName}</span>
                          <span className="text-muted">{ACTIONS[a.type] ?? "alterou"}</span>
                          <Link
                            href={`/tarefas/${a.taskNumber}`}
                            className="text-accent-text tabular-nums hover:underline"
                          >
                            TI-{a.taskNumber}
                          </Link>
                          <span className="truncate">{a.taskTitle}</span>
                          <span className="ml-auto text-muted tabular-nums">
                            {relativeTime(a.createdAt)}
                          </span>
                        </li>
                      ))}
                    </Card>
                  )}
                </section>
                <section className="flex flex-col gap-2">
                  <h2 className="text-h3 font-bold">Como conectar</h2>
                  <p className="text-sm text-muted">
                    No cliente MCP (Claude Code, Claude Desktop, Cowork), use o endereço e o token:
                  </p>
                  <Card as="pre" padding="md" className="overflow-x-auto text-xs">
                    {MCP_CONFIG}
                  </Card>
                  <Link href="/ajuda#mcp" className="text-sm text-accent-text hover:underline">
                    Como conectar um agente
                  </Link>
                </section>
              </>
            ),
          };
        }}
      />
    </Suspense>
  );
}
