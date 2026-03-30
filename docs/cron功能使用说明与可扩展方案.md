# cron 功能使用说明与可扩展方案

基于 2026-03-30 对当前仓库实现的核对整理，适用于 Star Sanctuary 当前已经落地的 cron 调度能力。

相关实现位置：

- `packages/belldandy-core/src/cron/types.ts`
- `packages/belldandy-core/src/cron/store.ts`
- `packages/belldandy-core/src/cron/scheduler.ts`
- `packages/belldandy-skills/src/builtin/cron-tool.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

---

## 当前完成进度

截至本轮代码实现，方案 B 的核心后端能力已经落地，当前状态如下：

### 已完成

- `CronSchedule` 已扩展支持：
  - `at`
  - `every`
  - `dailyAt`
  - `weeklyAt`
- `computeNextRun()` 已支持：
  - 指定时区下的每日固定时刻计算
  - 指定时区下的每周固定 weekday + 时刻计算
- `cron` 工具已支持创建与展示：
  - `dailyAt`
  - `weeklyAt`
- `cron` 工具已补齐：
  - `time` 校验
  - `timezone` 校验
  - `weekdays` 校验
- scheduler 已可在任务执行后正确推进：
  - 下一天
  - 下一个合法 weekday
- 自动化测试已覆盖：
  - `computeNextRun()` 的新调度类型
  - scheduler 对新调度类型的执行与推进
  - `cron` 工具对新调度类型的创建、校验与列表展示

### 已验证

- `corepack pnpm build` 已通过
- 以下测试已通过：
  - `packages/belldandy-core/src/cron/store.test.ts`
  - `packages/belldandy-core/src/cron/scheduler.test.ts`
  - `packages/belldandy-skills/src/builtin/cron-tool.test.ts`

### 尚未完成

- WebChat 侧尚未提供结构化的 `dailyAt / weeklyAt` 创建与编辑表单
- 当前前端仍主要通过：
  - `cron` 工具
  - 直接编辑 `cron-jobs.json`
  来使用新能力
- 仍未支持：
  - `monthlyAt`
  - 标准 cron expression

说明：

- 本文档中 8.2 方案 B 已从“设计方案”升级为“已完成核心实现并落地的正式能力”
- 但当前仍未做 WebChat 表单化，因此它还不是“纯 UI 可配置完成态”

---

## 0. 先说结论

当前 cron 能力已经可用，但它现在更准确地说是“轻量定时任务”而不是“完整 cron 表达式调度器”。

目前已经支持：

- 一次性任务：在指定时间执行一次
- 固定间隔任务：每隔 N 分钟 / 小时 / 天循环执行
- 每天固定时间点任务：`dailyAt`
- 每周固定 weekday + 时间任务：`weeklyAt`
- 执行给 Agent 的系统事件任务
- 执行长期任务审批扫描任务
- 在 WebChat 中查看和编辑 `cron-jobs.json`

目前还不支持：

- 每月固定日期时间执行
- 标准 cron expression，例如 `0 9 * * *`
- WebChat 内的结构化日历任务表单

所以，“每天早上 09:00 自动执行”这类需求，当前已经可以通过现有 `cron` 工具的 `dailyAt` 严格表达；但更复杂的 cron expression 仍未支持。

---

## 1. 当前 cron 能力由哪些部分组成

当前能力由三层组成：

### 1.1 持久化文件

任务列表保存在状态目录下的：

- `~/.star_sanctuary/cron-jobs.json`

调度器会从这里读取所有任务，并在任务状态变化后回写该文件。

### 1.2 调度器

Gateway 在以下条件满足时启动 cron 调度器：

- `BELLDANDY_CRON_ENABLED=true`

当前调度器特征：

- 每 30 秒轮询一次任务列表
- 只执行 `enabled=true` 的任务
- 会复用 Heartbeat 的 `activeHours` 活跃时段限制
- 会在系统忙碌时跳过当次调度
- 最大并发数为 3，但实际执行是顺序消费，避免 Agent 并发冲突

这意味着当前调度器不是“秒级准点触发器”，而是“30 秒粒度的轮询式执行器”。

### 1.3 Agent / 工具入口

当前对外暴露的 `cron` 工具支持 4 个动作：

- `list`
- `add`
- `remove`
- `status`

也就是说，它现在支持创建、查看、删除和查看状态，但还不支持更细粒度的编辑动作。

---

## 2. 当前支持什么类型的定时任务

## 2.1 调度类型

当前已经支持四种调度类型。

### `at`

一次性任务。

含义：

- 在一个指定 ISO 时间点执行一次

适合：

- 明天早上 9 点提醒一次
- 某个截止时间到点后执行一次扫描
- 某个预定窗口做一次自动通知

### `every`

固定间隔重复任务。

含义：

- 从一个锚点开始，每隔 `everyMs` 毫秒重复执行

适合：

- 每 5 分钟检查一次
- 每 30 分钟同步一次
- 每 1 小时跑一次巡检
- 每 24 小时跑一次近似“每日任务”

注意：

- 这不是按日历规则执行
- 它是按“固定毫秒间隔”执行

### `dailyAt`

按时区的每日固定时刻任务。

含义：

- 在指定 `timezone` 下，每天 `HH:mm` 触发一次

适合：

- 每天 09:00 审批扫描
- 每天 18:30 固定提醒

### `weeklyAt`

按时区的每周固定 weekday + 时刻任务。

含义：

- 在指定 `timezone` 下，于每周指定 weekday 的 `HH:mm` 触发

适合：

- 每周一 10:00 例行巡检
- 每周一、三、五 18:00 汇总提醒

---

## 2.2 任务 payload 类型

当前支持两类任务内容。

### `systemEvent`

给 Agent 发送一段文本，让 Agent 按提示执行。

适合：

- 定时提醒
- 定时让 Agent 做例行检查
- 定时让 Agent 总结某个状态

限制：

- 依赖 Agent 可用
- 如果 Gateway 没有成功创建 Agent，这类任务会不可用

### `goalApprovalScan`

直接执行长期任务审批扫描，不走自然语言 prompt。

适合：

- 扫描某个 goal 的 review / checkpoint 超时情况
- 扫描全部长期任务的审批流状态

特点：

- 不依赖自然语言 prompt
- 即使 `systemEvent` 因 Agent 不可用而关闭，这类结构化任务仍可运行

---

## 3. 当前到底能实现什么

可以稳定实现的典型场景：

### 3.1 一次性定时

例子：

- `2026-04-01T09:00:00+08:00` 执行一次“提醒检查发布包”
- `2026-04-05T18:00:00+08:00` 执行一次审批扫描

### 3.2 固定间隔轮询

例子：

- 每 5 分钟扫描一次全部长期任务审批流
- 每 30 分钟让 Agent 检查一次待办
- 每 1 小时推送一次某种汇总

### 3.3 近似“每日一次”

例子：

- 每 24 小时执行一次

但要注意，这只是：

- `everyMs = 86400000`

它不是严格意义上的“每天 09:00”。

### 3.4 正式的每日固定时刻

例子：

- 每天 09:00 执行审批扫描
- 每天 18:30 执行提醒

对应方式：

- `schedule.kind = "dailyAt"`

### 3.5 正式的每周固定时刻

例子：

- 每周一 10:00 执行巡检
- 每周一、三、五 18:00 发送提醒

对应方式：

- `schedule.kind = "weeklyAt"`

---

## 4. 当前不能严格实现什么

以下需求当前都不能用现有工具原生表达：

- 每月 1 号 08:00 执行
- `0 9 * * *` 这一类 cron 表达式
- 任意复杂的“第 N 个工作日 / 每月最后一个周五 / 节假日跳过”这类规则

原因不是调度器完全没有时间概念，而是当前正式能力只收敛到了：

1. `at`
2. `every`
3. `dailyAt`
4. `weeklyAt`

还没有：

5. `monthlyAt`
6. `cron expression`
7. 更复杂的业务日历规则

---

## 5. 当前“每天固定时间”到底能不能曲线实现

分两层说。

### 5.1 通过当前 `cron` 工具

现在已经可以直接实现：

- 每天固定时间点
- 每周几固定时间点

对应方式：

- `dailyAt`
- `weeklyAt`

但仍然不能直接实现：

- 每月固定日期时间
- 标准 cron expression
- 更复杂的业务日历规则

### 5.2 通过手工编辑 `cron-jobs.json`

当前主要适用于两类场景：

1. 临时手工创建 `dailyAt / weeklyAt` 任务
2. 对旧的 `every + anchorMs` 近似方案做兼容维护

对于“每天固定时间点”这一需求，当前已经不必再依赖 `every + anchorMs` 的近似写法。

旧近似方案仍然保留说明，仅用于兼容历史任务：

思路是：

- 手工把 `schedule.kind` 设为 `every`
- `everyMs` 设为 `86400000`
- `anchorMs` 设为目标起始时间点的 Unix 毫秒时间戳

例如你希望任务尽量对齐到每天早上 09:00，可以使用类似结构：

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "daily-approval-scan",
      "name": "每日审批扫描",
      "enabled": true,
      "createdAtMs": 1774920000000,
      "updatedAtMs": 1774920000000,
      "schedule": {
        "kind": "every",
        "everyMs": 86400000,
        "anchorMs": 1774986000000
      },
      "payload": {
        "kind": "goalApprovalScan",
        "allGoals": true,
        "autoEscalate": true
      },
      "state": {
        "nextRunAtMs": 1774986000000
      }
    }
  ]
}
```

