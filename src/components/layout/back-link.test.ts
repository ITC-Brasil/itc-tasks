import { expect, it } from "vitest";
import { readOrigin } from "./back-link";

it("aceita só as listas conhecidas e refaz a busca", () => {
  expect(readOrigin("/tarefas?projeto=a&q=x")).toEqual({
    href: "/tarefas?projeto=a&q=x",
    label: "Equipe",
  });
  expect(readOrigin("/?aba=minhas")).toEqual({ href: "/?aba=minhas", label: "Minhas Tarefas" });
  for (const bad of [null, "//evil.com", "https://evil.com/", "/config/membros", "/tarefas/12"])
    expect(readOrigin(bad)).toEqual({ href: "/", label: "Minhas Tarefas" });
});
