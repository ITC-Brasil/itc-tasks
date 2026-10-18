import { expect, it } from "vitest";
import { describe as text, withinHours } from "./notifications";

const tz = "America/Sao_Paulo";
const at = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00-03:00`);

it("expediente [início, fim) no fuso da empresa", () => {
  expect(withinHours(at("07:59"), "08:00", "18:00", tz)).toBe(false);
  expect(withinHours(at("08:00"), "08:00", "18:00", tz)).toBe(true);
  expect(withinHours(at("17:59"), "08:00", "18:00", tz)).toBe(true);
  expect(withinHours(at("18:00"), "08:00", "18:00", tz)).toBe(false);
  // atravessa a meia-noite
  expect(withinHours(at("23:00"), "22:00", "06:00", tz)).toBe(true);
  expect(withinHours(at("12:00"), "22:00", "06:00", tz)).toBe(false);
});

it("linha do aviso", () => {
  expect(
    text({ event: "mentioned", actorLabel: "Ana", data: {} }, { number: 149, title: "Nobreak" }),
  ).toBe("Ana mencionou você em TI-149 Nobreak");
  expect(text({ event: "status_changed", actorLabel: "Lucas", data: { to: "Feito" } }, null)).toBe(
    "Lucas mudou para Feito",
  );
});
