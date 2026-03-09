import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractOwnerUuid } from "./identity.js";

describe("extractOwnerUuid", () => {
  it("returns owner uuid from IDENTITY.md", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-identity-test-"));
    try {
      await fs.writeFile(path.join(dir, "IDENTITY.md"), "# IDENTITY\n\n- **主人UUID**：a10001\n", "utf-8");
      await expect(extractOwnerUuid(dir)).resolves.toBe("a10001");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when IDENTITY.md is missing or owner uuid is absent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-identity-test-"));
    try {
      await expect(extractOwnerUuid(dir)).resolves.toBeUndefined();

      await fs.writeFile(path.join(dir, "IDENTITY.md"), "# IDENTITY\n\n- **名字：** 贝露丹蒂\n", "utf-8");
      await expect(extractOwnerUuid(dir)).resolves.toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