这个方案的特点：

- 在中国时区这类无 DST 的环境里，通常能比较接近“每天固定时间”
- 但本质仍然是“固定间隔 + 锚点”
- 不是完整的日历型调度

它的边界也要明确：

- 调度器是 30 秒轮询，不是秒级准点
- 如果系统正忙，任务可能延后
- 如果活跃时段不允许，也会延后
- 如果机器停机一段时间，恢复后不会逐次补跑所有遗漏周期，而是恢复后执行一次，再算下一个周期
- 如果未来部署到有 DST 的时区，`24h` 间隔不等于严格本地“每天同一钟点”

结论：

- 这个方案可以临时用
- 但在当前版本里，它已经不是“每天固定时刻”的推荐实现方式

### 5.3 通过 `HEARTBEAT` 曲线实现

也可以做“近似方案”，但同样不能算正式支持。

`HEARTBEAT` 当前机制是：

- 按固定间隔触发
- 每次触发时读取 `HEARTBEAT.md`
- 在活跃时段内运行
- 如果系统忙碌则跳过本轮

因此它本质上仍然是：

- 轮询式触发器

不是：

- 日历型定时器

这意味着你可以把 `HEARTBEAT.md` 写成类似思路：

- 每次 heartbeat 触发时，先判断当前是不是周一
- 再判断当前是不是接近 09:00
- 满足条件再执行真正任务
- 不满足就返回 `HEARTBEAT_OK`

