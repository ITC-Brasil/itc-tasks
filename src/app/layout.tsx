import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "ITC Tasks",
  description: "Gestor de tarefas do time de TI do Grupo ITC Brasil",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-theme="light" className={`${inter.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
