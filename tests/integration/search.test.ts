import { expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { createMobileUnit, createProject } from "@/server/services/catalog";
import { completeTask, createTask, prefixQuery, searchTasks } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = Date.now();
const tag = String(run).slice(-6);

it("busca por título sem acento, prefixo, TI-, #GLPI e código de UM", async () => {
  const project = await createProject(system, {
    code: `S${tag}`,
    name: `Busca ${run}`,
    kind: "client",
  });
  const unit = await createMobileUnit(system, { code: `ZZ${tag}`, projectId: project.id });
  const word = `Roteadorx${tag}`;
  const a = await createTask(system, {
    title: `Trocar ${word} da recepção`,
    projectIds: [project.id],
    glpiTicket: Number(tag),
  });
  const b = await createTask(system, {
    title: "Sem relação",
    projectIds: [project.id],
    mobileUnitIds: [unit.id],
  });
  const done = await createTask(system, { title: `${word} antigo`, projectIds: [project.id] });
  await completeTask(system, done.id);

  const ids = async (q: string) => (await searchTasks(system, q)).map((t) => t.id);
  expect(await ids(word.slice(0, 7).toLowerCase())).toEqual(expect.arrayContaining([a.id]));
  expect(await ids(`${word} recepcao`)).toEqual([a.id]);
  expect((await ids(word)).slice(0, 2)).toEqual([a.id, done.id]); // abertas antes
  expect(await ids(`TI-${a.number}`)).toContain(a.id);
  expect(await ids(String(b.number))).toContain(b.id);
  expect(await ids(`#${tag}`)).toEqual([a.id]);
  expect(await ids(`UM-zz${tag}`)).toEqual([b.id]);
  expect(await ids("   ")).toEqual([]);
  expect(await ids("%_")).not.toContain(b.id);
  expect(await ids("!")).toEqual([]);
});

it("prefixQuery só deixa letras e dígitos", () => {
  expect(prefixQuery("rede & (wi-fi)!")).toBe("rede:* & wi:* & fi:*");
  expect(prefixQuery("!!")).toBe("");
});
