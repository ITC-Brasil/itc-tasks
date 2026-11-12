import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { taskEvents } from "@/db/schema";
import { ForbiddenError, type Actor } from "@/server/actor";
import { createProject } from "@/server/services/catalog";
import { addComment, editComment, listComments, mentionIds } from "@/server/services/comments";
import { createMember, setMemberActive } from "@/server/services/members";
import { createTask, listTasks } from "@/server/services/tasks";

const system: Actor = { kind: "system" };
const run = Date.now();
let ana: Actor & { kind: "user" };
let bia: Actor & { kind: "user" };
let projectId: string;

const person = async (name: string) => {
  const u = await createMember(system, {
    name,
    email: `${name.toLowerCase()}-${run}@t.test`,
    password: "senha-de-teste-123",
    role: "member",
  });
  return { kind: "user" as const, userId: u.id, role: "member" as const };
};
const doc = (...content: object[]) => ({
  type: "doc",
  content: [{ type: "paragraph", content }],
});
const text = (t: string) => ({ type: "text", text: t });
const mention = (id: string, label: string) => ({ type: "mention", attrs: { id, label } });

beforeAll(async () => {
  ana = await person("Ana");
  bia = await person("Bia");
  const code = `C${String(run).slice(-6)}`;
  projectId = (await createProject(system, { code, name: `Comentários ${run}`, kind: "client" }))
    .id;
});

it("comenta com menção, grava evento e aparece na aba Menções", async () => {
  const task = await createTask(ana, { title: "Com comentário", projectIds: [projectId] });
  const c = await addComment(ana, task.id, doc(text("Olha isso "), mention(bia.userId, "Bia")));
  expect(c.bodyText).toBe("Olha isso @Bia");
  expect(c.mentions).toEqual([bia.userId]);

  const [ev] = await db
    .select()
    .from(taskEvents)
    .where(and(eq(taskEvents.type, "commented"), eq(taskEvents.taskId, task.id)));
  expect(ev.payload).toEqual({ commentId: c.id });
  expect(ev.actorUserId).toBe(ana.userId);

  const mine = await listTasks(bia, {}, { mentionedUserId: bia.userId, openOnly: true });
  expect(mine.tasks.map((t) => t.id)).toContain(task.id);
  const notMine = await listTasks(ana, {}, { mentionedUserId: ana.userId, openOnly: true });
  expect(notMine.tasks.map((t) => t.id)).not.toContain(task.id);
});

it("menção a pessoa desativada ou inexistente não conta", async () => {
  const off = await person("Ex");
  await setMemberActive(system, off.userId, false);
  const task = await createTask(ana, { title: "Menções inválidas", projectIds: [projectId] });
  const c = await addComment(
    ana,
    task.id,
    doc(mention(off.userId, "Ex"), mention("nao-existe", "X"), mention(bia.userId, "Bia")),
  );
  expect(c.mentions).toEqual([bia.userId]);
});

it("comentário vazio é recusado", async () => {
  const task = await createTask(ana, { title: "Vazio", projectIds: [projectId] });
  await expect(addComment(ana, task.id, doc())).rejects.toThrow("Escreva o comentário");
  await expect(addComment(ana, task.id, { type: "x" })).rejects.toThrow();
});

it("só o autor edita; edição marca editedAt e grava evento", async () => {
  const task = await createTask(ana, { title: "Edição", projectIds: [projectId] });
  const c = await addComment(ana, task.id, doc(text("primeiro")));
  await expect(editComment(bia, c.id, doc(text("intruso")))).rejects.toThrow(ForbiddenError);
  const edited = await editComment(ana, c.id, doc(text("corrigido")));
  expect(edited.bodyText).toBe("corrigido");
  expect(edited.editedAt).not.toBeNull();
  const [row] = await listComments({ kind: "system" }, task.id);
  expect(row.authorName).toBe("Ana");
  const types = (
    await db
      .select({ type: taskEvents.type })
      .from(taskEvents)
      .where(eq(taskEvents.taskId, task.id))
  ).map((e) => e.type);
  expect(types).toEqual(expect.arrayContaining(["created", "commented", "comment_edited"]));
});

it("mentionIds percorre o documento", () => {
  expect(
    mentionIds(doc(mention("a", "A"), text("x"), mention("a", "A"), mention("b", "B"))),
  ).toEqual(["a", "b"]);
});

it("ADR-061: label da menção vem do banco, no comentário e na descrição", async () => {
  const task = await createTask(ana, { title: "Rótulo", projectIds: [projectId] });
  const c = await addComment(ana, task.id, doc(mention(bia.userId, "Diretoria")));
  expect(JSON.stringify(c.bodyJson)).toContain('"label":"Bia"');
  expect(c.bodyText).toBe("@Bia");
  const t = await createTask(ana, {
    title: "Rótulo 2",
    projectIds: [projectId],
    descriptionJson: doc(mention(bia.userId, "Diretoria")),
  });
  expect(t.descriptionText).toBe("@Bia");
});
