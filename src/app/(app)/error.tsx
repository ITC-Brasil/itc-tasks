"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// UI.md §3: card no lugar do conteúdo com a causa e "Recarregar"
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="p-4 md:p-6">
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border bg-surface p-5 shadow-1"
      >
        <h1 className="text-h3">Não foi possível carregar esta tela</h1>
        <p className="text-sm text-muted">
          O servidor não respondeu como esperado. Verifique a conexão e tente de novo.
        </p>
        <Button variant="secondary" onClick={reset}>
          <RotateCw aria-hidden="true" /> Recarregar
        </Button>
      </div>
    </main>
  );
}
