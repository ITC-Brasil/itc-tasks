import { Client } from "pg";
import { env } from "@/lib/env";

// ADR-048: um LISTEN por processo, repassado a todas as abas conectadas em /api/events
export type RealtimeEvent = { event: "task.changed" | "notification.created"; data: string };
type Listener = (e: RealtimeEvent) => void;

const CHANNELS = new Map<string, RealtimeEvent["event"]>([
  ["task_changed", "task.changed"],
  ["notification_created", "notification.created"], // ADR-050
]);
const RETRY_MS = 5000;

// globalThis: o HMR do dev recarrega o módulo sem fechar a conexão antiga
const hub = ((globalThis as { __realtime?: Hub }).__realtime ??= {
  listeners: new Set(),
  client: null,
});
type Hub = { listeners: Set<Listener>; client: Promise<Client> | null };

function connect() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  const reset = () => {
    if (hub.client !== ready) return;
    hub.client = null;
    client.end().catch(() => {});
    // reconecta só se ainda houver aba ouvindo
    setTimeout(() => hub.listeners.size && ensure(), RETRY_MS);
  };
  client.on("notification", (msg) => {
    const event = CHANNELS.get(msg.channel);
    if (!event || !msg.payload) return;
    for (const l of hub.listeners) l({ event, data: msg.payload });
  });
  client.on("error", reset);
  client.on("end", reset);
  const ready = (async () => {
    await client.connect();
    for (const channel of CHANNELS.keys()) await client.query(`LISTEN ${channel}`);
    return client;
  })();
  ready.catch(reset);
  return ready;
}

function ensure() {
  hub.client ??= connect();
  return hub.client;
}

/** Assina os eventos; devolve a função que cancela. Resolve quando o LISTEN está ativo. */
export async function subscribe(listener: Listener) {
  hub.listeners.add(listener);
  await ensure().catch(() => {}); // sem banco agora: tenta de novo em RETRY_MS
  return () => {
    hub.listeners.delete(listener);
  };
}
