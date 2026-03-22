import WebSocket from "ws";
import type { BelldandyAgent } from "@belldandy/agent";
import { uploadTokenUsage, type TokenUsageUploadConfig } from "@belldandy/protocol";
import type { Channel } from "./types.js";
import { ConversationStore } from "@belldandy/agent";
import { updateAgentRoom } from "./community-config.js";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

/**
 * 社区 Agent 配置
 */
export interface CommunityAgentConfig {
  /** Agent 名称 */
  name: string;
  /** API Key */
  apiKey: string;
  /** 官网工具相关本地路径配置 */
  office?: {
    /** 工坊默认下载目录；相对路径按工作区解析 */
    downloadDir?: string;
    /** 工坊上传/读取白名单根目录；相对路径按工作区解析 */
    uploadRoots?: string[];
  };
  /** 要加入的房间 */
  room?: {
    name: string;
    password?: string;
  };
}

/**
 * 社区渠道配置
 */
export interface CommunityChannelConfig {
  /** 社区服务端点 */
  endpoint: string;
  /** Agent 配置列表 */
  agents: CommunityAgentConfig[];
  /** Agent 实例 */
  agent: BelldandyAgent;
  /** 会话存储 */
  conversationStore: ConversationStore;
  /** Agent ID */
  agentId?: string;
  /** 重连配置 */
  reconnect?: {
    enabled: boolean;
    maxRetries: number;
    backoffMs: number;
  };
  /** token 用量上传配置（可选） */
  tokenUsageUpload?: TokenUsageUploadConfig;
  /** 主人 UUID（用于 strict uuid 模式） */
  ownerUserUuid?: string;
}

/**
 * 房间成员（本地维护）
 */
interface RoomMember {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string;
}

/**
 * WebSocket 连接状态
 */
interface ConnectionState {
  ws: WebSocket;
  agentConfig: CommunityAgentConfig;
  roomId: string;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  /** 本地维护的房间成员列表 */
  members: RoomMember[];
}

interface CommunityConnectivityDiagnostic {
  requestUrl: string;
  host: string;
  port: number;
  dns: {
    ok: boolean;
    addresses?: string[];
    error?: string;
  };
  tcp: {
    ok: boolean;
    address?: string;
    error?: string;
  };
  failure: {
    name: string;
    message: string;
    code?: string;
    cause?: string;
  };
}

/**
 * office.goddess.ai 社区渠道实现
 * 支持多个 Agent 同时连接不同房间
 */
export class CommunityChannel implements Channel {
  readonly name = "community";

  private readonly endpoint: string;
  private readonly agentConfigs: CommunityAgentConfig[];
  private readonly agent: BelldandyAgent;
  private readonly conversationStore: ConversationStore;
  private readonly agentId?: string;
  private readonly reconnectConfig: {
    enabled: boolean;
    maxRetries: number;
    backoffMs: number;
  };
  private readonly tokenUsageUpload?: TokenUsageUploadConfig;
  private readonly ownerUserUuid?: string;

  private _running = false;
  private connections = new Map<string, ConnectionState>(); // agentName -> ConnectionState
  private processedMessages = new Set<string>();
  private readonly MESSAGE_CACHE_SIZE = 1000;
  // Per-room 消息串行队列，避免同一房间的消息并发处理导致冲突
  private messageQueues = new Map<string, Promise<void>>();

  get isRunning(): boolean {
    return this._running;
  }

  constructor(config: CommunityChannelConfig) {
    this.endpoint = config.endpoint;
    this.agentConfigs = config.agents;
    this.agent = config.agent;
    this.conversationStore = config.conversationStore;
    this.agentId = config.agentId;
    this.tokenUsageUpload = config.tokenUsageUpload;
    this.ownerUserUuid = config.ownerUserUuid;
    this.reconnectConfig = config.reconnect ?? {
      enabled: true,
      maxRetries: 10,
      backoffMs: 5000,
    };
  }

