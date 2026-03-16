/**
 * MCP 客户端封装
 * 
 * 对 @modelcontextprotocol/sdk 的 Client 进行封装，
 * 提供连接管理、工具发现和调用等功能。
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import path from "node:path";

import {
  type MCPServerConfig,
  type MCPServerState,
  type MCPServerStatus,
  type MCPToolInfo,
  type MCPResourceInfo,
  type MCPToolCallResult,
  type MCPResourceReadResult,
  type MCPEvent,
  type MCPEventListener,
  isStdioTransport,
  isSSETransport,
} from "./types.js";
import { mcpLog, mcpWarn, mcpError } from "./logger-adapter.js";

const FILESYSTEM_SERVER_PACKAGE = "@modelcontextprotocol/server-filesystem";
const EXTRA_WORKSPACE_ROOTS_ENV_KEY = "BELLDANDY_EXTRA_WORKSPACE_ROOTS";

function normalizeComparablePath(input: string): string {
  const resolved = path.resolve(input);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function parseExtraWorkspaceRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[EXTRA_WORKSPACE_ROOTS_ENV_KEY]?.trim();
  if (!raw) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const resolved = path.resolve(trimmed);
    const comparable = normalizeComparablePath(resolved);
    if (seen.has(comparable)) continue;
    seen.add(comparable);
    result.push(resolved);
  }
  return result;
}

export function expandFilesystemServerArgs(
  command: string,
  args: string[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
  const currentArgs = [...(args ?? [])];
  const extraRoots = parseExtraWorkspaceRoots(env);
  if (!extraRoots.length) return currentArgs;

  const packageIndex = currentArgs.lastIndexOf(FILESYSTEM_SERVER_PACKAGE);
  const commandLooksFilesystem = command.includes("server-filesystem");
  if (packageIndex < 0 && !commandLooksFilesystem) {
    return currentArgs;
  }

  const rootsStartIndex = packageIndex >= 0 ? packageIndex + 1 : 0;
  const prefix = currentArgs.slice(0, rootsStartIndex);
  const existingRoots = currentArgs.slice(rootsStartIndex);
  const seen = new Set(existingRoots.map((entry) => normalizeComparablePath(entry)));
  const appendedRoots: string[] = [];

  for (const root of extraRoots) {
    const comparable = normalizeComparablePath(root);
    if (seen.has(comparable)) continue;
    seen.add(comparable);
    appendedRoots.push(root);
  }

  if (!appendedRoots.length) return currentArgs;
  return [...prefix, ...existingRoots, ...appendedRoots];
}

// ============================================================================
// MCP 客户端类
// ============================================================================

/**
 * MCP 客户端
 * 
 * 封装单个 MCP 服务器的连接和交互。
 */
export class MCPClient {
  /** 服务器配置 */
  private config: MCPServerConfig;
  
  /** MCP SDK 客户端实例 */
  private client: Client | null = null;
  
  /** 传输层实例 */
  private transport: Transport | null = null;
  
  /** 子进程实例（仅 stdio 传输） */
  private childProcess: ChildProcess | null = null;
  
  /** 当前状态 */
  private status: MCPServerStatus = "disconnected";
  
  /** 错误信息 */
  private error: string | undefined;
  
  /** 连接时间 */
  private connectedAt: Date | undefined;
  
  /** 缓存的工具列表 */
  private tools: MCPToolInfo[] = [];
  
  /** 缓存的资源列表 */
  private resources: MCPResourceInfo[] = [];
  
  /** 服务器元数据 */
  private metadata: MCPServerState["metadata"];
  
  /** 事件监听器 */
  private eventListeners: Set<MCPEventListener> = new Set();
  
  /** 重连计数器 */
  private reconnectCount = 0;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  // ==========================================================================
  // 公共方法
  // ==========================================================================

  /**
   * 获取服务器 ID
   */
  get serverId(): string {
    return this.config.id;
  }

  /**
   * 获取服务器名称
   */
  get serverName(): string {
    return this.config.name;
  }

  /**
   * 获取当前状态
   */
  getState(): MCPServerState {
    return {
      id: this.config.id,
      status: this.status,
      error: this.error,
      connectedAt: this.connectedAt,
      tools: [...this.tools],
      resources: [...this.resources],
      metadata: this.metadata,
    };
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "connecting") {
      mcpLog(`mcp:${this.config.id}`, "已连接或正在连接中，跳过");
      return;
    }

    this.setStatus("connecting");
    this.error = undefined;

