// Datas de prazo são `YYYY-MM-DD` (coluna date); "hoje" é o de Brasília, não o do servidor
export const todayISO = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

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
