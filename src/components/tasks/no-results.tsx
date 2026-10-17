import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
