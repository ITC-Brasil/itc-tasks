import { cn } from "@/lib/utils";

// Avatar do DS: iniciais sobre accent-dark (texto claro nos dois temas)
export function Avatar({
  initials,
  size = "md",
  className,
}: {
  initials: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full bg-accent-dark font-semibold text-on-accent-dark",
        size === "lg" ? "size-7 text-[11px]" : "size-[22px] text-[10px]",
        className,
      )}
    >
      {initials}
    </span>
  );
}
