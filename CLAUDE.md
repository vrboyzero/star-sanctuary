# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Belldandy is a **local-first personal AI assistant** — a pnpm monorepo using TypeScript (ESM). It runs on the user's device and communicates through WebChat, Feishu (Lark), and extensible chat channels.

**Workspace boundary**: Only develop in `e:\project\star-sanctuary`. The sibling `openclaw/` and `UI-TARS-desktop-main/` directories are **read-only** reference code.

## Commands

```bash
corepack pnpm install          # Install dependencies
corepack pnpm build            # Build all packages
corepack pnpm start            # Start Gateway (foreground, with auto-restart)
corepack pnpm dev:gateway      # Start Gateway (dev mode)
corepack pnpm test             # Run tests
corepack pnpm bdd --help       # CLI help
corepack pnpm bdd doctor       # Health check
corepack pnpm bdd start        # Start Gateway (foreground)
corepack pnpm bdd start -d     # Start Gateway (daemon/background mode)
corepack pnpm bdd stop         # Stop Gateway daemon
corepack pnpm bdd status       # Show Gateway daemon status
```

## Package Structure

```
packages/
├── belldandy-protocol/    # Shared types: WebSocket frames, events, auth modes
├── belldandy-agent/       # Agent runtime: BelldandyAgent, ToolEnabledAgent,
│                          #   FailoverClient, ConversationStore, hook system
├── belldandy-core/        # Gateway server, security/pairing, logger, CLI
├── belldandy-skills/      # Tool executor framework + builtin tools
├── belldandy-memory/      # SQLite + FTS5 + sqlite-vec hybrid RAG
├── belldandy-channels/    # Channel abstraction + Feishu implementation
├── belldandy-mcp/         # MCP client and tool bridge
├── belldandy-plugins/     # Plugin registry: dynamic JS/MJS loading
└── belldandy-browser/     # WebSocket-CDP relay for browser automation

apps/
├── web/public/            # WebChat frontend (vanilla JS/CSS)
└── browser-extension/     # Chrome Extension for browser automation
```

## Data Flow

1. **Client** (WebChat / Feishu) → WebSocket / channel adapter
2. **Gateway** (`belldandy-core/src/server.ts`) → auth, pairing, routing
3. **Agent** (`belldandy-agent/`) → OpenAIChatAgent or ToolEnabledAgent (ReAct loop)
4. **Tools** (`belldandy-skills/`) → execute actions
5. Gateway streams events back (`chat.delta`, `chat.final`, `tool_call`, etc.)

## Key Entry Points

| Purpose | File |
|---------|------|
| Gateway startup | `packages/belldandy-core/src/bin/gateway.ts` |
| HTTP/WS server | `packages/belldandy-core/src/server.ts` |
| Agent interface | `packages/belldandy-agent/src/index.ts` |
| Tool-enabled agent | `packages/belldandy-agent/src/tool-agent.ts` |
| Tool executor | `packages/belldandy-skills/src/executor.ts` |
| Memory store | `packages/belldandy-memory/src/store.ts` |

## Security Model

- **Pairing**: Default-deny. Unknown clients get pairing code. Allowlist in `~/.star_sanctuary/allowlist.json`
- **Bind safety**: `0.0.0.0` + `AUTH_MODE=none` → forced exit
- **Dangerous tools**: `run_command` requires `BELLDANDY_DANGEROUS_TOOLS_ENABLED=true`
- **SSRF protection**: `web_fetch` has DNS rebinding check

## Environment Variables

Core variables (see `.env.example` for full list):

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_PORT` | `28889` | Gateway port |
| `BELLDANDY_HOST` | `127.0.0.1` | Bind address |
| `BELLDANDY_AUTH_MODE` | `none` | `none` / `token` / `password` |
| `BELLDANDY_AGENT_PROVIDER` | `mock` | `mock` / `openai` |
| `BELLDANDY_OPENAI_BASE_URL` | — | OpenAI-compatible API base |
| `BELLDANDY_OPENAI_API_KEY` | — | API key |
| `BELLDANDY_OPENAI_MODEL` | — | Model name |
| `BELLDANDY_TOOLS_ENABLED` | `false` | Enable tool calling |

Use `.env.local` for persistent local config (Git-ignored).

## User Workspace (`~/.star_sanctuary/`)

```
~/.star_sanctuary/
├── SOUL.md / IDENTITY.md / USER.md   # Personality & user profile
├── TOOLS.md / AGENTS.md              # Local environment description
├── allowlist.json / pairing.json     # Security state
├── models.json                       # Failover model profiles
├── memory.db                         # SQLite (FTS5 + vector)
├── gateway.pid                       # Daemon PID file (when running in background)
├── logs/ / sessions/ / memory/       # Runtime data (logs/gateway.log for daemon output)
└── plugins/ / skills/                # User extensions
```

## Extending Belldandy

### Adding a New Agent Provider

1. Implement `BelldandyAgent` interface (async generator yielding `AgentStreamItem`)
2. Export from `packages/belldandy-agent/src/index.ts`
3. Add env-based selection in `packages/belldandy-core/src/bin/gateway.ts`

### Adding a New Builtin Tool

1. Create tool file in `packages/belldandy-skills/src/builtin/`
2. Implement `Tool` interface from `packages/belldandy-skills/src/types.ts`
3. Export from `packages/belldandy-skills/src/index.ts`
4. Register in `gateway.ts` `toolsToRegister` array

### Adding a New Channel

1. Implement `Channel` interface from `packages/belldandy-channels/src/types.ts`
2. Export from `packages/belldandy-channels/src/index.ts`
3. Add env-based initialization in `gateway.ts`

## Tech Stack

- Node.js ≥22.12.0, pnpm 10.x (corepack)
- TypeScript with project references
- Express 5 + ws for HTTP/WebSocket
- SQLite + FTS5 + sqlite-vec for RAG
- Vitest for testing

