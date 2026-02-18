/**
 * Canvas 可视化工作区 — Agent 工具集
 *
 * 提供 10 个工具，让 Agent 能程序化操作画布：
 * canvas_list / canvas_create / canvas_read
 * canvas_add_node / canvas_update_node / canvas_remove_node
 * canvas_connect / canvas_disconnect
 * canvas_auto_layout / canvas_snapshot
 *
 * 存储路径: ~/.belldandy/canvas/<boardId>.json
 * 广播机制: 写操作完成后通过 BroadcastFn 推送 canvas.update 事件
 */

import type { Tool, JsonObject, ToolContext, ToolCallResult } from "../types.js";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────

export type CanvasBroadcastFn = (msg: unknown) => void;

type NodeType =
  | "task" | "note" | "method" | "knowledge"
  | "agent-output" | "screenshot" | "session" | "group";

interface NodeRef {
  type: "method" | "memory" | "session" | "url" | "file";
  id: string;
}

interface NodeData {
  title: string;
  content?: string;
  status?: "todo" | "doing" | "done";
  ref?: NodeRef;
  imageUrl?: string;
  color?: string;
  tags?: string[];
  collapsed?: boolean;
}

interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned: boolean;
  data: NodeData;
}

interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  fromPort?: "top" | "bottom" | "left" | "right";
  toPort?: "top" | "bottom" | "left" | "right";
  label?: string;
  style?: "solid" | "dashed" | "dotted";
}

interface CanvasBoard {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: Record<string, CanvasNode>;
  edges: Record<string, CanvasEdge>;
}

// ─── Helpers ─────────────────────────────────────────────────

const getCanvasDir = () => path.join(os.homedir(), ".belldandy", "canvas");

function genId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function ok(name: string, output: string): ToolCallResult {
  return { id: "", name, success: true, output, durationMs: 0 };
}

function fail(name: string, output: string, error?: string): ToolCallResult {
  return { id: "", name, success: false, output, error: error ?? output, durationMs: 0 };
}

async function ensureCanvasDir(): Promise<string> {
  const dir = getCanvasDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function boardPath(dir: string, boardId: string): string {
  const p = path.join(dir, `${boardId}.json`);
  if (!p.startsWith(dir)) throw new Error("Path traversal detected");
  return p;
}

async function readBoard(dir: string, boardId: string): Promise<CanvasBoard> {
  const raw = await fs.readFile(boardPath(dir, boardId), "utf-8");
  return JSON.parse(raw) as CanvasBoard;
}

async function writeBoard(dir: string, board: CanvasBoard): Promise<void> {
  board.updatedAt = new Date().toISOString();
  const p = boardPath(dir, board.id);
  const tmp = p + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(board, null, 2), "utf-8");
  await fs.rename(tmp, p);
}

/** Auto-populate content from ref when creating a node with a reference */
async function autoPopulateContent(ref: NodeRef | undefined): Promise<string | undefined> {
  if (!ref) return undefined;
  const stateDir = path.join(os.homedir(), ".belldandy");
  let filePath: string | undefined;
  if (ref.type === "method") {
    filePath = path.join(stateDir, "methods", ref.id);
  } else if (ref.type === "memory") {
    filePath = path.join(stateDir, "memory", ref.id);
  } else if (ref.type === "file") {
    filePath = path.join(stateDir, ref.id);
  }
  if (!filePath) return undefined;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    // Truncate to first 500 chars for preview
    return raw.length > 500 ? raw.slice(0, 500) + "\u2026" : raw;
  } catch {
    return undefined;
  }
}

// 简单的内存互斥锁，防止同一画布并发写冲突
const locks = new Map<string, Promise<void>>();
async function withLock<T>(boardId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(boardId) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  locks.set(boardId, next);
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (locks.get(boardId) === next) locks.delete(boardId);
  }
}

