"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const RETRY_MS = 1000;

/** Arrastando, digitando ou com diálogo aberto: recarregar agora desfaria o que a pessoa faz. */
function busy(pointerDown: boolean) {
  const el = document.activeElement as HTMLElement | null;
  return (
    pointerDown ||
    !!el?.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "") ||
    !!document.querySelector('[role="dialog"], [role="listbox"]')
  );
}

/**
 * ADR-048: mudança em tarefa feita por outra pessoa/agente → recarrega os Server Components
 * (debounce de 500 ms, adiado enquanto a pessoa interage). A própria escrita já revalida pela action.
 */
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const source = new EventSource("/api/events"); // reconecta sozinho (retry: 5000)
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pointerDown = false;
    const down = () => (pointerDown = true);
    const up = () => (pointerDown = false);
    const refresh = () => {
      if (busy(pointerDown)) timer = setTimeout(refresh, RETRY_MS);
      else router.refresh();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 500);
    };
    source.addEventListener("task.changed", (e) => {
      if ((JSON.parse(e.data) as { by: string | null }).by === userId) return;
      schedule();
    });
    // ADR-050: aviso novo → atualiza o contador do sino e a central
    source.addEventListener("notification.created", schedule);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      clearTimeout(timer);
      source.close();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, [router, userId]);
  return null;
}
