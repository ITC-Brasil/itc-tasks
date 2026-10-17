import { Skeleton } from "@/components/ui/skeleton";

// UI.md §3: skeleton na forma do conteúdo, nunca spinner de página
export default function Loading() {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col">
      <div className="flex min-h-topbar-height items-center border-b bg-surface px-4 md:px-6">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-col gap-3 p-4 md:p-6">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-row-height w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
