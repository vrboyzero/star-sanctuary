import fs from "node:fs/promises";
import path from "node:path";
import type { MCPServerState, MCPToolInfo } from "@belldandy/mcp";

const MCP_DISCOVERY_DIR_SEGMENTS = ["generated", "mcp-docs"] as const;
export const MCP_DISCOVERY_DIR = MCP_DISCOVERY_DIR_SEGMENTS.join("/");
export const MCP_DISCOVERY_INDEX_PATH = `${MCP_DISCOVERY_DIR}/README.md`;

export type MCPPromptDiscoveryState = {
  generatedAt: string;
  docsIndexPath: string;
  serverCount: number;
  toolCount: number;
  resourceCount: number;
  promptSummary?: string;
};

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "unknown";
}

function countToolProperties(tool: MCPToolInfo): number {
  const raw = tool.inputSchema;
  if (!raw || typeof raw !== "object") return 0;
  const properties = (raw as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return 0;
  return Object.keys(properties as Record<string, unknown>).length;
}

function listToolProperties(tool: MCPToolInfo): string[] {
  const raw = tool.inputSchema;
  if (!raw || typeof raw !== "object") return [];
  const properties = (raw as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.keys(properties as Record<string, unknown>).slice(0, 12);
}

function summarizeTool(tool: MCPToolInfo): string {
  const firstLine = String(tool.description ?? "").split(/\r?\n/)[0]?.trim();
  return firstLine || `MCP tool ${tool.name}`;
}

function buildRootReadme(input: {
  generatedAt: string;
  serverStates: MCPServerState[];
}): string {
  const lines: string[] = [
    "# MCP Discovery Index",
    "",
    `Generated At: ${input.generatedAt}`,
    "",
    "This directory contains full MCP tool docs generated for on-demand discovery.",
    "",
    "Recommended usage path:",
    "1. Use `tool_search` to discover a likely MCP tool by domain words or server id.",
    `2. Use \`file_read\` to inspect this index or a server/tool doc under \`${MCP_DISCOVERY_DIR}/...\`.`,
    "3. After confirming the right tool, use `tool_search select=[...]` to load the exact schema for the next turn.",
    "",
    "## Servers",
    "",
  ];

  if (input.serverStates.length === 0) {
    lines.push("- No connected MCP servers.");
    return lines.join("\n");
  }

  for (const server of input.serverStates) {
    const serverDir = `${MCP_DISCOVERY_DIR}/${sanitizeSegment(server.id)}`;
    const serverDocPath = `${serverDir}/README.md`;
    lines.push(
      `- \`${server.id}\`${server.metadata?.serverName ? ` (${server.metadata.serverName})` : ""}`
      + ` | status=${server.status}`
      + ` | tools=${server.tools.length}`
      + ` | resources=${server.resources.length}`
      + ` | doc=${serverDocPath}`,
    );
  }

  return lines.join("\n");
}

function buildServerReadme(input: {
  generatedAt: string;
  server: MCPServerState;
}): string {
  const { server } = input;
  const serverDir = `${MCP_DISCOVERY_DIR}/${sanitizeSegment(server.id)}`;
  const lines: string[] = [
    `# MCP Server: ${server.id}`,
    "",
    `Generated At: ${input.generatedAt}`,
    `Status: ${server.status}`,
    `Server Name: ${server.metadata?.serverName ?? "(unknown)"}`,
    `Server Version: ${server.metadata?.serverVersion ?? "(unknown)"}`,
    `Protocol Version: ${server.metadata?.protocolVersion ?? "(unknown)"}`,
    `Tool Count: ${server.tools.length}`,
    `Resource Count: ${server.resources.length}`,
    "",
    "## Tools",
    "",
  ];

  if (server.tools.length === 0) {
    lines.push("- No tools exposed by this server.");
  } else {
    for (const tool of server.tools) {
      const toolDocPath = `${serverDir}/${sanitizeSegment(tool.name)}.md`;
      lines.push(
        `- \`${tool.bridgedName}\``
        + ` | original=${tool.name}`
        + ` | params=${countToolProperties(tool)}`
        + ` | doc=${toolDocPath}`,
      );
      lines.push(`  - ${summarizeTool(tool)}`);
    }
  }

  lines.push("", "## Resources", "");
  if (server.resources.length === 0) {
    lines.push("- No resources exposed by this server.");
  } else {
    for (const resource of server.resources.slice(0, 20)) {
      lines.push(
        `- \`${resource.name}\``
        + ` | uri=${resource.uri}`
        + `${resource.mimeType ? ` | mime=${resource.mimeType}` : ""}`
        + `${resource.description ? ` | ${resource.description}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

function buildToolReadme(input: {
  generatedAt: string;
  server: MCPServerState;
  tool: MCPToolInfo;
}): string {
  const { server, tool } = input;
  const properties = listToolProperties(tool);
  const lines: string[] = [
    `# MCP Tool: ${tool.bridgedName}`,
    "",
    `Generated At: ${input.generatedAt}`,
    `Server ID: ${server.id}`,
    `Server Name: ${server.metadata?.serverName ?? "(unknown)"}`,
    `Original Tool Name: ${tool.name}`,
    `Bridged Tool Name: ${tool.bridgedName}`,
    `Property Count: ${countToolProperties(tool)}`,
    "",
    "## Summary",
    "",
    summarizeTool(tool),
    "",
    "## Suggested Discovery Flow",
    "",
    "1. Read this doc to confirm the tool is the right match.",
    `2. If needed, open \`${MCP_DISCOVERY_DIR}/${sanitizeSegment(server.id)}/README.md\` for sibling tools on the same server.`,
    `3. Load the exact schema with \`tool_search select=[\"${tool.bridgedName}\"]\` in the next turn before calling it.`,
    "",
    "## Top-level Parameters",
    "",
  ];

  if (properties.length === 0) {
    lines.push("- No top-level parameters declared.");
  } else {
    for (const property of properties) {
      lines.push(`- \`${property}\``);
    }
  }

  lines.push(
    "",
    "## Full Input Schema",
    "",
    "```json",
    JSON.stringify(tool.inputSchema, null, 2),
    "```",
  );

  return lines.join("\n");
}

export async function writeMCPDiscoveryWorkspaceDocs(input: {
  stateDir: string;
  serverStates: MCPServerState[];
}): Promise<MCPPromptDiscoveryState> {
  const generatedAt = new Date().toISOString();
  const docsDir = path.join(input.stateDir, ...MCP_DISCOVERY_DIR_SEGMENTS);
  await fs.mkdir(docsDir, { recursive: true });

  const writes: Array<Promise<void>> = [];
  writes.push(
    fs.writeFile(
      path.join(docsDir, "README.md"),
      buildRootReadme({ generatedAt, serverStates: input.serverStates }),
      "utf-8",
    ),
  );

  for (const server of input.serverStates) {
    const serverDir = path.join(docsDir, sanitizeSegment(server.id));
    await fs.mkdir(serverDir, { recursive: true });
    writes.push(
      fs.writeFile(
        path.join(serverDir, "README.md"),
        buildServerReadme({ generatedAt, server }),
        "utf-8",
      ),
    );

    for (const tool of server.tools) {
      writes.push(
        fs.writeFile(
          path.join(serverDir, `${sanitizeSegment(tool.name)}.md`),
          buildToolReadme({ generatedAt, server, tool }),
          "utf-8",
        ),
      );
    }
  }

  await Promise.all(writes);

  return {
    generatedAt,
    docsIndexPath: MCP_DISCOVERY_INDEX_PATH,
    serverCount: input.serverStates.length,
    toolCount: input.serverStates.reduce((sum, server) => sum + server.tools.length, 0),
    resourceCount: input.serverStates.reduce((sum, server) => sum + server.resources.length, 0),
    promptSummary: buildMCPDiscoveryPromptSummary({
      docsIndexPath: MCP_DISCOVERY_INDEX_PATH,
      serverStates: input.serverStates,
    }),
  };
}

export function buildMCPDiscoveryPromptSummary(input: {
  docsIndexPath: string;
  serverStates: MCPServerState[];
}): string | undefined {
  if (input.serverStates.length === 0) {
    return undefined;
  }

  const totalTools = input.serverStates.reduce((sum, server) => sum + server.tools.length, 0);
  const totalResources = input.serverStates.reduce((sum, server) => sum + server.resources.length, 0);
  const lines: string[] = [
    "## MCP Discovery",
    "",
    `You currently have ${input.serverStates.length} MCP server(s), ${totalTools} MCP tool(s), and ${totalResources} resource(s) available.`,
    "MCP tools are exposed through progressive discovery instead of full first-turn schema injection.",
    "",
    "Recommended workflow:",
    "1. Use `tool_search` with domain words, tool intent, or server id to discover likely MCP tools.",
    `2. Use \`file_read\` to inspect full docs under \`${input.docsIndexPath}\` before loading a tool schema.`,
    "3. Use `tool_search select=[...]` to load only the exact MCP schema you want to call in the next turn.",
    "4. Avoid bulk-loading many MCP tools unless the task truly requires them.",
    "",
    "Available MCP servers:",
  ];

  for (const server of input.serverStates.slice(0, 12)) {
    const serverDocPath = `${MCP_DISCOVERY_DIR}/${sanitizeSegment(server.id)}/README.md`;
    lines.push(
      `- ${server.id}${server.metadata?.serverName ? ` (${server.metadata.serverName})` : ""}`
      + ` | status=${server.status}`
      + ` | tools=${server.tools.length}`
      + ` | resources=${server.resources.length}`
      + ` | doc=${serverDocPath}`,
    );
  }

  return lines.join("\n").trim();
}
