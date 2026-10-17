import { Inbox, Plus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// ponytail: sem tarefas até o Módulo 04; a lista real substitui o empty state
export default function MyTasks() {
  return (
    <>
      <Topbar title="Minhas tarefas" />
      <main className="p-4 md:p-6">
        <EmptyState
          icon={Inbox}
          title="Nada pendente por aqui"
          action={
            <Button disabled title="Disponível no Módulo 04">
              <Plus aria-hidden="true" /> Criar tarefa
            </Button>
          }
        >
          Você não tem tarefas abertas neste ciclo. Crie uma ou puxe algo do backlog.
        </EmptyState>
      </main>
    </>
  );
}
