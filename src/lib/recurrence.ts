import { addDays } from "./dates";

// ADR-077: datas da recorrência, em `YYYY-MM-DD` de Brasília (o job usa o todayISO)
export const RECURRENCE_FREQUENCIES = ["weekdays", "weekly", "monthly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export type RecurrenceRule = {
  frequency: RecurrenceFrequency | string;
  weekdays: number[] | null;
  monthDay: number | null; // 0 = último dia
  intervalMonths: number;
  startDate: string;
};

// ponytail: varre dia a dia; 400 dias cobrem "a cada 12 meses" com folga
const HORIZON = 400;

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A regra cria uma tarefa nesta data? */
export function occursOn(rule: RecurrenceRule, iso: string) {
  if (iso < rule.startDate) return false;
  const dow = weekday(iso);
  switch (rule.frequency) {
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      return (rule.weekdays ?? []).includes(dow);
    case "monthly": {
      const [y, m, d] = iso.split("-").map(Number);
      const [sy, sm] = rule.startDate.split("-").map(Number);
      if (((y - sy) * 12 + (m - sm)) % Math.max(1, rule.intervalMonths) !== 0) return false;
      const last = lastDay(y, m);
      const day = rule.monthDay ?? 0;
      return d === (day === 0 ? last : Math.min(day, last)); // dia 31 em mês de 30 = último dia
    }
    default:
      return false;
  }
}

/** Ocorrência mais recente ≤ `today` e ≥ `floor` (worker parado: só a última pendente). */
export function latestOccurrence(rule: RecurrenceRule, today: string, floor: string) {
  const min = [floor, rule.startDate, addDays(today, -HORIZON)].sort().at(-1)!;
  for (let d = today; d >= min; d = addDays(d, -1)) if (occursOn(rule, d)) return d;
  return null;
}

/** Próxima ocorrência a partir de `from` (inclusive), para a tela. */
export function nextOccurrence(rule: RecurrenceRule, from: string) {
  const start = from < rule.startDate ? rule.startDate : from;
  for (let i = 0, d = start; i <= HORIZON; i++, d = addDays(d, 1)) if (occursOn(rule, d)) return d;
  return null;
}

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "Dias úteis", "Semanal: seg, qua", "Mensal, dia 5", "A cada 3 meses, último dia". */
export function describeRule(rule: RecurrenceRule) {
  if (rule.frequency === "weekdays") return "Dias úteis";
  if (rule.frequency === "weekly")
    return `Semanal: ${[...(rule.weekdays ?? [])]
      .sort()
      .map((d) => WEEKDAY_SHORT.at(d))
      .join(", ")}`;
  const day = rule.monthDay ? `dia ${rule.monthDay}` : "último dia";
  return rule.intervalMonths > 1 ? `A cada ${rule.intervalMonths} meses, ${day}` : `Mensal, ${day}`;
}
