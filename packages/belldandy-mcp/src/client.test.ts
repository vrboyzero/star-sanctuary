import { describe, expect, it } from "vitest";

import { expandFilesystemServerArgs, parseExtraWorkspaceRoots } from "./client.js";

describe("parseExtraWorkspaceRoots", () => {
  it("splits BELLDANDY_EXTRA_WORKSPACE_ROOTS and removes duplicates", () => {
    const roots = parseExtraWorkspaceRoots({
      BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary, E:/project/star-sanctuary , E:/project/docs",
    });

    expect(roots).toHaveLength(2);
    expect(roots[0].toLowerCase()).toContain("e:");
    expect(roots[0].replace(/\\/g, "/")).toContain("/project/star-sanctuary");
    expect(roots[1].replace(/\\/g, "/")).toContain("/project/docs");
  });
});

describe("expandFilesystemServerArgs", () => {
  it("uses env roots when filesystem MCP has no explicit roots", () => {
    const args = expandFilesystemServerArgs(
      "cmd",
      ["/c", "npx", "@modelcontextprotocol/server-filesystem"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary,E:/project/assets" },
    );

    expect(args).toEqual([
      "/c",
      "npx",
      "@modelcontextprotocol/server-filesystem",
      expect.stringMatching(/project[\\/]+star-sanctuary$/),
      expect.stringMatching(/project[\\/]+assets$/),
    ]);
  });

  it("appends BELLDANDY_EXTRA_WORKSPACE_ROOTS to filesystem MCP roots", () => {
    const args = expandFilesystemServerArgs(
      "cmd",
      ["/c", "npx", "@modelcontextprotocol/server-filesystem", "C:/Users/admin/.star_sanctuary"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary,E:/project/assets" },
    );

    expect(args).toEqual([
      "/c",
      "npx",
      "@modelcontextprotocol/server-filesystem",
      "C:/Users/admin/.star_sanctuary",
      expect.stringMatching(/project[\\/]+star-sanctuary$/),
      expect.stringMatching(/project[\\/]+assets$/),
    ]);
  });

  it("does not change non-filesystem MCP commands", () => {
    const args = expandFilesystemServerArgs(
      "npx",
      ["-y", "chrome-devtools-mcp@latest"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary" },
    );

    expect(args).toEqual(["-y", "chrome-devtools-mcp@latest"]);
  });

  it("does not append duplicated roots", () => {
    const args = expandFilesystemServerArgs(
      "npx",
      ["-y", "@modelcontextprotocol/server-filesystem", "E:/project/star-sanctuary"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary" },
    );

    expect(args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "E:/project/star-sanctuary"]);
  });
});
