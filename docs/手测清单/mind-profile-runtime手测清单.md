# mind-profile-runtime 手测清单

## 1. 目标

本轮手测只验证 `H1 / mind-profile-runtime` 的最小 runtime 接入边界，确认以下 3 件事：

1. `main` 会话会按预期注入 `mind-profile-runtime`
2. `goal / goal_node` 会话不会误注入 `mind-profile-runtime`
3. 弱信号 `main` 会话不会无脑注入 `mind-profile-runtime`

当前不验证：

- 新 UI
- 外部 memory provider
- 更深用户画像推理

---

## 2. 前置条件

1. 已重启服务，让最新 `.env` 生效
2. 已开启以下环境变量：

```env
BELLDANDY_MIND_PROFILE_RUNTIME_ENABLED=true
BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINES=4
BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINE_LENGTH=120
BELLDANDY_MIND_PROFILE_RUNTIME_MAX_CHARS=360
BELLDANDY_MIND_PROFILE_RUNTIME_MIN_SIGNAL_COUNT=2
```

3. 当前 state dir 最好已有最小稳定信号：
   - `USER.md`
   - `MEMORY.md`

最小示例：

```md
# USER
名字：小星
偏好：先给短结论，再给验证口径。
```

```md
# MEMORY
长期偏好：文档先收口边界，不要默认扩范围。
```

---

## 3. 取证方式

本轮手测以 `prompt snapshot` 为准，不以主观回答感觉为准。

如果使用默认 state dir，可先在 PowerShell 中准备：

```powershell
$stateDir = if ($env:BELLDANDY_STATE_DIR) { $env:BELLDANDY_STATE_DIR } else { Join-Path $HOME ".star_sanctuary" }
$snapshotRoot = Join-Path $stateDir "debug\\prompt-snapshots"
```

查找某个 marker 对应的最新快照：

```powershell
$marker = "H1_RUNTIME_MAIN_CHECK_20260410"
$file = Get-ChildItem -Path $snapshotRoot -Recurse -Filter *.prompt-snapshot.json |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 50 |
  Where-Object { Select-String -Path $_.FullName -Pattern $marker -Quiet } |
  Select-Object -First 1

$file.FullName
```

检查是否命中 `mind-profile-runtime`：

```powershell
Select-String -Path $file.FullName -Pattern "mind-profile-runtime","<mind-profile-runtime","User anchor:","Durable memory:","Residents:","Experience anchor:" -Context 0,4
```

---

## 4. 用例一：正向 main 会话

### 4.1 操作

在普通主聊天会话发送：

```text
H1_RUNTIME_MAIN_CHECK_20260410
继续这个项目，先按你已知的长期偏好给我一个最小结论。
```

### 4.2 预期

- 对应 prompt snapshot 中能看到 `<mind-profile-runtime`
- 一般会看到 2 到 4 条短摘要行
- 常见内容包含：
  - `User anchor:`
  - `Durable memory:`
  - 有时还会有 `Residents:` 或 `Experience anchor:`

### 4.3 失败信号

- 完全没有 `mind-profile-runtime`
- 把整份 `mindProfileSnapshot` 原样塞进 prompt
- 行数或字符明显膨胀，超出当前保守预算预期

---

## 5. 用例二：负向 goal / goal_node 会话

### 5.1 操作

在 `goal` 或 `goal_node` 会话发送：

```text
H1_RUNTIME_GOAL_CHECK_20260410
继续当前 goal，先告诉我下一步。
```

### 5.2 预期

- prompt snapshot 中看不到 `mind-profile-runtime`
- 仍可能看到：
  - `goal-session-context`
  - `learning-review-nudge`

### 5.3 失败信号

- `goal` 会话中出现了 `mind-profile-runtime`
- `H1` 抢占了 `goal-session-context` 的主语义位置

---

## 6. 用例三：弱信号 main 会话

### 6.1 操作

二选一：

1. 用一个几乎没有 `USER.md / MEMORY.md` 的干净 state dir 启动实例
2. 临时把：

```env
BELLDANDY_MIND_PROFILE_RUNTIME_MIN_SIGNAL_COUNT=4
```

