"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Bloco de código da ajuda: rola dentro da caixa e copia com toast (ADR-065). */
export function CodeBlock({ code, label }: { code: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }
  return (
    <Card className="relative min-w-0">
      <Button
        variant="secondary"
        size="sm"
        onClick={copy}
        aria-label={`Copiar ${label}`}
        className="absolute top-2 right-2"
      >
        <Copy strokeWidth={1.75} aria-hidden="true" />
        Copiar
      </Button>
      {/* tabIndex: a caixa rola no teclado (axe scrollable-region-focusable) */}
      <pre tabIndex={0} aria-label={label} className="overflow-x-auto p-4 pr-28 text-tech">
        <code>{code}</code>
      </pre>
    </Card>
  );
}
