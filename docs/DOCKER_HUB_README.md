# Belldandy - Local-first Personal AI Assistant

[![Docker Pulls](https://img.shields.io/docker/pulls/belldandy/belldandy)](https://hub.docker.com/r/belldandy/belldandy)
[![Docker Image Size](https://img.shields.io/docker/image-size/belldandy/belldandy/latest)](https://hub.docker.com/r/belldandy/belldandy)
[![GitHub](https://img.shields.io/github/license/your-org/belldandy)](https://github.com/your-org/belldandy)

Belldandy 是一个**本地优先的个人 AI 助手**，运行在你的设备上，通过 WebChat、飞书（Lark）等渠道提供智能对话服务。

## 特性

- 🏠 **本地优先**：数据存储在本地，隐私可控
- 🔧 **工具调用**：支持 20+ 内置工具（文件操作、网络搜索、浏览器自动化等）
- 🧠 **记忆系统**：SQLite + FTS5 + 向量检索混合 RAG
- 🔌 **MCP 协议**：兼容 Model Context Protocol
- 🌐 **多渠道**：WebChat、飞书、QQ（扩展中）
- 🐳 **容器化**：开箱即用的 Docker 部署
- 🔒 **安全**：Pairing 机制 + Token/Password 认证

## 快速开始

### 1. 使用 Docker Compose（推荐）

```bash
# 下载配置文件
curl -O https://raw.githubusercontent.com/your-org/belldandy/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/your-org/belldandy/main/.env.example

# 配置环境变量
cp .env.example .env
nano .env  # 填写 API Key 等配置

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

访问 http://localhost:28889 打开 WebChat 界面。

### 2. 使用 Docker Run

```bash
docker run -d \
  --name belldandy \
  -p 28889:28889 \
  -v ~/.belldandy:/home/belldandy/.belldandy \
  -e BELLDANDY_AUTH_MODE=token \
  -e BELLDANDY_AUTH_TOKEN=your-secure-token \
  -e BELLDANDY_AGENT_PROVIDER=openai \
  -e BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1 \
  -e BELLDANDY_OPENAI_API_KEY=sk-your-api-key \
  -e BELLDANDY_OPENAI_MODEL=gpt-4 \
  -e BELLDANDY_TOOLS_ENABLED=true \
  belldandy/belldandy:latest
```

## 环境变量

### 必需配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `BELLDANDY_AUTH_MODE` | 认证模式 (`none`/`token`/`password`) | `token` |
| `BELLDANDY_AUTH_TOKEN` | Token 认证密钥 | `openssl rand -hex 32` |
| `BELLDANDY_AGENT_PROVIDER` | Agent 提供商 (`mock`/`openai`) | `openai` |
| `BELLDANDY_OPENAI_BASE_URL` | OpenAI API 地址 | `https://api.openai.com/v1` |
| `BELLDANDY_OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `BELLDANDY_OPENAI_MODEL` | 模型名称 | `gpt-4` |

### 可选配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BELLDANDY_HOST` | `127.0.0.1` | 绑定地址（`0.0.0.0` 允许局域网访问） |
| `BELLDANDY_PORT` | `28889` | 服务端口 |
| `BELLDANDY_TOOLS_ENABLED` | `false` | 启用工具调用 |
| `BELLDANDY_MEMORY_ENABLED` | `false` | 启用记忆系统 |
| `BELLDANDY_EMBEDDING_ENABLED` | `false` | 启用向量检索 |
| `BELLDANDY_MCP_ENABLED` | `false` | 启用 MCP 协议 |
| `BELLDANDY_LOG_LEVEL` | `info` | 日志级别 (`debug`/`info`/`warn`/`error`) |

完整配置参考：[.env.example](https://github.com/your-org/belldandy/blob/main/.env.example)

## 数据持久化

### 推荐挂载点

```yaml
volumes:
  # 配置 + 状态（必需）
  - ~/.belldandy:/home/belldandy/.belldandy

  # 工作区（可选，用于文件工具）
  - ./workspace:/home/belldandy/workspace
```

### 目录结构

```
~/.belldandy/
├── SOUL.md              # 核心人格
├── IDENTITY.md          # Agent 身份
├── USER.md              # 用户档案
├── allowlist.json       # 已批准的客户端
├── memory.db            # 记忆数据库
├── logs/                # 日志文件
└── sessions/            # 会话记录
```

## 高级部署

### Tailscale 远程访问

通过 Tailscale 实现零配置远程访问：

```bash
# 启动 Tailscale 模式
docker-compose --profile tailscale up -d
```

详细文档：[Tailscale 部署指南](https://github.com/your-org/belldandy/blob/main/docs/TAILSCALE_DEPLOYMENT.md)

### 多架构支持

支持以下平台：
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

Docker 会自动拉取适配当前平台的镜像。

## 健康检查

```bash
# 检查容器健康状态
docker inspect --format='{{.State.Health.Status}}' belldandy

# 手动测试健康端点
curl http://localhost:28889/health
```

## 故障排查

### 容器无法启动

```bash
# 查看日志
docker logs belldandy

# 常见问题：
# 1. AUTH_TOKEN 未设置 → 检查 .env 文件
# 2. 端口冲突 → 修改 BELLDANDY_PORT
# 3. Volume 权限问题 → 检查 ~/.belldandy 权限
```

### 健康检查失败

```bash
# 进入容器调试
docker exec -it belldandy bash

# 检查进程
ps aux | grep node

# 检查端口
netstat -tlnp | grep 28889
```

### 性能优化

```bash
# 限制内存使用
docker run --memory=2g --memory-swap=2g belldandy/belldandy:latest

# 限制 CPU 使用
docker run --cpus=2 belldandy/belldandy:latest
```

## 安全建议

1. **强制认证**：生产环境必须启用 `AUTH_MODE=token` 或 `password`
2. **网络隔离**：使用 `BELLDANDY_HOST=127.0.0.1` 限制本地访问
3. **Origin 白名单**：配置 `BELLDANDY_ALLOWED_ORIGINS` 防止 CSWSH 攻击
4. **定期更新**：及时拉取最新镜像修复安全漏洞

```bash
# 更新到最新版本
docker-compose pull
docker-compose up -d
```

## 版本说明

- `latest` - 最新稳定版（跟踪 `main` 分支）
- `v1.2.3` - 特定版本号
- `v1.2` - 次版本号（自动更新补丁版本）
- `v1` - 主版本号（自动更新次版本）
- `main-abc123` - 开发版本（Git commit SHA）

## 资源链接

- 📖 [完整文档](https://github.com/your-org/belldandy/blob/main/README.md)
- 🐛 [问题反馈](https://github.com/your-org/belldandy/issues)
- 💬 [讨论区](https://github.com/your-org/belldandy/discussions)
- 🔧 [部署指南](https://github.com/your-org/belldandy/blob/main/docs/DOCKER_DEPLOYMENT.md)

## 许可证

MIT License - 详见 [LICENSE](https://github.com/your-org/belldandy/blob/main/LICENSE)

---

**注意**：本项目处于活跃开发中，API 可能发生变化。生产环境建议使用固定版本号（如 `v1.2.3`）而非 `latest`。
