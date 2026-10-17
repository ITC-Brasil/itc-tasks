import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { requireActor } from "@/server/actor";

// cacheComponents (ADR-036): a leitura da sessão fica dentro de Suspense
async function SessionGate({ children }: { children: React.ReactNode }) {
  await requireActor();
  return children;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense>
        <SessionGate>{children}</SessionGate>
      </Suspense>
      <Toaster />
    </>
  );
}
