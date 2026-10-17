import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ITC Tasks",
  description: "Gestor de tarefas do time de TI do Grupo ITC Brasil",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
