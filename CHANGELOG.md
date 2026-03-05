# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-05

### Added
- 建立版本单一源头：根 `package.json` 新增 `version`，构建前自动生成 `version.generated.ts`。
- `/health` 与 WebSocket `hello-ok` 返回版本号，Gateway 启动日志输出当前版本。
- 新增异步更新检查（GitHub Releases latest），支持环境变量开关与超时。
- Docker 构建链路支持 `BELLDANDY_VERSION` 注入，CI 构建/发布统一透传版本。
- GitHub Release 自动提取 `CHANGELOG.md` 对应版本段落作为发布说明。
- 新增 `scripts/release.sh` 一键发版脚本（version bump + commit + tag + push）。
