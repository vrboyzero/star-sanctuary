# Windows Vitest 定向测试说明

本文仅用于仓库内部开发与排查，记录当前 Windows 环境下 Vitest 定向测试的已知卡点、推荐命令和排查顺序，避免重复踩坑。

## 1. 当前结论

当前仓库在 Windows 下做 Vitest 定向验证时，需要区分两类问题：

1. 沙箱 / 权限问题  
   在受限环境里，Vitest 启动阶段可能先报 `esbuild spawn EPERM`。  
   这类报错优先按权限问题处理，不要直接记为代码失败。

2. 默认 discovery 过重  
   提权后如果 `EPERM` 消失，但定向单测仍在执行前长时间卡住，当前已确认根因通常不是测试逻辑本身，而是 Vitest 默认 discovery 在 Windows 下会先遍历仓库根下的重型临时目录。  
   本仓库当前已在 [vitest.config.ts](/E:/project/star-sanctuary/vitest.config.ts) 中排除：
   - `tmp/**`
   - `.tmp/**`
   - `.tmp-codex/**`
   - `.playwright-mcp/**`

其中最重的是仓库根下的 `tmp/`。该目录会挂多份外部源码镜像和烟测产物，文件量远高于主仓库代码；在修复前，Vitest 会卡在 `globTestFiles()`，也就是测试执行前的文件收集阶段。

## 2. 推荐命令

当前 Windows 下做定向 Vitest，优先使用 Vitest 直连命令：

```powershell
node .\node_modules\vitest\vitest.mjs run apps/web/public/app/features/assistant-mode-settings-view-model.test.js --reporter verbose
node .\node_modules\vitest\vitest.mjs run apps/web/public/app/features/assistant-mode-settings-config.test.js --reporter verbose
node .\node_modules\vitest\vitest.mjs run apps/web/public/app/features/settings.test.js --reporter verbose
```

本轮已在 Windows 提权环境下验证通过的就是以上 3 条 assistant mode 相关命令。

如果只是要跑全量测试，仍可使用：

```powershell
corepack pnpm test
```

## 3. 当前不推荐的命令

当前不建议把下面这种写法当成“定向单测命令”：

```powershell
corepack pnpm test -- apps/web/public/app/features/settings.test.js
```

原因是当前仓库脚本里 `test` 定义为 `vitest run`，经 `pnpm` 转发后，实际会变成类似：

```text
vitest run "--" "apps/web/public/app/features/settings.test.js"
```

在当前环境下，这种写法可能把无关测试批量带起来，而不是只跑目标文件，进而暴露完全不相关的失败，干扰排查。

结论很直接：

- 定向测试：优先用 `node .\node_modules\vitest\vitest.mjs run <file>`
- 全量测试：再用 `corepack pnpm test`

## 4. 排查顺序

当 Windows 下的 Vitest 定向测试再次异常时，按下面顺序排查：

1. 先看是否是 `spawn EPERM`  
   如果是，优先判断为权限 / 沙箱问题，按既有流程提权后重试。

2. 如果提权后不再是 `EPERM`，看是否卡在执行前  
   若命令长时间没有进入测试结果输出，优先怀疑 discovery，而不是先怀疑测试逻辑。

3. 确认 `vitest.config.ts` 的排除项是否仍在  
   核对 [vitest.config.ts](/E:/project/star-sanctuary/vitest.config.ts) 中是否保留了对 `tmp/** / .tmp/** / .tmp-codex/** / .playwright-mcp/**` 的排除。

4. 先用直连命令跑最小目标文件  
   例如：

```powershell
node .\node_modules\vitest\vitest.mjs run apps/web/public/app/features/assistant-mode-settings-view-model.test.js --reporter verbose
```

5. 若定向命令通过，而 `pnpm test -- <file>` 失败或跑偏  
   优先判断为脚本转发 / 命令使用方式问题，不要误记成该测试文件本身失败。

## 5. 当前已知现象

当前仓库里，以下现象都已经被验证过：

- 未提权时，最小 Vitest 命令可能先报 `esbuild spawn EPERM`
- 提权后，若 discovery 未收敛，卡点会出现在 `globTestFiles()`
- 排除重型临时目录后，assistant mode 的定向前端测试可在约 1 秒内稳定完成
- `corepack pnpm test -- <file>` 在当前脚本口径下不适合作为 Windows 定向验证命令

## 6. 维护约定

后续如果又新增根目录级的大型镜像、临时产物或烟测目录，并且不应参与 Vitest discovery，应同步检查并更新：

- [vitest.config.ts](/E:/project/star-sanctuary/vitest.config.ts)
- [AGENTS.md](/E:/project/star-sanctuary/AGENTS.md)
- 本文档
