"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteTasksAction } from "@/server/actions/tasks";

type Target = { id: string; number: number; title: string };

/** ADR-063: confirmação da exclusão definitiva, com `TI-<number>` e título de cada tarefa. */
export function DeleteTasksDialog({
  trigger,
  tasks,
  onDeleted,
}: {
  trigger: React.ReactElement;
  tasks: Target[];
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const one = tasks.length === 1;

  function confirm() {
    start(async () => {
      const r = await deleteTasksAction({ taskIds: tasks.map((t) => t.id) });
      if (!r.ok) return void toast.error(r.error);
      setOpen(false);
      toast.success(one ? `TI-${tasks[0].number} excluída` : `${r.data} tarefas excluídas`);
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{one ? "Excluir tarefa?" : `Excluir ${tasks.length} tarefas?`}</DialogTitle>
          <DialogDescription>
            Some de vez, com subtarefas, comentários, anexos e histórico. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
          {tasks.map((t) => (
            <li key={t.id}>
              <span className="font-medium tabular-nums">TI-{t.number}</span> {t.title}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
