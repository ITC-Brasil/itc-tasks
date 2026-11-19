import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { requireUser } from "@/server/actor";
import { unreadCount } from "@/server/services/notifications";
import { countLate } from "@/server/services/tasks";

// cacheComponents (ADR-036): a leitura da sessão fica dentro de Suspense
async function Shell({ children }: { children: React.ReactNode }) {
  const { actor, profile } = await requireUser();
  const [unread, late] = await Promise.all([unreadCount(actor.userId), countLate(actor)]);
  return (
    <AppShell
      profile={{ ...profile, id: actor.userId, role: actor.role }}
      unread={unread}
      late={late}
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
