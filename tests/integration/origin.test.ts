import { describe, expect, it } from "vitest";
import { POST as upload } from "@/app/api/attachments/route";
import { DELETE as unsubscribe, POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as testPush } from "@/app/api/push/test/route";
import { env } from "@/lib/env";

// Issue #24: rotas com cookie recusam outra origem antes de olhar a sessão
const req = (origin: string | null, type = "application/json", method = "POST") =>
  new Request(`${env.BETTER_AUTH_URL}/api/x`, {
    method,
    headers: { ...(origin ? { origin } : {}), "content-type": type, "content-length": "2" },
    body: "{}",
  });

describe("checagem de Origin", () => {
  it("recusa subdomínio irmão e requisição sem Origin (403)", async () => {
    for (const handler of [upload, subscribe, unsubscribe, testPush]) {
      expect((await handler(req("https://monitor.itcbr.xyz"))).status).toBe(403);
      expect((await handler(req(null))).status).toBe(403);
    }
  });

  it("recusa text/plain no push (415), sem preflight não passa", async () => {
    const own = new URL(env.BETTER_AUTH_URL).origin;
    expect((await subscribe(req(own, "text/plain"))).status).toBe(415);
    expect((await unsubscribe(req(own, "text/plain", "DELETE"))).status).toBe(415);
  });

  it("mesma origem passa da checagem e chega à sessão", async () => {
    const own = new URL(env.BETTER_AUTH_URL).origin;
    // fora do Next, a leitura da sessão (headers()) lança: prova que a checagem deixou passar
    for (const handler of [upload, subscribe, unsubscribe, testPush])
      await expect(handler(req(own))).rejects.toThrow(/outside a request scope/);
  });
});
