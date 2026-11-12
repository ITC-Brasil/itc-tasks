import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import "@/styles/globals.css";

// fontes no repositório (subconjunto latin, variáveis): o build não depende de fonts.gstatic.com
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--font-inter",
});
const archivo = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "600 800",
  variable: "--font-archivo",
});

const SPLASH = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [375, 667, 2],
  [320, 568, 2],
  [1024, 1366, 2],
  [834, 1194, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [810, 1080, 2],
  [744, 1133, 2],
  [768, 1024, 2],
] as const;

export const metadata: Metadata = {
  title: "ITC Tasks",
  description: "Gestor de tarefas do time de TI do Grupo ITC Brasil",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ITC Tasks",
    statusBarStyle: "default",
    // splash iOS do pacote de marca (docs/brand/head.html): [largura, altura, densidade] em pontos
    startupImage: SPLASH.flatMap(([w, h, dpr]) =>
      (["light", "dark"] as const).map((scheme) => ({
        url: `/splash/splash-${scheme === "light" ? "claro" : "escuro"}-${w * dpr}x${h * dpr}.png`,
        media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
      })),
    ),
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F0E8" },
    { media: "(prefers-color-scheme: dark)", color: "#141918" },
  ],
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
