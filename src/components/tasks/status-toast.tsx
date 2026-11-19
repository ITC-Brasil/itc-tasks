"use client";

import { toast } from "sonner";
import { undoStatusAction } from "@/server/actions/tasks";

type Router = { push: (href: string) => void; refresh: () => void };

/**
 * Módulo 18: toast depois de mudar o status pela tela. Concluir convida a comentar (item 8); toda
 * mudança traz "Desfazer" por 6 s (ADR-082). Um toast por vez: o próximo encerra este.
 */
export function statusToast(
  router: Router,
  t: { taskId: string; number: number; statusName: string; done: boolean; eventId: string | null },
) {
  const undo = t.eventId
    ? {
        label: "Desfazer",
        onClick: async () => {
          const r = await undoStatusAction(t.taskId, t.eventId!);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`TI-${t.number}: mudança desfeita`);
          router.refresh();
        },
      }
    : undefined;
  const options = { duration: 6000 };
  if (t.done)
    toast.success(`TI-${t.number} concluída`, {
      ...options,
      action: {
        label: "Adicionar comentário",
        onClick: () => {
          const href = `/tarefas/${t.number}`;
          if (window.location.pathname !== href) return router.push(`${href}#comentar`);
          // já no detalhe: a rota não muda, então foca o editor aqui
          const editor = document.querySelector<HTMLElement>("#comentar [contenteditable]");
          editor?.scrollIntoView({ block: "center" });
          editor?.focus();
        },
      },
      cancel: undo,
    });
  else toast.success(`TI-${t.number} movida para ${t.statusName}`, { ...options, action: undo });
}
