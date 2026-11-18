import { describe, expect, it } from "vitest";
import { describeRule, latestOccurrence, nextOccurrence, occursOn } from "./recurrence";

const monthly = (monthDay: number, intervalMonths = 1, startDate = "2026-01-01") => ({
  frequency: "monthly",
  weekdays: null,
  monthDay,
  intervalMonths,
  startDate,
});

describe("recorrência (ADR-077)", () => {
  it("dias úteis pulam sábado e domingo", () => {
    const r = {
      frequency: "weekdays",
      weekdays: null,
      monthDay: null,
      intervalMonths: 1,
      startDate: "2026-01-01",
    };
    expect(occursOn(r, "2026-11-20")).toBe(true); // sexta
    expect(occursOn(r, "2026-11-21")).toBe(false); // sábado
    expect(latestOccurrence(r, "2026-11-22", "2026-01-01")).toBe("2026-11-20");
  });

  it("semanal nos dias marcados", () => {
    const r = {
      frequency: "weekly",
      weekdays: [1, 3],
      monthDay: null,
      intervalMonths: 1,
      startDate: "2026-01-01",
    };
    expect(occursOn(r, "2026-11-16")).toBe(true); // segunda
    expect(occursOn(r, "2026-11-17")).toBe(false);
    expect(nextOccurrence(r, "2026-11-17")).toBe("2026-11-18");
    expect(describeRule(r)).toBe("Semanal: seg, qua");
  });

  it("dia 31 em mês curto cai no último dia; fevereiro de ano bissexto", () => {
    expect(occursOn(monthly(31), "2026-04-30")).toBe(true);
    expect(occursOn(monthly(31), "2026-02-28")).toBe(true);
    expect(occursOn(monthly(30), "2028-02-29")).toBe(true);
    expect(occursOn(monthly(29), "2028-02-29")).toBe(true);
    expect(occursOn(monthly(29), "2027-02-28")).toBe(true);
    expect(occursOn(monthly(29), "2027-03-01")).toBe(false);
  });

  it("último dia do mês (0)", () => {
    expect(occursOn(monthly(0), "2026-11-30")).toBe(true);
    expect(occursOn(monthly(0), "2026-12-31")).toBe(true);
    expect(occursOn(monthly(0), "2026-12-30")).toBe(false);
    expect(describeRule(monthly(0))).toBe("Mensal, último dia");
  });

  it("a cada N meses conta a partir do mês de início e vira o ano", () => {
    const r = monthly(10, 3, "2026-11-01");
    expect(occursOn(r, "2026-11-10")).toBe(true);
    expect(occursOn(r, "2026-12-10")).toBe(false);
    expect(occursOn(r, "2027-02-10")).toBe(true);
    expect(nextOccurrence(r, "2026-11-11")).toBe("2027-02-10");
    expect(describeRule(r)).toBe("A cada 3 meses, dia 10");
  });

  it("nada antes do início nem antes do piso", () => {
    const r = monthly(5, 1, "2026-11-10");
    expect(occursOn(r, "2026-11-05")).toBe(false);
    expect(latestOccurrence(r, "2026-11-20", "2026-01-01")).toBe(null);
    expect(latestOccurrence(monthly(5), "2026-11-20", "2026-11-06")).toBe(null);
    // worker parado desde setembro: só a mais recente
    expect(latestOccurrence(monthly(5), "2026-11-20", "2026-09-01")).toBe("2026-11-05");
  });
});
