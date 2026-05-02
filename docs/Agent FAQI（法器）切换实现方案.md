# Agent FAQI（法器）切换实现方案

## 0. 当前实现进度

截至当前版本，本方案已经完成第一轮代码落地，当前状态如下：

- 已实现 FAQI 全局法器库解析：
  - `~/.star_sanctuary/faqis/*.md`
- 已实现 FAQI 状态文件读写：
  - `~/.star_sanctuary/faqis-state.json`
- 已实现启动时按 `currentFaqi` 合成 Agent 最终 `toolWhitelist`
- 已实现 `list_faqis`
- 已实现 `switch_faqi`
- 已实现 `switch_faqi` 只切换当前 Agent 自己的 `currentFaqi`
- 已实现 FAQI 失效时回退到旧 `toolWhitelist`
- 已实现 FAQI 管理工具白名单保留放行，避免 Agent 把自己锁死
- 已实现 FAQI 工具进入核心可见工具集合，避免首次切换时还要先额外展开 deferred tool

当前已经落地的主要代码位置：

- `packages/belldandy-skills/src/faqi.ts`
- `packages/belldandy-skills/src/builtin/list-faqis.ts`
- `packages/belldandy-skills/src/builtin/switch-faqi.ts`
- `packages/belldandy-core/src/bin/gateway.ts`
- `packages/belldandy-core/src/task-dedup.ts`

当前已经完成的验证：

- FAQI 单元测试已通过
- `task-dedup` 回归测试已通过
- `packages/belldandy-skills` 与 `packages/belldandy-core` 的 TypeScript build 已通过
- 真实 Gateway 手工验证已通过

本轮真实 Gateway 手工验证结果如下：

- 启动方式：
  - 由于本机 `.env` 使用 `BELLDANDY_AUTH_MODE=token` 但未配置 token 值，验证时通过临时环境变量注入 `BELLDANDY_AUTH_TOKEN=codex-faqi-test-token` 启动 Gateway
- 基线验证：
  - 在 `faqis-state.json` 不存在时，`coder` 真实可见工具为 29 个，继续走旧 `toolWhitelist`
- FAQI 收窄验证：
  - 临时创建 `~/.star_sanctuary/faqis/codex-test-narrow.md`
  - 其中只声明 `file_read` 与 `list_files`
  - 将 `coder.currentFaqi` 指向 `codex-test-narrow` 并重启 Gateway 后
  - `coder` 真实可见工具收窄为 5 个：
    - `file_read`
    - `list_files`
    - `list_faqis`
    - `switch_faqi`
    - `tool_search`
  - 启动日志明确输出：
    - `Agent "coder" using FAQI "codex-test-narrow" (2 tools)`
- FAQI 失效回退验证：
  - 将 `coder.currentFaqi` 改为不存在的 `codex-missing-faqi` 并重启 Gateway 后
  - `coder` 真实可见工具恢复到原来的 29 个
  - 启动日志明确输出回退告警：
    - `falling back to toolWhitelist`
- 环境恢复：
  - 验证结束后，已删除临时 `faqis-state.json`
  - 已删除临时 `codex-test-narrow.md`
  - Gateway 当前已恢复到“无 FAQI 状态文件”的基线状态

本轮未覆盖但已明确边界的点：

- 没有额外走一轮 `message.send -> Agent 自主调用 switch_faqi`
- 原因不是功能缺失，而是当前 `coder` 的工具控制模式为 `confirm`，`switch_faqi` 又属于高风险确认型工具，这会额外引入“确认机制链路”变量，和本轮 FAQI 主链路验证目标不同
- `switch_faqi` 的状态写入逻辑已经由单元测试覆盖，本轮运行态已验证它在真实 Gateway 中持续可见且不会被 FAQI 自锁

运行期验证日志位置：

- `E:\project\star-sanctuary\.tmp-codex\gateway-faqi-stdout.log`
- `E:\project\star-sanctuary\.tmp-codex\gateway-faqi-stderr.log`