  async start(): Promise<void> {
    if (this._running) return;

    console.log(`[${this.name}] Starting community channel...`);

    // 为每个配置的 Agent 建立连接
    for (const agentConfig of this.agentConfigs) {
      if (!agentConfig.room) {
        console.log(`[${this.name}] Agent ${agentConfig.name} has no room configured, skipping`);
        continue;
      }

      try {
        await this.connectAgent(agentConfig);
      } catch (error) {
        console.error(`[${this.name}] Failed to connect agent ${agentConfig.name}:`, error);
      }
    }

    this._running = true;
    console.log(`[${this.name}] Community channel started`);
  }

  async stop(): Promise<void> {
    if (!this._running) return;

    console.log(`[${this.name}] Stopping community channel...`);

    // 关闭所有连接
    for (const [agentName, state] of this.connections.entries()) {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
      }
      if (state.ws.readyState === WebSocket.OPEN) {
        state.ws.close(1000, "Channel stopped");
      }
    }

    this.connections.clear();
    this.messageQueues.clear();
    this._running = false;
    console.log(`[${this.name}] Community channel stopped`);
  }

  async sendProactiveMessage(content: string, chatId?: string): Promise<boolean> {
    // chatId 在社区场景中是 roomId，但我们需要找到对应的 agentName
    if (!chatId) {
      console.warn(`[${this.name}] No roomId specified for proactive message`);
      return false;
    }

    // 找到在这个房间的第一个 Agent（如果有多个 Agent 在同一房间，使用第一个）
    const state = Array.from(this.connections.values()).find(s => s.roomId === chatId);
    if (!state || state.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[${this.name}] No active connection for room ${chatId}`);
      return false;
    }

    try {
      // 通过 WebSocket 发送消息
      state.ws.send(JSON.stringify({
        type: "message",
        data: { content },
      }));
      return true;
    } catch (error) {
      console.error(`[${this.name}] Failed to send proactive message:`, error);
      return false;
    }
  }

  /**
   * 连接单个 Agent 到房间
   */
  private async connectAgent(agentConfig: CommunityAgentConfig): Promise<void> {
    const { room } = agentConfig;
    if (!room) return;

    console.log(`[${this.name}] Connecting agent ${agentConfig.name} to room ${room.name}...`);

    // 1. 通过房间名称查询房间 ID
    let roomId: string;
    const roomLookupUrl = `${this.endpoint}/api/rooms/by-name/${encodeURIComponent(room.name)}`;
    try {
      const roomResponse = await fetch(roomLookupUrl, {
        headers: {
          "X-API-Key": agentConfig.apiKey,
          "X-Agent-ID": encodeURIComponent(agentConfig.name),
        },
      });

      if (!roomResponse.ok) {
        const errorText = await roomResponse.text();
        console.error(`[${this.name}] Failed to resolve room name "${room.name}" (http ${roomResponse.status}):`, {
          requestUrl: roomLookupUrl,
          status: roomResponse.status,
          statusText: roomResponse.statusText,
          bodyPreview: errorText.slice(0, 300),
        });
        throw new Error(`Failed to find room "${room.name}": ${roomResponse.statusText} - ${errorText}`);
      }

      const roomData = await roomResponse.json();
      roomId = roomData.room.id;
      console.log(`[${this.name}] Resolved room "${room.name}" to ID: ${roomId}`);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith(`Failed to find room "${room.name}":`))) {
        const diagnostic = await this.diagnoseHttpConnectivity(roomLookupUrl, error);
        console.error(`[${this.name}] Failed to resolve room name "${room.name}" (network):`, diagnostic);
      }
      throw error;
    }

    // 2. 调用 HTTP API 加入房间
    const joinRoomUrl = `${this.endpoint}/api/rooms/${roomId}/join`;
    try {
      const joinResponse = await fetch(joinRoomUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": agentConfig.apiKey,
          "X-Agent-ID": encodeURIComponent(agentConfig.name),
        },
        body: JSON.stringify({
          password: room.password,
        }),
      });

      if (!joinResponse.ok) {
        const errorText = await joinResponse.text();
        console.error(`[${this.name}] Failed to join room ${room.name} (http ${joinResponse.status}):`, {
          requestUrl: joinRoomUrl,
          status: joinResponse.status,
          statusText: joinResponse.statusText,
          bodyPreview: errorText.slice(0, 300),
        });
        throw new Error(`Failed to join room: ${joinResponse.statusText} - ${errorText}`);
      }

      console.log(`[${this.name}] Agent ${agentConfig.name} joined room ${room.name} (${roomId})`);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("Failed to join room:"))) {
        const diagnostic = await this.diagnoseHttpConnectivity(joinRoomUrl, error);
        console.error(`[${this.name}] Failed to join room ${room.name} (network):`, diagnostic);
      }
      throw error;
    }

    // 3. 建立 WebSocket 连接
    await this.createWebSocketConnection(agentConfig, roomId);
  }

  /**
   * 创建 WebSocket 连接
   */
  private async createWebSocketConnection(agentConfig: CommunityAgentConfig, roomId: string): Promise<void> {
    const wsUrl = `${this.endpoint.replace(/^http/, "ws")}/ws/room?roomId=${roomId}&apiKey=${agentConfig.apiKey}&agentName=${encodeURIComponent(agentConfig.name)}`;

    const ws = new WebSocket(wsUrl);

    const state: ConnectionState = {
      ws,
      agentConfig,
      roomId,
      reconnectAttempts: 0,
      members: [],
    };

    this.connections.set(agentConfig.name, state);

    ws.on("open", () => {
      console.log(`[${this.name}] WebSocket connected for agent ${agentConfig.name} in room ${roomId}`);
      state.reconnectAttempts = 0; // 重置重连计数
    });

    ws.on("message", async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(message, state);
      } catch (error) {
        console.error(`[${this.name}] Failed to handle message:`, error);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[${this.name}] WebSocket closed for agent ${agentConfig.name} in room ${roomId}: ${code} - ${reason}`);
      this.connections.delete(agentConfig.name);

      // 自动重连
      if (this._running && this.reconnectConfig.enabled) {
        this.scheduleReconnect(state);
      }
    });

    ws.on("error", (error) => {
      console.error(`[${this.name}] WebSocket error for agent ${agentConfig.name} in room ${roomId}:`, error);
    });

    // 等待连接建立
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 10000);

      ws.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async diagnoseHttpConnectivity(
    requestUrl: string,
    error: unknown,
  ): Promise<CommunityConnectivityDiagnostic> {
    const url = new URL(requestUrl);
    const host = url.hostname;
    const port = url.port
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : 80;

    let dns: CommunityConnectivityDiagnostic["dns"];
    try {
      const records = await dnsLookup(host, { all: true });
      dns = {
        ok: true,
        addresses: records.map((record) => record.address),
      };
    } catch (lookupError) {
      dns = {
        ok: false,
        error: lookupError instanceof Error ? lookupError.message : String(lookupError),
      };
    }

    const tcp = await this.probeTcpConnectivity(host, port);

    const failureError = error instanceof Error ? error : new Error(String(error));
    const cause = (failureError as Error & { cause?: unknown }).cause;
    return {
      requestUrl,
      host,
      port,
      dns,
      tcp,
      failure: {
        name: failureError.name,
        message: failureError.message,
        code: typeof (failureError as Error & { code?: unknown }).code === "string"
          ? (failureError as Error & { code?: string }).code
          : undefined,
        cause: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
      },
    };
  }

  private async probeTcpConnectivity(
    host: string,
    port: number,
    timeoutMs = 3000,
  ): Promise<CommunityConnectivityDiagnostic["tcp"]> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result: CommunityConnectivityDiagnostic["tcp"]) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.once("connect", () => {
        finish({
          ok: true,
          address: `${socket.remoteAddress}:${socket.remotePort}`,
        });
      });
      socket.once("timeout", () => {
        finish({
          ok: false,
          error: `TCP connect timeout after ${timeoutMs}ms`,
        });
      });
      socket.once("error", (socketError) => {
        finish({
          ok: false,
          error: socketError instanceof Error ? socketError.message : String(socketError),
        });
      });

      socket.connect(port, host);
    });
  }

  /**
   * 处理收到的消息
   */
  private async handleMessage(message: any, state: ConnectionState): Promise<void> {
    const { type, data } = message;

    // 处理不同类型的消息
    switch (type) {
      case "message":
        await this.enqueueMessage(data, state);
        break;
      case "member_join":
        console.log(`[${this.name}] Member joined: ${data.name} (${data.memberType})`);
        // 追加到本地成员列表（去重）
        {
          const uid = data.memberUid || data.memberId;
          if (!state.members.some(m => m.id === uid)) {
            state.members.push({
              type: data.memberType === "agent" ? "agent" : "user",
              id: uid,
              name: data.name,
              identity: data.identity,
            });
          }
        }
        break;
      case "member_leave":
        console.log(`[${this.name}] Member left: ${data.name} (${data.memberType})`);
        // 从本地成员列表移除
        {
          const uid = data.memberUid || data.memberId;
          state.members = state.members.filter(m => m.id !== uid);
        }
        break;
      case "room_state":
        console.log(`[${this.name}] Room state received: mode=${data.mode}, members=${data.members?.length ?? 0}`);
        // 用服务端完整成员列表覆盖本地状态
        if (Array.isArray(data.members)) {
          state.members = data.members.map((m: any) => ({
            type: m.memberType === "agent" ? "agent" : "user",
            id: m.memberUid || m.memberId,
            name: m.name,
            identity: m.identity,
          }));
        }
        break;
      case "room_closed":
        console.log(`[${this.name}] Room closed: ${data.reason || "unknown reason"}`);
        // 房间被关闭，清理连接并阻止重连
        this.handleForcedDisconnect(state, "room_closed");
        break;
      case "member_kicked":
        // 检查被踢的是不是自己
        if (data.memberId === state.agentConfig.name || data.name === state.agentConfig.name) {
          console.log(`[${this.name}] Agent ${state.agentConfig.name} was kicked from room`);
          this.handleForcedDisconnect(state, "kicked");
        } else {
          console.log(`[${this.name}] Member kicked: ${data.name} (${data.memberType})`);
          // 别人被踢，从本地成员列表移除
          state.members = state.members.filter(m => m.id !== data.memberId && m.name !== data.name);
        }
        break;
      case "pong":
        // 应用层 pong 响应，忽略
        break;
      case "error":
        console.warn(`[${this.name}] Server error: ${data.message}`);
        break;
      default:
        console.log(`[${this.name}] Unknown message type: ${type}`);
    }
  }

  /**
   * 将消息加入 per-room 串行队列
   */
  private async enqueueMessage(data: any, state: ConnectionState): Promise<void> {
    const roomId = state.roomId;
    const prev = this.messageQueues.get(roomId) ?? Promise.resolve();
    const next = prev.then(() => this.handleChatMessage(data, state)).catch((err) => {
      console.error(`[${this.name}] Queued message handler error for room ${roomId}:`, err);
    });
    this.messageQueues.set(roomId, next);
    void next.finally(() => {
      if (this.messageQueues.get(roomId) === next) {
        this.messageQueues.delete(roomId);
      }
    });
    await next;
  }

  /**
   * 处理聊天消息
   */
  private async handleChatMessage(data: any, state: ConnectionState): Promise<void> {
    const { id, content, sender } = data;

    // 去重检查
    if (this.processedMessages.has(id)) {
      return;
    }

    // 忽略自己发送的消息
    if (sender.type === "agent" && sender.name === state.agentConfig.name) {
      return;
    }

    // 添加到已处理集合
    this.processedMessages.add(id);
    if (this.processedMessages.size > this.MESSAGE_CACHE_SIZE) {
      const firstKey = this.processedMessages.values().next().value;
      if (firstKey) this.processedMessages.delete(firstKey);
    }

    console.log(`[${this.name}] Received message from ${sender.name}: ${content}`);

    // 构建会话 ID（房间级别）
    const conversationId = `community:${state.roomId}`;

    try {
      // 调用 Agent 处理消息（流式接口）
      const stream = this.agent.run({
        conversationId,
        text: content,
        agentId: this.agentId,
        roomContext: {
          roomId: state.roomId,
          environment: "community",
          members: data.roomMembers ?? state.members, // 优先用消息附带的，fallback 到本地维护的成员列表
        },
        senderInfo: {
          type: sender.type,
          id: sender.uid || sender.id,
          name: sender.name,
          identity: sender.identity,
        },
      });

      const runStartedAt = Date.now();
      let finalText = "";
      let lastUploadedUsageTotal = 0;
      let latestUsage:
        | {
          inputTokens: number;
          outputTokens: number;
        }
        | undefined;

      const tokenUploadLog = {
        warn: (module: string, message: string, data?: unknown) => {
          if (data !== undefined) {
            console.warn(`[${this.name}] [${module}] ${message}`, data);
          } else {
            console.warn(`[${this.name}] [${module}] ${message}`);
          }
        },
      };

      // 处理流式响应
      for await (const item of stream) {
        if (item.type === "final") {
          finalText = item.text;
        }
        if (item.type === "usage") {
          latestUsage = {
            inputTokens: Number(item.inputTokens ?? 0),
            outputTokens: Number(item.outputTokens ?? 0),
          };
        }
        if (item.type === "usage" && this.tokenUsageUpload?.enabled) {
          const usageTotal = Math.max(0, Number(item.inputTokens ?? 0) + Number(item.outputTokens ?? 0));
          const deltaTokens = Math.max(0, usageTotal - lastUploadedUsageTotal);
          if (usageTotal > lastUploadedUsageTotal) {
            lastUploadedUsageTotal = usageTotal;
          }
          if (deltaTokens > 0) {
            void uploadTokenUsage({
              config: this.tokenUsageUpload,
              userUuid: this.ownerUserUuid,
              conversationId,
              source: "community",
              deltaTokens,
              log: tokenUploadLog,
            });
          }
        }
      }

      if (latestUsage) {
        this.conversationStore.recordTaskTokenResult(conversationId, {
          name: "run",
          inputTokens: latestUsage.inputTokens,
          outputTokens: latestUsage.outputTokens,
          totalTokens: latestUsage.inputTokens + latestUsage.outputTokens,
          durationMs: Date.now() - runStartedAt,
          auto: true,
        });
      }

      // 发送回复
      if (finalText) {
        state.ws.send(JSON.stringify({
          type: "message",
          data: { content: finalText },
        }));
      }
    } catch (error) {
      console.error(`[${this.name}] Failed to process message:`, error);
      // 发送错误提示
      state.ws.send(JSON.stringify({
        type: "message",
        data: { content: "抱歉，处理消息时出现了错误。" },
      }));
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(state: ConnectionState): void {
    // 检查是否已主动离开房间（room 被清空）
    if (!state.agentConfig.room) {
      console.log(`[${this.name}] Agent ${state.agentConfig.name} has left room ${state.roomId}, not reconnecting`);
      return;
    }

    if (state.reconnectAttempts >= this.reconnectConfig.maxRetries) {
      console.error(`[${this.name}] Max reconnect attempts reached for room ${state.roomId}`);
      return;
    }

    state.reconnectAttempts++;
    const delay = this.reconnectConfig.backoffMs * state.reconnectAttempts;

    console.log(`[${this.name}] Scheduling reconnect for room ${state.roomId} in ${delay}ms (attempt ${state.reconnectAttempts}/${this.reconnectConfig.maxRetries})`);

    state.reconnectTimer = setTimeout(async () => {
      try {
        await this.connectAgent(state.agentConfig);
      } catch (error) {
        console.error(`[${this.name}] Reconnect failed for room ${state.roomId}:`, error);
        // 递归调度下一次重连
        this.scheduleReconnect(state);
      }
    }, delay);
  }

  /**
   * 主动离开房间（供工具调用）
   * @param roomIdOrName 房间 UUID 或房间名称
   */
  /**
   * 处理服务端强制断开（房间关闭 / 被踢出）
   * 清理连接状态并阻止重连
   */
  private handleForcedDisconnect(state: ConnectionState, reason: string): void {
    const agentName = state.agentConfig.name;

    // 1. 清空 room 配置，阻止 ws.on('close') 触发重连
    state.agentConfig.room = undefined;
    try {
      updateAgentRoom(agentName, undefined);
    } catch (e) {
      console.warn(`[${this.name}] Failed to persist room removal for ${agentName}:`, e);
    }

    // 2. 清理重连定时器
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    // 3. 从连接池移除（WS 会被服务端关闭，无需主动 close）
    this.connections.delete(agentName);
    this.messageQueues.delete(state.roomId);

    console.log(`[${this.name}] Agent ${agentName} disconnected from room (reason: ${reason})`);
  }

  /**
   * 离开房间（供工具调用）
   */
  async leaveRoom(roomIdOrName: string): Promise<void> {
    // 同时支持按 roomId（UUID）和 room.name 查找
    const agentConfig = this.agentConfigs.find(a => a.room?.name === roomIdOrName)
      || (() => {
        // 按 roomId 从 connections 中反查 agentName
        for (const [agentName, state] of this.connections.entries()) {
          if (state.roomId === roomIdOrName) {
            return this.agentConfigs.find(a => a.name === agentName);
          }
        }
        return undefined;
      })();

    if (!agentConfig) {
      throw new Error(`No agent found for room "${roomIdOrName}"`);
    }

    const state = this.connections.get(agentConfig.name);
    if (!state) {
      throw new Error(`No active connection found for room "${roomIdOrName}"`);
    }

    // 1. 先清空内存中的 room 配置，确保 ws.on('close') 触发时不会重连
    agentConfig.room = undefined;
    try {
      updateAgentRoom(agentConfig.name, undefined);
    } catch (e) {
      console.warn(`[${this.name}] Failed to persist room removal for ${agentConfig.name}:`, e);
    }

    // 2. 清理重连定时器
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    // 3. 关闭 WebSocket 连接（会触发 ws.on('close')，但 room 已清空，不会重连）
    if (state.ws.readyState === WebSocket.OPEN) {
      state.ws.close(1000, "User requested leave");
    }

    // 4. 从连接池移除
    this.connections.delete(agentConfig.name);
    this.messageQueues.delete(state.roomId);

    console.log(`[${this.name}] Left room "${roomIdOrName}"`);
  }

  /**
   * 返回当前已加入的社区房间，用于工具在非社区上下文中解析离开目标。
   */
  getJoinedRooms(): Array<{ agentName: string; roomId: string; roomName?: string }> {
    return Array.from(this.connections.values()).map(state => ({
      agentName: state.agentConfig.name,
      roomId: state.roomId,
      roomName: state.agentConfig.room?.name,
    }));
  }

  /**
   * 动态加入房间（供工具调用）
   */
  async joinRoom(agentName: string, roomName: string, password?: string): Promise<void> {
    // 1. 查找 agent 配置
    const agentConfig = this.agentConfigs.find(a => a.name === agentName);
    if (!agentConfig) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    // 2. 检查是否已连接到其他房间
    const existingState = this.connections.get(agentName);
    if (existingState) {
      throw new Error(`Agent ${agentName} is already connected to a room. Please leave first.`);
    }

    // 3. 更新内存中的 room 配置
    agentConfig.room = { name: roomName, password };

    // 4. 持久化到 community.json
    try {
      updateAgentRoom(agentName, { name: roomName, password });
    } catch (e) {
      // 回滚内存配置
      agentConfig.room = undefined;
      throw new Error(`Failed to persist room configuration: ${e}`);
    }

    // 5. 建立连接
    try {
      await this.connectAgent(agentConfig);
      console.log(`[${this.name}] Agent ${agentName} joined room ${roomName}`);
    } catch (e) {
      // 连接失败，回滚配置
      agentConfig.room = undefined;
      updateAgentRoom(agentName, undefined);
      throw e;
    }
  }
}
