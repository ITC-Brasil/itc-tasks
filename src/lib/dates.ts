// Datas de prazo são `YYYY-MM-DD` (coluna date); "hoje" é o de Brasília, não o do servidor
export const todayISO = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Prazo de template (ADR-052): dias úteis, pulando sábado e domingo; sem feriados. */
export function addBusinessDays(iso: string, days: number) {
  let d = iso;
  for (let left = days; left > 0;) {
    d = addDays(d, 1);
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left--;
  }
  return d;
}

/** "14:30" agora em Brasília (ADR-072). */
export const nowHM = (now = new Date()) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

/**
 * ADR-072: sem hora vence no fim do dia (atrasada a partir de amanhã); com hora, a partir dela.
 * Não olha o status: quem chama descarta as concluídas.
 */
export function isOverdue(date: string | null, time: string | null, now = new Date()) {
  if (!date) return false;
  const today = todayISO(now);
  return date < today || (date === today && !!time && time <= nowHM(now));
}

/**
 * Módulo 18: "atrasada" para a borda do card e o contador da navegação. Concluída e Aguardando
 * (esperando terceiro) não contam. A versão SQL é a `lateSql` do service de tarefas.
 */
export const isLate = (
  t: { category: string; dueDate: string | null; dueTime: string | null },
  now = new Date(),
) => t.category !== "done" && t.category !== "waiting" && isOverdue(t.dueDate, t.dueTime, now);

/** Chave de ordenação por prazo: data, depois hora; sem hora = fim do dia; sem prazo por último. */
export const dueKey = (date: string | null, time?: string | null) =>
  date ? `${date}T${time ?? "99:99"}` : "9999";

export type DueBucket = "overdue" | "today" | "week" | "later";

/** PRD V1: vencidas, hoje, esta semana (até domingo), depois (inclui sem prazo). */
export function dueBucket(due: string | null, today: string): DueBucket {
  if (!due) return "later";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return due <= addDays(today, (7 - weekday) % 7) ? "week" : "later";
}

/** "17 out" — data curta em pt-BR. */
export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
    .replace(".", "");

/** Grade do mês (semanas de domingo a sábado) com os dias de fora do mês. */
export function monthGrid(month: string /* YYYY-MM */) {
  const first = `${month}-01`;
  const start = addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
  const days: string[] = [];
  for (let d = start; days.length < 42; d = addDays(d, 1)) days.push(d);
  // ponytail: sempre 6 semanas; corta a última se ficar toda fora do mês
  return days.slice(0, days[35].startsWith(month) ? 42 : 35);
}

export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
/** Histórico relativo (UI.md §8): "agora", "há 5 min", "há 2 h", "ontem"; depois de 7 dias, a data. */
export function relativeTime(date: Date, now = new Date()) {
  const s = Math.round((date.getTime() - now.getTime()) / 1000);
  if (s > -60) return "agora";
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  if (s > -7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return date.toLocaleDateString("pt-BR");
}
