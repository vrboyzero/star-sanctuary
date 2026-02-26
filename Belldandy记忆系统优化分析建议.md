# Belldandy vs memory-lancedb-pro 记忆系统对比分析

## 一、架构定位差异

| 维度 | Belldandy | memory-lancedb-pro |
|------|-----------|-------------------|
| 定位 | 文件驱动的知识库（自动索引 Markdown/会话文件） | 对话驱动的记忆条目（Agent 主动存取单条记忆） |
| 存储引擎 | SQLite + FTS5 + sqlite-vec | LanceDB（列式向量数据库） |
| 数据粒度 | 文件 → 分块（Chunker 切分） | 单条记忆条目（无分块概念） |
| 数据来源 | 文件系统自动扫描 + 增量索引 | Agent 工具调用主动写入 |
| 记忆分类 | 按文件来源：`core/daily/session/other` | 按内容语义：`preference/fact/decision/entity/other` |

## 二、检索管线逐环节对比

### 1. Embedding

| | Belldandy | memory-lancedb-pro |
|--|-----------|-------------------|
| Task-aware Embedding | ❌ 查询和文档用同一方式 embed | ✅ 支持 `taskQuery` / `taskPassage` 区分（如 Jina 的 `retrieval.query` vs `retrieval.passage`） |
| 缓存 | ✅ SQLite 持久化缓存（SHA-256 hash），跨重启有效 | 内存 LRU 缓存（256 条，30min TTL），重启丢失 |
| 批处理 | ✅ embedBatch | ✅ embedBatch |

**结论**：Belldandy 的持久化缓存更优，但缺少 Task-aware Embedding 是一个明显短板。对于支持 task 参数的模型（Jina、BGE-M3 等），查询和文档用不同 task 前缀可以显著提升检索相关性。

### 2. 混合检索融合

两者都用 **加权 RRF**（k=60），逻辑基本一致：

```
score += weight / (rank + 60)
```

Belldandy 默认 vector:text = 0.7:0.3，memory-lancedb-pro 也是类似配比。这一环节两者持平。

### 3. 重排序（最大差异点）

| 信号 | Belldandy | memory-lancedb-pro |
|------|-----------|-------------------|
| 类型/重要性权重 | ✅ memory_type 权重（core 1.3 > daily 1.0 > session 0.9） | ✅ importance 字段（0-1 浮点，per-entry 粒度） |
| 时间衰减 | ✅ 指数衰减，半衰期 30 天，下限 0.3 | ✅ 指数衰减，半衰期 60 天，下限 0.5 |
| 时效性加成（Recency Boost） | ❌ | ✅ 对近期记忆额外加分（加法，与衰减独立） |
| 来源多样性 | ✅ 同源惩罚 15%（按 source_path） | ✅ MMR（Maximal Marginal Relevance），基于向量余弦相似度去重 |
| 长度归一化 | ❌ | ✅ `1 / (1 + log2(charLen / anchor))`，防止长文本靠关键词密度霸榜 |
| Cross-encoder Rerank | ❌ | ✅ 支持 Jina / SiliconFlow / Pinecone 跨编码器重排 |
| Hard Min Score 截断 | ❌ | ✅ 所有打分阶段结束后，低于阈值（默认 0.35）的结果直接丢弃 |

### 4. 检索前过滤

| | Belldandy | memory-lancedb-pro |
|--|-----------|-------------------|
| 自适应检索（Adaptive Retrieval） | ❌ 每次查询都可能触发检索 | ✅ 正则分类：问候/命令/简单确认 → 跳过检索；记忆关键词 → 强制检索 |
| 噪声过滤（Noise Filter） | ❌ | ✅ 过滤 Agent 否认回复、元问题、会话样板文 |

### 5. 记忆管理

| | Belldandy | memory-lancedb-pro |
|--|-----------|-------------------|
| 写入 | 文件系统自动索引 | Agent 工具主动 `memory_store` |
| 删除 | 按文件删除（deleteBySource） | ✅ 单条 `memory_forget` + 批量 `bulkDelete` |
| 更新 | 重新索引整个文件 | ✅ 单条 `memory_update`（改文本/分类/重要性） |
| Scope 隔离 | ❌ 无 | ✅ 多 Scope（global / agent:* / project:* / user:*） |

