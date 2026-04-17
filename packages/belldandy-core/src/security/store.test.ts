import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readPairingStore, writePairingStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.promises.rm(dir, { recursive: true, force: true })));
});

describe("security store", () => {
  it("falls back to direct write when rename reports ENOENT", async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-security-store-"));
    tempDirs.push(stateDir);

    const renameSpy = vi.spyOn(fs.promises, "rename").mockRejectedValue(Object.assign(new Error("missing temp file"), {
      code: "ENOENT",
    }));

    await writePairingStore(stateDir, {
      version: 1,
      pending: [
        {
          clientId: "client-1",
          code: "ABC23456",
          createdAt: "2026-04-17T00:00:00.000Z",
        },
      ],
    });

    expect(renameSpy).toHaveBeenCalled();
    await expect(readPairingStore(stateDir)).resolves.toMatchObject({
      pending: [
        expect.objectContaining({
          clientId: "client-1",
          code: "ABC23456",
        }),
      ],
    });
  });
});
