import { sessionActor } from "@/server/actor";
import { subscribe } from "@/server/realtime";

// API.md §3 / ADR-020: SSE com ping a cada 25 s por causa do túnel
const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const actor = await sessionActor();
  if (!actor) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          cleanup(); // aba fechou entre o evento e o envio
        }
      };
      controller.enqueue(encoder.encode("retry: 5000\n\n"));
      const unsubscribe = await subscribe((e) => {
        if (e.event !== "notification.created") return send(e.event, e.data);
        // ADR-050: aviso só para a aba da própria pessoa, sem o userId
        const { userId, ...rest } = JSON.parse(e.data) as { userId: string };
        if (userId === actor.userId) send(e.event, JSON.stringify(rest));
      });
      const ping = setInterval(() => send("ping", "{}"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel: () => cleanup(),
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
