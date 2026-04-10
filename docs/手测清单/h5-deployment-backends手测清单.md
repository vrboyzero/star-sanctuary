# H5 Deployment Backends 手测清单

## 1. 目标

本轮手测只验证 `H5-v1` 当前已经实现的最小闭环，确认以下 4 件事：

1. `deployment-backends.json` 已成为统一 deployment profile 配置入口
2. gateway 启动后能自动补出默认 `local-default` profile
3. `bdd doctor / system.doctor / web doctor` 三边对 deployment backend 的诊断口径基本一致
4. `docker / ssh` profile 的关键字段缺口能给出明确 warning，而不是静默吞掉

当前不验证：

- 真正的 backend 执行切换
- remote gateway / serverless / sandbox
- 实际 SSH 远程执行、Docker 编排接管

---

## 2. 前置条件

1. 仓库已构建通过：

```powershell
corepack pnpm build
```

2. 已知当前 `H5` 的验证范围只到：
   - `deployment-backends.json`
   - `bdd doctor`
   - `system.doctor`
   - web 侧现有 `doctor` 卡片

3. 若要做“当前真实安装态”验证，先确认当前默认 state dir：

```powershell
$stateDir = if ($env:BELLDANDY_STATE_DIR) { $env:BELLDANDY_STATE_DIR } else { Join-Path $HOME ".star_sanctuary" }
$stateDir
```

---

## 3. 推荐手测样本

建议至少准备 2 组 deployment profile：

### 3.1 干净样本

- `local-default`
- `docker-main`
- `ssh-burst`

三者字段齐全，不应出现 warning。

### 3.2 缺口样本

至少制造 1 到 2 个明显缺口：

- `selectedProfileId` 指向不存在 profile
- `docker` 缺 `runtime.service / container / image`
- `docker` 缺 `workspace.remotePath`
- `ssh` 缺 `runtime.host`
- `ssh_key` 缺 `credentials.ref`
- `file` logMode 缺 `observability.ref`

预期：这些缺口应在 doctor 中被明确标出。

---

## 4. 用例一：当前真实安装态 CLI 诊断

### 4.1 操作

运行：

```powershell
node packages/belldandy-core/dist/bin/bdd.js doctor --json
```

### 4.2 预期

- JSON 顶层能看到 `deploymentBackends`
- `checks` 中能看到 `Deployment Backends`
- 若当前默认 state dir 还没有 `deployment-backends.json`，允许出现：
  - `configExists=false`
  - `config_missing=1`
  - fix 提示让你“创建该文件或启动一次 gateway”

### 4.3 失败信号

- `deploymentBackends` 完全不存在
- `checks` 中没有 `Deployment Backends`
- 当前 profile 信息与 `deploymentBackends.summary` 明显对不上

---

## 5. 用例二：gateway 自动补默认 profile

### 5.1 操作

1. 使用一个干净临时 state dir 启动 gateway
2. 启动前确认该目录下不存在 `deployment-backends.json`
3. 启动后再次查看该文件

### 5.2 预期

- gateway 启动后会自动补出 `deployment-backends.json`
- 默认文件中至少包含：
  - `selectedProfileId=local-default`
  - 一个启用的 `local` profile
  - `workspace.mode=direct`
  - `credentials.mode=inherit_env`
  - `observability.logMode=local`

### 5.3 失败信号

- gateway 启动后文件仍不存在
- 默认 profile 缺 `local-default`
- 默认字段不符合当前 H5-v1 约定

---

## 6. 用例三：干净 profile 集合的 doctor 一致性

### 6.1 操作

1. 在临时 state dir 写入一份“干净样本” `deployment-backends.json`
2. 分别查看：
   - `bdd doctor --json --state-dir <dir>`
   - `system.doctor`
   - web 端现有 `doctor`

### 6.2 预期

- 三边都能看到：
  - `selectedProfileId`
  - `selectedBackend`
  - `profileCount / enabledCount`
  - `local / docker / ssh` backend 分布
- 干净样本下应为：
  - `warningCount=0`
  - `Deployment Backends` check 为 `pass`

### 6.3 失败信号

- CLI 显示 `pass`，但 `system.doctor` 显示 `warn`
- profile 数量、selected profile、backend 分布在三边不一致

---

