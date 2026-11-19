"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { lateCountsAction } from "@/server/actions/tasks";

export type LateCounts = { mine: number; team: number };
const EVERY_MS = 5 * 60_000;

/**
 * Módulo 18: atrasadas de Minhas Tarefas e da Equipe. Começa com o número do layout (que o SSE
 * já atualiza pelo router.refresh) e reconta ao focar a janela e a cada 5 min (prazo vence sem
 * evento).
 */
export function useLateCounts(initial: LateCounts) {
  const [counts, setCounts] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCounts(initial);
  }
  useEffect(() => {
    const recount = () =>
      void lateCountsAction().then((r) => {
        if (r.ok) setCounts(r.data);
      });
    const timer = setInterval(recount, EVERY_MS);
    window.addEventListener("focus", recount);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", recount);
    };
  }, []);
  return counts;
}

/** Itens de navegação com contador: href → chave. */
export const LATE_KEY = new Map<string, keyof LateCounts>([
  ["/", "mine"],
  ["/tarefas", "team"],
]);

/**
 * Selo `err`/`on-err` (ADR-039) que leva à tela com o filtro Atrasadas. Link próprio, irmão do
 * item (link dentro de link não vale). No trilho recolhido também com o número (item 21), no
 * formato do selo de notificações.
 */
export function LateBadge({
  href,
  count,
  className,
}: {
  href: string;
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  const label = `${count} ${count === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`;
  return (
    <Link
      href={`${href}?atrasadas=1`}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-full bg-err font-semibold text-on-err tabular-nums focus-visible:ring-3 focus-visible:ring-accent-light focus-visible:outline-none",
        "px-1.5 text-[11px] leading-[18px]",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </Link>
  );
}
