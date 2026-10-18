import type { Metadata } from "next";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { getTaskFormOptionsAction } from "@/server/actions/tasks";
import { listTemplates } from "@/server/services/templates";
import { TemplateDialog, TemplatesView } from "./templates-client";

export const metadata: Metadata = { title: "Templates · ITC Tasks" };

async function Templates() {
  // a action confere a sessão; os seletores são os mesmos da criação rápida
  const [options, templates] = await Promise.all([getTaskFormOptionsAction(), listTemplates()]);
  return (
    <>
      <Topbar title="Templates">
        <TemplateDialog options={options} />
      </Topbar>
      <main className="flex flex-col gap-5 p-4 md:p-6">
        <TemplatesView templates={templates} options={options} />
      </main>
    </>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense>
      <Templates />
    </Suspense>
  );
}
