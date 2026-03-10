# Tailscale 远程访问部署指南

## 概述

Tailscale 是一个零配置 VPN 解决方案，基于 WireGuard 协议，可以让你在任何地方安全访问 Belldandy Gateway，无需：
- 公网 IP
- 端口转发
- 防火墙配置
- 复杂的 VPN 设置

## 前置条件

1. **Docker 环境**：Docker 20.10+ 和 Docker Compose
2. **Tailscale 账号**：在 [https://login.tailscale.com/](https://login.tailscale.com/) 注册（免费）
3. **Auth Key**：从 Tailscale 控制台生成

---

## 快速开始

### 1. 获取 Tailscale Auth Key

1. 访问 [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
2. 点击 **Generate auth key**
3. 配置选项：
   - **Reusable**: ✅ 勾选（允许多次使用）
   - **Ephemeral**: ❌ 不勾选（保持持久连接）
   - **Expiration**: 90 days（或根据需要调整）
4. 复制生成的 `tskey-auth-xxxxx` 密钥

### 2. 配置环境变量

编辑 `.env` 文件，添加 Tailscale 配置：

```bash
# Tailscale 远程访问
TAILSCALE_AUTH_KEY=tskey-auth-xxxxx  # 替换为你的 Auth Key
TAILSCALE_EXTRA_ARGS=--ssh           # 可选：启用 SSH 访问
```

### 3. 启动 Tailscale 模式

```bash
# 构建镜像（如果尚未构建）
./scripts/docker-build.sh

# 启动 Gateway + Tailscale
docker-compose --profile tailscale up -d

# 查看日志
docker-compose logs -f tailscale belldandy-gateway-tailscale
```

### 4. 获取 Tailscale IP

```bash
# 查看 Tailscale 状态
docker-compose exec tailscale tailscale status

# 输出示例：
# 100.64.0.1   belldandy-gateway  user@example.com  linux   active; direct 192.168.1.100:41641
```

记录 Tailscale IP（例如 `100.64.0.1`）。

### 5. 远程访问

在任何已加入 Tailscale 网络的设备上：

```bash
# 浏览器访问
http://100.64.0.1:28889

# 或使用主机名（如果启用了 MagicDNS）
http://belldandy-gateway:28889
```

---

## 架构说明

### Sidecar 模式

Belldandy 使用 Tailscale Sidecar 模式，两个容器共享网络栈：

```yaml
services:
  tailscale:
    image: tailscale/tailscale:latest
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    # ... Tailscale 配置

  belldandy-gateway-tailscale:
    image: belldandy:local
    network_mode: service:tailscale  # 共享 Tailscale 网络
    depends_on:
      - tailscale
    # ... Gateway 配置
```

**优势**：
- Gateway 无需修改代码
- Tailscale 负责所有网络加密和路由
- 容器间通过 localhost 通信

### 网络拓扑

```
[远程设备] <--Tailscale VPN--> [Tailscale Sidecar] <--localhost--> [Gateway Container]
```

---

## 高级配置

### 启用 SSH 访问

在 `.env` 中配置：

```bash
TAILSCALE_EXTRA_ARGS=--ssh
```

然后可以通过 Tailscale SSH 访问容器：

```bash
ssh belldandy-gateway
```

### 自定义主机名

修改 `docker-compose.yml` 中的 `hostname` 字段：

```yaml
tailscale:
  hostname: my-belldandy  # 自定义主机名
```

### ACL 访问控制

在 Tailscale Admin Console 配置 ACL，限制访问权限：

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["user@example.com"],
      "dst": ["tag:belldandy:*"]
    }
  ]
}
```

### 持久化 Tailscale 状态

Tailscale 状态已自动持久化到 Docker volume：

```yaml
volumes:
  - tailscale-state:/var/lib/tailscale
```

**备份方法**：

```bash
# 导出 volume
docker run --rm -v belldandy_tailscale-state:/data -v $(pwd):/backup \
  alpine tar czf /backup/tailscale-state.tar.gz -C /data .

# 恢复 volume
docker run --rm -v belldandy_tailscale-state:/data -v $(pwd):/backup \
  alpine tar xzf /backup/tailscale-state.tar.gz -C /data
```

---

## 故障排查

### 1. Tailscale 容器无法启动

**症状**：`docker-compose logs tailscale` 显示权限错误

**解决方法**：

```bash
# 检查 /dev/net/tun 设备
ls -l /dev/net/tun

