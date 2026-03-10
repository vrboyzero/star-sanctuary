# Nix 部署指南

## 概述

Belldandy 提供 Nix Flake 支持，可以通过声明式配置在 NixOS 或任何支持 Nix 的系统上部署。

## 前置条件

### 1. 安装 Nix（带 Flakes 支持）

```bash
# 安装 Nix（官方安装器）
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

# 或使用传统安装器 + 启用 Flakes
sh <(curl -L https://nixos.org/nix/install) --daemon
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

### 2. 验证安装

```bash
nix --version  # 应显示 2.18+ 或更高版本
nix flake --help  # 应显示 flake 命令帮助
```

---

## 快速开始

### 方式 1: 直接运行（无需克隆仓库）

```bash
# 运行 Belldandy Gateway
nix run github:your-org/belldandy

# 运行 CLI
nix run github:your-org/belldandy#bdd -- --help
```

### 方式 2: 开发环境

```bash
# 克隆仓库
git clone https://github.com/your-org/belldandy.git
cd belldandy

# 进入开发环境
nix develop

# 现在可以使用 pnpm 命令
pnpm install
pnpm build
pnpm start
```

### 方式 3: 安装到用户环境

```bash
# 安装 Belldandy
nix profile install github:your-org/belldandy

# 现在可以直接使用命令
belldandy  # 启动 Gateway
bdd --help  # CLI 命令
```

---

## NixOS 系统集成

### 1. 添加 Flake 输入

编辑 `/etc/nixos/flake.nix`：

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    belldandy.url = "github:your-org/belldandy";
  };

  outputs = { self, nixpkgs, belldandy }: {
    nixosConfigurations.your-hostname = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ./configuration.nix
        belldandy.nixosModules.default
      ];
    };
  };
}
```

### 2. 配置服务

编辑 `/etc/nixos/configuration.nix`：

```nix
{ config, pkgs, ... }:

{
  # 启用 Belldandy 服务
  services.belldandy = {
    enable = true;

    # 网络配置
    host = "127.0.0.1";  # 或 "0.0.0.0" 允许局域网访问
    port = 28889;

    # 认证配置
    authMode = "token";
    authTokenFile = "/run/secrets/belldandy-token";  # 使用 agenix 或 sops-nix 管理密钥

    # Agent 配置
    agentProvider = "openai";
    openai = {
      baseUrl = "https://api.openai.com/v1";
      apiKeyFile = "/run/secrets/openai-api-key";
      model = "gpt-4";
    };

    # 功能开关
    toolsEnabled = true;
    memoryEnabled = true;

    # 数据目录
    stateDir = "/var/lib/belldandy";

    # 用户配置
    user = "belldandy";
    group = "belldandy";
  };

  # 配置防火墙（如果需要局域网访问）
  networking.firewall.allowedTCPPorts = [ 28889 ];
}
```

### 3. 应用配置

```bash
# 重建系统
sudo nixos-rebuild switch

# 查看服务状态
systemctl status belldandy

# 查看日志
journalctl -u belldandy -f
```

---

## 密钥管理

### 方式 1: agenix（推荐）

```nix
# 安装 agenix
inputs.agenix.url = "github:ryantm/agenix";

# 配置密钥
age.secrets.belldandy-token = {
  file = ./secrets/belldandy-token.age;
  owner = "belldandy";
};

age.secrets.openai-api-key = {
  file = ./secrets/openai-api-key.age;
  owner = "belldandy";
};

# 在 Belldandy 配置中引用
services.belldandy = {
  authTokenFile = config.age.secrets.belldandy-token.path;
  openai.apiKeyFile = config.age.secrets.openai-api-key.path;
};
```

### 方式 2: sops-nix

```nix
# 安装 sops-nix
inputs.sops-nix.url = "github:Mic92/sops-nix";

# 配置密钥
sops.secrets.belldandy-token = {
  owner = "belldandy";
};

sops.secrets.openai-api-key = {
  owner = "belldandy";
};

# 在 Belldandy 配置中引用
services.belldandy = {
  authTokenFile = config.sops.secrets.belldandy-token.path;
  openai.apiKeyFile = config.sops.secrets.openai-api-key.path;
};
```

---

## 高级配置

### 1. 自定义包版本

```nix
services.belldandy = {
  enable = true;
  package = pkgs.belldandy.override {
    # 自定义构建选项
  };
};
```

### 2. 多实例部署

```nix
# 实例 1: 开发环境
services.belldandy-dev = {
  enable = true;
  port = 28889;
  stateDir = "/var/lib/belldandy-dev";
};

# 实例 2: 生产环境
services.belldandy-prod = {
  enable = true;
  port = 28890;
  stateDir = "/var/lib/belldandy-prod";
};
```

### 3. 反向代理（Nginx）

```nix
services.nginx = {
  enable = true;
  virtualHosts."belldandy.example.com" = {
    enableACME = true;
    forceSSL = true;
    locations."/" = {
      proxyPass = "http://127.0.0.1:28889";
      proxyWebsockets = true;
      extraConfig = ''
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      '';
    };
  };
};
```