这样可以近似实现：

- 每天固定时间附近执行
- 每周几固定时间附近执行

但这个方案的定位必须说清楚：

- 它依赖 Agent 按提示词正确判断时间条件
- 它不保证严格准点
- 它会受到 heartbeat 间隔影响
- 它会受到忙碌跳过与活跃时段限制影响
- 它不支持标准 cron expression

所以：

- `HEARTBEAT` 适合做“高频巡检 + 条件判断”
- 不适合被定义为“已经支持每天固定时间 / 每周几 / cron expression”

推荐口径：

> `HEARTBEAT` 可以用于曲线逼近固定时刻任务，但那属于业务层绕法，不等于底层已经具备正式的日历型调度能力。

---

## 6. 当前建议怎么使用

如果你现在就要使用 cron，我建议按下面理解。

### 6.1 用 `at` 处理一次性任务

适合：

- 某个确定时间点只执行一次的任务

这是当前最稳定、最没有歧义的模式。

### 6.2 用 `every` 处理巡检、轮询、周期扫描

适合：

- 每 5 分钟
- 每 15 分钟
- 每 30 分钟
- 每 1 小时
- 每 6 小时

这类“固定间隔轮询”正是当前实现最匹配的场景。

### 6.3 用 `dailyAt` 处理每天固定时刻任务

