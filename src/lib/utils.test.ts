import { expect, test } from "vitest";
import { cn } from "./utils";

test("cn merges conflicting tailwind classes", () => {
  expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4");
});

test("cn mantém a cor do texto junto com os tamanhos do @theme", () => {
  expect(cn("text-on-accent", "text-small")).toBe("text-on-accent text-small");
  expect(cn("text-small", "text-h3")).toBe("text-h3");
});
