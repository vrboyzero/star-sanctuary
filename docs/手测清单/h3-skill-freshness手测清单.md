# H3 Skill Freshness 手测清单

## 1. 目标

- 验证 `H3` 第一版是否已经形成最小闭环：
  - 已有正式 `skill` 能给出 `healthy / warn_stale / needs_patch`
  - 新缺口 `skill candidate` 能给出 `needs_new_skill`
  - `doctor / candidate / usage / task usedSkills` 四处结果基本一致
  - 人工 stale mark 可设置、可取消、可持久化

## 2. 手测前准备

- 准备 3 类样本：
  - 一个已接受、近期使用正常的 `skill`
  - 一个已接受、近期多次失败或成功率偏低的 `skill`
  - 一个待审 `skill candidate`
- 待审 `skill candidate` 分两种：
  - 名称或主题明显对应已有正式 `skill`，用于验证 `needs_patch`
  - 名称或主题不对应任何已有正式 `skill`，用于验证 `needs_new_skill`

## 3. Doctor 总览

1. 打开 `doctor`
2. 查看是否出现 `Skill Freshness` 卡片
3. 确认卡片中是否可见：
   - `healthy / warn / patch / new` 统计
   - top 风险项
   - 每个风险项的一句摘要

预期：

- 正常 `skill` 计入 `healthy`
- 旧 `skill` 风险计入 `warn` 或 `patch`
- 新缺口 candidate 计入 `new`

## 4. 已接受 Skill 详情

1. 在记忆查看中打开一个已接受的 `skill candidate`
2. 查看详情面板里的 `Skill Freshness`
3. 确认是否可见：
   - 状态标签：`稳定 / 快过期 / 需要补丁 / 需要新增`
   - 摘要说明
   - 触发信号
   - 建议动作

预期：

- 正常 `skill` 显示“稳定”
- 失败较多或成功率偏低的 `skill` 显示“快过期”或“需要补丁”

## 5. Usage 视图

1. 打开 `experience usage` 相关区域
2. 查看：
   - `Hot Skills`
   - usage detail
   - task detail 中的 `usedSkills`
3. 确认 skill 项上是否可见 freshness 状态或摘要

预期：

- 同一个 `skill` 在 `doctor / candidate detail / usage detail / task usedSkills` 中状态一致
- 不应出现 `doctor` 显示 `needs_patch`，但 usage detail 完全没有提示

## 6. Patch Candidate 判定

1. 准备一个待审 `skill candidate`
2. 让它的名称或主题明显对应已有正式 `skill`
3. 打开 `doctor` 和该 candidate 详情

预期：

- 已有正式 `skill` 被判成 `needs_patch`
- 待审 candidate 的建议偏向“审阅 patch candidate”
- `doctor` 中出现对应风险项

## 7. 新 Skill 缺口判定

1. 准备一个待审 `skill candidate`
2. 让它不对应任何已接受 `skill`
3. 打开 `doctor` 和该 candidate 详情

预期：

- 该项被判成 `needs_new_skill`
- `doctor` 里 `new` 计数增加
- 建议动作偏向“审阅 new skill candidate”

## 8. 人工 Stale Mark

1. 对一个已接受 `skill` 调用 `experience.skill.freshness.update`
2. 参数示例：

```json
{
  "sourceCandidateId": "<accepted-skill-candidate-id>",
  "reason": "手测发现说明已经过时",
  "markedBy": "tester",
  "stale": true
}
```

3. 再次打开：
   - `doctor`
   - `experience.candidate.get`
   - 相关 usage detail

预期：

- 该 `skill` 出现“人工标记”痕迹
- `manual stale mark` 生效
- 刷新后结果仍保留，不应丢失

## 9. 取消人工 Stale Mark

1. 再调用一次：

```json
{
  "sourceCandidateId": "<accepted-skill-candidate-id>",
  "stale": false
}
```

2. 刷新 `doctor` 与详情

预期：

- 人工标记消失
- 状态回到由真实 `usage / candidate` 信号决定的结果

## 10. 一致性回归

