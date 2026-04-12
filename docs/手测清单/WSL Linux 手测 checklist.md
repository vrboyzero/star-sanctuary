# WSL Linux 手测 checklist

## 1. 目标

本轮手测只验证 `D0 / D1` 当前在 `WSL Ubuntu (Linux)` 下的最小可用闭环，确认以下 6 件事：

1. `install.sh` 能在 `WSL Linux` 环境完成源码包安装
2. 安装器能正确检查本机 `node / corepack / curl / tar`
3. 安装后能正确落盘安装态入口：
   - `bdd`
   - `start.sh`
   - `install-info.json`
4. 安装态 `envDir` 固定在安装根，而不是误写到 `current/`
5. `bdd setup` 在 Linux 安装态下可正常运行
6. `start.sh -> gateway -> /health -> WebChat` 主链可正常成立

当前不验证：

- `macOS`
- 便携包 / single-exe
- 官网大包下载链
- 带真实模型凭据的完整消息对话链
- `community / models / webhook / cron` 的深度编辑器体验

---

## 2. 适用范围

本清单只适用于：

- `Windows + WSL2 + Ubuntu`
- 使用仓库内当前版本的 [install.sh](/E:/project/star-sanctuary/install.sh)

说明：

- `WSL Ubuntu` 可以作为 `Linux` 侧真实手测环境
- 它不能替代 `macOS` 手测
- 推荐把安装目录放在 WSL 的 Linux 文件系统里，例如 `$HOME/.local/share/...`
- 不推荐把正式安装目录放到 `/mnt/e/...` 这类 Windows 挂载盘里，避免权限 / 性能 / 换行差异干扰结论

---

## 3. 前置条件

### 3.1 WSL 侧基础环境

先在 Ubuntu 里确认这些命令存在：

```bash
node -v
corepack --version
curl --version
tar --version
```

预期：

- `Node.js >= 22.12`
- `corepack` 可用
- `curl` 可用
- `tar` 可用

若 `node` 不满足版本要求，本轮先不继续，先升级 Node。

### 3.2 仓库脚本路径

确认仓库在 WSL 中可访问，例如：

```bash
ls /mnt/e/project/star-sanctuary/install.sh
ls /mnt/e/project/star-sanctuary/start.sh
```

### 3.3 推荐安装目录

本轮建议统一使用以下目录：

```bash
export SS_WSL_TEST_DIR="$HOME/.local/share/star-sanctuary-wsl-test"
export SS_WSL_FULL_DIR="$HOME/.local/share/star-sanctuary-wsl-fulltest"
```

---

## 4. 用例一：安装链路（跳过 setup）

### 4.1 操作

运行：

```bash
rm -rf "$SS_WSL_TEST_DIR"
bash /mnt/e/project/star-sanctuary/install.sh --install-dir "$SS_WSL_TEST_DIR" --no-setup
```

### 4.2 预期

- 安装器能输出：
  - `Detected Node.js ...`
  - `Downloading GitHub release source archive`
  - `Installing workspace dependencies`
  - `Building workspace`
  - `Skipping bdd setup (--no-setup)`
  - `Install complete.`
- 安装目录下应出现：
  - `$SS_WSL_TEST_DIR/bdd`
  - `$SS_WSL_TEST_DIR/start.sh`
  - `$SS_WSL_TEST_DIR/install-info.json`
  - `$SS_WSL_TEST_DIR/current/`

### 4.3 取证命令

```bash
ls -la "$SS_WSL_TEST_DIR"
ls -la "$SS_WSL_TEST_DIR/current"
cat "$SS_WSL_TEST_DIR/install-info.json"
"$SS_WSL_TEST_DIR/bdd" --help
```

### 4.4 关键检查点

- `bdd --help` 必须能正常输出
- `install-info.json` 中应看到：
  - `currentDir: "current"`
  - `envDir: "."`
- 安装根存在，但此时允许还没有 `.env.local`

### 4.5 失败信号

