import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { listActivity } from "@/server/services/activity";
import {
  addAttachment,
  cleanFileName,
  declaredSizeStatus,
  getAttachment,
  listAttachments,
} from "@/server/services/attachments";
import { createProject } from "@/server/services/catalog";
import { createMember } from "@/server/services/members";
import { createTask } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = Date.now();

async function setup() {
  const u = await createMember(system, {
    name: "Duda",
    email: `duda-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  const duda: Actor = { kind: "user", userId: u.id, role: "member" };
  const code = `A${String(run).slice(-6)}`;
  const project = await createProject(system, { code, name: `Anexos ${run}`, kind: "client" });
  const task = await createTask(duda, { title: "Com anexo", projectIds: [project.id] });
  return { duda, task };
}

it("grava o arquivo no volume, a linha e o evento; tipo vem da extensão", async () => {
  const { duda, task } = await setup();
  const file = new File(["log do roteador"], "../../etc/roteador.LOG", { type: "text/html" });
  const row = await addAttachment(duda, task.id, file);
  expect(row.fileName).toBe("roteador.LOG");
  expect(row.mimeType).toBe("text/plain");
  const stored = await getAttachment({ kind: "system" }, row.id);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- caminho do próprio service
  expect(await readFile(stored!.path, "utf8")).toBe("log do roteador");
  expect((await listAttachments({ kind: "system" }, task.id)).map((a) => a.fileName)).toEqual([
    "roteador.LOG",
  ]);
  expect((await listActivity({ kind: "system" }, task.id)).map((a) => a.text)).toContain(
    "anexou roteador.LOG",
  );

  await expect(addAttachment(duda, task.id, new File(["x"], "script.exe"))).rejects.toMatchObject({
    code: "UNSUPPORTED_TYPE",
  });
  await expect(addAttachment(duda, task.id, new File(["x"], "semextensao"))).rejects.toMatchObject({
    code: "UNSUPPORTED_TYPE",
  });
  const huge = { name: "grande.zip", size: 25 * 1024 * 1024 + 1 } as File;
  await expect(addAttachment(duda, task.id, huge)).rejects.toMatchObject({ code: "TOO_LARGE" });
  await expect(addAttachment(duda, crypto.randomUUID(), new File(["x"], "a.txt"))).rejects.toThrow(
    "Tarefa não encontrada",
  );
  expect(await listAttachments({ kind: "system" }, task.id)).toHaveLength(1);
});

it("id inválido ou inexistente → null", async () => {
  expect(await getAttachment({ kind: "system" }, "nao-uuid")).toBeNull();
  expect(await getAttachment({ kind: "system" }, crypto.randomUUID())).toBeNull();
});

it("cleanFileName tira caminho e controle", () => {
  expect(cleanFileName(String.raw`C:\Users\x\print.png`)).toBe("print.png");
  expect(cleanFileName('a\u0000b"c.txt')).toBe("abc.txt");
  expect(cleanFileName("   ")).toBe("arquivo");
});

it("envio sem Content-Length válido é recusado antes de ler o corpo (411); acima de 25 MB, 413", () => {
  expect(declaredSizeStatus(null)).toBe(411);
  expect(declaredSizeStatus("")).toBe(411);
  expect(declaredSizeStatus("abc")).toBe(411);
  expect(declaredSizeStatus("-1")).toBe(411);
  expect(declaredSizeStatus(String(26 * 1024 * 1024))).toBe(413);
  expect(declaredSizeStatus("1024")).toBeNull();
});
