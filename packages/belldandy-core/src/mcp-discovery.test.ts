import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MCPServerState } from "@belldandy/mcp";
import { buildMCPDiscoveryPromptSummary, MCP_DISCOVERY_INDEX_PATH, writeMCPDiscoveryWorkspaceDocs } from "./mcp-discovery.js";

const tempDirs: string[] = [];

function createServerState(): MCPServerState {
  return {
    id: "docs",
    status: "connected",
    tools: [
      {
        name: "search",
        bridgedName: "mcp_docs_search",
        description: "Search docs by keyword",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
        serverId: "docs",
      },
    ],
    resources: [
      {
        uri: "resource://docs/index",
        name: "docs-index",
        description: "Index resource",
        mimeType: "text/markdown",
        serverId: "docs",
      },
    ],
    metadata: {
      serverName: "Documentation Server",
      serverVersion: "1.0.0",
      protocolVersion: "2025-03-26",
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("mcp discovery workspace docs", () => {
  it("writes index, server docs, and tool docs into generated/mcp-docs", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-mcp-discovery-"));
    tempDirs.push(stateDir);

    const result = await writeMCPDiscoveryWorkspaceDocs({
      stateDir,
      serverStates: [createServerState()],
    });

    expect(result.docsIndexPath).toBe(MCP_DISCOVERY_INDEX_PATH);
    expect(result.serverCount).toBe(1);
    expect(result.toolCount).toBe(1);

    const indexContent = await fs.readFile(path.join(stateDir, "generated", "mcp-docs", "README.md"), "utf-8");
    const serverContent = await fs.readFile(path.join(stateDir, "generated", "mcp-docs", "docs", "README.md"), "utf-8");
    const toolContent = await fs.readFile(path.join(stateDir, "generated", "mcp-docs", "docs", "search.md"), "utf-8");

    expect(indexContent).toContain("MCP Discovery Index");
    expect(indexContent).toContain("tool_search");
    expect(serverContent).toContain("Documentation Server");
    expect(serverContent).toContain("mcp_docs_search");
    expect(toolContent).toContain("tool_search select");
    expect(toolContent).toContain("\"query\"");
  });

  it("builds a prompt summary that points to the generated docs index", () => {
    const summary = buildMCPDiscoveryPromptSummary({
      docsIndexPath: MCP_DISCOVERY_INDEX_PATH,
      serverStates: [createServerState()],
    });

    expect(summary).toContain("MCP Discovery");
    expect(summary).toContain(MCP_DISCOVERY_INDEX_PATH);
    expect(summary).toContain("docs (Documentation Server)");
  });
});
