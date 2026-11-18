import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { type Actor, isAdmin, requireActor } from "@/server/actor";
import { ConfigTabs } from "./config-ui";

/**
 * Casca das telas de Configurações (só admin; `members` abre para membros, sem as abas).
 * Chame dentro de Suspense (ADR-036). `render` recebe o actor já conferido e devolve ações da
 * Topbar e conteúdo.
 */
export async function AdminConfigPage({
  title,
  render,
  members = false,
}: {
  title: string;
  render: (actor: Actor) => Promise<{ actions?: React.ReactNode; content: React.ReactNode }>;
  members?: boolean;
}) {
  const actor = await requireActor();
  if (!members && !isAdmin(actor)) {
    return (
      <main className="flex flex-col gap-2 p-4 md:p-6">
        <h1 className="text-h2">Você não tem acesso a esta área</h1>
        <Link href="/" className="text-sm text-accent-text underline">
          Ir para o Início
        </Link>
      </main>
    );
  }
  const { actions, content } = await render(actor);
  return (
    <>
      <Topbar title={title}>{actions}</Topbar>
      {isAdmin(actor) && <ConfigTabs />}
      <main className="flex max-w-5xl flex-col gap-5 p-4 md:p-6">{content}</main>
    </>
  );
}
