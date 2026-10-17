import { expect, it } from "vitest";
import { dueBucket, monthGrid, relativeTime, shiftMonth, todayISO } from "./dates";

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