因此当前结论是：

- **代码主链路已实现**
- **静态测试、编译验证、真实 Gateway 手工验证均已通过**
- **FAQI 的启动装配、收窄生效、失效回退三条核心链路已跑通**

## 1. 需求确认

本方案基于以下已确认前提编写：

- 我对需求的理解是正确的
- 本次实现不改 FACET 相关功能代码
- FACET 只是参考交互模式，不参与本功能实现
- 新功能正式命名为：
  - 中文：**法器**
  - 英文：**FAQI**
- FAQI 定义与当前选择必须分开理解
- 所有 FAQI 文件统一放在 `~/.star_sanctuary/faqis/`
- 本期不做、近期也不做的范围已经固定，不再扩展

本次需求的核心目标是：

**把 Agent 的工具权限，从静态一套 `toolWhitelist`，升级成可切换多套 FAQI。**

---

## 2. 现状结论

基于当前代码与 `C:\Users\admin\.star_sanctuary\agents.json`，现状如下：

- FACET 通过 `switch_facet` 工具切换 `SOUL.md` 锚点后的内容
- `toolWhitelist` 目前只存在于 `agents.json` 中
- Agent 工具权限判断发生在 Gateway 运行时，通过 `agentRegistry.getProfile(agentId)` 读取 `toolWhitelist`
- `agents.json` 当前是在 Gateway 启动时加载，修改后需要重启才重新生效
- `default` Agent 的工作区直接走 `~/.star_sanctuary/`
- 非 `default` Agent 的专属工作区走 `~/.star_sanctuary/agents/{agentId}/`
- FAQI 更适合做成全局共享的法器定义库，由各 Agent 分别选择当前 FAQI

因此，FAQI 不适合硬绑定到 FACET 代码，也不适合做成运行时直接复用 FACET 的替换逻辑。

---

## 3. FAQI 的目标定义

### 3.1 FAQI 是什么

FAQI 是 Agent 的“工具集合模组”。

一个 FAQI = 一组工具集合 = 一套可生效的 `toolWhitelist`。

### 3.2 FAQI 解决什么问题

它解决的是：

- 同一个 Agent 在不同工作模式下，需要切换不同工具边界
- 但不希望每次都手改 `agents.json` 里的整段 `toolWhitelist`

### 3.3 FAQI 不解决什么问题

FAQI 不负责：

- 人格切换
- SOUL 内容切换
- 不同会话自动切换
- 多个 FAQI 叠加组合
- 复杂权限继承链

这些都不属于本期范围。

---

## 4. FAQI 与 FACET 的关系

两者关系明确如下：

- FACET：人格 / 职能模组
- FAQI：工具集合模组

两者相似点：

- 都是“预定义多个模组，再切换当前生效项”
- 都使用独立文件存放模组内容

两者不同点：

- FACET 生效目标是 `SOUL.md`
- FAQI 生效目标是 Agent 当前工具白名单
- FACET 当前已支持工具切换
- FAQI 本次新增，不复用 FACET 的功能代码

---

## 5. 目录与文件布局

### 5.1 FAQI 文件目录

FAQI 文件目录统一固定为：

- `~/.star_sanctuary/faqis/`

这条规则明确按最新确认的要求执行：

- `default` Agent 不走 `agents/default/`
- 非 `default` Agent 也不单独维护 `agents/{agentId}/faqis/`
- 所有 Agent 共用同一个 FAQI 定义库
- 各 Agent 只分别维护自己的 `currentFaqi`

### 5.2 FAQI 文件命名

FAQI 文件采用一文件一法器：

- `safe-dev.md`
- `full-dev.md`
- `browser-only.md`
- `research-docs.md`

文件名即 FAQI 名称，不带 `.md` 后缀参与切换。

### 5.3 FAQI 文件作用

每个 FAQI 文件只负责声明：

- 这个 FAQI 的名称
- 可选的用途说明
- 这套 FAQI 对应的工具列表