## 7. 用例四：缺口 profile 集合的告警质量

### 7.1 操作

1. 在临时 state dir 写入一份“缺口样本” `deployment-backends.json`
2. 重新查看：
   - `bdd doctor --json --state-dir <dir>`
   - `system.doctor`

### 7.2 预期

- `warningCount > 0`
- `Deployment Backends` check 为 `warn`
- `items[].warnings` 或 `message` 中能看到针对性原因，例如：
  - `ssh backend needs runtime.host`
  - `docker backend needs workspace.remotePath`
  - `selected profile not found`

### 7.3 失败信号

- 有明显缺口但没有 warning
- 只显示笼统失败，不指出具体缺口字段

---

## 8. web doctor 人工确认项

这一项当前建议人工目视确认：

1. 打开现有 `doctor`
2. 查看是否出现 `Deployment Backends` 卡片
3. 确认卡片内至少能看到：
   - enabled/total profile 数
   - `local / docker / ssh` 分布
   - selected profile
   - config path
   - 最近 profile 摘要行

当前只要求复用现有 `doctor` 卡片，不要求新增任何一级入口。

---

## 9. 当前不作为失败项

以下内容当前不算 `H5-v1` 失败：

- 还不能真正切换 backend 执行链路
- 还没有 remote workspace mount/sync 的实际执行器
- 还没有 SSH 连通性探测
- 还没有 Docker 容器/compose 实际健康检查
- 还没有独立 deployment 管理页

---

## 10. 通过标准

`H5-v1` 手测可判“当前通过”，至少满足：

1. `bdd doctor` 能稳定输出 `deploymentBackends`
2. gateway 启动后能自动补出默认 `deployment-backends.json`
3. 干净 profile 集合下，CLI 与 `system.doctor` 的 selected profile / backend 分布 / warningCount 基本一致
4. 缺口 profile 集合下，doctor 能给出明确 warning

---

## 11. 手测完成后的决策分支

### 11.1 结果通过

条件：

1. 默认 `local-default` 自动落盘正常
2. CLI / gateway / Web 三边诊断口径一致
3. 缺口 warning 基本准确

后续动作：

1. 在实施计划中补记 `H5` 当前真实手测结果
2. `H5` 继续维持“进行中”，但下一步只观察真实 `docker / ssh` profile 字段稳定性
3. 不直接扩成远程执行主链重构

### 11.2 结果部分失败

典型现象：

- 默认文件没有被自动补出
- CLI 和 `system.doctor` 统计不一致
- warning 过少或过泛

后续动作：

1. 优先做最小 schema / doctor warning 修补
2. 修完后只重跑本清单相关用例
3. 不借机扩新面板或远程执行能力

---

## 12. 本轮真实手测记录

- 手测日期：
  - 2026-04-10
- 本轮计划执行：
  - 先看当前真实安装态 `bdd doctor`
  - 再用临时 state dir 做 gateway 自动落盘与 `system.doctor` 验证
  - 再补一轮缺口 profile warning 验证
  - 最后对临时实例的 WebChat `doctor` 卡片做一次目视确认
- 手测环境：
  - 当前真实安装态：
    - 默认 state dir：`C:\Users\admin\.star_sanctuary`
    - CLI：`node packages/belldandy-core/dist/bin/bdd.js doctor --json`
  - 纯净临时实例：
    - state dir：`E:\project\star-sanctuary\.tmp-h5-manual-test\pure-state`
    - gateway：`http://127.0.0.1:28902`
    - 纯净 envDir：`E:\project\star-sanctuary\.tmp-h5-manual-test\pure-state`
    - provider：`mock`
