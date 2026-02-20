{
  description = "Belldandy - Local-first Personal AI Assistant";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        # Node.js 版本
        nodejs = pkgs.nodejs_22;

        # pnpm 版本
        pnpm = pkgs.pnpm;

        # 构建 Belldandy 包
        belldandy = pkgs.stdenv.mkDerivation rec {
          pname = "belldandy";
          version = "0.1.0";

          src = ./.;

          nativeBuildInputs = [
            nodejs
            pnpm.configHook
          ];

          pnpmDeps = pnpm.fetchDeps {
            inherit pname version src;
            hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
          };

          buildPhase = ''
            runHook preBuild

            # 构建 TypeScript
            pnpm build

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # 创建输出目录
            mkdir -p $out/{bin,lib/belldandy}

            # 复制构建产物
            cp -r packages $out/lib/belldandy/
            cp -r apps $out/lib/belldandy/
            cp -r node_modules $out/lib/belldandy/
            cp package.json pnpm-workspace.yaml $out/lib/belldandy/

            # 创建启动脚本
            cat > $out/bin/belldandy <<EOF
            #!${pkgs.bash}/bin/bash
            export NODE_ENV=production
            export PATH="${nodejs}/bin:\$PATH"
            cd $out/lib/belldandy
            exec ${pnpm}/bin/pnpm start "\$@"
            EOF
            chmod +x $out/bin/belldandy

            # 创建 CLI 脚本
            cat > $out/bin/bdd <<EOF
            #!${pkgs.bash}/bin/bash
            export PATH="${nodejs}/bin:\$PATH"
            cd $out/lib/belldandy
            exec ${pnpm}/bin/pnpm bdd "\$@"
            EOF
            chmod +x $out/bin/bdd

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Local-first Personal AI Assistant";
            homepage = "https://github.com/your-org/belldandy";
            license = licenses.mit;
            maintainers = [ ];
            platforms = platforms.unix;
          };
        };

      in
      {
        # 默认包
        packages.default = belldandy;
        packages.belldandy = belldandy;

        # 开发环境
        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs
            pnpm
            pkgs.git
            pkgs.curl
            pkgs.jq
          ];

          shellHook = ''
            echo "🌸 Belldandy Development Environment"
            echo "Node.js: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo ""
            echo "Quick start:"
            echo "  pnpm install    # Install dependencies"
            echo "  pnpm build      # Build packages"
            echo "  pnpm start      # Start Gateway"
            echo "  pnpm bdd --help # CLI commands"
          '';
        };

        # NixOS 模块
        nixosModules.default = { config, lib, pkgs, ... }:
          with lib;
          let
            cfg = config.services.belldandy;
          in
          {
            options.services.belldandy = {
              enable = mkEnableOption "Belldandy AI Assistant";

              package = mkOption {
                type = types.package;
                default = belldandy;
                description = "Belldandy package to use";
              };

              host = mkOption {
                type = types.str;
                default = "127.0.0.1";
                description = "Bind address";
              };

              port = mkOption {
                type = types.port;
                default = 28889;
                description = "Gateway port";
              };

              authMode = mkOption {
                type = types.enum [ "none" "token" "password" ];
                default = "token";
                description = "Authentication mode";
              };

              authToken = mkOption {
                type = types.nullOr types.str;
                default = null;
                description = "Authentication token (use authTokenFile for secrets)";
              };

              authTokenFile = mkOption {
                type = types.nullOr types.path;
                default = null;
                description = "Path to file containing authentication token";
              };

              agentProvider = mkOption {
                type = types.enum [ "mock" "openai" ];
                default = "openai";
                description = "Agent provider";
              };

              openai = {
                baseUrl = mkOption {
                  type = types.str;
                  default = "https://api.openai.com/v1";
                  description = "OpenAI API base URL";
                };

                apiKeyFile = mkOption {
                  type = types.nullOr types.path;
                  default = null;
                  description = "Path to file containing OpenAI API key";
                };

                model = mkOption {
                  type = types.str;
                  default = "gpt-4";
                  description = "OpenAI model name";
                };
              };

              toolsEnabled = mkOption {
                type = types.bool;
                default = true;
                description = "Enable tool calling";
              };

              memoryEnabled = mkOption {
                type = types.bool;
                default = true;
                description = "Enable memory system";
              };

              stateDir = mkOption {
                type = types.path;
                default = "/var/lib/belldandy";
                description = "State directory";
              };

              user = mkOption {
                type = types.str;
                default = "belldandy";
                description = "User to run Belldandy as";
              };

              group = mkOption {
                type = types.str;
                default = "belldandy";
                description = "Group to run Belldandy as";
              };
            };

            config = mkIf cfg.enable {
              # 创建用户和组
              users.users.${cfg.user} = {
                isSystemUser = true;
                group = cfg.group;
                home = cfg.stateDir;
                createHome = true;
              };

              users.groups.${cfg.group} = { };

              # systemd 服务
              systemd.services.belldandy = {
                description = "Belldandy AI Assistant";
                wantedBy = [ "multi-user.target" ];
                after = [ "network.target" ];

                environment = {
                  NODE_ENV = "production";
                  BELLDANDY_HOST = cfg.host;
                  BELLDANDY_PORT = toString cfg.port;
                  BELLDANDY_AUTH_MODE = cfg.authMode;
                  BELLDANDY_AGENT_PROVIDER = cfg.agentProvider;
                  BELLDANDY_OPENAI_BASE_URL = cfg.openai.baseUrl;
                  BELLDANDY_OPENAI_MODEL = cfg.openai.model;
                  BELLDANDY_TOOLS_ENABLED = toString cfg.toolsEnabled;
                  BELLDANDY_MEMORY_ENABLED = toString cfg.memoryEnabled;
                  BELLDANDY_STATE_DIR = cfg.stateDir;
                };

                serviceConfig = {
                  Type = "simple";
                  User = cfg.user;
                  Group = cfg.group;
                  WorkingDirectory = cfg.stateDir;
                  ExecStart = "${cfg.package}/bin/belldandy";
                  Restart = "on-failure";
                  RestartSec = "5s";

                  # 安全加固
                  NoNewPrivileges = true;
                  PrivateTmp = true;
                  ProtectSystem = "strict";
                  ProtectHome = true;
                  ReadWritePaths = [ cfg.stateDir ];

                  # 从文件加载密钥
                  LoadCredential = mkMerge [
                    (mkIf (cfg.authTokenFile != null) [
                      "auth-token:${cfg.authTokenFile}"
                    ])
                    (mkIf (cfg.openai.apiKeyFile != null) [
                      "openai-api-key:${cfg.openai.apiKeyFile}"
                    ])
                  ];

                  # 环境变量（从 credentials 加载）
                  EnvironmentFile = pkgs.writeText "belldandy-env" ''
                    ${optionalString (cfg.authToken != null) "BELLDANDY_AUTH_TOKEN=${cfg.authToken}"}
                  '';

                  ExecStartPre = pkgs.writeShellScript "belldandy-pre-start" ''
                    # 从 credentials 加载密钥
                    if [ -f "$CREDENTIALS_DIRECTORY/auth-token" ]; then
                      export BELLDANDY_AUTH_TOKEN=$(cat "$CREDENTIALS_DIRECTORY/auth-token")
                    fi
                    if [ -f "$CREDENTIALS_DIRECTORY/openai-api-key" ]; then
                      export BELLDANDY_OPENAI_API_KEY=$(cat "$CREDENTIALS_DIRECTORY/openai-api-key")
                    fi
                  '';
                };
              };

              # 防火墙配置
              networking.firewall.allowedTCPPorts = mkIf (cfg.host == "0.0.0.0") [ cfg.port ];
            };
          };
      }
    );
}