它不负责写 Agent 基础信息，也不负责写模型配置。

---

## 6. FAQI 定义与当前选择

FAQI 必须拆成两层：

### 6.1 FAQI 定义

FAQI 定义表示：

- 这个 Agent 有哪些可选法器
- 每个法器各自对应哪些工具

FAQI 定义来自 FAQI 文件本身。

### 6.2 当前选择

当前选择表示：

- 这个 Agent 现在正在使用哪一个 FAQI

当前选择不写死在 FAQI 文件里，而是单独记录。

这样做的原因：

- FAQI 文件是“候选集合”
- 当前选择是“运行时状态”
- 两者职责不同，不应混在一起

---

## 7. 首版技术策略

### 7.1 总体策略

首版采用：

- **文件化 FAQI 定义**
- **状态化当前选择**
- **启动时解析并注册到 Agent Profile**
- **修改后通过重启生效**

这样做有几个直接好处：

- 与当前 `agents.json` 的加载机制一致
- 不需要改 FACET 代码
- 不需要引入复杂热更新
- 风险低，回滚简单

### 7.2 为什么首版不做运行时热切

当前 Agent Profile 与 `toolWhitelist` 是启动时加载进 `agentRegistry` 的。

工具权限判断依赖：

- `agentRegistry.getProfile(agentId)`

而不是每次调用工具时重新解析文件。

因此，首版若想稳定实现 FAQI，最合理的方式是：

- 切换 FAQI 时更新 Agent 配置状态
- 明确提示重启 Gateway
- 重启后按新的 FAQI 生效

这和当前 `agents.json` 的行为完全一致，符合现有系统结构。

---

## 8. 配置结构设计

### 8.1 `agents.json` 的处理原则

首版不在 `agents.json` 中新增 FAQI 相关字段。

也就是说：

- 不增加 `faqiEnabled`
- 不增加 `defaultFaqi`
- 不要求在 `agents.json` 里声明 `currentFaqi`

### 8.2 推荐口径

首版建议：

- `agents.json` 继续只保留原有 Agent Profile 配置
- FAQI 是否生效，直接看这个 Agent 有没有有效的 `currentFaqi`
- 当前 FAQI 选择全部写入独立状态文件

这样做的好处是：

- 配置更少
- 用户理解更简单
- 代码分支更少
- 不需要维护“默认 FAQI”这层概念

### 8.3 `agents.json` 的唯一兜底职责

在这个简化版里，`agents.json` 中与 FAQI 相关的唯一保留点是：

- 旧 `toolWhitelist`

也就是说：

- FAQI 有效时，用 FAQI 对应工具集合
- FAQI 无效或不存在时，回退到旧 `toolWhitelist`

这里的关键点是：

- FAQI 定义是全局共享的
- `currentFaqi` 是按 Agent 分别记录的
- `toolWhitelist` 是最终兜底

---

## 9. 当前 FAQI 状态文件设计

### 9.1 为什么需要独立状态文件

当前 FAQI 选择本质上是运行状态，而不是长期静态定义。

如果直接回写 `agents.json`，会带来几个问题：

- 手工编辑配置和运行时切换容易冲突
- 每次切换都要改配置主文件
- 会把本来很简单的“当前法器状态”混进静态 Profile 配置里

因此建议引入一个专用状态文件。

### 9.2 状态文件位置

建议路径：

- `~/.star_sanctuary/faqis-state.json`

### 9.3 状态文件结构

建议按 Agent 维度记录：

```json
{
  "agents": {
    "default": {
      "currentFaqi": "safe-dev"
    },
    "coder": {
      "currentFaqi": "full-dev"
    },
    "researcher": {
      "currentFaqi": "research-docs"
    }
  }
}
```

### 9.4 状态解析规则

系统启动时：

1. 先读 `agents.json`
2. 再读 `faqis-state.json`
3. 为每个 Agent 计算最终 FAQI

优先级固定为：