// 节点类型的默认尺寸
const DEFAULT_SIZE: Record<NodeType, { w: number; h: number }> = {
  task:           { w: 220, h: 120 },
  note:           { w: 240, h: 140 },
  method:         { w: 220, h: 100 },
  knowledge:      { w: 220, h: 120 },
  "agent-output": { w: 280, h: 160 },
  screenshot:     { w: 320, h: 240 },
  session:        { w: 200, h:  80 },
  group:          { w: 400, h: 300 },
};

// ─── Tool: canvas_list ───────────────────────────────────────

const canvasListTool: Tool = {
  definition: {
    name: "canvas_list",
    description: "列出所有画布 (Canvas Board)。返回每个画布的 ID、名称、节点数量和最后更新时间。",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute(_args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
    const dir = await ensureCanvasDir();
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return ok("canvas_list", "当前没有任何画布。可以使用 canvas_create 创建一个。");

    const boards: { id: string; name: string; nodes: number; updatedAt: string }[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const b = JSON.parse(raw) as CanvasBoard;
        boards.push({ id: b.id, name: b.name, nodes: Object.keys(b.nodes).length, updatedAt: b.updatedAt });
      } catch { /* skip corrupted files */ }
    }
    boards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const lines = boards.map((b) => `- [${b.id}] ${b.name} (${b.nodes} nodes, updated ${b.updatedAt})`);
    return ok("canvas_list", `找到 ${boards.length} 个画布:\n${lines.join("\n")}`);
  },
};

// ─── Tool: canvas_create ─────────────────────────────────────

function createCanvasCreateTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_create",
      description: "创建一个新的空白画布。返回画布 ID，后续可用 canvas_add_node 添加节点。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "画布名称" },
        },
        required: ["name"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const name = args.name as string;
      if (!name) return fail("canvas_create", "缺少参数: name");

      const dir = await ensureCanvasDir();
      const id = genId();
      const now = new Date().toISOString();
      const board: CanvasBoard = {
        version: 1, id, name, createdAt: now, updatedAt: now,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: {}, edges: {},
      };
      await writeBoard(dir, board);

      broadcast?.({ type: "event", event: "canvas.update", payload: { boardId: id, action: "board_created", payload: { id, name } } });
      return ok("canvas_create", `画布已创建。ID: ${id}, 名称: ${name}`);
    },
  };
}

// ─── Tool: canvas_read ───────────────────────────────────────

const canvasReadTool: Tool = {
  definition: {
    name: "canvas_read",
    description: "读取画布的完整数据，包括所有节点和连线。",
    parameters: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "画布 ID" },
      },
      required: ["boardId"],
    },
  },
  async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
    const boardId = args.boardId as string;
    if (!boardId) return fail("canvas_read", "缺少参数: boardId");

    try {
      const dir = await ensureCanvasDir();
      const board = await readBoard(dir, boardId);
      return ok("canvas_read", JSON.stringify(board, null, 2));
    } catch (e) {
      return fail("canvas_read", `无法读取画布 '${boardId}': ${(e as Error).message}`);
    }
  },
};

// ─── Tool: canvas_add_node ────────────────────────────────────

function createCanvasAddNodeTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_add_node",
      description: "向画布添加一个节点。支持类型: task, note, method, knowledge, agent-output, screenshot, session, group。返回新节点 ID。",
      parameters: {
        type: "object",
        properties: {
          boardId: { type: "string", description: "画布 ID" },
          type: { type: "string", description: "节点类型", enum: ["task", "note", "method", "knowledge", "agent-output", "screenshot", "session", "group"] },
          title: { type: "string", description: "节点标题" },
          content: { type: "string", description: "节点内容 (Markdown)" },
          status: { type: "string", description: "任务状态 (仅 task 类型)", enum: ["todo", "doing", "done"] },
          refType: { type: "string", description: "关联资源类型", enum: ["method", "memory", "session", "url", "file"] },
          refId: { type: "string", description: "关联资源 ID" },
          tags: { type: "string", description: "标签，逗号分隔" },
          color: { type: "string", description: "自定义颜色 (CSS 色值)" },
        },
        required: ["boardId", "type", "title"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const boardId = args.boardId as string;
      const nodeType = args.type as NodeType;
      const title = args.title as string;
      if (!boardId || !nodeType || !title) return fail("canvas_add_node", "缺少必要参数: boardId, type, title");

      const dir = await ensureCanvasDir();
      return withLock(boardId, async () => {
        let board: CanvasBoard;
        try { board = await readBoard(dir, boardId); }
        catch { return fail("canvas_add_node", `画布 '${boardId}' 不存在`); }

        const nodeId = genId();
        const size = DEFAULT_SIZE[nodeType] ?? { w: 220, h: 120 };

        // 自动分配位置：在现有节点右下方偏移
        const existingNodes = Object.values(board.nodes);
        const offsetX = existingNodes.length > 0
          ? Math.max(...existingNodes.map((n) => n.x + n.width)) + 40
          : 40;
        const offsetY = existingNodes.length > 0
          ? existingNodes[existingNodes.length - 1].y
          : 40;

        const data: NodeData = { title };
        if (args.content) data.content = args.content as string;
        if (args.status && nodeType === "task") data.status = args.status as NodeData["status"];
        if (args.refType && args.refId) data.ref = { type: args.refType as NodeRef["type"], id: args.refId as string };
        if (args.tags) data.tags = (args.tags as string).split(",").map((t) => t.trim()).filter(Boolean);
        if (args.color) data.color = args.color as string;

        // Auto-populate content from referenced file if not explicitly provided
        if (!data.content && data.ref) {
          const auto = await autoPopulateContent(data.ref);
          if (auto) data.content = auto;
        }

        const node: CanvasNode = {
          id: nodeId, type: nodeType,
          x: offsetX, y: offsetY,
          width: size.w, height: size.h,
          pinned: false, data,
        };
        board.nodes[nodeId] = node;
        await writeBoard(dir, board);

        broadcast?.({ type: "event", event: "canvas.update", payload: { boardId, action: "node_added", payload: { nodeId, node } } });
        return ok("canvas_add_node", `节点已添加。ID: ${nodeId}, 类型: ${nodeType}, 标题: ${title}`);
      });
    },
  };
}

// ─── Tool: canvas_update_node ─────────────────────────────────

function createCanvasUpdateNodeTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_update_node",
      description: "更新画布中某个节点的属性（标题、内容、状态、标签等）。",
      parameters: {
        type: "object",
        properties: {
          boardId: { type: "string", description: "画布 ID" },
          nodeId: { type: "string", description: "节点 ID" },
          title: { type: "string", description: "新标题" },
          content: { type: "string", description: "新内容" },
          status: { type: "string", description: "新状态", enum: ["todo", "doing", "done"] },
          tags: { type: "string", description: "新标签，逗号分隔" },
          color: { type: "string", description: "新颜色" },
          collapsed: { type: "boolean", description: "是否折叠" },
        },
        required: ["boardId", "nodeId"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const boardId = args.boardId as string;
      const nodeId = args.nodeId as string;
      if (!boardId || !nodeId) return fail("canvas_update_node", "缺少参数: boardId, nodeId");

      const dir = await ensureCanvasDir();
      return withLock(boardId, async () => {
        let board: CanvasBoard;
        try { board = await readBoard(dir, boardId); }
        catch { return fail("canvas_update_node", `画布 '${boardId}' 不存在`); }

        const node = board.nodes[nodeId];
        if (!node) return fail("canvas_update_node", `节点 '${nodeId}' 不存在`);

        if (args.title !== undefined) node.data.title = args.title as string;
        if (args.content !== undefined) node.data.content = args.content as string;
        if (args.status !== undefined) node.data.status = args.status as NodeData["status"];
        if (args.tags !== undefined) node.data.tags = (args.tags as string).split(",").map((t) => t.trim()).filter(Boolean);
        if (args.color !== undefined) node.data.color = args.color as string;
        if (args.collapsed !== undefined) node.data.collapsed = args.collapsed as boolean;

        await writeBoard(dir, board);

        broadcast?.({ type: "event", event: "canvas.update", payload: { boardId, action: "node_updated", payload: { nodeId, node } } });
        return ok("canvas_update_node", `节点 '${nodeId}' 已更新。`);
      });
    },
  };
}

