import { describe, expect, it } from "vitest";
import { productionEnvProblems } from "./env-checks";

const good = {
  BETTER_AUTH_URL: "https://tasks.itcbr.xyz",
  BETTER_AUTH_SECRET: "Xq3v9LmP2rT8wZk1Yb7Nc4Hd6Jf0Gs5A",
  SMTP_USER: "tasks@itcbr.xyz",
  SMTP_PASSWORD: "x",
};

describe("productionEnvProblems (issue #26)", () => {
  it("aceita a configuração de produção", () => {
    expect(productionEnvProblems(good)).toEqual([]);
  });

  it("recusa segredo de CI, http e SMTP pela metade", () => {
    const ci = `ci-${"0".repeat(38)}`;
    const problems = productionEnvProblems({
      BETTER_AUTH_URL: "http://tasks.itcbr.xyz",
      BETTER_AUTH_SECRET: ci,
      SMTP_USER: "tasks@itcbr.xyz",
    });
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).not.toContain(ci);
  });

  it("build local e E2E do CI (localhost) ficam de fora", () => {
    expect(
      productionEnvProblems({
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "ci-0",
      }),
    ).toEqual([]);
  });
});