    try {
      // 创建传输层
      this.transport = await this.createTransport();

      // 创建客户端
      this.client = new Client(
        {
          name: "belldandy",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // 连接到服务器
      await this.client.connect(this.transport);

      // 获取服务器信息
      const serverInfo = this.client.getServerVersion();
      this.metadata = {
        serverName: serverInfo?.name,
        serverVersion: serverInfo?.version,
        protocolVersion: undefined, // SDK 不再提供此字段
      };

      // 发现工具和资源
      await this.discoverCapabilities();

      // 更新状态
      this.connectedAt = new Date();
      this.reconnectCount = 0;
      this.setStatus("connected");

      mcpLog(`mcp:${this.config.id}`, `已连接到服务器 ${this.metadata.serverName || "unknown"}`);
      mcpLog(`mcp:${this.config.id}`, `发现 ${this.tools.length} 个工具, ${this.resources.length} 个资源`);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.setStatus("error");
      mcpError(`mcp:${this.config.id}`, `连接失败: ${this.error}`);
      
      // 清理资源
      await this.cleanup();
      
      throw err;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.status === "disconnected") {
      return;
    }

    mcpLog(`mcp:${this.config.id}`, "正在断开连接...");

    await this.cleanup();
    this.setStatus("disconnected");

    mcpLog(`mcp:${this.config.id}`, "已断开连接");
  }

  /**
   * 重新连接
   */
  async reconnect(): Promise<void> {
    if (this.reconnectCount >= (this.config.retryCount ?? 3)) {
      mcpError(`mcp:${this.config.id}`, "已达到最大重试次数");
      this.setStatus("error");
      this.error = "重连失败：已达到最大重试次数";
      return;
    }

    this.reconnectCount++;
    this.setStatus("reconnecting");
    
    mcpLog(`mcp:${this.config.id}`, `正在重连 (${this.reconnectCount}/${this.config.retryCount ?? 3})...`);

    // 等待重试间隔
    const delay = this.config.retryDelay ?? 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.cleanup();
      await this.connect();
    } catch {
      // 连接失败，递归重试
      await this.reconnect();
    }
  }

  /**
   * 调用工具
   * 
   * @param toolName 工具名称（原始名称，非桥接名称）
   * @param args 工具参数
   * @returns 工具调用结果
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    if (!this.client || this.status !== "connected") {
      return {
        success: false,
        error: "MCP 服务器未连接",
        isError: true,
      };
    }

    try {
      mcpLog(`mcp:${this.config.id}`, `调用工具: ${toolName}`);
      
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      // 转换结果格式
      const contentArray = Array.isArray(result.content) ? result.content : [];
      const content = contentArray.map((item: { type: string; text?: string; data?: string; mimeType?: string; resource?: { uri?: string; text?: string; mimeType?: string } }) => {
        if (item.type === "text") {
          return { type: "text" as const, text: item.text };
        } else if (item.type === "image") {
          return {
            type: "image" as const,
            data: item.data,
            mimeType: item.mimeType,
          };
        } else if (item.type === "resource") {
          return {
            type: "resource" as const,
            uri: item.resource?.uri,
            text: item.resource?.text,
            mimeType: item.resource?.mimeType,
          };
        }
        return { type: "text" as const, text: JSON.stringify(item) };
      });

      return {
        success: !result.isError,
        content,
        isError: Boolean(result.isError),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      mcpError(`mcp:${this.config.id}`, `工具调用失败: ${errorMessage}`);
      
      return {
        success: false,
        error: errorMessage,
        isError: true,
      };
    }
  }

  /**
   * 读取资源
   * 
   * @param uri 资源 URI
   * @returns 资源内容
   */
  async readResource(uri: string): Promise<MCPResourceReadResult> {
    if (!this.client || this.status !== "connected") {
      throw new Error("MCP 服务器未连接");
    }

    mcpLog(`mcp:${this.config.id}`, `读取资源: ${uri}`);
    
    const result = await this.client.readResource({ uri });
    
    return {
      contents: result.contents.map((content) => ({
        uri: content.uri,
        mimeType: content.mimeType,
        text: "text" in content ? content.text : undefined,
        blob: "blob" in content ? content.blob : undefined,
      })),
    };
  }

