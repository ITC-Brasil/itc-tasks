import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/server/mcp";
import { agentFromKey } from "@/server/services/agents";

// ADR-049: Streamable HTTP sem sessão; um servidor por requisição

// o mesmo teto do SDK (requestBody.js), que deixa de valer com parsedBody
const MAX_BODY = 4 * 1024 * 1024;

const json = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error: message }, { status, headers });

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key) return json(401, "Token ausente");
  const agent = await agentFromKey(key);
  if ("status" in agent)
    return agent.status === 429
      ? json(429, "Limite de 60 requisições por minuto", { "Retry-After": "60" })
      : json(401, "Token inválido, expirado ou revogado");

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY)
    return json(413, "Corpo acima de 4 MB");
  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, "Corpo acima de 4 MB");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, "JSON inválido");
  }
  // lote JSON-RPC contaria como 1 no limite de 60/min (ADR-009, issue #25)
  if (Array.isArray(body)) return json(400, "Envie uma mensagem JSON-RPC por requisição");

  const server = createMcpServer(agent.actor, agent.access);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody: body });
  } finally {
    await server.close();
  }
}

const notAllowed = () => json(405, "Use POST", { Allow: "POST" });
export { notAllowed as GET, notAllowed as DELETE };
