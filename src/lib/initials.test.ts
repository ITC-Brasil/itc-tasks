import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("usa primeira e última palavra", () => expect(initialsOf("Matheus de Lima")).toBe("ML"));
  it("nome único usa duas letras", () => expect(initialsOf(" ana ")).toBe("AN"));
});