1. `faqis-state.json` 中的 `currentFaqi`
2. 回退到旧 `toolWhitelist`

补充固定规则：

- 如果 `currentFaqi` 存在且可解析，直接使用
- 如果 `currentFaqi` 不存在、为空或解析失败，直接回退到旧 `toolWhitelist`

---

## 10. FAQI 文件格式设计

### 10.1 首版文件格式选择

首版建议 FAQI 文件使用 `md`。

原因：

- 和 FACET 心智一致
- 用户容易直接编辑
- 可读性强
- 无需引入脚本执行风险

你前面允许未来用脚本形式记录，但首版不建议做脚本执行。

### 10.2 FAQI 文件内容建议

FAQI 文件采用“头部元数据 + 工具列表正文”的轻量格式。

建议形态如下：

```md
# 【FAQI | 法器 | safe-dev】

用途：安全开发模式

## tools

- file_read
- file_write
- list_files
- apply_patch
- log_read
- log_search
```

### 10.3 解析策略

首版解析建议保持简单：

- 标题只做展示，不强依赖
- 重点从 `## tools` 段提取工具名
- 工具项采用 `- tool_name` 逐行列出

这样解析器足够稳，也便于手写维护。

### 10.4 非法格式处理

当 FAQI 文件内容不合法时：

- 该 FAQI 视为不可用
- 启动日志给出错误
- 运行时回退到旧 `toolWhitelist`

---

## 11. 最终工具白名单计算规则

每个 Agent 的最终工具白名单，按下面固定顺序计算：

1. 尝试从 `faqis-state.json` 读取该 Agent 的 `currentFaqi`
2. 如果 `currentFaqi` 存在且可解析
   - 使用 FAQI 对应工具列表
3. 如果 `currentFaqi` 不存在、为空或解析失败
   - 回退到原 `toolWhitelist`

这个规则能保证：

- 旧系统兼容
- FAQI 配坏时不至于把 Agent 完全切废
- 逻辑足够简单

---

## 12. 切换工具设计

### 12.1 需要新增的工具

建议新增一个独立工具：

- `switch_faqi`

它的职责是：

- 在全局 `faqis/` 中查找目标 FAQI
- 校验目标 FAQI 文件是否存在且可解析
- 基于 `context.agentId` 更新该 Agent 自己在 `faqis-state.json` 中的 `currentFaqi`
- 返回切换结果
- 明确提示需要重启 Gateway 才会完全生效

它的权限边界明确为：

- 当前 Agent 只能切换自己的 `currentFaqi`
- 不提供切换其他 Agent FAQI 的能力

### 12.2 是否需要列表工具

首版建议再补一个只读工具：

- `list_faqis`

它的职责是：

- 列出全局可用 FAQI
- 标记当前 FAQI
- 标记默认 FAQI

这能明显提升可用性，也有助于排障。

### 12.3 不建议首版做的工具

首版不建议做：

- `create_faqi`
- `delete_faqi`
- `edit_faqi`
- `switch_agent_faqi`

这些都不属于本期必要范围。

---

## 13. 模块改动范围

### 13.1 `packages/belldandy-agent`

需要改动：

- `src/agent-profile.ts`

职责：

- 扩展 AgentProfile 类型
- 保持旧字段兼容

建议新增：

- `src/faqi.ts`

职责：

- 解析 FAQI 文件
- 解析 FAQI 状态文件
- 计算 Agent 最终 FAQI 与最终工具白名单
- 统一处理全局 FAQI 定义库

### 13.2 `packages/belldandy-core`

需要改动：

- `src/bin/gateway.ts`

职责：

- 启动时加载 FAQI 状态
- 合成每个 Agent 的最终 `toolWhitelist`
- 注册进 `agentRegistry`
- 启动时确保 FAQI 目录存在

建议新增：

- `src/faqi-state.ts`

职责：

- 读写 `faqis-state.json`
- 提供轻量状态访问封装

