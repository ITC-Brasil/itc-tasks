import { Inbox } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { CreateTaskButton } from "@/components/tasks/quick-create";
import { EmptyState } from "@/components/ui/empty-state";

// ponytail: a lista real (Módulo 05) substitui o empty state
export default function MyTasks() {
  return (
    <>
      <Topbar title="Minhas tarefas" />
      <main className="p-4 md:p-6">
        <EmptyState icon={Inbox} title="Nada pendente por aqui" action={<CreateTaskButton />}>
          Você não tem tarefas abertas neste ciclo. Crie uma ou puxe algo do backlog.
        </EmptyState>
      </main>
    </>
  );
}
