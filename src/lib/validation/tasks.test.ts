import { describe, expect, it } from "vitest";
import { commentBodySchema } from "./tasks";

// ADR-061: documento Tiptap normalizado no servidor
const linkDoc = (attrs: object) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { class: "fixed inset-0 z-50", textAlign: "left" },
      content: [{ type: "text", text: "x", marks: [{ type: "link", attrs }, { type: "bold" }] }],
    },
  ],
});

describe("commentBodySchema", () => {
  it("guarda só o href da marca link e tira class/style dos attrs", () => {
    const out = commentBodySchema.parse(
      linkDoc({ href: "https://a.test", class: "fixed inset-0", target: "_self", rel: null }),
    ) as unknown as { content: [{ attrs: object; content: [{ marks: object[] }] }] };
    expect(out.content[0].attrs).toEqual({ textAlign: "left" });
    expect(out.content[0].content[0].marks).toEqual([
      { type: "link", attrs: { href: "https://a.test" } },
      { type: "bold" },
    ]);
  });

  it("recusa documento grande demais ou aninhado demais", () => {
    const big = { type: "doc", content: [{ type: "text", text: "a".repeat(200_001) }] };
    expect(commentBodySchema.safeParse(big).success).toBe(false);
    let deep: object = { type: "text", text: "x" };
    for (let i = 0; i < 25; i++) deep = { type: "paragraph", content: [deep] };
    expect(commentBodySchema.safeParse({ type: "doc", content: [deep] }).success).toBe(false);
  });

  it("documento comum passa igual", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "oi" }] }],
    };
    expect(commentBodySchema.parse(doc)).toEqual(doc);
  });
});
