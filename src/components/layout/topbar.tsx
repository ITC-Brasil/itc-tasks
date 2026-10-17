// Topbar da página: título à esquerda, ações da tela à direita
export function Topbar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-topbar-height flex-wrap items-center gap-3 border-b bg-surface px-4 py-2 md:px-6">
      <h1 className="text-h3">{title}</h1>
      <span className="flex-1" />
      {children}
    </header>
  );
}
