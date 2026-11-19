"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// ADR-083: a última visão de lista da aba volta no botão Voltar do detalhe
const KEY = "itc-tasks:origem";
const ORIGINS = new Map([
  ["/", "Minhas Tarefas"],
  ["/tarefas", "Equipe"],
  ["/tarefas/lista", "Lista"],
  ["/tarefas/calendario", "Calendário"],
]);
const DEFAULT = { href: "/", label: "Minhas Tarefas" };
const noop = () => () => {};
const stored = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Lê a origem guardada; só aceita caminho exato da lista e refaz a busca (sem redirect aberto). */
export function readOrigin(raw: string | null) {
  if (!raw) return DEFAULT;
  const [path, search = ""] = raw.split("?", 2);
  const label = ORIGINS.get(path);
  if (!label) return DEFAULT;
  const query = new URLSearchParams(search).toString();
  return { href: query ? `${path}?${query}` : path, label };
}

/** No layout: grava a visão de lista atual; outra tela (fora o detalhe) apaga a origem. */
export function RememberOrigin() {
  const pathname = usePathname();
  const params = useSearchParams().toString();
  useEffect(() => {
    try {
      if (ORIGINS.has(pathname))
        sessionStorage.setItem(KEY, params ? `${pathname}?${params}` : pathname);
      else if (!/^\/tarefas\/\d+$/.test(pathname)) sessionStorage.removeItem(KEY);
    } catch {} // sem storage (aba privada): o Voltar vai para Minhas Tarefas
  }, [pathname, params]);
  return null;
}

export function BackLink() {
  // no servidor não há sessionStorage: começa em Minhas Tarefas e corrige na hidratação
  const origin = readOrigin(useSyncExternalStore(noop, stored, () => null));
  return (
    <Link
      href={origin.href}
      aria-label={`Voltar para ${origin.label}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-sm px-1.5 text-sm text-muted hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-accent-light focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
      {origin.label}
    </Link>
  );
}