适合：

- 每天 09:00
- 每天 18:30

这是当前“每日固定时刻”需求的正式实现方式。

### 6.4 用 `weeklyAt` 处理每周固定时刻任务

适合：

- 每周一 10:00
- 每周一、三、五 18:00

这是当前“每周固定 weekday + 时刻”需求的正式实现方式。

### 6.5 用 `goalApprovalScan` 做长期任务治理

这是当前 cron 最适合的结构化任务类型。

它特别适合：

- 超期 review 扫描
- checkpoint 扫描
- 自动升级超时 stage

### 6.6 不要把当前能力对外宣传成“完整 cron”

更准确的产品说明应该是：

- 当前支持一次性定时、固定间隔定时、每日固定时刻、每周固定时刻
- 尚不支持标准 cron 表达式和更复杂的日历型规则
- `HEARTBEAT` 可用于高频巡检和条件判断式触发，但不等于正式支持复杂日历调度

---

## 7. WebChat 当前能做什么

当前 WebChat 已经提供“定时任务配置”过滤视图。

它现在展示：

- `HEARTBEAT.md`
- `cron-jobs.json`

并且 `cron-jobs.json` 当前已经可以在 WebChat 中：

- 查看
- 打开
- 编辑
- 保存

也就是说，如果你要走“手工编辑 `anchorMs` 的近似方案”，当前前端已经有入口，不必单独进文件系统手改。

---

## 8. 可扩展方案

如果接下来要把 cron 做成真正可对外说明的“每天固定时间点定时能力”，我建议按三档考虑。

## 8.1 方案 A：小改版，补锚点参数

目标：

- 先让现有 `every` 能指定锚点

改动：

- `cron` 工具新增 `anchorAt` 或 `anchorMs`
- WebChat 如果后续做结构化 cron 表单，也补一个“起始时间”字段

效果：

- 能创建“从明天 09:00 开始，每 24h 一次”的任务

优点：

- 改动小
- 基本不碰调度器核心结构
- 能快速满足一部分“近似每日定时”需求

缺点：

- 仍然不是严格日历型调度
- 仍然无法表达每周几、每月几号
- 产品语义容易让用户误以为已经支持真实 cron

适用判断：

- 只适合当过渡方案
- 不适合拿来作为“cron 已支持每天固定时间”的正式结论

---

## 8.2 方案 B：推荐方案，新增结构化日历调度

目标：

- 在不直接引入 cron expression 的前提下，补齐最常用的日历型规则

### 8.2.1 最终字段定义

本方案最终确定新增两个 schedule 类型：

- `dailyAt`
- `weeklyAt`

最终 `CronSchedule` 定义如下：

```ts
type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "dailyAt"; time: string; timezone: string }
  | { kind: "weeklyAt"; weekdays: number[]; time: string; timezone: string };
```

约定如下：

- `time`
  - 固定使用 `HH:mm`
  - 24 小时制
  - 必须补零，例如 `09:00`、`18:30`
- `timezone`
  - 必填
  - 固定使用 IANA 时区名，例如 `Asia/Shanghai`、`UTC`、`America/New_York`
  - 创建任务时可默认带入当前系统时区，但落盘时必须显式写入
- `weekdays`
  - 固定使用 `1-7`
  - `1=Monday`，`7=Sunday`
  - 必须为去重后的升序数组
  - 最少 1 个值，最多 7 个值

明确不采用的设计：

- 不使用 `0-6`
- 不允许省略 `timezone`
- 不支持 `HH:mm:ss`
- 不支持自然语言 weekday 文本

### 8.2.2 最终校验规则

#### `dailyAt`

字段：

- `kind = "dailyAt"`
- `time`
- `timezone`

校验：

- `time` 必须匹配 `^\d{2}:\d{2}$`
- 小时范围 `00-23`
- 分钟范围 `00-59`
- `timezone` 必须能被 `Intl.DateTimeFormat(..., { timeZone })` 正常解析

#### `weeklyAt`

字段：