### 13.3 `packages/belldandy-skills`

建议新增：

- `src/builtin/switch-faqi.ts`
- `src/builtin/list-faqis.ts`

职责：

- FAQI 列表与切换工具实现

并在：

- `src/index.ts`

中导出

然后在 Gateway 工具池里注册。

### 13.4 文档层

需要改动：

- [docs/agents.json配置说明.md](/E:/project/star-sanctuary/docs/agents.json配置说明.md)
- 新 FAQI 方案文档
- 必要时 README 中关于 Agent 工具边界的说明

---

## 14. 路径解析规则

建议新增统一路径解析函数，规则如下：

### 14.1 FAQI 目录

- FAQI 目录固定为：`{stateDir}/faqis`

### 14.2 Agent 状态维度

- FAQI 文件来源是全局共享的
- 但 `currentFaqi` 仍按 Agent 分别计算

### 14.3 路径安全要求

FAQI 名称必须禁止：

- `/`
- `\`
- `..`

避免路径穿越。

这部分策略可直接参考 `switch_facet` 当前的参数校验方式。

---

## 15. 启动时初始化建议

Gateway 启动时增加以下初始化动作：

1. 确保根目录下 `faqis/` 存在
2. 尝试加载 `faqis-state.json`
3. 解析全局 FAQI 定义库
4. 按 Agent 计算各自最终 FAQI
5. 计算最终 `toolWhitelist`
6. 将合成后的 Profile 注册进 `agentRegistry`

这样可以保证 FAQI 和 Agent Profile 在同一时刻完成装配。

---

## 16. 运行时行为设计

### 16.1 `switch_faqi` 执行后

首版行为建议是：

- 只更新 `faqis-state.json`
- 不直接热改内存中的 `agentRegistry`
- 返回明确提示：
  - 已切换到哪个 FAQI
  - 当前 Agent 是谁
  - 需要调用 `service_restart` 或重启 Gateway 才会完全生效

### 16.2 为什么不热改 `agentRegistry`

理论上可以做运行时覆盖，但首版不建议。

原因：

- 会引入额外状态同步复杂度
- 需要确认所有 Agent 实例缓存何时失效
- 需要考虑当前会话和既有实例的边界
- 现有系统本来就接受“改 `agents.json` 后重启”

所以首版直接沿用现有生效模型更稳。

---

## 17. 测试与验证计划

### 17.1 Unit

建议新增单元测试覆盖：

- FAQI 文件解析成功
- FAQI 文件格式错误回退
- 全局 FAQI 路径解析正确
- FAQI 失效时回退到旧 `toolWhitelist`
- `switch_faqi` 参数非法时失败
- `switch_faqi` 只修改当前 Agent 的 `currentFaqi`

### 17.2 Integration

建议补集成验证：

- 启动时读取 `agents.json + faqis-state.json + faqis/*.md`
- 合成后的 Agent Profile 工具白名单符合预期
- `list_faqis` 能列出当前 Agent FAQI
- `switch_faqi` 能写入状态文件

### 17.3 Manual

手动验证路径建议：

1. 给 `coder` 准备两套 FAQI
2. 启动 Gateway
3. 确认当前工具可见性符合默认 FAQI
4. 执行 `switch_faqi`
5. 重启 Gateway
6. 再确认工具可见性切换成功

### 17.4 Regression Focus

重点回归：

- 未启用 FAQI 的 Agent 行为是否完全不变
- 只使用旧 `toolWhitelist` 的现有用户是否零影响
- FACET 切换是否完全不受影响
- Agent 原有工作区加载是否完全不受影响

---

## 18. 风险与应对

### 18.1 风险：FAQI 文件写错

应对：

- 启动时记录清晰日志
- 自动回退到旧 `toolWhitelist`

### 18.2 风险：状态文件损坏

应对：

- 解析失败时按“无当前 FAQI”处理
- 回退到旧 `toolWhitelist`

### 18.3 风险：用户误以为切换立即生效

应对：

- `switch_faqi` 返回结果里明确写“需要重启”
- 文档写清楚首版是重启生效

### 18.4 风险：与现有 Agent Profile 机制耦合过深

应对：

- FAQI 解析与状态处理独立成单独模块
- 保持 AgentProfile 只扩字段，不塞复杂逻辑

---

## 19. 回滚方案

本功能回滚非常直接：

1. 删除或不使用 FAQI 目录
2. 删除或忽略 `faqis-state.json`
3. 系统自动回退到原 `toolWhitelist`

也就是说：

- FAQI 体系失效时，旧权限模型仍然可以完整工作

---

## 20. 技术债决策

本期技术债决策如下：

- FAQI 脚本化定义：`defer`
- FAQI 热切换立即生效：`defer`
- FAQI 图形化编辑：`defer`
- FAQI 继承 / 叠加：`defer`
- 跨 Agent 切换：`defer`

原因：

- 这些能力都会明显扩大本期复杂度
- 当前目标是先稳定做出最小可用版

---

## 21. 实施计划

PLAN

Goal
为 Agent 增加独立于 FACET 的 FAQI（法器）切换能力，支持基于 FAQI 文件定义多套工具白名单、记录当前选择，并在重启后按当前 FAQI 生效，同时保持对现有 `toolWhitelist` 的完全兼容。

Constraints
- 不修改 FACET 功能代码
- 所有 FAQI 目录统一位于 `~/.star_sanctuary/faqis/`
- 首版采用 `md` 文件定义 FAQI
- 首版采用“切换后重启生效”
- 不新增 `faqiEnabled`
- 不新增 `defaultFaqi`
- 不做 FAQI 继承、叠加、图形化编辑、跨 Agent 切换

Steps
1. 在 `belldandy-agent` 中新增 FAQI 解析与最终白名单计算模块，保持 AgentProfile 旧结构兼容。
2. 在 `belldandy-core` 中接入 FAQI 状态文件加载、FAQI 目录初始化、Agent Profile 合成逻辑。
3. 在 `belldandy-skills` 中新增 `list_faqis` 与 `switch_faqi` 工具，并注册到 Gateway。
4. 更新 `agents.json` 相关文档，补充 FAQI 的配置方式、目录结构和生效规则。
5. 编写单元测试与集成测试，覆盖 FAQI 解析、路径规则、状态优先级、当前 Agent 精准切换与回退链路。
6. 做一次手动验证，确认 FAQI 切换后经重启可以改变 Agent 工具边界，且旧 `toolWhitelist` 模式不受影响。

Validation
- Unit：FAQI 解析、状态加载、路径解析、回退规则
- Integration：Gateway 启动装配 FAQI、工具可见性判定、FAQI 列表与切换工具
- Manual：准备全局 FAQI，切换并重启后验证不同 Agent 的工具边界变化
- Regression Focus：FACET 不受影响、旧 Agent 配置不受影响、未启用 FAQI 的 Agent 行为不变

---

## 22. 结论

推荐的首版实现方向是：

- 用 `faqis/*.md` 定义全局 FAQI 法器库
- 用 `faqis-state.json` 记录当前 FAQI
- 启动时合成最终 `toolWhitelist`
- 通过 `list_faqis` / `switch_faqi` 提供操作入口
- 通过重启实现稳定生效
- 保持对现有 `toolWhitelist` 的完整兼容

首版不引入：

- `faqiEnabled`
- `defaultFaqi`

这个方案满足你的核心要求，同时不会碰 FACET 的功能代码，也不会把当前 Agent 工作区模型搅乱。

补充说明：

- 本文档当前既是实现方案文档，也是实现进度文档。
- 上半部分以设计口径说明为什么这样做。
- `0. 当前实现进度` 反映的是当前代码已经实际落地到哪一步。
- 若后续实现继续推进，应优先更新本文件中的进度、验证结果与残留问题，而不是另起一份平行说明。
