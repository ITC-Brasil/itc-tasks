import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/server/mcp";
import { agentFromKey } from "@/server/services/agents";

// ADR-049: Streamable HTTP sem sessão; um servidor por requisição
export const dynamic = "force-dynamic";

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

  const server = createMcpServer(agent.actor, agent.access);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

const notAllowed = () => json(405, "Use POST", { Allow: "POST" });
export { notAllowed as GET, notAllowed as DELETE };