- `kind = "weeklyAt"`
- `weekdays`
- `time`
- `timezone`

校验：

- `weekdays` 必须为非空数组
- 数组成员必须是整数
- 数组成员范围必须在 `1-7`
- 数组内不允许重复值
- 建议在写入前规范化为升序
- `time` / `timezone` 校验规则与 `dailyAt` 一致

### 8.2.3 最终计算语义

#### `dailyAt`

语义：

- 表示“在指定时区下，每天 `time` 触发一次”

`computeNextRun()` 规则：

1. 取 `nowMs`
2. 按 `timezone` 转成该时区下的当前本地日期
3. 组合出“今天的 `time`”
4. 若今天目标时刻 `> now`，返回今天该时刻
5. 否则返回“明天的 `time`”

#### `weeklyAt`

语义：

- 表示“在指定时区下，每周的指定 weekday + `time` 触发”

`computeNextRun()` 规则：

1. 取 `nowMs`
2. 按 `timezone` 转成该时区下的当前本地日期与 weekday
3. 在本周剩余日期中查找最近一个合法 weekday
4. 若当天就是合法 weekday，再比较 `time`
5. 若本周已无合法未来时刻，则返回下周最近一个合法 weekday 的 `time`

#### 错过触发的最终语义

方案 B 明确采用以下语义：

- 如果任务到点但系统忙碌，本轮稍后补跑一次
- 如果 Gateway 在计划时刻离线，恢复后只补最近这一轮，不回放多轮遗漏执行
- 每次执行完成后，再重新计算下一次合法触发时间

这与当前 scheduler 的轮询模型保持一致，不引入“历史补跑队列”。

### 8.2.4 最终工具层字段定义

`cron` 工具在方案 B 中应扩成以下输入：

- `scheduleKind`
  - `at`
  - `every`
  - `dailyAt`
  - `weeklyAt`
- `time`
  - `dailyAt` / `weeklyAt` 必填
- `timezone`
  - `dailyAt` / `weeklyAt` 必填
- `weekdays`
  - `weeklyAt` 必填
  - 数字数组，使用 `1-7`

工具层输出文案应固定为：

- `dailyAt`
  - `每天 09:00 @ Asia/Shanghai`
- `weeklyAt`
  - `每周 Mon/Wed/Fri 10:30 @ Asia/Shanghai`

### 8.2.5 最终 JSON 示例

#### `dailyAt`

```json
{
  "kind": "dailyAt",
  "time": "09:00",
  "timezone": "Asia/Shanghai"
}
```

#### `weeklyAt`

```json
{
  "kind": "weeklyAt",
  "weekdays": [1, 3, 5],
  "time": "10:30",
  "timezone": "Asia/Shanghai"
}
```

### 8.2.6 最终测试矩阵

#### A. 类型与校验

1. `dailyAt`
   - `time="09:00"` 合法
   - `time="9:00"` 非法
   - `time="24:00"` 非法
   - `time="23:60"` 非法
   - `timezone="Asia/Shanghai"` 合法
   - `timezone="Invalid/Zone"` 非法

2. `weeklyAt`
   - `weekdays=[1]` 合法
   - `weekdays=[1,3,5]` 合法
   - `weekdays=[]` 非法
   - `weekdays=[0]` 非法
   - `weekdays=[8]` 非法
   - `weekdays=[1,1,3]` 非法
   - `weekdays=["1"]` 非法

#### B. `computeNextRun()` 行为

3. `dailyAt`
   - 当前时间早于今日目标时间，返回今日目标时间
   - 当前时间等于今日目标时间，返回明日目标时间
   - 当前时间晚于今日目标时间，返回明日目标时间
   - 跨时区下计算正确

4. `weeklyAt`
   - 当前 weekday 不在列表中，返回本周最近未来合法 weekday
   - 当前 weekday 在列表中但目标时间未到，返回今天目标时间
   - 当前 weekday 在列表中且目标时间已过，返回下一个合法 weekday
   - 本周剩余日期无合法 weekday，返回下周第一个合法 weekday
   - 跨周边界计算正确

#### C. Scheduler 行为

