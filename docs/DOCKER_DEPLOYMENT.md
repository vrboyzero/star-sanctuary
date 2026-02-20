# Belldandy Docker 部署指南

本文档介绍如何使用 Docker 部署 Belldandy Gateway。

## 前置要求

- Docker 20.10+ 
- Docker Compose 2.0+
- 至少 2GB 可用磁盘空间

## 快速开始

### 1. 准备配置文件

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写必需的配置项：

```bash
# 认证 Token（必填）
BELLDANDY_AUTH_TOKEN=your-secure-token-here

# OpenAI API 配置（必填）
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-your-api-key-here
BELLDANDY_OPENAI_MODEL=gpt-4
```

**生成安全 Token**：

```bash
# Linux/macOS
openssl rand -hex 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. 构建镜像

```bash
./scripts/docker-build.sh
```

或手动构建：

```bash
docker build -t belldandy:local .
```

### 3. 启动服务

使用一键部署脚本：

```bash
./scripts/docker-deploy.sh
```

或手动启动：

```bash
docker-compose up -d belldandy-gateway
```

### 4. 访问 WebChat

打开浏览器访问：

```
http://localhost:28889
```

## 配置说明

### 网络配置

**仅本机访问**（默认）：

```env
BELLDANDY_HOST=127.0.0.1
BELLDANDY_GATEWAY_PORT=28889
```

**局域网访问**：

```env
BELLDANDY_HOST=0.0.0.0
BELLDANDY_GATEWAY_PORT=28889
BELLDANDY_AUTH_MODE=token  # 必须启用认证
BELLDANDY_AUTH_TOKEN=your-secure-token-here
```

### 认证模式

支持三种认证模式：

1. **Token 认证**（推荐）：

```env
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token-here
```

2. **密码认证**：

```env
BELLDANDY_AUTH_MODE=password
BELLDANDY_AUTH_PASSWORD=your-secure-password-here
```

3. **无认证**（仅限本地开发）：

```env
BELLDANDY_AUTH_MODE=none
BELLDANDY_HOST=127.0.0.1  # 必须是 127.0.0.1
```

⚠️ **安全警告**：使用 `0.0.0.0` 时禁止使用 `none` 模式，Gateway 会强制退出。

### Agent 配置

**OpenAI 兼容 API**：

```env
BELLDANDY_AGENT_PROVIDER=openai
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-your-api-key-here
BELLDANDY_OPENAI_MODEL=gpt-4
```

**Mock Agent**（测试用）：

```env
BELLDANDY_AGENT_PROVIDER=mock
```

### 功能开关

```env
# 工具调用（ReAct 循环）
BELLDANDY_TOOLS_ENABLED=true

# 记忆系统
BELLDANDY_MEMORY_ENABLED=true

# 向量检索
BELLDANDY_EMBEDDING_ENABLED=false
BELLDANDY_EMBEDDING_MODEL=text-embedding-3-small

# MCP 协议
BELLDANDY_MCP_ENABLED=false

# 浏览器自动化
BELLDANDY_BROWSER_RELAY_ENABLED=false

# 定时任务
BELLDANDY_CRON_ENABLED=false

# 心跳检查
BELLDANDY_HEARTBEAT_ENABLED=false
```

### 数据持久化

默认数据目录：

```env
BELLDANDY_STATE_DIR=~/.belldandy
BELLDANDY_WORKSPACE_DIR=./workspace
```

数据存储结构：

```
~/.belldandy/
├── SOUL.md              # 人格配置
├── IDENTITY.md          # 身份配置
├── USER.md              # 用户信息
├── allowlist.json       # 客户端白名单
├── memory.db            # 记忆数据库
├── sessions/            # 会话记录
├── logs/                # 日志文件
└── methods/             # 方法论文档
```

## 常用命令

### 服务管理

```bash
# 启动服务
docker-compose up -d belldandy-gateway

# 停止服务
docker-compose down

# 重启服务
docker-compose restart belldandy-gateway

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f belldandy-gateway

# 查看最近 100 行日志
docker-compose logs --tail=100 belldandy-gateway
```

### CLI 工具

```bash
# 运行 CLI 命令
docker-compose run --rm belldandy-cli --help

# 查看配对列表
docker-compose run --rm belldandy-cli pairing:list

# 批准配对请求
docker-compose run --rm belldandy-cli pairing:approve <CODE>

# 健康检查
docker-compose run --rm belldandy-cli doctor
```

### 数据备份

```bash
# 备份状态目录
tar -czf belldandy-backup-$(date +%Y%m%d).tar.gz ~/.belldandy