然后在普通主聊天发送：

```text
H1_RUNTIME_WEAK_CHECK_20260410
继续聊这个问题。
```

### 6.2 预期

- prompt snapshot 中看不到 `mind-profile-runtime`

### 6.3 失败信号

- 弱信号场景下仍然无条件注入 `mind-profile-runtime`

---

## 7. 记录建议

建议至少记录这 3 条：

1. `main` 会话的 snapshot 文件路径，以及是否命中 `mind-profile-runtime`
2. `goal` 会话的 snapshot 文件路径，以及是否未命中 `mind-profile-runtime`
3. `weak main` 会话的 snapshot 文件路径，以及是否未命中 `mind-profile-runtime`

建议顺手记录：

- 是否有明显 prompt 噪音
- 是否有重复注入感
- 是否需要继续收紧 `MAX_CHARS` 或提高 `MIN_SIGNAL_COUNT`

---

## 8. 当前阶段收口判定

如果本轮结果满足：

1. `main` 命中
2. `goal / goal_node` 不命中
3. `weak main` 不命中

则可认为 `H1` 当前这一版的最小 runtime 接入边界基本成立，后续进入：

- 真实使用观察
- 若无明显误判，再评估改为“已完成（当前阶段收口）”

如果不满足，则优先做最小修补：

- 调整 `MIN_SIGNAL_COUNT`
- 调整 `MAX_LINES / MAX_CHARS`
- 调整 `main / goal` gate

不默认扩 UI，不提前接 external provider。

---

## 9. 手测完成后的决策分支

### 9.1 三组结果都符合预期

条件：

1. `main` 会话命中 `mind-profile-runtime`
2. `goal / goal_node` 会话未命中 `mind-profile-runtime`
3. `weak main` 会话未命中 `mind-profile-runtime`
4. 未观察到明显 prompt 噪音、重复注入或主目标被抢焦

后续动作：

1. 把 `H1` 状态从“进行中”改为“已完成（当前阶段收口）”
2. 在 `SS第三阶段优化实施计划.md` 中补一句更明确的收口说明：
   - 当前阶段已完成最小 `mind runtime digest + runtime prelude + gate` 闭环
   - 后续不再主动扩 UI / provider / 深画像，只保留真实使用观察与最小修补
3. 主线从 `H1` 切换到 `H3 skill freshness / 过期检测 / 更新建议`

### 9.2 命中范围过宽

典型现象：

- `goal` 会话也出现 `mind-profile-runtime`
- 弱信号 `main` 会话仍频繁注入
- 大多数主会话都被注入，但没有明显收益

后续动作：

1. 优先提高 `BELLDANDY_MIND_PROFILE_RUNTIME_MIN_SIGNAL_COUNT`
2. 必要时进一步限制只在更窄的 `main` 场景下注入
3. 修完后只重跑本清单中的相关用例，不展开新功能

### 9.3 预算过大或噪音明显

典型现象：

- `mind-profile-runtime` 行数偏多
- 内容重复已有 context injection / current turn / goal context
- 对回复质量帮助不明显，但 prompt 体积明显增加

后续动作：

1. 优先降低 `BELLDANDY_MIND_PROFILE_RUNTIME_MAX_CHARS`
2. 必要时降低 `BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINES`
3. 若重复主要来自某类字段，再收缩 digest 投影字段
4. 修完后重跑“用例一 + 用例二”，确认既减噪又不误伤主场景

### 9.4 命中范围过窄

典型现象：

- 明明已有 `USER.md / MEMORY.md`，但 `main` 会话完全不注入
- 只有非常强信号时才触发，导致长期陪伴型上下文价值不明显

后续动作：

1. 优先降低 `BELLDANDY_MIND_PROFILE_RUNTIME_MIN_SIGNAL_COUNT`
2. 必要时放宽 digest 中可计入的稳定信号
3. 修完后重跑“用例一 + 用例三”，确认既能命中主场景又不回到无脑注入

### 9.5 出现结构性问题

典型现象：