### 4. 自动备份

```nix
services.restic.backups.belldandy = {
  paths = [ "/var/lib/belldandy" ];
  repository = "s3:s3.amazonaws.com/my-backup-bucket";
  passwordFile = "/run/secrets/restic-password";
  timerConfig = {
    OnCalendar = "daily";
  };
};
```

---

## 开发工作流

### 1. 本地开发

```bash
# 进入开发环境
nix develop

# 安装依赖
pnpm install

# 构建
pnpm build

# 运行
pnpm start
```

### 2. 构建包

```bash
# 构建 Belldandy 包
nix build

# 查看构建产物
ls -lh result/

# 运行构建产物
./result/bin/belldandy
```

### 3. 更新依赖

```bash
# 更新 flake.lock
nix flake update

# 更新特定输入
nix flake lock --update-input nixpkgs
```

### 4. 检查 Flake

```bash
# 检查 flake 语法
nix flake check

# 显示 flake 信息
nix flake show

# 显示 flake 元数据
nix flake metadata
```

---

## 故障排查

### 1. 构建失败

```bash
# 查看详细构建日志
nix build --print-build-logs

# 进入构建环境调试
nix develop .#belldandy
```

### 2. 服务无法启动

```bash
# 查看 systemd 日志
journalctl -u belldandy -n 100

# 检查配置
systemctl cat belldandy

# 手动运行测试
sudo -u belldandy /nix/store/.../bin/belldandy
```

### 3. 权限问题

```bash
# 检查状态目录权限
ls -ld /var/lib/belldandy

# 修复权限
sudo chown -R belldandy:belldandy /var/lib/belldandy
sudo chmod 750 /var/lib/belldandy
```

### 4. 网络问题

```bash
# 检查端口监听
sudo ss -tlnp | grep 28889

# 检查防火墙
sudo iptables -L -n | grep 28889

# 测试连接
curl http://localhost:28889/health
```

---

## 性能优化

### 1. 启用二进制缓存

```nix
# 在 configuration.nix 中添加
nix.settings = {
  substituters = [
    "https://cache.nixos.org"
    "https://your-org.cachix.org"  # 如果有自定义缓存
  ];
  trusted-public-keys = [
    "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
    "your-org.cachix.org-1:..."
  ];
};
```

### 2. 垃圾回收

```bash
# 清理旧版本
nix-collect-garbage -d

# 优化 Nix store
nix-store --optimise
```

### 3. 构建缓存

```bash
# 使用 cachix 缓存构建产物
cachix use your-org
nix build --json | jq -r '.[].outputs.out' | cachix push your-org
```

---

## 与其他部署方式对比

| 特性 | Nix | Docker | 裸机 |
|------|-----|--------|------|
| **声明式配置** | ✅ | ⚠️ (docker-compose) | ❌ |
| **可重现构建** | ✅ | ✅ | ❌ |
| **系统集成** | ✅ (systemd) | ⚠️ (需手动) | ✅ |
| **依赖隔离** | ✅ | ✅ | ❌ |
| **回滚能力** | ✅ (原子) | ⚠️ (需手动) | ❌ |
| **学习曲线** | 高 | 中 | 低 |
| **适用场景** | NixOS 用户 | 通用 | 开发 |

---

## 常见问题

### Q: 如何更新 Belldandy？

```bash
# 更新 flake 输入
nix flake lock --update-input belldandy

# 重建系统
sudo nixos-rebuild switch
```

### Q: 如何回滚到旧版本？

```bash
# 查看历史版本
sudo nix-env --list-generations --profile /nix/var/nix/profiles/system

# 回滚到上一个版本
sudo nixos-rebuild switch --rollback

# 回滚到特定版本
sudo nix-env --switch-generation 42 --profile /nix/var/nix/profiles/system
sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch
```

### Q: 如何在非 NixOS 系统使用？

```bash
# 使用 home-manager
home.packages = [ inputs.belldandy.packages.${system}.default ];

# 或直接安装
nix profile install github:your-org/belldandy
```

### Q: 如何贡献 Nix 配置？

参考 [CONTRIBUTING.md](../CONTRIBUTING.md) 中的 Nix 开发指南。

---

## 参考资源

- [Nix 官方文档](https://nixos.org/manual/nix/stable/)
- [NixOS 手册](https://nixos.org/manual/nixos/stable/)
- [Nix Flakes 指南](https://nixos.wiki/wiki/Flakes)
- [agenix 文档](https://github.com/ryantm/agenix)
- [sops-nix 文档](https://github.com/Mic92/sops-nix)

---

## 下一步

- 探索 [Docker 部署](./DOCKER_DEPLOYMENT.md)
- 配置 [Tailscale 远程访问](./TAILSCALE_DEPLOYMENT.md)
- 查看 [完整配置示例](../examples/nixos-configuration.nix)