# 恢复备份
tar -xzf belldandy-backup-20260220.tar.gz -C ~/
```

### 镜像管理

```bash
# 查看镜像
docker images | grep belldandy

# 删除旧镜像
docker rmi belldandy:local

# 重新构建
./scripts/docker-build.sh
```

## 升级指南

### 方式一：重新构建（推荐）

```bash
# 1. 停止服务
docker-compose down

# 2. 拉取最新代码
git pull

# 3. 重新构建镜像
./scripts/docker-build.sh

# 4. 启动服务
docker-compose up -d belldandy-gateway
```

### 方式二：使用官方镜像（未来支持）

```bash
# 1. 停止服务
docker-compose down

# 2. 拉取最新镜像
docker pull belldandy/gateway:latest

# 3. 更新 .env
BELLDANDY_IMAGE=belldandy/gateway:latest

# 4. 启动服务
docker-compose up -d belldandy-gateway
```

## 故障排查

### 容器无法启动

**检查日志**：

```bash
docker-compose logs belldandy-gateway
```

**常见问题**：

1. **端口被占用**：

```bash
# 检查端口占用
netstat -tulpn | grep 28889

# 修改端口
# 编辑 .env: BELLDANDY_GATEWAY_PORT=28890
```

2. **权限问题**：

```bash
# 确保数据目录可写
chmod -R 755 ~/.belldandy
```

3. **环境变量缺失**：

```bash
# 检查 .env 文件
cat .env | grep BELLDANDY_AUTH_TOKEN
```

### 健康检查失败

**手动测试健康检查**：

```bash
# 进入容器
docker exec -it belldandy-gateway bash

# 测试健康检查端点
curl http://127.0.0.1:28889/health
```

**预期输出**：

```json
{"status":"ok","timestamp":"2026-02-20T12:00:00.000Z"}
```

### WebChat 无法连接

**检查 WebSocket 连接**：

1. 打开浏览器开发者工具（F12）
2. 切换到 Network 标签
3. 刷新页面
4. 查找 WebSocket 连接错误

**常见原因**：

- 认证 Token 不匹配
- Origin 白名单配置错误
- 防火墙阻止连接

### 数据丢失

**检查 Volume 挂载**：

```bash
# 查看 Volume 配置
docker-compose config | grep volumes -A 5

# 检查数据目录
ls -la ~/.belldandy
```

**恢复数据**：

```bash
# 从备份恢复
tar -xzf belldandy-backup-20260220.tar.gz -C ~/
```

## 高级配置

### 自定义 Dockerfile

如需修改 Dockerfile，重新构建：

```bash
docker build -t belldandy:custom .
```

更新 `.env`：

```env
BELLDANDY_IMAGE=belldandy:custom
```

### 多实例部署

复制 `docker-compose.yml` 并修改端口：

```yaml
# docker-compose.instance2.yml
services:
  belldandy-gateway:
    ports:
      - "28890:28889"  # 不同端口
    volumes:
      - ~/.belldandy-instance2:/home/belldandy/.belldandy
```

启动第二个实例：

```bash
docker-compose -f docker-compose.instance2.yml up -d
```

### 反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name belldandy.example.com;

    location / {
        proxy_pass http://127.0.0.1:28889;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 资源限制

在 `docker-compose.yml` 中添加：

```yaml
services:
  belldandy-gateway:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## 安全建议

1. **使用强 Token**：至少 32 字节随机字符串
2. **定期备份**：每天备份 `~/.belldandy` 目录
3. **限制网络访问**：仅在必要时使用 `0.0.0.0`
4. **配置 Origin 白名单**：防止 CSWSH 攻击
5. **定期更新**：及时拉取最新镜像
6. **监控日志**：定期检查异常访问

## 性能优化

### 构建缓存

使用 BuildKit 缓存加速构建：

```bash
DOCKER_BUILDKIT=1 docker build \
  --cache-from type=local,src=/tmp/docker-cache \
  --cache-to type=local,dest=/tmp/docker-cache \
  -t belldandy:local .
```

### 镜像体积优化

当前镜像体积约 500MB（使用 `node:22-bookworm-slim`）。

进一步优化：

1. 使用 Alpine 基础镜像（需测试兼容性）
2. 清理不必要的依赖
3. 使用 `.dockerignore` 排除无关文件

## 相关文档

- [Belldandy 使用手册](../Belldandy使用手册.md)
- [CLAUDE.md](../CLAUDE.md)
- [README.md](../README.md)

## 支持

遇到问题？

1. 查看 [故障排查](#故障排查) 章节
2. 检查 [GitHub Issues](https://github.com/your-org/belldandy/issues)
3. 提交新 Issue 并附上日志
