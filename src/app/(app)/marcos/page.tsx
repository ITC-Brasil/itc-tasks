import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { requireActor } from "@/server/actor";
import { listProjects } from "@/server/services/catalog";
import { listMilestones } from "@/server/services/planning";
import { MilestoneDialog, MilestonesView } from "./milestones-client";

export const metadata: Metadata = { title: "Marcos · ITC Tasks" };

async function Milestones() {
  const actor = await requireActor();
  const [milestones, projects] = await Promise.all([listMilestones(), listProjects(actor)]);
  const options = projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
  return (
    <>
      <Topbar title="Marcos">
        <MilestoneDialog projects={options} />
      </Topbar>
      <main className="flex flex-col gap-5 p-4 md:p-6">
        <MilestonesView milestones={milestones} projects={options} />
      </main>
    </>
  );
}

export default function MilestonesPage() {
  return (
    <Suspense>
      <Milestones />
    </Suspense>
  );
}
