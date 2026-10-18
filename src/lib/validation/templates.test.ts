import { expect, it } from "vitest";
import { formatTaskOutline, parseTaskOutline } from "./templates";

it("texto do template de projeto: linha = tarefa, '-' = subtarefa da tarefa de cima", () => {
  const text = "- solta, ignorada\nLevantar rede\n- switch\n  -  cabos \n\nInstalar UM\n";
  const tasks = parseTaskOutline(text);
  expect(tasks).toEqual([
    { title: "Levantar rede", checklist: ["switch", "cabos"] },
    { title: "Instalar UM", checklist: [] },
  ]);
  expect(parseTaskOutline(formatTaskOutline(tasks))).toEqual(tasks);
});
