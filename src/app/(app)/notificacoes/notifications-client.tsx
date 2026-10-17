"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/server/actions/notifications";

/** Abrir o aviso marca como lido (sem esperar a resposta). */
export function NotificationLink({
  id,
  unread,
  href,
  children,
}: {
  id: string;
  unread: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        if (unread) void markNotificationsReadAction([id]);
      }}
      className={cn(
        "flex items-start gap-3.5 px-4 py-3.5 hover:bg-muted",
        unread && "bg-accent-light/40",
      )}
    >
      {children}
    </Link>
  );
}

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => markNotificationsReadAction())}
    >
      Marcar todas como lidas
    </Button>
  );
}
