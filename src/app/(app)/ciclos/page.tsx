import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { requireActor } from "@/server/actor";
import { isAdmin } from "@/server/permissions";
import { cycleLoad, listCycles, pendingTasks } from "@/server/services/planning";
import { CycleDialog, CyclesView } from "./cycles-client";

export const metadata: Metadata = { title: "Ciclos · ITC Tasks" };

async function Cycles() {
  const actor = await requireActor();
  const cycles = await listCycles();
  const active = cycles.find((c) => c.state === "active");
  const [load, pending] = active
    ? await Promise.all([cycleLoad(active.id), pendingTasks(active.id)])
    : [[], []];
  return (
    <>
      <Topbar title="Ciclos">
        <CycleDialog />
      </Topbar>
      <main className="flex flex-col gap-6 p-4 md:p-6">
        <CyclesView cycles={cycles} load={load} pending={pending} canDelete={isAdmin(actor)} />
      </main>
    </>
  );
}

export default function CyclesPage() {
  return (
    <Suspense>
      <Cycles />
    </Suspense>
  );
}
