import type { Metadata } from "next";
import { Suspense } from "react";
import { listMembers } from "@/server/services/members";
import { AdminConfigPage } from "../admin-only";
import { MembersTable, NewMemberDialog } from "./members-client";

export const metadata: Metadata = { title: "Membros · ITC Tasks" };

// ADR-036: a sessão é lida dentro de Suspense para a navegação seguir instantânea
export default function MembersPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Membros"
        render={async (actor) => ({
          actions: <NewMemberDialog />,
          content: (
            <>
              <p className="text-sm text-muted">
                Quem acessa o ITC Tasks. Membros desativados não entram nem aparecem em seletores.
              </p>
              <MembersTable
                members={await listMembers(actor)}
                selfId={"userId" in actor ? actor.userId : ""}
              />
            </>
          ),
        })}
      />
    </Suspense>
  );
}
