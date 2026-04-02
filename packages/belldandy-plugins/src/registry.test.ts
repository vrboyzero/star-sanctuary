import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PluginRegistry } from "./registry.js";

describe("PluginRegistry", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  it("records load errors and continues scanning remaining plugin files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-plugin-registry-"));
    tempDirs.push(dir);

    await fs.writeFile(path.join(dir, "broken-plugin.mjs"), "export default {};\n", "utf-8");
    await fs.writeFile(
      path.join(dir, "good-plugin.mjs"),
      [
        "export default {",
        "  id: 'good-plugin',",
        "  name: 'Good Plugin',",
        "  async activate(context) {",
        "    context.registerTool({",
        "      definition: {",
        "        name: 'good_tool',",
        "        description: 'good',",
        "        parameters: { type: 'object', properties: {} },",
        "      },",
        "      async execute() {",
        "        return { id: '', name: 'good_tool', success: true, output: 'ok' };",
        "      },",
        "    });",
        "  },",
        "};",
        "",
      ].join("\n"),
      "utf-8",
    );

    const registry = new PluginRegistry();
    await registry.loadPluginDirectory(dir);

    expect(registry.getPluginIds()).toEqual(["good-plugin"]);
    expect(registry.listPlugins()).toEqual([
      expect.objectContaining({
        id: "good-plugin",
        name: "Good Plugin",
        toolNames: ["good_tool"],
      }),
    ]);
    expect(registry.getDiagnostics()).toEqual(expect.objectContaining({
      pluginCount: 1,
      toolCount: 1,
      loadErrors: [
        expect.objectContaining({
          phase: "load_plugin",
          target: expect.stringContaining("broken-plugin.mjs"),
        }),
      ],
    }));
  });
});
