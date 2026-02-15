
import Database from "better-sqlite3";
import type { MemoryChunk, MemorySearchResult, MemoryIndexStatus, MemoryType } from "./types.js";
import { cosineSimilarity, vectorToBuffer, vectorFromBuffer, type EmbeddingVector } from "./embeddings/index.js";
import { loadSqliteVec } from "./sqlite-vec.js";

// 基础表结构。
const SCHEMA_BASE = `
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_type TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'other',
  start_line INTEGER,
  end_line INTEGER,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_path);
CREATE INDEX IF NOT EXISTS idx_chunks_updated ON chunks(updated_at);

-- Embedding 缓存表（避免重复计算相同内容）
CREATE TABLE IF NOT EXISTS embedding_cache (
  content_hash TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  dimensions INTEGER NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 元信息表
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

// FTS5 全文索引（better-sqlite3 默认编译 FTS5）
const SCHEMA_FTS5 = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;
`;

export class MemoryStore {
  private db: Database.Database;
  private closed = false;
  private vecDims: number | null = null;
  /** 当前 SQLite 是否支持 FTS5（better-sqlite3 默认编译 FTS5） */
  private hasFts5: boolean;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    loadSqliteVec(this.db);
    this.db.exec(SCHEMA_BASE);
    try {
      this.db.exec(SCHEMA_FTS5);
      this.hasFts5 = true;
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      if (msg.includes("fts5") || msg.includes("no such module")) {
        this.hasFts5 = false;
        console.warn(
          "[belldandy-memory] FTS5 not available (e.g. Node built-in sqlite). Keyword search will use LIKE fallback."
        );
      } else {
        throw err;
      }
    }
  }

  /** 插入或更新 chunk */
  upsertChunk(chunk: MemoryChunk): void {
    this.ensureOpen();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, source_path, source_type, memory_type, start_line, end_line, content, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at,
        memory_type = excluded.memory_type
    `);
    stmt.run(
      chunk.id,
      chunk.sourcePath,
      chunk.sourceType,
      chunk.memoryType,
      chunk.startLine ?? null,
      chunk.endLine ?? null,
      chunk.content,
      JSON.stringify(chunk.metadata ?? {}),
      now,
      now
    );
  }

  /** 按来源路径删除 chunks */
  deleteBySource(sourcePath: string): number {
    this.ensureOpen();
    // 先查出要删除的 rowid，同步删除 vec 数据
    const rows = this.db.prepare(`SELECT rowid FROM chunks WHERE source_path = ?`).all(sourcePath) as { rowid: number }[];
    if (rows.length > 0 && this.vecDims) {
      // vec0 删除需要 rowid
      // 为了性能，可以使用事务或 batch
      const vecDelete = this.db.prepare(`DELETE FROM chunks_vec WHERE rowid = ?`);
      for (const row of rows) {
        vecDelete.run(row.rowid);
      }
    }

    const stmt = this.db.prepare(`DELETE FROM chunks WHERE source_path = ?`);
    const result = stmt.run(sourcePath);
    return Number(result.changes);
  }

  /** 删除所有 chunks */
  deleteAll(): number {
    this.ensureOpen();
    if (this.vecDims) {
      try {
        this.db.exec(`DELETE FROM chunks_vec`);
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }
    const stmt = this.db.prepare(`DELETE FROM chunks`);
    const result = stmt.run();
    return Number(result.changes);
  }

  /** 关键词搜索（有 FTS5 用全文索引，否则用 LIKE 降级） */
  searchKeyword(query: string, limit = 10): MemorySearchResult[] {
    this.ensureOpen();

    const tokens = tokenizeForSearch(query);
    if (tokens.length === 0) return [];

    if (this.hasFts5) {
      const ftsQuery = buildFtsQuery(query);
      if (!ftsQuery) return [];
      try {
        const stmt = this.db.prepare(`
          SELECT
            c.id, c.source_path, c.source_type, c.memory_type, c.start_line, c.end_line,
            c.content, c.metadata,
            bm25(chunks_fts) as rank
          FROM chunks_fts f
          JOIN chunks c ON c.rowid = f.rowid
          WHERE chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        const rows = stmt.all(ftsQuery, limit) as any[];
        return rows.map((row) => ({
          id: row.id,
          sourcePath: row.source_path,
          sourceType: row.source_type,
          memoryType: row.memory_type as MemoryType,
          startLine: row.start_line ?? undefined,
          endLine: row.end_line ?? undefined,
          snippet: truncateContent(row.content, 500),
          score: bm25RankToScore(row.rank),
          metadata: safeParseJson(row.metadata),
        }));
      } catch (err) {
        console.error("FTS query error:", err);
        return [];
      }
    }

    // 无 FTS5 时用 LIKE 降级（多词 AND，转义 % _ 避免通配符）
    const likeConditions = tokens.map((t) => `content LIKE ? ESCAPE '\\'`).join(" AND ");
    const likeArgs = tokens.map((t) => `%${escapeLike(t)}%`);
    const stmt = this.db.prepare(`
      SELECT id, source_path, source_type, memory_type, start_line, end_line, content, metadata
      FROM chunks
      WHERE ${likeConditions}
      LIMIT ?
    `);
    const rows = stmt.all(...likeArgs, limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      sourcePath: row.source_path,
      sourceType: row.source_type,
      memoryType: row.memory_type as MemoryType,
      startLine: row.start_line ?? undefined,
      endLine: row.end_line ?? undefined,
      snippet: truncateContent(row.content, 500),
      score: 0.5,
      metadata: safeParseJson(row.metadata),
    }));
  }

  /** 获取文件元数据（用于增量检查） */
  getFileMetadata(sourcePath: string): { updatedAt: string; metadata?: any } | null {
    this.ensureOpen();
    const stmt = this.db.prepare(`
      SELECT updated_at, metadata 
      FROM chunks 
      WHERE source_path = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `);
    const row = stmt.get(sourcePath) as { updated_at: string; metadata: string } | undefined;

    if (!row) return null;

    return {
      updatedAt: row.updated_at,
      metadata: safeParseJson(row.metadata),
    };
  }

  /** 获取索引状态 */
  getStatus(): MemoryIndexStatus {
    this.ensureOpen();

    const filesStmt = this.db.prepare(`SELECT COUNT(DISTINCT source_path) as count FROM chunks`);
    const filesRow = filesStmt.get() as { count: number };

    const chunksStmt = this.db.prepare(`SELECT COUNT(*) as count FROM chunks`);
    const chunksRow = chunksStmt.get() as { count: number };

    const metaStmt = this.db.prepare(`SELECT value FROM meta WHERE key = 'last_indexed_at'`);
    const metaRow = metaStmt.get() as { value: string } | undefined;

    return {
      files: filesRow.count,
      chunks: chunksRow.count,
      lastIndexedAt: metaRow?.value,
    };
  }

  /** 更新最后索引时间 */
  updateLastIndexedAt(): void {
    this.ensureOpen();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO meta (key, value) VALUES ('last_indexed_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(now);
  }

  /** 关闭数据库连接 */
  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }

  /**
   * 初始化/准备向量表
   */
  prepareVectorStore(dimensions: number): void {
    this.ensureOpen();
    this.ensureVectorTable(dimensions);
  }

  /**
   * 获取未向量化的 chunks
   */
  getUnembeddedChunks(limit = 10): MemoryChunk[] {
    this.ensureOpen();
    if (!this.vecDims) return []; // Vector table not ready

    // Find chunks that exist in 'chunks' but not in 'chunks_vec'
    // NOTE: vec0 table uses rowid matching usually.
    // We strictly use JOIN on rowid.
    const stmt = this.db.prepare(`
        SELECT c.* 
        FROM chunks c
        LEFT JOIN chunks_vec v ON c.rowid = v.rowid
        WHERE v.rowid IS NULL
        LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      sourcePath: row.source_path,
      sourceType: row.source_type,
      memoryType: row.memory_type as MemoryType,
      startLine: row.start_line,
      endLine: row.end_line,
      content: row.content,
      metadata: safeParseJson(row.metadata),
    }));
  }

  // ========== 向量存储方法 ==========

  private ensureVectorTable(dimensions: number): void {
    if (this.vecDims === dimensions) return;

    // 检查表是否存在
    const tableExists = this.db.prepare(`SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='chunks_vec'`).get() as { c: number };

    if (tableExists.c === 0) {
      this.db.exec(`
        CREATE VIRTUAL TABLE chunks_vec USING vec0(
          embedding float[${dimensions}]
        )
      `);
      this.vecDims = dimensions;
    } else {
      // 假设已存在同名表，我们沿用（忽略维度检查）
      this.vecDims = dimensions;
    }
  }

  /**
   * 存储 chunk 的 embedding 向量
   */
  upsertChunkVector(chunkId: string, embedding: EmbeddingVector, model: string): void {
    this.ensureOpen();
    const dimensions = embedding.length;
    this.ensureVectorTable(dimensions);

    // 获取 chunk 的 rowid
    const chunkRow = this.db.prepare(`SELECT rowid FROM chunks WHERE id = ?`).get(chunkId) as { rowid: number } | undefined;
    if (!chunkRow) {
      // 可能 chunk 还没插入？或者已被删除。
      // 一般来说调用方应该先 upsertChunk。
      return;
    }

    const blob = vectorToBuffer(embedding);

    // vec0 表不支持 upsert (ON CONFLICT)，所以先删除旧的（如果存在），再插入
    // 或者直接 DELETE + INSERT (rowid 不变)
    this.db.prepare(`DELETE FROM chunks_vec WHERE rowid = ?`).run(chunkRow.rowid);
    this.db.prepare(`INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)`).run(chunkRow.rowid, blob);
  }

  /**
   * 获取 chunk 的 embedding 向量
   */
  getChunkVector(chunkId: string): EmbeddingVector | null {
    this.ensureOpen();
    if (!this.vecDims) return null;

    const chunkRow = this.db.prepare(`SELECT rowid FROM chunks WHERE id = ?`).get(chunkId) as { rowid: number } | undefined;
    if (!chunkRow) return null;

    try {
      const stmt = this.db.prepare(`SELECT embedding FROM chunks_vec WHERE rowid = ?`);
      const row = stmt.get(chunkRow.rowid) as { embedding: Buffer } | undefined;
      if (!row) return null;
      return vectorFromBuffer(row.embedding);
    } catch {
      return null;
    }
  }

  /**
   * 缓存 embedding（按内容 hash）
   */
  cacheEmbedding(contentHash: string, embedding: EmbeddingVector, model: string): void {
    this.ensureOpen();
    const now = new Date().toISOString();
    const blob = vectorToBuffer(embedding);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO embedding_cache (content_hash, embedding, dimensions, model, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(contentHash, blob, embedding.length, model, now);
  }

  /**
   * 从缓存获取 embedding
   */
  getCachedEmbedding(contentHash: string): EmbeddingVector | null {
    this.ensureOpen();
    const stmt = this.db.prepare(`SELECT embedding FROM embedding_cache WHERE content_hash = ?`);
    const row = stmt.get(contentHash) as { embedding: Buffer } | undefined;
    if (!row) return null;
    return vectorFromBuffer(row.embedding);
  }

  /**
   * 向量搜索：返回与查询向量最相似的 chunks
   */
  searchVector(queryVec: EmbeddingVector, limit = 10): MemorySearchResult[] {
    this.ensureOpen();
    if (!this.vecDims) return [];

    const blob = vectorToBuffer(queryVec);

    // sqlite-vec KNN search
    const stmt = this.db.prepare(`
        SELECT
            c.id, c.source_path, c.source_type, c.memory_type, c.start_line, c.end_line,
            c.content, c.metadata,
            v.distance
        FROM chunks_vec v
        JOIN chunks c ON c.rowid = v.rowid
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance
    `);

    const rows = stmt.all(blob, limit) as Array<{
      id: string;
      source_path: string;
      source_type: string;
      memory_type: string;
      start_line: number | null;
      end_line: number | null;
      content: string;
      metadata: string | null;
      distance: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sourcePath: row.source_path,
      sourceType: row.source_type as "file" | "session" | "manual",
      memoryType: row.memory_type as MemoryType,
      startLine: row.start_line ?? undefined,
      endLine: row.end_line ?? undefined,
      snippet: truncateContent(row.content, 500),
      // 简单转换距离为分数，假设距离是 L2 距离
      score: 1 / (1 + row.distance),
      metadata: safeParseJson(row.metadata),
    }));
  }

  /**
   * 混合搜索：结合关键词（BM25）和向量（语义）搜索
   */
  searchHybrid(
    query: string,
    queryVec: EmbeddingVector | null,
    options: {
      limit?: number;
      vectorWeight?: number;
      textWeight?: number;
    } = {}
  ): MemorySearchResult[] {
    const { limit = 10, vectorWeight = 0.7, textWeight = 0.3 } = options;

    // 获取关键词搜索结果
    const keywordResults = this.searchKeyword(query, limit * 2);

    // 如果没有向量，只返回关键词结果
    if (!queryVec || queryVec.length === 0) {
      return keywordResults.slice(0, limit);
    }

    // 获取向量搜索结果
    const vectorResults = this.searchVector(queryVec, limit * 2);

    // 合并结果（使用 RRF - Reciprocal Rank Fusion）
    const scoreMap = new Map<string, { result: MemorySearchResult; score: number }>();

    // 添加关键词结果的权重
    keywordResults.forEach((result, rank) => {
      const rrf = textWeight / (rank + 60);
      const existing = scoreMap.get(result.id);
      if (existing) {
        existing.score += rrf;
      } else {
        scoreMap.set(result.id, { result, score: rrf });
      }
    });

    // 添加向量结果的权重
    vectorResults.forEach((result, rank) => {
      const rrf = vectorWeight / (rank + 60);
      const existing = scoreMap.get(result.id);
      if (existing) {
        existing.score += rrf;
      } else {
        scoreMap.set(result.id, { result, score: rrf });
      }
    });

    // 按融合分数排序
    const merged = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ result, score }) => ({
        ...result,
        score,
      }));

    return merged;
  }

  /**
   * 获取向量索引状态
   */
  getVectorStatus(): { indexed: number; cached: number; model?: string } {
    this.ensureOpen();

    let indexed = 0;
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM chunks_vec`).get() as { count: number };
      indexed = row.count;
    } catch {
      // table might not exist
    }

    const cachedStmt = this.db.prepare(`SELECT COUNT(*) as count FROM embedding_cache`);
    const cachedRow = cachedStmt.get() as { count: number };

    // vec0 doesn't store model name, we might lose this info unless we store it elsewhere.
    // For now return undefined or fix meta.
    return {
      indexed,
      cached: cachedRow.count,
    };
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("MemoryStore already closed");
    }
  }
}

/** 分词（FTS5 与 LIKE 共用） */
function tokenizeForSearch(raw: string): string[] {
  return raw.match(/[A-Za-z0-9_\u4e00-\u9fa5]+/g)?.filter(Boolean) ?? [];
}

/** LIKE 模式中转义 % 和 _（配合 ESCAPE '\\'） */
function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** 构建 FTS5 查询字符串 */
function buildFtsQuery(raw: string): string | null {
  const tokens = tokenizeForSearch(raw);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" AND ");
}

/** BM25 rank 转换为 0-1 分数（rank 越小越好） */
function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.abs(rank) : 0;
  return Math.min(1, normalized / 10);
}

/** 截断内容 */
function truncateContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + "...";
}

/** 安全解析 JSON */
function safeParseJson(str: string | null): Record<string, unknown> | undefined {
  if (!str) return undefined;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}
