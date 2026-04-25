import type { Tool, ToolCallResult, ToolContext } from "../../types.js";
import { OfficeSiteClient } from "./client.js";

type ForumBoardItem = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  realm: "renshijian" | "wulingjie";
  realmLabel?: string;
  sortOrder?: number;
  threadAuthorRole?: string;
  replyAuthorRole?: string;
  threadCount?: number;
};

type ForumThreadAuthor =
  | {
    type: "user";
    id: string | null;
    uid?: string | null;
    username?: string | null;
    displayName?: string | null;
  }
  | {
    type: "agent";
    id: string | null;
    name?: string | null;
    identity?: string | null;
  };

type ForumThreadItem = {
  id: string;
  boardId?: string;
  title: string;
  content: string;
  authorType: "user" | "agent";
  author?: ForumThreadAuthor;
  isPinned?: boolean;
  replyCount?: number;
  lastReplyAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  locked?: boolean;
  board?: {
    id: string;
    slug: string;
    name: string;
    realm: "renshijian" | "wulingjie";
    description?: string;
  };
};

type ForumReplyItem = {
  id: string;
  threadId: string;
  content: string;
  authorType: "user" | "agent";
  author?: ForumThreadAuthor;
  createdAt?: string;
  updatedAt?: string;
};

function makeResult(name: string, start: number, success: boolean, payload: unknown, error?: string): ToolCallResult {
  return {
    id: "",
    name,
    success,
    output: success ? JSON.stringify(payload, null, 2) : "",
    error,
    durationMs: Date.now() - start,
  };
}

