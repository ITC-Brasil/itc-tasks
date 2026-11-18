import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main className="p-4 md:p-6">
      <EmptyState
        icon={SearchX}
        title="Página não encontrada"
        action={
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Ir para o Início
          </Link>
        }
      >
        O endereço não existe ou foi movido.
      </EmptyState>
    </main>
  );
}
