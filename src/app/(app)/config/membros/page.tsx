import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { isAdmin, requireActor } from "@/server/actor";
import { listMembers } from "@/server/services/members";
import { MembersTable, NewMemberDialog } from "./members-client";

export const metadata: Metadata = { title: "Membros · ITC Tasks" };

// ADR-036: a sessão é lida dentro de Suspense para a navegação seguir instantânea
export default function MembersPage() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}

async function Members() {
  const actor = await requireActor();
  if (!isAdmin(actor)) {
    return (
      <main className="flex flex-col gap-2 p-4 md:p-6">
        <h1 className="text-h2">Você não tem acesso a esta área</h1>
        <Link href="/" className="text-sm text-accent-text underline">
          Ir para Minhas tarefas
        </Link>
      </main>
    );
  }
  const members = await listMembers(actor);
  return (
    <>
      <Topbar title="Membros">
        <NewMemberDialog />
      </Topbar>
      <main className="flex max-w-4xl flex-col gap-5 p-4 md:p-6">
        <p className="text-sm text-muted">
          Quem acessa o ITC Tasks. Membros desativados não entram nem aparecem em seletores.
        </p>
        <MembersTable members={members} selfId={actor.userId} />
      </main>
    </>
  );
}
