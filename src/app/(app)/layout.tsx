import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { requireUser } from "@/server/actor";
import { unreadCount } from "@/server/services/notifications";

// cacheComponents (ADR-036): a leitura da sessão fica dentro de Suspense
async function Shell({ children }: { children: React.ReactNode }) {
  const { actor, profile } = await requireUser();
  return (
    <AppShell
      profile={{ ...profile, id: actor.userId, role: actor.role }}
      unread={await unreadCount(actor.userId)}
    >
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense>
        <Shell>{children}</Shell>
      </Suspense>
      <Toaster />
    </>
  );
}
