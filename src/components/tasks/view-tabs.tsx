"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ViewTab = { label: string; href: string; active: boolean; about: string };

/**
 * Módulo 18, item 14: abas de Minhas Tarefas numa linha só, com rolagem horizontal no celular
 * (como as de Configurações, sem barra aparente e com fade na borda) e a aba ativa visível ao
 * carregar. A explicação de cada aba vem no tooltip (mouse e foco) e, no celular, no "i".
 */
export function ViewTabs({ tabs }: { tabs: ViewTab[] }) {
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, []);
  const current = tabs.find((t) => t.active);
  return (
    <div className="flex min-w-0 flex-1 items-end">
      <nav
        aria-label="Abas"
        className="flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] max-md:[mask-image:linear-gradient(to_right,black_85%,transparent)] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <Tooltip key={t.label}>
            <TooltipTrigger
              render={
                <Link
                  ref={t.active ? active : undefined}
                  href={t.href}
                  aria-current={t.active ? "page" : undefined}
                  aria-description={t.about}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm",
                    t.active
                      ? "border-accent font-medium text-accent-text"
                      : "border-transparent text-muted",
                  )}
                />
              }
            >
              {t.label}
            </TooltipTrigger>
            <TooltipContent side="bottom">{t.about}</TooltipContent>
          </Tooltip>
        ))}
      </nav>
      {current && (
        <Popover>
          <PopoverTrigger
            aria-label="Sobre esta aba"
            className="inline-flex size-11 flex-none items-center justify-center text-muted md:hidden"
          >
            <Info className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent aria-label={`Sobre a aba ${current.label}`} className="text-sm">
            {current.about}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