## 三、Belldandy 已有的优势（memory-lancedb-pro 不具备）

1. **文件自动索引 + chokidar 监听**：用户只需往 `memory/` 目录放文件，系统自动分块索引，零操作成本
2. **Markdown 感知分块**：按标题语义边界切分，memory-lancedb-pro 没有分块概念
3. **源路径聚合深度检索（M-N4）**：命中某文件多个 chunk 时，自动拉取该文件全部 chunk 补充上下文
4. **L0 摘要层**：为每个 chunk 生成 LLM 摘要，检索时可返回摘要而非全文
5. **会话记忆自动提取（M-N3）**：会话结束后 LLM 自动提取事实/偏好，写入每日记忆
6. **持久化 Embedding 缓存**：SQLite 表，跨重启有效，比内存 LRU 更可靠
7. **三层上下文压缩**：Working Memory → Rolling Summary → Archival Summary

## 四、可借鉴的优化方向（按价值排序）

### P0 — 高价值、低成本 ✅ 已全部实施（2026-02-25）

**1. 自适应检索（Adaptive Retrieval）** ✅
- 当前问题：Belldandy 的 `before_agent_start` hook 中注入记忆上下文时，对所有消息一视同仁
- 借鉴：移植 `shouldSkipRetrieval()` 逻辑，对问候/命令/简单确认跳过检索
- 成本：纯正则，约 50 行代码，零 API 开销
- 收益：减少无意义的 Embedding API 调用，降低噪声注入
- 实施：新建 `packages/belldandy-memory/src/adaptive-retrieval.ts`，在 `manager.ts` 的 `search()` 入口调用

**2. Hard Min Score 截断** ✅
- 当前问题：Belldandy 的 reranker 只排序不截断，低相关结果仍会返回
- 借鉴：在 `ResultReranker.rerank()` 末尾加一个 `minScore` 过滤
- 成本：1 行 filter
- 收益：避免低质量结果污染上下文
- 实施：`reranker.ts` 新增 `minScore` 选项（默认 0.15），rerank 结果末尾 filter 截断

**3. 噪声过滤（Noise Filter）** ✅
- 当前问题：会话历史索引时，Agent 的否认回复（"我不记得"）、用户的问候语也会被索引为 chunk
- 借鉴：在 `MemoryIndexer` 处理 `.jsonl` 会话文件时，过滤掉噪声消息
- 成本：约 60 行正则规则
- 收益：提升会话记忆的信噪比
- 实施：新建 `packages/belldandy-memory/src/noise-filter.ts`，在 `session-loader.ts` 解析 JSONL 时接入过滤

### P1 — 高价值、中等成本 ✅ 已全部实施（2026-02-25）

**4. Task-aware Embedding** ✅
- 当前问题：查询和文档用相同方式 embed，对于支持 task 参数的模型（Jina、BGE-M3）浪费了区分能力
- 借鉴：`EmbeddingProvider` 接口增加 `embedQuery(text)` / `embedPassage(text)` 区分，索引时用 passage task，检索时用 query task
- 成本：改 `EmbeddingProvider` 接口 + `store.ts` 调用处
- 收益：对支持 task 的模型，检索相关性可提升 5-15%
- 实施：`embeddings/index.ts` 接口新增可选 `embedQuery`/`embedPassage` 方法；`embeddings/openai.ts` 新增 `queryPrefix`/`passagePrefix` 配置支持 task-aware 前缀；`manager.ts` 检索时调用 `embedQuery`，`embedBatch` 索引时自动使用 passage 前缀；`MemoryManagerOptions` 新增 `embeddingQueryPrefix`/`embeddingPassagePrefix` 配置项

**5. 长度归一化** ✅
- 当前问题：长 chunk 因包含更多关键词，在 BM25 中天然占优
- 借鉴：在 reranker 中加入 `1 / (1 + log2(charLen / anchor))` 因子
- 成本：reranker 加 5 行
- 收益：防止长文本霸榜，让短而精准的记忆有机会排上来
- 实施：`reranker.ts` 新增 `lengthNormAnchor` 选项（默认 500 字符），在 rerank 第 4 步对 `result.content` 应用长度归一化因子