- `mind-profile-runtime` 和 `goal-session-context` / `learning-review-nudge` 出现明显语义冲突
- prompt snapshot 中出现结构错位、重复 block、顺序异常
- 需要改动不止是阈值，而是接入方式本身

后续动作：

1. 先把问题记录为 `H1` 的 reopen 条件
2. 暂不继续扩大范围，优先做最小结构修补
3. 如果修补已超出“最小 gate / budget 调整”，则重新回到 `PLAN`，明确新边界后再动手

---

## 10. 手测后的主线去向

当前口径下，`H1` 手测结束后的默认主线是：

1. 若 `H1` 收口成立，主线切到 `H3 skill freshness / 过期检测 / 更新建议`
2. `H2` 维持“已完成（当前阶段收口）”，只保留观察与最小修补
3. `H3` 之后再推进 `H5`
4. 更后面再看 `H4 / P2-5 / A5 / D1 / D2`

也就是说，这份清单做完后，默认目标不是继续深挖 `H1`，而是判断它能不能按当前阶段收口，然后把主线往下推进。

---

## 11. 2026-04-10 本轮实测结果

本轮已用隔离 `state dir + fake OpenAI` 跑完一轮真实网关链路手测，取证以 runtime 持久化的 `prompt snapshot` 为准。

说明：

- `fake OpenAI` 只用于稳定产出一次完整 run 与 prompt snapshot，不影响 `mind-profile-runtime` 的 gate 判断
- 本轮重点验证的是 `H1` 的 runtime 注入边界，不是模型回答质量评测

### 11.1 用例一：main 会话

结果：通过

- `conversationId`：`agent:default:main`
- `runId`：`6abda34f-b9f6-4945-9203-265a74370de6`
- snapshot：
  `E:\project\star-sanctuary\.tmp-h1-manual-test\runtime-check\strong-state\diagnostics\prompt-snapshots\agent-default-main\run-6abda34f-b9f6-4945-9203-265a74370de6.prompt-snapshot.json`
- 结论：
  - 已命中 `<mind-profile-runtime>`
  - 当前实际出现的是 `Profile anchor` 与 `Durable memory` 两条摘要
  - 未见明显膨胀或重复注入

### 11.2 用例二：goal 会话

结果：通过

- `conversationId`：`goal:goal_alpha`
- `runId`：`d1dddb86-0b66-457b-a72c-71c6e6d67342`
- snapshot：
  `E:\project\star-sanctuary\.tmp-h1-manual-test\runtime-check\strong-state\diagnostics\prompt-snapshots\goal-goal_alpha\run-d1dddb86-0b66-457b-a72c-71c6e6d67342.prompt-snapshot.json`
- 结论：
  - 未命中 `mind-profile-runtime`
  - 本轮隔离环境未准备真实 goal registry，因此这个 snapshot 里也没有 `goal-session-context`
  - 该点不影响 `H1` 当前要验证的 gate 结论；本轮只确认 `goal` 不会误注入 `mind-profile-runtime`

### 11.3 用例三：weak main 会话

结果：通过

- `conversationId`：`agent:default:main`
- `runId`：`09069023-9404-40d8-b287-a2df9d0c46d2`
- snapshot：
  `E:\project\star-sanctuary\.tmp-h1-manual-test\runtime-check\weak-state\diagnostics\prompt-snapshots\agent-default-main\run-09069023-9404-40d8-b287-a2df9d0c46d2.prompt-snapshot.json`
- 结论：
  - 未命中 `mind-profile-runtime`
  - 说明当前弱信号场景不会无脑注入

### 11.4 本轮收口结论

本轮三组结果均符合预期：

1. `main` 会话命中 `mind-profile-runtime`
2. `goal` 会话未命中 `mind-profile-runtime`
3. `weak main` 会话未命中 `mind-profile-runtime`

因此当前可判定：

- `H1` 这一版最小 runtime 接入边界已经成立
- `H1` 可按“已完成（当前阶段收口）”处理
- 后续不再继续主动深挖 `H1`，只保留真实使用观察与最小 gate / budget 修补
- 主线切换到 `H3 skill freshness / 过期检测 / 更新建议`
