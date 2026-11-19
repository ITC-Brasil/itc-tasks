"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // Módulo 18: tokens do Design System (os --popover do shadcn não existem: fundo transparente)
      style={
        {
          "--normal-bg": "var(--bg-surface)",
          "--normal-text": "var(--text-base)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)", // o mesmo dos menus (Módulo 18, item 17)
        } as React.CSSProperties
      }
      // um toast por vez: o novo substitui o anterior (e encerra o Desfazer dele)
      visibleToasts={1}
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-2",
          actionButton: "!bg-accent-solid !text-on-accent",
          cancelButton: "!border !bg-surface !text-base",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