// ─── Tool: canvas_remove_node ─────────────────────────────────

function createCanvasRemoveNodeTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_remove_node",
      description: "从画布中删除一个节点及其所有关联的连线。",
      parameters: {
        type: "object",
        properties: {
          boardId: { type: "string", description: "画布 ID" },
          nodeId: { type: "string", description: "要删除的节点 ID" },
        },
        required: ["boardId", "nodeId"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const boardId = args.boardId as string;
      const nodeId = args.nodeId as string;
      if (!boardId || !nodeId) return fail("canvas_remove_node", "缺少参数: boardId, nodeId");

      const dir = await ensureCanvasDir();
      return withLock(boardId, async () => {
        let board: CanvasBoard;
        try { board = await readBoard(dir, boardId); }
        catch { return fail("canvas_remove_node", `画布 '${boardId}' 不存在`); }

        if (!board.nodes[nodeId]) return fail("canvas_remove_node", `节点 '${nodeId}' 不存在`);

        delete board.nodes[nodeId];
        // 删除关联边
        const removedEdges: string[] = [];
        for (const [eid, edge] of Object.entries(board.edges)) {
          if (edge.from === nodeId || edge.to === nodeId) {
            delete board.edges[eid];
            removedEdges.push(eid);
          }
        }
        await writeBoard(dir, board);

        broadcast?.({ type: "event", event: "canvas.update", payload: { boardId, action: "node_removed", payload: { nodeId, removedEdges } } });
        return ok("canvas_remove_node", `节点 '${nodeId}' 已删除，同时移除了 ${removedEdges.length} 条关联连线。`);
      });
    },
  };
}

// ─── Tool: canvas_connect ─────────────────────────────────────

function createCanvasConnectTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_connect",
      description: "在画布中连接两个节点（创建有向边）。",
      parameters: {
        type: "object",
        properties: {
          boardId: { type: "string", description: "画布 ID" },
          fromId: { type: "string", description: "起始节点 ID" },
          toId: { type: "string", description: "目标节点 ID" },
          label: { type: "string", description: "连线标签（可选）" },
          style: { type: "string", description: "连线样式", enum: ["solid", "dashed", "dotted"] },
        },
        required: ["boardId", "fromId", "toId"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const boardId = args.boardId as string;
      const fromId = args.fromId as string;
      const toId = args.toId as string;
      if (!boardId || !fromId || !toId) return fail("canvas_connect", "缺少参数: boardId, fromId, toId");
      if (fromId === toId) return fail("canvas_connect", "不能连接节点到自身");

      const dir = await ensureCanvasDir();
      return withLock(boardId, async () => {
        let board: CanvasBoard;
        try { board = await readBoard(dir, boardId); }
        catch { return fail("canvas_connect", `画布 '${boardId}' 不存在`); }

        if (!board.nodes[fromId]) return fail("canvas_connect", `起始节点 '${fromId}' 不存在`);
        if (!board.nodes[toId]) return fail("canvas_connect", `目标节点 '${toId}' 不存在`);

        // 检查重复边
        const dup = Object.values(board.edges).find((e) => e.from === fromId && e.to === toId);
        if (dup) return fail("canvas_connect", `这两个节点之间已存在连线 (${dup.id})`);

        const edgeId = genId();
        const edge: CanvasEdge = { id: edgeId, from: fromId, to: toId };
        if (args.label) edge.label = args.label as string;
        if (args.style) edge.style = args.style as CanvasEdge["style"];

        board.edges[edgeId] = edge;
        await writeBoard(dir, board);

        broadcast?.({ type: "event", event: "canvas.update", payload: { boardId, action: "edge_added", payload: { edgeId, edge } } });
        return ok("canvas_connect", `连线已创建。ID: ${edgeId}, ${fromId} → ${toId}`);
      });
    },
  };
}

