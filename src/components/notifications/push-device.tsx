"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

const toKey = (base64: string) => {
  const raw = atob(
    (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return navigator.serviceWorker.register("/sw.js");
}

async function detect(publicKey: string | null): Promise<State> {
  if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window))
    return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

/** Push neste dispositivo (ADR-050): ativar, enviar teste, desativar. */
export function PushDevice({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    detect(publicKey).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await registration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKey(publicKey!),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent.slice(0, 300) }),
      });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      toast.error("Não foi possível ativar o push neste dispositivo");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const { sent } = (await res.json()) as { sent: number };
    if (sent) toast.success("Teste enviado");
    else toast.error("Nenhum dispositivo recebeu o teste");
  }

  const status = {
    loading: "Verificando…",
    unsupported: "Este navegador não recebe push.",
    denied: "Notificações bloqueadas no navegador. Libere nas permissões do site.",
    off: "Desativado neste dispositivo.",
    on: "Ativo neste dispositivo.",
  }[state];

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2.5 text-sm" role="status">
        <span
          aria-hidden="true"
          className={state === "on" ? "size-2 rounded-full bg-ok" : "size-2 rounded-full bg-border"}
        />
        {status}
      </p>
      <div className="flex flex-wrap gap-2">
        {state === "off" && (
          <Button size="sm" disabled={busy} onClick={enable}>
            Ativar push
          </Button>
        )}
        {state === "on" && (
          <>
            <Button variant="secondary" size="sm" onClick={test}>
              Enviar teste
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={disable}>
              Desativar
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted">
        No iPhone, instale o ITC Tasks na tela inicial (Compartilhar › Adicionar à Tela de Início)
        para receber push.
      </p>
    </div>
  );
}
