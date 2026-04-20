import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { readRecentJsonlRecords } from "./jsonl-tail-reader.js";

test("readRecentJsonlRecords reads only the latest valid records in reverse order", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-jsonl-tail-"));
  const filePath = path.join(workspace, "audit.jsonl");

  try {
    const lines = [
      JSON.stringify({ id: 1, text: "first" }),
      "{invalid json",
      JSON.stringify({ id: 2, text: "第二条" }),
      "",
      JSON.stringify({ id: 3, text: "third" }),
      JSON.stringify({ id: 4, text: "第四条，包含中文和 emoji 🚀" }),
    ];
    await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

    const items = await readRecentJsonlRecords<{ id: number; text: string }>({
      filePath,
      limit: 3,
      maxChunkBytes: 32,
    });

    expect(items).toEqual([
      { id: 4, text: "第四条，包含中文和 emoji 🚀" },
      { id: 3, text: "third" },
      { id: 2, text: "第二条" },
    ]);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("readRecentJsonlRecords returns an empty list for missing files", async () => {
  const items = await readRecentJsonlRecords({
    filePath: path.join(os.tmpdir(), `missing-${Date.now()}.jsonl`),
    limit: 5,
  });
  expect(items).toEqual([]);
});
