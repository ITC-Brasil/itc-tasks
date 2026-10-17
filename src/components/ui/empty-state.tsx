import type { LucideIcon } from "lucide-react";

// UI.md §3: ícone em accent-light, título, uma frase e um CTA
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-[14px] bg-accent-light text-accent-text">
        <Icon className="size-[22px]" aria-hidden="true" />
      </span>
      <h2 className="mt-1 text-h3 font-bold">{title}</h2>
      <p className="max-w-90 text-sm text-muted">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
