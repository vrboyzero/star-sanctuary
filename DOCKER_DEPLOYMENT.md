# Star Sanctuary Docker 部署指南

本文档对应当前仓库根目录下的 [docker-compose.yml](./docker-compose.yml) 与 [Dockerfile](./Dockerfile)。

当前发布口径：

- 官方仓库：`vrboyzero/star-sanctuary`
- Docker Hub 镜像：`vrboyzero/star-sanctuary`
- 对外品牌名：`Star Sanctuary`
- 兼容保留：`BELLDANDY_*` 环境变量、`belldandy-gateway` / `belldandy-cli` Compose service key

## 前置要求

- Docker 24+（建议）
- Docker Compose v2（命令统一使用 `docker compose`）
- 至少 2 GB 可用磁盘空间
- 若使用 OpenAI 兼容 Provider，需准备可用的 API Key

## 快速开始

### 1. 准备配置文件

```bash
cp .env.example .env
```

至少填写这些变量：

```env
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token-here
BELLDANDY_AGENT_PROVIDER=openai
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-your-api-key-here
BELLDANDY_OPENAI_MODEL=gpt-4o
```

生成随机 Token：

```bash
# Linux/macOS
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. 选择镜像来源

#### 方式 A：使用 Docker Hub 官方镜像

在 `.env` 中显式指定：

```env
BELLDANDY_IMAGE=vrboyzero/star-sanctuary:latest
```

然后执行：

```bash
docker compose pull
docker compose up -d belldandy-gateway
```

#### 方式 B：本地构建镜像

```bash
docker build \
  --target runtime \
  --build-arg BELLDANDY_VERSION=0.1.0-local \
  -t vrboyzero/star-sanctuary:local \
  .

docker compose up -d belldandy-gateway
```

> 仓库中仍保留 `scripts/docker-build.sh` / `scripts/docker-deploy.sh` 辅助脚本，但发版说明与故障排查统一以 `docker compose` 原生命令为准。

### 3. 访问服务

- WebChat: <http://localhost:28889>
- 健康检查: <http://localhost:28889/health>

## Compose 服务说明

当前 `docker-compose.yml` 中保留了这些 service key：

- `belldandy-gateway`：主 Gateway 服务
- `belldandy-cli`：CLI 管理工具（按需运行）
- `tailscale`：Tailscale sidecar
- `belldandy-gateway-tailscale`：共享 Tailscale 网络栈的 Gateway

这些旧 key 仅用于兼容现有脚本、命令和运维说明，不影响对外品牌名与镜像名。

## 关键配置说明

### 网络与鉴权

仅本机访问：

```env
BELLDANDY_HOST=127.0.0.1
BELLDANDY_GATEWAY_PORT=28889
BELLDANDY_AUTH_MODE=token
```

局域网访问：

```env
BELLDANDY_HOST=0.0.0.0
BELLDANDY_GATEWAY_PORT=28889
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token-here
```

> `BELLDANDY_HOST=0.0.0.0` 时不要使用 `BELLDANDY_AUTH_MODE=none`。

### Agent Provider

OpenAI 兼容接口：

```env
BELLDANDY_AGENT_PROVIDER=openai
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-your-api-key-here
BELLDANDY_OPENAI_MODEL=gpt-4o
```

Smoke test / 本地占位：

```env
BELLDANDY_AGENT_PROVIDER=mock
```

### 持久化目录

容器内默认状态目录已经切换到：

```text
/home/belldandy/.star_sanctuary
```

推荐在 `.env` 中显式设置宿主机目录：

```env
BELLDANDY_STATE_DIR=/absolute/path/to/star_sanctuary
BELLDANDY_WORKSPACE_DIR=/absolute/path/to/workspace
```

示例：

```env
# Linux/macOS
BELLDANDY_STATE_DIR=/home/alice/.star_sanctuary

# Windows（PowerShell / Docker Desktop）
BELLDANDY_STATE_DIR=E:/star_sanctuary/state
```

> `~` 的展开行为依赖 shell / 平台。准备正式发版时，建议统一写绝对路径，避免 Windows 与 CI 环境歧义。

## 常用命令

### 服务管理

```bash
# 启动
docker compose up -d belldandy-gateway