- 实际手测结果：
  - 用例一通过：当前真实安装态 CLI 诊断
    - `bdd doctor --json` 顶层已看到 `deploymentBackends`
    - `checks` 中已看到 `Deployment Backends`
    - 当前真实安装态尚未生成 `C:\Users\admin\.star_sanctuary\deployment-backends.json`
    - 实际结果为：
      - `configExists=false`
      - `headline=profiles=1; enabled=1; config_missing=1; selected=local-default; warnings=1; local=1; docker=0; ssh=0`
      - fix 提示明确要求“创建该文件或启动一次 gateway”
    - 这符合当前 H5-v1 预期，不算失败
  - 用例二通过：gateway 自动补默认 profile
    - 干净临时 state dir 启动前，`deployment-backends.json` 不存在
    - 启动纯净临时 gateway 后，文件已自动生成
    - 实际默认内容为：
      - `selectedProfileId=local-default`
      - `backend=local`
      - `workspace.mode=direct`
      - `credentials.mode=inherit_env`
      - `observability.logMode=local`
    - 同时 `system.doctor` 已返回：
      - `check.status=pass`
      - `headline=profiles=1; enabled=1; selected=local-default; warnings=0; local=1; docker=0; ssh=0`
  - 用例三通过：干净 profile 集合的一致性
    - 在纯净临时 state dir 写入 `local-default + docker-main + ssh-burst` 三个完整 profile 后：
      - `bdd doctor --json --state-dir <dir>` 返回：
        - `selectedProfileId=docker-main`
        - `selectedBackend=docker`
        - `profileCount=3`
        - `enabledCount=3`
        - `warningCount=0`
        - `backendCounts=local 1 / docker 1 / ssh 1`
      - 同一实例的 `system.doctor` 返回：
        - `check.status=pass`
        - `selectedProfileId=docker-main`
        - `selectedBackend=docker`
        - `profileCount=3`
        - `enabledCount=3`
        - `warningCount=0`
        - `backendCounts=local 1 / docker 1 / ssh 1`
    - 本轮已确认 CLI 与 `system.doctor` 在 H5 关键摘要字段上一致
  - 用例四通过：缺口 profile 集合的告警质量
    - 在纯净临时 state dir 写入缺口样本后：
      - `selectedProfileId=missing-profile`
      - `docker-main` 缺：
        - `runtime.service/container/image`
        - `workspace.remotePath`
        - `credentials.ref`
      - `ssh-burst` 缺：
        - `runtime.host`
        - `workspace.remotePath`
        - `credentials.ref`
        - `observability.ref`
    - `bdd doctor` 返回：
      - `check.status=warn`
      - `headline=profiles=2; enabled=2; selected=missing-profile; selected_missing=1; warnings=3; local=0; docker=1; ssh=1`
    - `system.doctor` 返回同样的 `warn` 总结，并在 `items[].warnings` 中给出具体原因：
      - `docker backend needs runtime.service, runtime.container, or runtime.image`
      - `docker backend needs workspace.remotePath`
      - `docker env_file credentials need credentials.ref`
      - `ssh backend needs runtime.host`
      - `ssh backend needs workspace.remotePath`
      - `ssh_key credentials need credentials.ref`
      - `file logMode needs observability.ref`
  - 用例八通过：WebChat `doctor` 卡片目视确认
    - 对临时实例 `http://127.0.0.1:28902/` 进行一次真实页面验证
    - 本轮页面首次进入时触发了 `pairing required`，已在同一临时 state dir 上批准当前浏览器会话的 pairing code 后继续验证
    - 打开 WebChat settings 后，已实际展开现有 `doctor` 区域
    - 页面内已真实看到 `Deployment Backends` 卡片，且卡片内容与干净三 profile 样本一致：
      - `3/3 profiles enabled`
      - `local 1 / docker 1 / ssh 1`
      - `selected docker-main (docker)`
      - `0 warning profiles`
      - `config: E:\project\star-sanctuary\.tmp-h5-manual-test\pure-state\deployment-backends.json`
      - `Local Default / Docker Main / SSH Burst` 三条 profile 摘要行都已显示
    - 本轮已保留局部目视凭证：
      - `E:\project\star-sanctuary\.tmp-h5-manual-test\web-doctor-deployment-backends-card.png`
- 本轮结论：
  - `H5-v1` 当前已可判“第一轮真实手测通过，且当前阶段收口条件成立”
  - 已确认：
    - 真实安装态下 `config_missing` 提示成立
    - gateway 自动补默认 `local-default` 成立
    - 干净 profile 集合下 CLI 与 `system.doctor` 关键摘要一致
    - 缺口样本下 warning 具有针对性
    - WebChat 现有 `doctor` 卡片已能真实显示 `Deployment Backends` 摘要
  - 下一步继续按原口径推进：
    - 不扩新面板
    - 只观察真实 `docker / ssh` profile 的字段稳定性
    - 若后续出现误判，只做最小 schema / warning 修补