**6. 内容语义分类（Category）** ✅
- 当前问题：Belldandy 的 `memory_type` 是按文件来源分的（core/daily/session），不是按内容语义
- 借鉴：在 M-N3 会话记忆提取时，让 LLM 同时输出 category（preference/fact/decision/entity），存入 chunk 元数据
- 成本：改 M-N3 的 LLM prompt + chunks 表加列
- 收益：支持按语义类型过滤检索（如"只找用户偏好"）
- 实施：`types.ts` 新增 `MemoryCategory` 类型（preference/fact/decision/entity/experience/other）+ `MemoryChunk.category` 字段 + `MemorySearchFilter.category` 过滤；`store.ts` 新增 `category` 列迁移、索引、upsert 写入、`buildFilterClause` 过滤支持；M-N3 提取 prompt 扩展为 5 类分类，LLM 输出包含 `category` 字段，写入每日记忆文件时标注分类

### P2 — 有价值、需评估

**7. Cross-encoder Rerank**
- 价值：跨编码器重排是检索质量提升最显著的手段（通常 +10-20% NDCG）
- 顾虑：需要额外 API 调用（Jina reranker），增加延迟和成本
- 建议：作为可选功能，配置 `BELLDANDY_RERANK_ENABLED` + `BELLDANDY_RERANK_API_KEY`，默认关闭

**8. MMR 多样性去重** ✅ 已实施（2026-02-26）
- 当前 Belldandy 的同源惩罚是按 `source_path` 的，粒度较粗
- MMR 基于向量余弦相似度，能发现内容相似但来自不同文件的重复
- ~~顾虑：需要在检索结果间两两计算余弦相似度，O(n²) 但 n 通常 < 20，可接受~~
- 实施：`reranker.ts` 新增 `mmrLambda`（默认 0.7）和 `mmrSimilarityThreshold`（默认 0.85）配置；`rerank()` 方法新增可选 `getVector` 回调参数；新增 `applyMMR()` 贪心选择算法，每次选择 `MMR = λ × relevance - (1-λ) × maxSimilarity` 最高的候选，相似度超过阈值的直接跳过；`manager.ts` 调用 rerank 时传入 `store.getChunkVector` 回调

**9. Scope 隔离** ✅ 已实施（2026-02-26）
- 当前 Belldandy 是单用户本地部署，Scope 需求不强
- 但如果未来支持多 Agent 协作（社区功能已有），Scope 隔离会变得有价值
- ~~建议：暂不实施，等多 Agent 场景成熟后再考虑~~
- 实施：`types.ts` 新增 `MemoryChunk.agentId` 和 `MemorySearchFilter.agentId` 字段；`store.ts` 新增 `agent_id` 列、索引、`buildFilterClause` 支持 agentId 过滤；`memory.ts` 工具层自动从 `context.agentId` 注入过滤，子 Agent 只检索自己写入的记忆，主 Agent 行为不变

## 五、总结

memory-lancedb-pro 的核心优势在**检索质量精细化**（cross-encoder rerank、MMR、长度归一化、自适应检索、噪声过滤），这些都是 Belldandy 当前检索管线中缺失的环节。

Belldandy 的核心优势在**自动化和深度**（文件自动索引、分块、深度检索、L0 摘要、会话自动提取、持久化缓存），这些是 memory-lancedb-pro 作为轻量插件不具备的。

两者互补性很强。P0 三项（自适应检索、硬截断、噪声过滤）和 P1 三项（Task-aware Embedding、长度归一化、内容语义分类）已全部实施完毕（2026-02-25），Belldandy 记忆检索的信噪比和精细度已显著提升。P2 的 Scope 隔离和 MMR 多样性去重已于 2026-02-26 实施，支持多 Agent 记忆隔离和跨文件语义去重。剩余 P2 项（Cross-encoder Rerank）可按需评估实施。
