import { BellOff, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Topbar } from "@/components/layout/topbar";
import { TextChip } from "@/components/tasks/badges";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { addDays, relativeTime, todayISO } from "@/lib/dates";
import { EVENT_LABELS, type NotificationData, verb } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/actor";
import { type InboxTab, listNotifications } from "@/server/services/notifications";
import { MarkAllRead, NotificationLink } from "./notifications-client";

export const metadata: Metadata = { title: "Notificações · ITC Tasks" };

const TABS: { aba: string; tab: InboxTab; label: string }[] = [
  { aba: "", tab: "unread", label: "Não lidas" },
  { aba: "todas", tab: "all", label: "Todas" },
  { aba: "mencoes", tab: "mentions", label: "Menções" },
];

async function Inbox({ searchParams }: PageProps<"/notificacoes">) {
  const { actor } = await requireUser();
  const aba = String((await searchParams).aba ?? "");
  const current = TABS.find((t) => t.aba === aba) ?? TABS[0];
  const items = await listNotifications(actor, current.tab);
  const today = todayISO();
  const groups = Map.groupBy(items, (n) => {
    const day = todayISO(n.createdAt);
    return day === today ? "Hoje" : day === addDays(today, -1) ? "Ontem" : "Antes";
  });
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-5 p-4 md:p-6">
      <nav aria-label="Abas" className="flex gap-1 border-b">
        {TABS.map((t) => {
          const active = t === current;
          return (
            <Link
              key={t.label}
              href={t.aba ? `/notificacoes?aba=${t.aba}` : "/notificacoes"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                active
                  ? "border-accent font-medium text-accent-text"
                  : "border-transparent text-muted",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Tudo em dia"
          action={
            <Link href="/config/preferencias" className="text-sm text-accent-text underline">
              Preferências
            </Link>
          }
        >
          Avisos de atribuições, menções e prazos aparecem aqui.
        </EmptyState>
      ) : (
        [...groups].map(([label, list]) => (
          <section key={label} aria-labelledby={`g-${label}`} className="flex flex-col gap-2.5">
            <h2 id={`g-${label}`} className="text-caption text-muted uppercase">
              {label}
            </h2>
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-1">
              {list.map((n) => {
                const data = n.data as NotificationData;
                return (
                  <li key={n.id}>
                    <NotificationLink
                      id={n.id}
                      unread={!n.readAt}
                      href={n.number === null ? "/notificacoes" : `/tarefas/${n.number}`}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-2 size-2 flex-none rounded-full",
                          !n.readAt && "bg-accent",
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-sm leading-relaxed">
                          {!n.readAt && <span className="sr-only">Não lida: </span>}
                          <b className="font-semibold">{n.actorLabel}</b> {verb(n.event, data)}{" "}
                          {n.number !== null && (
                            <>
                              <span className="text-muted tabular-nums">TI-{n.number}</span>{" "}
                              <span className="font-medium">{n.title}</span>
                            </>
                          )}
                        </span>
                        {data.quote && (
                          <span className="border-l-2 border-border pl-2.5 text-[13px] text-muted">
                            {data.quote}
                          </span>
                        )}
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <TextChip>{EVENT_LABELS[n.event].chip}</TextChip>
                          <span className="tabular-nums">{relativeTime(n.createdAt)}</span>
                        </span>
                      </span>
                    </NotificationLink>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

export default function NotificationsPage(props: PageProps<"/notificacoes">) {
  return (
    <>
      <Topbar title="Notificações">
        <MarkAllRead />
        <Link
          href="/config/preferencias"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Preferências
        </Link>
      </Topbar>
      <Suspense>
        <Inbox {...props} />
      </Suspense>
    </>
  );
}
