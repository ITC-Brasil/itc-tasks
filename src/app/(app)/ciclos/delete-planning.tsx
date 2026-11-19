"use client";

import { Trash2 } from "lucide-react";
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
import { deleteCycleAction, deleteMilestoneAction } from "@/server/actions/planning";

/** ADR-071: confirmação com o número de tarefas que perdem o vínculo; só aparece para o admin. */
export function DeletePlanningDialog({
  kind,
  id,
  name,
  tasks,
}: {
  kind: "cycle" | "milestone";
  id: string;
  name: string;
  tasks: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const what = kind === "cycle" ? "ciclo" : "marco";

  function confirm() {
    start(async () => {
      const r = await (kind === "cycle" ? deleteCycleAction(id) : deleteMilestoneAction(id));
      if (!r.ok) return void toast.error(r.error);
      setOpen(false);
      toast.success(`${name} excluído`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost-destructive" size="icon-sm" aria-label={`Excluir ${name}`} />
        }
      >
        <Trash2 strokeWidth={1.75} aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {name}?</DialogTitle>
          <DialogDescription>
            {tasks === 0
              ? `Nenhuma tarefa está neste ${what}.`
              : tasks === 1
                ? `1 tarefa continua e perde o vínculo com o ${what}.`
                : `${tasks} tarefas continuam e perdem o vínculo com o ${what}.`}{" "}
            O histórico de cada uma registra a exclusão. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
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