5. 到点执行
   - `dailyAt` 到点后会被执行一次
   - `weeklyAt` 到点后会被执行一次

6. 执行后推进
   - `dailyAt` 执行后 `nextRunAtMs` 推进到下一天
   - `weeklyAt` 执行后 `nextRunAtMs` 推进到下一个合法 weekday

7. 忙碌跳过
   - scheduler 忙碌时不执行
   - 忙碌结束后仍能补执行一次

#### D. Tool 行为

8. 创建
   - `cron add dailyAt` 成功
   - `cron add weeklyAt` 成功
   - 缺少 `time` 报错
   - 缺少 `timezone` 报错
   - `weeklyAt` 缺少 `weekdays` 报错

9. 展示
   - `list` 输出 `每天 09:00 @ Asia/Shanghai`
   - `list` 输出 `每周 Mon/Wed/Fri 10:30 @ Asia/Shanghai`

#### E. 兼容性

10. 旧任务兼容
   - 现有 `at` 任务不受影响
   - 现有 `every` 任务不受影响
   - 旧版 `cron-jobs.json` 仍可正常读取

### 8.2.7 需要配套改动

当前状态：

- 第 1、2、3、4 项已完成
- 第 5 项尚未完成

已完成：

1. 已扩 `types.ts`
2. 已扩 `computeNextRun()`
3. 已扩 `cron` 工具参数定义、校验与输出文案
4. 已补测试

待完成：

5. 若后续 WebChat 要做结构化表单，再增加对应 UI

优点：

- 能直接支持“每天 09:00”
- 能直接支持“每周一 10:00”
- 规则更适合产品和用户理解
- 不必立刻引入 cron parser 依赖

缺点：

- 规则表达能力有限
- 如果未来还要支持更复杂规则，后面仍要继续扩类型

我的判断：

- 如果你的目标是“让用户能配置每天固定时间点任务”
- 这是当前最合适的实施方案

---

## 8.3 方案 C：完整版，支持 cron expression

目标：

- 直接支持标准 cron 表达式

建议数据结构：

```ts
type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expression: string; timezone?: string };
```

需要处理的问题：

- 表达式解析
- 时区
- 非法表达式校验
- 夏令时
- 错过调度后的补跑策略
- UI 如何给普通用户提供输入和校验

优点：

- 能力最完整
- 与“cron”命名最一致
- 扩展性最好

缺点：

- 实现和测试复杂度明显更高
- 对普通用户不友好
- 前端设置与错误提示都更难做好

我的判断：

- 这更适合作为后续增强
- 不建议把它作为“下一步最小目标”

---

## 9. 推荐落地顺序

当前建议顺序应调整为：

1. 先补文档和产品口径同步
2. 先在真实场景下使用并观察 `dailyAt / weeklyAt`
3. 若前端配置需求增强，再做 WebChat 结构化表单
4. 若业务开始出现“每月固定日期 / 更复杂规则”需求，再评估方案 C 或新增 `monthlyAt`

补充判断：

- 不建议再把“每天固定时间”需求压在 `HEARTBEAT` 提示词绕法上
- 当前应优先复用已经落地的 `dailyAt / weeklyAt`

---

## 10. 推荐对外口径

建议当前对内对外都统一使用下面这句话：

> 当前 cron 功能已支持一次性定时、固定间隔定时、每日固定时刻和每周固定时刻，适合巡检、扫描、提醒类任务；尚未支持标准 cron 表达式和更复杂的日历型规则。

如果要单独回答“每天 09:00 能不能做”，建议直接说：

> 当前已经可以做，推荐使用 `dailyAt`；如果只是历史兼容，也仍可通过手工编辑 `cron-jobs.json` 维护旧的 `every + anchorMs` 近似方案。

如果用户追问“那 `HEARTBEAT` 能不能做”，建议直接说：

> `HEARTBEAT` 仍然可以通过“高频触发 + 提示词内判断时间条件”的方式曲线逼近，但当前已经没必要再把“每天固定时间 / 每周几”需求压给它；优先使用已正式落地的 `dailyAt / weeklyAt`。
