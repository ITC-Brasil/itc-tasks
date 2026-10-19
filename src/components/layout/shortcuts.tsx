"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// UI.md §5. Cada módulo acrescenta aqui os atalhos que passa a atender.
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Busca e comandos" },
  { keys: ["C"], label: "Criar tarefa" },
  { keys: ["⌘", "↵"], label: "Enviar (criar, comentar)" },
  { keys: ["G", "C"], label: "Ir para o ciclo atual" },
  { keys: ["["], label: "Recolher/expandir menu" },
  { keys: ["?"], label: "Mostrar atalhos" },
  { keys: ["Esc"], label: "Fechar modal/painel" },
];

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-base px-1 text-[11px] font-medium text-muted tabular-nums">
      {children}
    </kbd>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** Atalho de uma tecla; não dispara com foco em campo de texto nem com Ctrl/⌘/Alt. */
export function useShortcut(key: string, handler: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== key || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, handler]);
}

/**
 * Sequência `G` + tecla (UI.md §5). Escuta na captura e para a propagação, para a segunda tecla não
 * disparar também o atalho de uma tecla (ex.: `C` = criar).
 */
export function useGoTo(key: string, handler: () => void) {
  useEffect(() => {
    let gAt = 0;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      if (e.key === "g") gAt = Date.now();
      else if (e.key === key && Date.now() - gAt < 1000) {
        gAt = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
        handler();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [key, handler]);
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <dl className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4">
              <dt>{s.label}</dt>
              <dd className="flex gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <Link
          href="/ajuda#atalhos"
          onClick={() => onOpenChange(false)}
          className="text-sm text-accent-text hover:underline"
        >
          Manual completo
        </Link>
      </DialogContent>
    </Dialog>
  );
}
