"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useShortcut } from "@/components/layout/shortcuts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Módulo 18: busca das telas Minhas Tarefas e Equipe. Vai para `?q=` (filtro no servidor, a mesma
 * busca do ⌘K) depois de 300 ms; Esc limpa; `/` foca.
 * `collapsed` (M-171, Minhas Tarefas, onde a barra tem abas): vira botão de ícone e abre o campo ao
 * acionar ou com `/`; Esc ou sair do campo vazio fecha; com `?q=` fica aberto.
 */
export function SearchField({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("q") ?? "";
  const [value, setValue] = useState(fromUrl);
  // "Limpar filtros", filtro salvo ou voltar: a URL manda
  const [seen, setSeen] = useState(fromUrl);
  if (seen !== fromUrl) {
    setSeen(fromUrl);
    setValue(fromUrl);
  }
  const input = useRef<HTMLInputElement>(null);
  const [opened, setOpened] = useState(false);
  const open = !collapsed || opened || !!value || !!fromUrl;
  useShortcut("/", () => (open ? input.current?.focus() : setOpened(true)));

  useEffect(() => {
    if (value.trim() === fromUrl) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      next.delete("q");
      if (value.trim()) next.set("q", value.trim().slice(0, 100));
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, fromUrl, params, pathname, router]);

  if (!open)
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Buscar"
        aria-expanded={false}
        className="max-md:size-11"
        onClick={() => setOpened(true)}
      >
        <Search strokeWidth={1.75} aria-hidden="true" />
      </Button>
    );
  return (
    <div className="relative w-[280px] max-md:w-full">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <Input
        ref={input}
        type="search"
        aria-label="Buscar tarefas"
        placeholder="Buscar por título ou TI-123"
        maxLength={100}
        tone="page"
        className="pl-8"
        autoFocus={opened}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("");
            setOpened(false);
          }
        }}
        onBlur={(e) => {
          if (!e.currentTarget.value) setOpened(false);
        }}
      />
    </div>
  );
}
