import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "ITC Tasks",
  description: "Gestor de tarefas do time de TI do Grupo ITC Brasil",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${archivo.variable}`}>
      <body>
        {/* ADR-013 e ADR-038: só claro e escuro; o script do next-themes aplica antes da pintura */}
        <ThemeProvider
          attribute="data-theme"
          themes={["light", "dark"]}
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
