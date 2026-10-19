// Issue #26: em produção pública, recusa configuração fraca na subida (app e worker).
// O build de produção local e o E2E do CI (BETTER_AUTH_URL em localhost) ficam de fora.

type EnvSubset = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
};

const WEAK_SECRET = /^(ci-|changeme|change-me|test|secret|example|placeholder)/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Lista os problemas, sem nunca citar o valor do segredo. */
export function productionEnvProblems(e: EnvSubset): string[] {
  const url = new URL(e.BETTER_AUTH_URL);
  if (LOCAL_HOSTS.has(url.hostname)) return [];
  const problems: string[] = [];
  if (url.protocol !== "https:") problems.push("BETTER_AUTH_URL precisa ser https://");
  if (WEAK_SECRET.test(e.BETTER_AUTH_SECRET) || new Set(e.BETTER_AUTH_SECRET).size < 10)
    problems.push("BETTER_AUTH_SECRET parece valor de exemplo ou de CI (gere com openssl rand)");
  if (Boolean(e.SMTP_USER) !== Boolean(e.SMTP_PASSWORD))
    problems.push("SMTP_USER e SMTP_PASSWORD vão juntos");
  return problems;
}