- `pnpm install` 失败
- `pnpm build` 失败
- 安装完成后 `bdd --help` 无法运行
- `install-info.json` 未生成

---

## 5. 用例二：完整安装链路（安装后直接进入 setup）

### 5.1 操作

运行：

```bash
rm -rf "$SS_WSL_FULL_DIR"
bash /mnt/e/project/star-sanctuary/install.sh --install-dir "$SS_WSL_FULL_DIR"
```

安装器会在最后自动进入：

```bash
bdd setup
```

### 5.2 建议手测路径

建议先走最小 Linux 本地路径：

- `flow = Advanced`
- `scenario = local`
- `provider = mock`
- `auth mode = none` 或按当前验证需要改为 `token`
- `community / models / webhook / cron` 暂时都可 `Skip`

如果你只想先验证“安装链 + setup 能不能走完”，这里优先选最短路径。

### 5.3 预期

- setup 能顺利结束
- 安装根目录下出现：
  - `$SS_WSL_FULL_DIR/.env.local`
- 不应写到：
  - `$SS_WSL_FULL_DIR/current/.env.local`

### 5.4 取证命令

```bash
ls -la "$SS_WSL_FULL_DIR"
ls -la "$SS_WSL_FULL_DIR/current"
cat "$SS_WSL_FULL_DIR/.env.local"
test -f "$SS_WSL_FULL_DIR/current/.env.local" && echo "unexpected current env local"
```

### 5.5 失败信号

- setup 中途退出
- `.env.local` 没生成
- `.env.local` 被写进 `current/`

---

## 6. 用例三：重复启动入口验证

### 6.1 操作

安装并 setup 完成后，运行：

```bash
"$SS_WSL_FULL_DIR/start.sh"
```

另开一个 WSL 终端执行：

```bash
curl http://127.0.0.1:28889/health
```

### 6.2 预期

- `start.sh` 能拉起 gateway
- `/health` 返回 `200`
- 日志中能看到启动信息

### 6.3 可选验证

如果你的 Windows 浏览器可直接访问 WSL2 localhost，再打开：

```text
http://127.0.0.1:28889/
```

预期：

- WebChat 页面可打开

### 6.4 失败信号

- `start.sh` 直接退出
- `/health` 无响应
- WebChat 无法打开且 gateway 日志显示启动失败

---

## 7. 用例四：安装态 envDir 固定验证

### 7.1 操作

执行：

```bash
cat "$SS_WSL_FULL_DIR/install-info.json"
cat "$SS_WSL_FULL_DIR/.env.local"
find "$SS_WSL_FULL_DIR" -maxdepth 2 -name '.env.local' -o -name '.env'
```

### 7.2 预期

- 安装态主配置位于安装根：
  - `$SS_WSL_FULL_DIR/.env`
  - `$SS_WSL_FULL_DIR/.env.local`
- `current/` 仅作为 runtime workspace
- `current/` 下不应额外冒出一份安装态 `.env.local`

### 7.3 失败信号

- `current/.env.local` 存在
- 启动依赖的配置只落在 `current/`
- 安装根配置和实际运行配置不一致

---

## 8. 用例五：最小重新进入 CLI 验证

### 8.1 操作

执行：

```bash
"$SS_WSL_FULL_DIR/bdd" --help
"$SS_WSL_FULL_DIR/bdd" doctor --json
```

### 8.2 预期

- `bdd --help` 正常
- `bdd doctor --json` 能运行
- 若当前是 `mock` 配置，允许 doctor 里出现 provider 相关 warning，但不应是入口损坏或路径损坏

### 8.3 失败信号

- `bdd` 无法找到 runtime
- `bdd doctor` 报路径错误、入口错误、配置目录错误

---

## 9. 建议记录项

每轮至少记录这些信息：

- 手测日期
- WSL 版本
- Ubuntu 版本
- Node 版本
- install 目标目录
- 是否使用 `--no-setup`
- setup 中选择的 `flow / scenario / provider / auth`
- `/health` 是否返回 `200`
- `.env.local` 实际落盘路径
- 是否能打开 WebChat
- 是否观察到异常日志

