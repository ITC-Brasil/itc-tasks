import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

/** `tone="page"`: campo sobre o fundo da página (barra das visões), em vez da superfície. */
function Input({
  className,
  type,
  tone = "surface",
  ...props
}: React.ComponentProps<"input"> & { tone?: "surface" | "page" }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control-md w-full min-w-0 rounded-control border border-input px-3 py-1 text-[16px] shadow-1 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        tone === "page" ? "bg-base" : "bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
