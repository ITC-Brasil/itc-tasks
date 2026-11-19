import { expect, it } from "vitest";
import {
  addBusinessDays,
  dueBucket,
  dueKey,
  isOverdue,
  monthGrid,
  nowHM,
  relativeTime,
  shiftMonth,
  todayISO,
} from "./dates";

it("agrupa prazos de Minhas tarefas", () => {
  const today = "2026-10-14"; // quarta
  expect(dueBucket("2026-10-13", today)).toBe("overdue");
  expect(dueBucket("2026-10-14", today)).toBe("today");
  expect(dueBucket("2026-10-18", today)).toBe("week"); // domingo
  expect(dueBucket("2026-10-19", today)).toBe("later");
  expect(dueBucket(null, today)).toBe("later");
  expect(dueBucket("2026-10-19", "2026-10-18")).toBe("later"); // domingo: semana acaba hoje
});

it("hoje é o de Brasília", () => {
  expect(todayISO(new Date("2026-10-15T02:00:00Z"))).toBe("2026-10-14");
});

it("monta a grade do mês de domingo a sábado", () => {
  const oct = monthGrid("2026-10");
  expect(oct[0]).toBe("2026-09-27");
  expect(oct).toHaveLength(35);
  expect(monthGrid("2026-08")).toHaveLength(42);
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
});

it("formata o histórico relativo em pt-BR", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  expect(relativeTime(new Date("2026-10-17T11:59:30Z"), now)).toBe("agora");
  expect(relativeTime(new Date("2026-10-17T11:55:00Z"), now)).toBe("há 5 minutos");
  expect(relativeTime(new Date("2026-10-17T10:00:00Z"), now)).toBe("há 2 horas");
  expect(relativeTime(new Date("2026-10-16T12:00:00Z"), now)).toBe("ontem");
  expect(relativeTime(new Date("2026-10-01T12:00:00Z"), now)).toBe("01/10/2026");
});

it("addBusinessDays pula sábado e domingo", () => {
  expect(addBusinessDays("2026-10-16", 1)).toBe("2026-10-19"); // sexta → segunda
  expect(addBusinessDays("2026-10-17", 5)).toBe("2026-10-23"); // sábado → sexta seguinte
  expect(addBusinessDays("2026-10-14", 0)).toBe("2026-10-14");
});

it("ADR-072: atraso com hora, no fuso de Brasília e na virada do dia", () => {
  // 17/11 14:30 em Brasília = 17:30 UTC
  const now = new Date("2026-11-17T17:30:00Z");
  expect(nowHM(now)).toBe("14:30");
  expect(isOverdue("2026-11-17", null, now)).toBe(false); // sem hora: fim do dia
  expect(isOverdue("2026-11-17", "14:30", now)).toBe(true); // a partir do horário
  expect(isOverdue("2026-11-17", "14:31", now)).toBe(false);
  expect(isOverdue("2026-11-16", "23:59", now)).toBe(true);
  expect(isOverdue(null, null, now)).toBe(false);
  // 02:30 UTC de 18/11 ainda é 17/11 23:30 em Brasília
  const late = new Date("2026-11-18T02:30:00Z");
  expect(todayISO(late)).toBe("2026-11-17");
  expect(isOverdue("2026-11-17", null, late)).toBe(false);
  expect(isOverdue("2026-11-17", "23:00", late)).toBe(true);
  expect(isOverdue("2026-11-18", "00:10", late)).toBe(false);
  // virou o dia em Brasília (03:00 UTC = 00:00)
  expect(isOverdue("2026-11-17", null, new Date("2026-11-18T03:00:00Z"))).toBe(true);
});

it("ADR-072: ordem por prazo leva a hora; sem hora no fim do dia; sem prazo por último", () => {
  const keys = [
    dueKey(null),
    dueKey("2026-11-17", null),
    dueKey("2026-11-17", "09:00"),
    dueKey("2026-11-16", "18:00"),
  ].sort();
  expect(keys).toEqual(["2026-11-16T18:00", "2026-11-17T09:00", "2026-11-17T99:99", "9999"]);
});

it("isLate: vencida fora de done e waiting", async () => {
  const { isLate } = await import("./dates");
  const now = new Date("2026-11-18T15:00:00Z"); // 12:00 em Brasília
  const t = (category: string, dueDate: string | null, dueTime: string | null = null) => ({
    category,
    dueDate,
    dueTime,
  });
  expect(isLate(t("todo", "2026-11-17"), now)).toBe(true);
  expect(isLate(t("todo", "2026-11-18"), now)).toBe(false);
  expect(isLate(t("todo", "2026-11-18", "11:00"), now)).toBe(true);
  expect(isLate(t("waiting", "2026-11-01"), now)).toBe(false);
  expect(isLate(t("done", "2026-11-01"), now)).toBe(false);
  expect(isLate(t("todo", null), now)).toBe(false);
});