// ─── Tool: canvas_disconnect ──────────────────────────────────

function createCanvasDisconnectTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_disconnect",
      description: "删除画布中的一条连线。",
      parameters: {
        type: "object",
        properties: {
          boardId: { type: "string", description: "画布 ID" },
          edgeId: { type: "string", description: "连线 ID" },
        },
        required: ["boardId", "edgeId"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const boardId = args.boardId as string;
      const edgeId = args.edgeId as string;
      if (!boardId || !edgeId) return fail("canvas_disconnect", "缺少参数: boardId, edgeId");

      const dir = await ensureCanvasDir();
      return withLock(boardId, async () => {
        let board: CanvasBoard;
        try { board = await readBoard(dir, boardId); }
        catch { return fail("canvas_disconnect", `画布 '${boardId}' 不存在`); }

        if (!board.edges[edgeId]) return fail("canvas_disconnect", `连线 '${edgeId}' 不存在`);

        delete board.edges[edgeId];
        await writeBoard(dir, board);

        broadcast?.({ type: "event", event: "canvas.update", payload: { boardId, action: "edge_removed", payload: { edgeId } } });
        return ok("canvas_disconnect", `连线 '${edgeId}' 已删除。`);
      });
    },
  };
}

// ─── Tool: canvas_auto_layout ─────────────────────────────────

function createCanvasAutoLayoutTool(broadcast?: CanvasBroadcastFn): Tool {
  return {
    definition: {
      name: "canvas_auto_layout",
      description: "对画布执行自动布局（有向图层次布局）。已固定 (pinned) 的节点不会被移动。前端加载 dagre.js 时使用前端布局；此工具提供简单的服务端拓扑网格布局作为后备。",
      parameters: {
        type: "object",
        properties: {
          boardId: { type: "string", description: "画布 ID" },
          direction: { type: "string", description: "布局方向: TB=从上到下, LR=从左到右", enum: ["TB", "LR"] },
        },
        required: ["boardId"],
      },
    },
    async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
      const boardId = args.boardId as string;
      if (!boardId) return fail("canvas_auto_layout", "缺少参数: boardId");

      const direction = (args.direction as string) || "TB";
      const dir = await ensureCanvasDir();

      return withLock(boardId, async () => {
        let board: CanvasBoard;
        try { board = await readBoard(dir, boardId); }
        catch { return fail("canvas_auto_layout", `画布 '${boardId}' 不存在`); }

        const nodes = Object.values(board.nodes).filter((n) => !n.pinned);
        const edges = Object.values(board.edges);

        if (nodes.length === 0) return ok("canvas_auto_layout", "没有可布局的节点（所有节点已固定）。");

        // 构建邻接表做拓扑排序
        const nodeIds = new Set(nodes.map((n) => n.id));
        const adj = new Map<string, string[]>();
        const inDeg = new Map<string, number>();
        for (const n of nodes) {
          adj.set(n.id, []);
          inDeg.set(n.id, 0);
        }
        for (const e of edges) {
          if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
            adj.get(e.from)!.push(e.to);
            inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
          }
        }

        // Kahn's algorithm 拓扑排序
        const queue: string[] = [];
        for (const [id, deg] of inDeg) { if (deg === 0) queue.push(id); }
        const sorted: string[] = [];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          sorted.push(cur);
          for (const next of adj.get(cur) ?? []) {
            const d = (inDeg.get(next) ?? 1) - 1;
            inDeg.set(next, d);
            if (d === 0) queue.push(next);
          }
        }
        // 未排序的节点（环或孤立）追加到末尾
        for (const n of nodes) {
          if (!sorted.includes(n.id)) sorted.push(n.id);
        }

        // 按拓扑序分层，然后网格排列
        const GAP_X = 60;
        const GAP_Y = 80;
        const COLS = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));

        for (let i = 0; i < sorted.length; i++) {
          const node = board.nodes[sorted[i]];
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          if (direction === "LR") {
            node.x = row * (node.width + GAP_X) + 40;
            node.y = col * (node.height + GAP_Y) + 40;
          } else {
            node.x = col * (node.width + GAP_X) + 40;
            node.y = row * (node.height + GAP_Y) + 40;
          }
        }

        await writeBoard(dir, board);

        broadcast?.({ type: "event", event: "canvas.update", payload: { boardId, action: "layout_changed", payload: { direction, nodeCount: sorted.length } } });
        return ok("canvas_auto_layout", `已对 ${sorted.length} 个节点执行 ${direction} 方向自动布局。`);
      });
    },
  };
}