---

## 10. 本轮通过标准

本轮 `WSL Linux` 手测可判“当前通过”，至少满足：

1. `install.sh --no-setup` 能完成安装，且 `bdd --help` 正常
2. 不带 `--no-setup` 时，安装器能顺利进入并完成 `bdd setup`
3. `.env.local` 明确落在安装根，不在 `current/`
4. `start.sh` 能拉起 gateway，`/health` 返回 `200`
5. `bdd doctor --json` 可运行

若 1 到 3 成立，但 4 或 5 失败，则可判：

- `D0 安装主链基本成立`
- `Linux 启动 / runtime 主链仍需修补`

若 1 就失败，则当前不能宣称：

- `install.sh` 已完成 `Linux` 侧真实闭环验证

---

## 11. 手测完成后的回写建议

手测后建议同步回：

- [Setup 2.0 设计稿.md](/E:/project/star-sanctuary/docs/Setup%202.0%20设计稿.md)
- [SS第三阶段优化实施计划.md](/E:/project/star-sanctuary/docs/SS第三阶段优化实施计划.md)

至少补以下结论：

- `install.sh` 在 `WSL Ubuntu` 下是否通过
- `installer -> setup -> start.sh -> /health` 是否通过
- 安装态 `envDir` 是否固定成功
- 当前结论是否只适用于 `Linux/WSL`，还是可外推到更广 Unix 环境

---

## 12. 备注

本清单默认优先验证“安装与启动主链是否成立”，不是为了覆盖所有高级配置分支。

如果本轮主链通过，下一轮再继续补：

- `community / models / webhook / cron`
- 带真实凭据的完整消息链
- `macOS` 独立手测

---

## 13. 本轮真实手测结果（2026-04-12）

- 手测环境：
  - `Windows + WSL2 + Ubuntu`
  - `Node.js v22.22.0`
  - `corepack 0.34.0`
- 实际验证结果：
  - `install.sh --version v0.2.4 --no-setup` 已真实跑通
  - 完整 `install.sh --version v0.2.4` 已真实走到 `bdd setup`，并成功把 `.env.local` 写入安装根
  - 安装态 `current/` 保留正常
  - 安装态 `start.sh` 已成功拉起 gateway，`/health` 返回 `200`
  - 安装态 `bdd doctor --json` 已正常返回，且 `Environment directory` 指向安装根
- 关键取证：
  - `install root`:
    - `/home/vrboyzero/.local/share/star-sanctuary-wsl-test-20260412-204413`
    - `/home/vrboyzero/.local/share/star-sanctuary-wsl-fulltest-stable-20260412130541`
    - `/home/vrboyzero/.local/share/star-sanctuary-wsl-test-dist-20260412-215645`
  - `doctor` 中已确认：
    - `Environment directory = /home/vrboyzero/.local/share/star-sanctuary-wsl-fulltest-stable-20260412130541`
    - `.env.local = /home/vrboyzero/.local/share/star-sanctuary-wsl-fulltest-stable-20260412130541/.env.local`
  - `/health` 返回：

```json
{"status":"ok","timestamp":"2026-04-12T13:36:24.128Z","version":"0.2.4"}
```

- 当前观察到的边界：
  - 在真实 `PTY` 驱动下，安装态 `bdd setup` 已确认会把 `.env.local` 写入安装根，并自然 `exit 0`
  - 先前观察到的“配置已保存但进程未自然退出”目前已收敛为非 `TTY` 自动化交互边界，而不是 Linux 安装主链失败
  - 因此当前剩余问题更偏向“脚本化自动交互兼容性”，不是安装后运行链损坏
- 当前结论：
  - `Linux / WSL` 主链可判“第一轮真实手测通过”
  - `Linux / WSL` 的真实终端 `setup -> 保存配置 -> 自然退出` 主链也可判通过
  - `macOS` 仍未验证，不能把本轮结果外推为“Linux / macOS 全通过”