# 如果不存在，创建设备
sudo mkdir -p /dev/net
sudo mknod /dev/net/tun c 10 200
sudo chmod 666 /dev/net/tun
```

### 2. Auth Key 过期

**症状**：日志显示 `authentication failed`

**解决方法**：
1. 在 Tailscale Admin Console 生成新的 Auth Key
2. 更新 `.env` 中的 `TAILSCALE_AUTH_KEY`
3. 重启容器：`docker-compose --profile tailscale restart`

### 3. 无法连接到 Gateway

**症状**：浏览器访问 `http://100.64.0.1:28889` 超时

**诊断步骤**：

```bash
# 1. 检查 Tailscale 状态
docker-compose exec tailscale tailscale status

# 2. 检查 Gateway 健康状态
docker-compose exec tailscale curl http://127.0.0.1:28889/health

# 3. 检查防火墙（宿主机）
sudo ufw status
sudo iptables -L -n

# 4. 检查 Gateway 日志
docker-compose logs belldandy-gateway-tailscale
```

### 4. 网络冲突

**症状**：Tailscale IP 与本地网络冲突

**解决方法**：
在 Tailscale Admin Console 修改 IP 分配范围（Settings → IP Addresses）

### 5. 性能问题

**症状**：连接延迟高

**优化方法**：

```bash
# 检查连接类型（direct 最快）
docker-compose exec tailscale tailscale status

# 如果显示 relay，检查 NAT 穿透
docker-compose exec tailscale tailscale netcheck
```

---

## 安全最佳实践

### 1. Auth Key 管理

- ✅ 使用 **Reusable** 密钥（方便重新部署）
- ✅ 设置合理的过期时间（90 天）
- ❌ 不要将 Auth Key 提交到 Git
- ❌ 不要在公共场所分享 Auth Key

### 2. 访问控制

- 启用 Tailscale ACL，限制访问来源
- 使用 `BELLDANDY_AUTH_MODE=token` 双重认证
- 定期审计 Tailscale Admin Console 的设备列表

### 3. 网络隔离

- 使用 Tailscale Tags 隔离不同环境（dev/prod）
- 配置 Exit Nodes 时注意流量路由

### 4. 日志审计

```bash
# 查看 Tailscale 连接日志
docker-compose logs tailscale | grep "connection"

# 查看 Gateway 访问日志
docker-compose logs belldandy-gateway-tailscale | grep "request"
```

---

## 与本地部署对比

| 特性 | 本地部署 | Tailscale 部署 |
|------|----------|----------------|
| **访问范围** | 仅本机/局域网 | 全球任意位置 |
| **配置复杂度** | 低 | 中（需 Tailscale 账号） |
| **安全性** | 依赖本地网络 | 端到端加密 |
| **端口转发** | 不需要 | 不需要 |
| **公网 IP** | 不需要 | 不需要 |
| **性能** | 最快（本地） | 快（P2P 直连） |
| **适用场景** | 开发/测试 | 生产/远程办公 |

---

## 常见问题

### Q: Tailscale 免费吗？

A: 个人用户免费（最多 100 台设备），企业用户需付费。

### Q: 可以同时运行本地和 Tailscale 模式吗？

A: 可以，使用不同的 profile：

```bash
# 本地模式（默认）
docker-compose up -d belldandy-gateway

# Tailscale 模式
docker-compose --profile tailscale up -d
```

### Q: 如何切换回本地模式？

```bash
# 停止 Tailscale 模式
docker-compose --profile tailscale down

# 启动本地模式
docker-compose up -d belldandy-gateway
```

### Q: Tailscale 会影响性能吗？

A: 影响很小。Tailscale 使用 P2P 直连（当 NAT 允许时），延迟通常 <10ms。

### Q: 支持 IPv6 吗？

A: 支持。Tailscale 自动分配 IPv6 地址（`fd7a:115c:a1e0::/48` 范围）。

---

## 参考资源

- [Tailscale 官方文档](https://tailscale.com/kb/)
- [Docker 集成指南](https://tailscale.com/kb/1282/docker/)
- [Tailscale ACL 配置](https://tailscale.com/kb/1018/acls/)
- [Belldandy Docker 部署文档](./DOCKER_DEPLOYMENT.md)

---

## 下一步

- 配置 [Kubernetes Helm Chart](./KUBERNETES_DEPLOYMENT.md)（规划中）
- 集成 [Nix Flake](./NIX_DEPLOYMENT.md)（规划中）
- 探索 [云平台一键部署](./CLOUD_DEPLOYMENT.md)（规划中）
