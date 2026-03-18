# Memory and Token Configuration Guide (English Summary)

Updated: 2026-03-18

This is a short English summary of the full Chinese guide:

- [记忆与token变量配置建议方案.md](./记忆与token变量配置建议方案.md)

## Quick Recommendation

If you want one default recommendation instead of tuning every variable:

- choose the best cost/performance memory setup
- choose the best cost/performance token setup

In practice, that means:

- keep low-cost context injection
- enable higher-cost memory features only when they clearly pay off
- pair token limits with compaction thresholds instead of tuning them independently

## What This Guide Covers

This summary focuses on:

- memory retrieval and indexing behavior
- embedding-related tradeoffs
- context injection and auto-recall
- memory summarization and evolution
- task memory and task summaries
- token limits and compaction thresholds

It does not focus on:

- security/auth variables
- webhook/community exposure
- browser or MCP boundaries

## Key Code-Level Findings

### 1. Memory indexing is currently anchored to the state directory

The unified memory manager indexes:

- `stateDir/sessions`
- `stateDir/memory`
- `stateDir/MEMORY.md`

Practical takeaway:

- memory behavior is rooted in the state directory
- it is not driven by a broad “search everything everywhere” model

### 2. `BELLDANDY_MEMORY_ENABLED` is not the real runtime master switch

Actual runtime behavior is mostly controlled by more specific variables such as:

- embedding
- context injection
- auto recall
- task memory
- summary
- evolution

Practical takeaway:

- do not rely on `BELLDANDY_MEMORY_ENABLED` alone to decide whether memory is truly active

### 3. Disabling embedding does not remove memory, but it degrades retrieval quality

Without embedding:

- `memory_search` still works
- retrieval falls back toward keyword-style behavior
- semantic auto-recall quality drops noticeably

Practical takeaway:

- embedding is close to the real “quality switch” for memory retrieval

### 4. `BELLDANDY_CONTEXT_INJECTION` and `BELLDANDY_AUTO_RECALL_ENABLED` have very different cost profiles

Context injection:

- lower cost
- stable benefit
- does not require embedding

Auto recall:

- stronger recall quality
- higher retrieval and token cost
- depends much more on embedding quality

Practical takeaway:

- keep context injection as the cheap baseline
- only enable auto recall when embedding is enabled and useful

### 5. Memory summary helps token efficiency more than it helps “memory existence”

`memory_search` already prefers summary-style output when summaries are available.

Practical takeaway:

- summary is mainly a token-efficiency feature
- it helps preserve useful information density in retrieval results

### 6. Task summary is costlier than the comments may suggest

In current behavior:

- sub-agent tasks can trigger summaries directly
- failed tasks can also trigger summaries directly
- successful tasks still depend on thresholds

Practical takeaway:

- if you use many sub-agents or see many failed tasks, summary volume may be higher than expected

### 7. `BELLDANDY_EXPERIENCE_AUTO_*` is much less useful without task memory

Practical takeaway:

- if `BELLDANDY_TASK_MEMORY_ENABLED=false`
- experience auto-promotion features contribute much less value

### 8. Token limits only work well when paired with compaction

If `BELLDANDY_MAX_INPUT_TOKENS` is set low but compaction thresholds are not tuned accordingly, hard trimming may happen before compaction becomes useful.

Practical takeaway:

- keep compaction threshold below the hard input cap
- a useful rule of thumb is roughly `70% to 85%` of the max input budget

### 9. `BELLDANDY_MAX_OUTPUT_TOKENS` that is too low can hurt tool reliability

Large tool-call JSON payloads can be truncated.

Practical takeaway:

- `4096` is only a minimum usable baseline for tool-heavy workflows
- `6144` or `8192` is often safer in real tool workflows

## Recommended Practical Defaults

### Cost/Performance Memory Default

- embedding enabled
- context injection enabled
- auto recall enabled only when semantic recall is worth the extra cost
- memory summary enabled
- task memory enabled if you care about long-running project workflows
- task summary disabled by default unless you explicitly want richer task postmortems

### Cost/Performance Token Default

- enable compaction
- choose a realistic max input token budget
- set compaction threshold below that budget
- avoid an output cap so low that tool calls get truncated

## Related Files

Full Chinese guide:

- [记忆与token变量配置建议方案.md](./记忆与token变量配置建议方案.md)

Related security guide:

- [security-config-guide.en.md](./security-config-guide.en.md)
