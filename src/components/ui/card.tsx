import { cn } from "@/lib/utils";

const PADDING = { none: "", sm: "px-4 py-3", md: "p-4", lg: "p-5" } as const;

type CardProps<T extends React.ElementType> = {
  /** elemento renderizado (padrão `div`): `section`, `ul`, `li`, `pre`… */
  as?: T;
  padding?: keyof typeof PADDING;
} & Omit<React.ComponentPropsWithoutRef<T>, "as">;

/** Card do Design System: superfície `bg-surface`, `rounded-xl`, `shadow-1`. */
export function Card<T extends React.ElementType = "div">({
  as,
  padding = "none",
  className,
  ...props
}: CardProps<T>) {
  const Comp = as ?? "div";
  return (
    <Comp
      data-slot="card"
      className={cn("rounded-xl bg-surface shadow-1", PADDING[padding], className)}
      {...props}
    />
  );
}
