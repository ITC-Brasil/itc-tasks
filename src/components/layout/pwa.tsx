"use client";

import { Share, WifiOff, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// ADR-054: service worker, estado da conexão e convite para instalar

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Apaga as telas guardadas pelo service worker (ao sair: o HTML tem dados da pessoa). */
export async function clearPageCache() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith("pages-")).map((k) => caches.delete(k)));
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-small"
    >
      <WifiOff className="size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
      Sem conexão — mostrando a última versão salva. Ações de escrita voltam com a rede.
    </div>
  );
}

const DISMISSED = "itc:install-dismissed";

type InstallEvent = Event & { prompt: () => Promise<void> };

// convite só no celular, fora do app instalado e se não dispensado antes
function eligible() {
  try {
    if (localStorage.getItem(DISMISSED) === "1") return false;
  } catch {}
  return (
    window.matchMedia("(max-width: 767px)").matches &&
    !window.matchMedia("(display-mode: standalone)").matches
  );
}
const noSubscribe = () => () => {};

export function Pwa() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // iOS não tem beforeinstallprompt: só a instrução
  const ios = useSyncExternalStore(
    noSubscribe,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent) && eligible(),
    () => false,
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!eligible()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = dismissed ? null : ios ? "ios" : prompt;
  if (!install) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <aside
      aria-label="Instalar o app"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-xl border bg-surface p-3 shadow-2 md:hidden"
    >
      <p className="flex-1 text-small">
        {install === "ios" ? (
          <>
            Instale o ITC Tasks: toque em{" "}
            <Share className="inline size-4" aria-label="Compartilhar" /> e depois em Adicionar à
            Tela de Início.
          </>
        ) : (
          "Instale o ITC Tasks na tela inicial para abrir mais rápido e receber push."
        )}
      </p>
      {install !== "ios" && (
        <Button
          size="sm"
          onClick={async () => {
            await install.prompt();
            setDismissed(true);
          }}
        >
          Instalar
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Agora não">
        <X aria-hidden="true" />
      </Button>
    </aside>
  );
}
