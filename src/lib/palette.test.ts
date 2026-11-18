import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PROJECT_COLORS } from "./validation/catalog";

// ADR-068 e ADR-075: todas as cores de projeto com o texto ≥ 5:1 sobre os dois fundos, nos dois temas
const css = readFileSync("src/styles/globals.css", "utf8");
const dark = css.indexOf('\n[data-theme="dark"] {');
const themes = {
  claro: css.slice(css.indexOf("\n:root,"), dark),
  escuro: css.slice(dark, css.indexOf("@theme inline")),
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

it("a paleta tem 12 cores", () => expect(PROJECT_COLORS).toHaveLength(12));

for (const [theme, block] of Object.entries(themes))
  for (const color of PROJECT_COLORS)
    it(`${color} no tema ${theme}: texto ≥ 5:1 sobre bg e unit-bg`, () => {
      const token = (part: string) =>
        // eslint-disable-next-line security/detect-non-literal-regexp -- chave da paleta fechada
        block.match(new RegExp(`--project-${color}-${part}: (#[0-9a-f]{6});`, "i"))?.[1];
      const [bg, unit, fg] = [token("bg"), token("unit-bg"), token("fg")];
      expect([bg, unit, fg].every(Boolean), `tokens de ${color}`).toBe(true);
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(5);
      expect(contrast(fg!, unit!)).toBeGreaterThanOrEqual(5);
    });