- 重点核对这 4 处是否一致：
  - `system.doctor`
  - `experience.candidate.get`
  - `experience.usage.stats / get`
  - `memory.task.get` 的 `usedSkills`

预期：

- 同一个 `skill` 的 `status / summary / suggestion` 基本一致
- 不应出现某处有 `skillFreshness`，另一处完全没有

## 11. 当前不作为失败项

- 以下内容当前不算 `H3` 第一版失败：
  - 尚未纳入 `resume / takeover` 信号
  - 尚未做自动 patch draft
  - `skills` 文本工具输出里尚未显示 freshness

## 12. 自动化验证记录

- 本轮记录时间：
  - 2026-04-10
- 已通过模块单测：
  - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/skill-freshness.test.ts`
- 已通过 server 集成测试：
  - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.test.ts -t "server exposes skill freshness across doctor, candidate, usage, and task payloads"`
  - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.test.ts -t "usage-only manual stale"`
- 已通过构建验证：
  - `corepack pnpm build`
- 当前结论：
  - 自动化层面已确认 `skillFreshness` 可贯通 `doctor / candidate / usage / task usedSkills`
  - 下一步重点转向真实手测，不再把自动化补充当作主要阻塞项

## 13. 通过标准

- `H3` 第一版手测可判“通过”，至少满足：
  - `doctor` 能稳定看到 `Skill Freshness`
  - 已接受 `skill` 能显示 `healthy / warn_stale / needs_patch`
  - 新缺口 candidate 能显示 `needs_new_skill`
  - 人工 stale mark 可设置、可取消、可持久化
  - `doctor / candidate / usage / task usedSkills` 四处结果基本一致

## 14. 本轮真实手测结果

- 手测日期：
  - 2026-04-10
- 手测环境：
  - 本地网关临时以 `BELLDANDY_AUTH_MODE=none`
  - `BELLDANDY_COMMUNITY_API_ENABLED=false`
  - 启动 WebChat 于 `http://127.0.0.1:28889/`
- 本轮真实样本：
  - 待审 `skill candidate`：`exp_8c25230e`
    - 标题：`Read HEARTBEAT.md if it exists. Follow it strictly. 技能草稿`
  - 历史 usage-only skill：`web-monitor`
    - 关联 usage：`78a907c9-f786-4db7-9917-a9c8f72843fc`
    - 关联任务：`task_8c4e9a82`
- 真实验证结论：
  - 通过：`doctor` 总览可见 `Skill Freshness`
    - 实际看到 `healthy 0 / warn 0 / patch 0 / new 71`
  - 通过：真实待审 `skill candidate` 在 `experience.candidate.list / get` 中返回 `needs_new_skill`
  - 初次失败后已修补：usage-only skill 的人工 stale mark
    - 初次手测时，对 `web-monitor` 调 `experience.skill.freshness.update(stale=true)` 后，`doctor / usage / task` 都没有反映
    - 已补 usage-only fallback，并补单测、server 集测、构建验证
  - 修补后复测通过：
    - 对 `web-monitor` 再次设置人工 stale mark 后，`system.doctor` 变为 `healthy 0 / warn 1 / patch 0 / new 71`
    - `experience.usage.stats / get` 与 `memory.task.get.usedSkills` 对同一 `web-monitor` 都返回 `warn_stale`
    - Web 端现有 `usage overview` 中，`web-monitor` 已显示 `快过期`
    - Web 端 `settings -> doctor` 中，`Skill Freshness` 摘要已显示 `warn 1`
  - 通过：取消人工 stale mark
    - 清除后 `system.doctor` 回到 `healthy 0 / warn 0 / patch 0 / new 71`
    - 本次手测残留状态已回滚
- 当前仍需说明的边界：
  - 本轮真实状态目录里没有自然存在的 accepted `skill candidate`
  - 因此 `accepted -> needs_patch` 与 accepted candidate detail 的真实样本未在本轮 live 数据中直接命中
  - 这一路径当前由定向自动化样本覆盖，不再阻塞 `H3` 第一版收口
- 本轮结论：
  - `H3` 第一版已可判“通过”
  - 当前按“已完成（当前阶段收口）”处理，后续只保留真实使用观察与最小修补
