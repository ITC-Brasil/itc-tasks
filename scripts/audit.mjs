// ADR-076: `npm audit --omit=dev` com o gate em high, menos os advisories da lista abaixo.
// Cada exceção tem motivo e sai quando o pacote corrigido for publicado.
import { execFileSync } from "node:child_process";

const IGNORED = new Map([
  // picomatch ≤ 4.0.7 (ReDoS); entra por better-auth → vitest, não roda no app; sem versão corrigida
  ["GHSA-fc5q-39xc-vjpf", "picomatch: remover quando sair a versão corrigida"],
]);
const FAIL = new Set(["high", "critical"]);

let out;
try {
  out = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
} catch (error) {
  out = error.stdout; // npm audit sai com 1 quando há qualquer achado
}
const { vulnerabilities = {} } = JSON.parse(out);

// os advisories de fato vêm nos `via` que são objetos; os de string só apontam para outro pacote
const advisories = new Map();
for (const v of Object.values(vulnerabilities))
  for (const via of v.via)
    if (typeof via === "object" && FAIL.has(via.severity)) advisories.set(via.url, via);

const ghsa = (url) => url.split("/").pop();
const blocking = [...advisories.values()].filter((a) => !IGNORED.has(ghsa(a.url)));
for (const a of advisories.values())
  if (IGNORED.has(ghsa(a.url)))
    console.log(`ignorado (ADR-076): ${a.name} ${ghsa(a.url)} — ${IGNORED.get(ghsa(a.url))}`);
for (const a of blocking) console.error(`${a.severity}: ${a.name} ${a.url} ${a.title}`);
if (blocking.length) process.exit(1);
console.log("npm audit: nenhum advisory high ou critical fora das exceções");