function parsePositiveInt(input: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function parseDateInput(input: unknown): number | null {
  const value = String(input || "").trim();
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveThreadTimestamp(thread: ForumThreadItem): number | null {
  const raw = thread.lastReplyAt || thread.updatedAt || thread.createdAt || null;
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function filterThreadsByTimeRange(
  items: ForumThreadItem[],
  fromInput: unknown,
  toInput: unknown,
): ForumThreadItem[] {
  const from = parseDateInput(fromInput);
  const to = parseDateInput(toInput);
  if (from === null && to === null) return items;

  return items.filter((item) => {
    const timestamp = resolveThreadTimestamp(item);
    if (timestamp === null) return false;
    if (from !== null && timestamp < from) return false;
    if (to !== null && timestamp > to) return false;
    return true;
  });
}

function summarizeThreadAuthor(author: ForumThreadAuthor | undefined): string | null {
  if (!author) return null;
  if (author.type === "agent") {
    return author.name || author.identity || author.id || null;
  }
  return author.displayName || author.username || author.uid || author.id || null;
}

async function fetchForumThreads(
  client: OfficeSiteClient,
  params: {
    boardSlug: string;
    keyword?: string;
    pinned?: "all" | "true" | "false";
    page?: number;
    pageSize?: number;
  },
): Promise<{ items: ForumThreadItem[]; total: number; page: number; pageSize: number }> {
  const qs = new URLSearchParams();
  qs.set("boardSlug", params.boardSlug);
  if (params.keyword) qs.set("q", params.keyword.trim());
  if (params.pinned) qs.set("pinned", params.pinned);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return client.getJson<{ items: ForumThreadItem[]; total: number; page: number; pageSize: number }>(
    `/api/forum/threads${query ? `?${query}` : ""}`,
  );
}

export const officeForumListBoardsTool: Tool = {
  definition: {
    name: "office_forum_list_boards",
    description: "列出官网社区论坛分区，支持按板块筛选。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        realm: { type: "string", description: "分区板块筛选", enum: ["renshijian", "wulingjie"] },
        board_slug: { type: "string", description: "按 slug 精确筛选单个分区" },
      },
      required: ["agent_name"],
    },
  },
  async execute(input, context): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_forum_list_boards";
    try {
      const agentName = String(input.agent_name || "").trim();
      const realm = String(input.realm || "").trim();
      const boardSlug = String(input.board_slug || "").trim();
      if (!agentName) return makeResult(name, start, false, null, "agent_name 参数必填");

      const client = new OfficeSiteClient(agentName, context.abortSignal);
      const payload = await client.getJson<{ items: ForumBoardItem[] }>("/api/forum/boards");
      let items = payload.items || [];
      if (realm) {
        items = items.filter((item) => item.realm === realm);
      }
      if (boardSlug) {
        items = items.filter((item) => item.slug === boardSlug);
      }

      return makeResult(name, start, true, {
        success: true,
        total: items.length,
        items,
      });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeForumSearchThreadsTool: Tool = {
  definition: {
    name: "office_forum_search_threads",
    description: "搜索官网社区论坛主题，可按分区、关键词、置顶、时间范围分页筛选。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        board_slug: { type: "string", description: "论坛分区 slug，例如 bug、suggestions、wulingjie" },
        keyword: { type: "string", description: "搜索关键词，匹配标题与正文" },
        pinned: { type: "string", description: "是否只看置顶主题", enum: ["all", "true", "false"] },
        page: { type: "number", description: "页码，从 1 开始" },
        page_size: { type: "number", description: "每页数量，最大 100" },
        from: { type: "string", description: "开始时间（ISO 或可被 Date.parse 解析）" },
        to: { type: "string", description: "结束时间（ISO 或可被 Date.parse 解析）" },
      },
      required: ["agent_name", "board_slug"],
    },
  },
  async execute(input, context): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_forum_search_threads";
    try {
      const agentName = String(input.agent_name || "").trim();
      const boardSlug = String(input.board_slug || "").trim();
      const keyword = String(input.keyword || "").trim();
      const pinned = String(input.pinned || "all").trim() as "all" | "true" | "false";
      const page = parsePositiveInt(input.page, 1, 1, 10000);
      const pageSize = parsePositiveInt(input.page_size, 20, 1, 100);
      if (!agentName || !boardSlug) {
        return makeResult(name, start, false, null, "agent_name 和 board_slug 参数必填");
      }

      const client = new OfficeSiteClient(agentName, context.abortSignal);
      const payload = await fetchForumThreads(client, {
        boardSlug,
        keyword: keyword || undefined,
        pinned,
        page,
        pageSize,
      });
      const filteredItems = filterThreadsByTimeRange(payload.items || [], input.from, input.to);

      return makeResult(name, start, true, {
        success: true,
        boardSlug,
        total: payload.total,
        page: payload.page,
        pageSize: payload.pageSize,
        filteredCount: filteredItems.length,
        appliedFilters: {
          keyword: keyword || null,
          pinned,
          from: String(input.from || "").trim() || null,
          to: String(input.to || "").trim() || null,
        },
        items: filteredItems,
      });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

export const officeForumGetThreadTool: Tool = {
  definition: {
    name: "office_forum_get_thread",
    description: "获取论坛单个主题详情，并可附带读取回复列表。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        thread_id: { type: "string", description: "论坛主题 ID" },
        include_replies: { type: "boolean", description: "是否附带读取回复列表，默认 true" },
        reply_page: { type: "number", description: "回复页码，从 1 开始" },
        reply_page_size: { type: "number", description: "回复每页数量，最大 100" },
      },
      required: ["agent_name", "thread_id"],
    },
  },
  async execute(input, context): Promise<ToolCallResult> {
    const start = Date.now();
    const name = "office_forum_get_thread";
    try {
      const agentName = String(input.agent_name || "").trim();
      const threadId = String(input.thread_id || "").trim();
      const includeReplies = input.include_replies !== false;
      const replyPage = parsePositiveInt(input.reply_page, 1, 1, 10000);
      const replyPageSize = parsePositiveInt(input.reply_page_size, 50, 1, 100);
      if (!agentName || !threadId) {
        return makeResult(name, start, false, null, "agent_name 和 thread_id 参数必填");
      }

      const client = new OfficeSiteClient(agentName, context.abortSignal);
      const threadPayload = await client.getJson<{ thread: ForumThreadItem }>(
        `/api/forum/threads/${encodeURIComponent(threadId)}`,
      );

      let repliesPayload: { items: ForumReplyItem[]; total: number; page: number; pageSize: number } | null = null;
      if (includeReplies) {
        const qs = new URLSearchParams();
        qs.set("page", String(replyPage));
        qs.set("pageSize", String(replyPageSize));
        repliesPayload = await client.getJson<{ items: ForumReplyItem[]; total: number; page: number; pageSize: number }>(
          `/api/forum/threads/${encodeURIComponent(threadId)}/replies?${qs.toString()}`,
        );
      }

      return makeResult(name, start, true, {
        success: true,
        thread: threadPayload.thread,
        replies: repliesPayload?.items ?? [],
        repliesTotal: repliesPayload?.total ?? 0,
        replyPage: repliesPayload?.page ?? null,
        replyPageSize: repliesPayload?.pageSize ?? null,
      });
    } catch (error) {
      return makeResult(name, start, false, null, error instanceof Error ? error.message : String(error));
    }
  },
};

async function collectForumBoardThreads(
  toolName: string,
  boardSlug: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  try {
    const agentName = String(input.agent_name || "").trim();
    const keyword = String(input.keyword || "").trim();
    const limit = parsePositiveInt(input.limit, 10, 1, 100);
    const pinned = String(input.pinned || "all").trim() as "all" | "true" | "false";
    if (!agentName) return makeResult(toolName, start, false, null, "agent_name 参数必填");

    const client = new OfficeSiteClient(agentName, context.abortSignal);
    const boardsPayload = await client.getJson<{ items: ForumBoardItem[] }>("/api/forum/boards");
    const board = (boardsPayload.items || []).find((item) => item.slug === boardSlug) || null;
    const payload = await fetchForumThreads(client, {
      boardSlug,
      keyword: keyword || undefined,
      pinned,
      page: 1,
      pageSize: Math.min(limit, 100),
    });
    const filteredItems = filterThreadsByTimeRange(payload.items || [], input.from, input.to)
      .slice(0, limit);

    return makeResult(toolName, start, true, {
      success: true,
      board: board
        ? {
          slug: board.slug,
          name: board.name,
          realm: board.realm,
          realmLabel: board.realmLabel || null,
          threadCount: board.threadCount ?? null,
        }
        : { slug: boardSlug },
      collectedAt: new Date().toISOString(),
      totalMatched: filteredItems.length,
      appliedFilters: {
        keyword: keyword || null,
        pinned,
        from: String(input.from || "").trim() || null,
        to: String(input.to || "").trim() || null,
        limit,
      },
      items: filteredItems.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null,
        lastReplyAt: item.lastReplyAt || null,
        replyCount: item.replyCount ?? 0,
        isPinned: item.isPinned === true,
        locked: item.locked === true,
        authorType: item.authorType,
        authorLabel: summarizeThreadAuthor(item.author),
        board: item.board ?? null,
      })),
    });
  } catch (error) {
    return makeResult(toolName, start, false, null, error instanceof Error ? error.message : String(error));
  }
}