  /**
   * 刷新工具和资源列表
   */
  async refresh(): Promise<void> {
    if (this.status !== "connected") {
      throw new Error("MCP 服务器未连接");
    }

    await this.discoverCapabilities();
    
    this.emitEvent("tools:updated", { tools: this.tools });
    this.emitEvent("resources:updated", { resources: this.resources });
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: MCPEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: MCPEventListener): void {
    this.eventListeners.delete(listener);
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 创建传输层
   */
  private async createTransport(): Promise<Transport> {
    const transport = this.config.transport;

    if (isStdioTransport(transport)) {
      return this.createStdioTransport(transport);
    } else if (isSSETransport(transport)) {
      return this.createSSETransport(transport);
    } else {
      throw new Error(`不支持的传输类型`);
    }
  }

  /**
   * 创建 stdio 传输层
   */
  private createStdioTransport(
    config: MCPServerConfig["transport"] & { type: "stdio" }
  ): Transport {
    const expandedArgs = expandFilesystemServerArgs(config.command, config.args, process.env);
    if ((expandedArgs?.length ?? 0) !== (config.args?.length ?? 0)) {
      mcpLog(
        `mcp:${this.config.id}`,
        `filesystem roots expanded from ${EXTRA_WORKSPACE_ROOTS_ENV_KEY}: ${(expandedArgs || []).join(" ")}`
      );
    }
    mcpLog(`mcp:${this.config.id}`, `创建 stdio 传输: ${config.command} ${(expandedArgs || []).join(" ")}`);

    // 使用 cross-spawn 创建子进程，支持跨平台
    const transport = new StdioClientTransport({
      command: config.command,
      args: expandedArgs,
      env: config.env,
      cwd: config.cwd,
      stderr: "inherit",
    });

    return transport;
  }

  /**
   * 创建 SSE 传输层
   */
  private createSSETransport(
    config: MCPServerConfig["transport"] & { type: "sse" }
  ): Transport {
    mcpLog(`mcp:${this.config.id}`, `创建 SSE 传输: ${config.url}`);

    const transport = new SSEClientTransport(
      new URL(config.url),
      {
        requestInit: config.headers
          ? { headers: config.headers }
          : undefined,
      }
    );

    return transport;
  }

  /**
   * 发现服务器能力（工具和资源）
   */
  private async discoverCapabilities(): Promise<void> {
    if (!this.client) return;

    // 发现工具
    try {
      const toolsResult = await this.client.listTools();
      this.tools = (toolsResult.tools || []).map((tool) => ({
        name: tool.name,
        bridgedName: this.getBridgedToolName(tool.name),
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverId: this.config.id,
      }));
    } catch (err) {
      mcpWarn(`mcp:${this.config.id}`, "无法列出工具", err);
      this.tools = [];
    }

    // 发现资源
    try {
      const resourcesResult = await this.client.listResources();
      this.resources = (resourcesResult.resources || []).map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId: this.config.id,
      }));
    } catch (err) {
      mcpWarn(`mcp:${this.config.id}`, "无法列出资源", err);
      this.resources = [];
    }
  }

  /**
   * 获取桥接后的工具名称
   * 
   * 格式: mcp_{serverId}_{toolName}
   */
  private getBridgedToolName(toolName: string): string {
    // 将工具名转换为安全的标识符
    const safeName = toolName.replace(/[^a-zA-Z0-9_]/g, "_");
    const safeServerId = this.config.id.replace(/[^a-zA-Z0-9_]/g, "_");
    return `mcp_${safeServerId}_${safeName}`;
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    // 关闭客户端连接
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        mcpWarn(`mcp:${this.config.id}`, "关闭客户端时出错", err);
      }
      this.client = null;
    }

    // 关闭传输层
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (err) {
        mcpWarn(`mcp:${this.config.id}`, "关闭传输时出错", err);
      }
      this.transport = null;
    }

    // 终止子进程
    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch (err) {
        mcpWarn(`mcp:${this.config.id}`, "终止子进程时出错", err);
      }
      this.childProcess = null;
    }

    // 清空缓存
    this.tools = [];
    this.resources = [];
    this.metadata = undefined;
    this.connectedAt = undefined;
  }

  /**
   * 设置状态并触发事件
   */
  private setStatus(status: MCPServerStatus): void {
    const oldStatus = this.status;
    this.status = status;

    if (oldStatus !== status) {
      switch (status) {
        case "connected":
          this.emitEvent("server:connected", { metadata: this.metadata });
          break;
        case "disconnected":
          this.emitEvent("server:disconnected", {});
          break;
        case "error":
          this.emitEvent("server:error", { error: this.error });
          break;
      }
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(type: MCPEvent["type"], data?: unknown): void {
    const event: MCPEvent = {
      type,
      serverId: this.config.id,
      timestamp: new Date(),
      data,
    };

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        mcpError(`mcp:${this.config.id}`, "事件监听器错误", err);
      }
    }
  }
}
