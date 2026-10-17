import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LIST_LIMIT } from "@/server/services/tasks";

/** UI.md §3: filtro sem resultado. */
export function NoResults({ href }: { href: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Nenhuma tarefa com esses filtros"
      action={
        <Link href={href} className={buttonVariants({ variant: "outline" })}>
          Limpar filtros
        </Link>
      }
    >
      Mude ou limpe os filtros para ver mais tarefas.
    </EmptyState>
  );
}

/** ADR-047: as concluídas bateram no limite da consulta. */
export function LimitNotice({ truncated }: { truncated: boolean }) {
  if (!truncated) return null;
  return (
    <p role="status" className="mx-4 mt-3 rounded-md border bg-surface px-3 py-2 text-sm md:mx-6">
      Mostrando as primeiras {LIST_LIMIT.toLocaleString("pt-BR")} tarefas concluídas; refine os
      filtros para ver as demais.
    </p>
  );
}