export const officeForumCollectBugsTool: Tool = {
  definition: {
    name: "office_forum_collect_bugs",
    description: "快速收集 BUG 区主题，便于后续做问题归纳与故障汇总。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        keyword: { type: "string", description: "可选关键词过滤" },
        pinned: { type: "string", description: "是否只看置顶主题", enum: ["all", "true", "false"] },
        from: { type: "string", description: "开始时间（ISO 或可被 Date.parse 解析）" },
        to: { type: "string", description: "结束时间（ISO 或可被 Date.parse 解析）" },
        limit: { type: "number", description: "最多返回多少条主题，默认 10，最大 100" },
      },
      required: ["agent_name"],
    },
  },
  async execute(input, context): Promise<ToolCallResult> {
    return collectForumBoardThreads("office_forum_collect_bugs", "bug", input as Record<string, unknown>, context);
  },
};

export const officeForumCollectFeedbackTool: Tool = {
  definition: {
    name: "office_forum_collect_feedback",
    description: "快速收集建议区主题，便于后续做需求归纳与反馈汇总。",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "community.json 中已配置 apiKey 的 Agent 名称" },
        keyword: { type: "string", description: "可选关键词过滤" },
        pinned: { type: "string", description: "是否只看置顶主题", enum: ["all", "true", "false"] },
        from: { type: "string", description: "开始时间（ISO 或可被 Date.parse 解析）" },
        to: { type: "string", description: "结束时间（ISO 或可被 Date.parse 解析）" },
        limit: { type: "number", description: "最多返回多少条主题，默认 10，最大 100" },
      },
      required: ["agent_name"],
    },
  },
  async execute(input, context): Promise<ToolCallResult> {
    return collectForumBoardThreads("office_forum_collect_feedback", "suggestions", input as Record<string, unknown>, context);
  },
};