# 停止并删除容器
docker compose down

# 重启
docker compose restart belldandy-gateway

# 状态
docker compose ps

# 日志
docker compose logs -f belldandy-gateway

# 最近 100 行日志
docker compose logs --tail=100 belldandy-gateway
```

### CLI 管理

```bash
docker compose run --rm belldandy-cli --help
docker compose run --rm belldandy-cli pairing:list
docker compose run --rm belldandy-cli pairing:approve <CODE>
docker compose run --rm belldandy-cli doctor
```

### 数据备份

```bash
tar -czf star-sanctuary-backup-$(date +%Y%m%d).tar.gz ~/.star_sanctuary
tar -xzf star-sanctuary-backup-20260310.tar.gz -C ~/
```

## 升级与回滚

### 升级到指定版本

```bash
# 1. 更新 .env 中的镜像 tag
# BELLDANDY_IMAGE=vrboyzero/star-sanctuary:0.1.0

# 2. 拉取镜像
docker compose pull

# 3. 重建服务
docker compose up -d --remove-orphans
```

### 回滚到旧版本

```bash
# 1. 把 .env 中的 BELLDANDY_IMAGE 改回旧 tag
# 2. 重新启动
docker compose up -d --remove-orphans
```

### 本地构建用户升级

```bash
git pull
docker build \
  --target runtime \
  --build-arg BELLDANDY_VERSION=0.1.0-local \
  -t vrboyzero/star-sanctuary:local \
  .
docker compose up -d belldandy-gateway
```

## Tailscale 远程访问

1. 在 `.env` 中设置：

```env
TAILSCALE_AUTH_KEY=tskey-auth-xxxxx
TAILSCALE_EXTRA_ARGS=--ssh
```

2. 启动：

```bash
docker compose --profile tailscale up -d tailscale belldandy-gateway-tailscale
```

更多说明见 [docs/TAILSCALE_DEPLOYMENT.md](./docs/TAILSCALE_DEPLOYMENT.md)。

## 故障排查

### 容器无法启动

```bash
docker compose logs belldandy-gateway
```

优先检查：

1. `BELLDANDY_AUTH_TOKEN`、`BELLDANDY_OPENAI_API_KEY`、`BELLDANDY_OPENAI_MODEL` 是否填写。
2. `BELLDANDY_STATE_DIR` 是否为 Docker 可访问的绝对路径。
3. `BELLDANDY_GATEWAY_PORT` 是否与宿主机现有服务冲突。

### 健康检查失败

```bash
docker exec -it belldandy-gateway bash
curl http://127.0.0.1:28889/health
```

预期返回：

```json
{
  "status": "ok",
  "timestamp": "2026-03-10T00:00:00.000Z",
  "version": "0.1.0"
}
```

### WebChat 无法访问

检查：

1. 浏览器访问的端口是否与 `BELLDANDY_GATEWAY_PORT` 一致。
2. 若通过局域网访问，`BELLDANDY_HOST` 是否设为 `0.0.0.0`。
3. 若使用反向代理，是否已转发 WebSocket Upgrade 头。

### 数据目录为空或丢失

```bash
docker compose config
docker compose exec belldandy-gateway ls -la /home/belldandy/.star_sanctuary
```

如果宿主机路径写错，Compose 会创建一个新的空目录，看起来像“数据丢了”。

## 安全建议

1. 生产环境始终使用 `token` 或 `password` 鉴权。
2. 对外暴露时优先配合反向代理 / Tailscale，不直接裸露公网端口。
3. 定期备份 `BELLDANDY_STATE_DIR`。
4. 固定镜像 tag 发版，不要在生产环境长期追 `latest`。
5. 若启用局域网访问，务必同时配置强随机 Token。

## 相关文档

- [README.md](./README.md)
- [DOCKER_HUB_README.md](./DOCKER_HUB_README.md)
- [docs/TAILSCALE_DEPLOYMENT.md](./docs/TAILSCALE_DEPLOYMENT.md)
- [docs/用户版本升级手册.md](./docs/用户版本升级手册.md)

## 反馈

- GitHub Issues: <https://github.com/vrboyzero/star-sanctuary/issues>
- Releases: <https://github.com/vrboyzero/star-sanctuary/releases>