// ─── Tool: canvas_snapshot ────────────────────────────────────

const canvasSnapshotTool: Tool = {
  definition: {
    name: "canvas_snapshot",
    description: "获取画布的文本摘要（供 Agent 理解画布当前状态）。返回节点列表、连线关系和统计信息。",
    parameters: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "画布 ID" },
      },
      required: ["boardId"],
    },
  },
  async execute(args: JsonObject, _ctx: ToolContext): Promise<ToolCallResult> {
    const boardId = args.boardId as string;
    if (!boardId) return fail("canvas_snapshot", "缺少参数: boardId");

    try {
      const dir = await ensureCanvasDir();
      const board = await readBoard(dir, boardId);

      const nodeList = Object.values(board.nodes);
      const edgeList = Object.values(board.edges);

      const lines: string[] = [
        `# 画布: ${board.name} (${board.id})`,
        `节点: ${nodeList.length} | 连线: ${edgeList.length} | 更新: ${board.updatedAt}`,
        "",
        "## 节点",
      ];

      for (const n of nodeList) {
        const status = n.data.status ? ` [${n.data.status}]` : "";
        const ref = n.data.ref ? ` → ${n.data.ref.type}:${n.data.ref.id}` : "";
        const tags = n.data.tags?.length ? ` #${n.data.tags.join(" #")}` : "";
        lines.push(`- [${n.id}] (${n.type})${status} ${n.data.title}${ref}${tags}`);
        if (n.data.content) {
          const preview = n.data.content.length > 100 ? n.data.content.slice(0, 100) + "..." : n.data.content;
          lines.push(`  ${preview}`);
        }
      }

      if (edgeList.length > 0) {
        lines.push("", "## 连线");
        for (const e of edgeList) {
          const fromTitle = board.nodes[e.from]?.data.title ?? e.from;
          const toTitle = board.nodes[e.to]?.data.title ?? e.to;
          const label = e.label ? ` "${e.label}"` : "";
          lines.push(`- ${fromTitle} → ${toTitle}${label}`);
        }
      }

      return ok("canvas_snapshot", lines.join("\n"));
    } catch (e) {
      return fail("canvas_snapshot", `无法读取画布 '${boardId}': ${(e as Error).message}`);
    }
  },
};

// ─── Export: Factory Function ─────────────────────────────────

/**
 * 创建所有 Canvas 工具。
 * broadcast 参数由 gateway.ts 注入，用于写操作后推送 canvas.update 事件。
 */
export function createCanvasTools(broadcast?: CanvasBroadcastFn): Tool[] {
  return [
    canvasListTool,
    createCanvasCreateTool(broadcast),
    canvasReadTool,
    createCanvasAddNodeTool(broadcast),
    createCanvasUpdateNodeTool(broadcast),
    createCanvasRemoveNodeTool(broadcast),
    createCanvasConnectTool(broadcast),
    createCanvasDisconnectTool(broadcast),
    createCanvasAutoLayoutTool(broadcast),
    canvasSnapshotTool,
  ];
}

export type { CanvasBoard, CanvasNode, CanvasEdge, NodeType, NodeData, NodeRef };
