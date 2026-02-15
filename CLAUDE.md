# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Belldandy is a **local-first personal AI assistant** — a pnpm monorepo using TypeScript (ESM). It runs on the user's device and communicates through WebChat, Feishu (Lark), and extensible chat channels.

**Workspace boundary**: Only develop in `e:\project\Belldandy`. The sibling `openclaw/` and `UI-TARS-desktop-main/` directories are **read-only** reference code.

## Commands

```bash
# Install dependencies
corepack pnpm install

# Build all packages (TypeScript project references)
corepack pnpm build

# Start Gateway with process supervisor (auto-restart on exit code 100)
corepack pnpm start

# Start Gateway directly (development, no auto-restart)
corepack pnpm dev:gateway

# Run tests
corepack pnpm test

# Pairing management
corepack pnpm pairing:approve <CODE>
corepack pnpm pairing:revoke <CLIENT_ID>
corepack pnpm pairing:list
corepack pnpm pairing:pending
corepack pnpm pairing:cleanup
corepack pnpm pairing:export --out backup.json
corepack pnpm pairing:import --in backup.json

# CLI (unified bdd entry point)
corepack pnpm bdd --help                # Show full command tree
corepack pnpm bdd doctor                # Health check (env, port, state dir, deps)
corepack pnpm bdd doctor --check-model  # Include model connectivity test
corepack pnpm bdd config list           # List .env.local config (secrets masked)
corepack pnpm bdd config get <KEY>      # Read a config value
corepack pnpm bdd config set <KEY> <V>  # Write a config value to .env.local
corepack pnpm bdd config edit           # Open .env.local in $EDITOR
corepack pnpm bdd config path           # Print .env.local path
corepack pnpm bdd relay start [--port]  # Start CDP relay standalone

# Setup wizard
corepack pnpm bdd setup                # Interactive onboarding wizard
corepack pnpm bdd setup --provider openai --base-url <URL> --api-key <KEY> --model <MODEL>  # Non-interactive
```

## Architecture

### Package Structure

```
packages/
├── belldandy-protocol/    # Shared types: WebSocket frames, events, auth modes
├── belldandy-agent/       # Agent runtime: BelldandyAgent interface, OpenAIChatAgent,
│                          #   ToolEnabledAgent, FailoverClient, ConversationStore,
│                          #   Workspace/SystemPrompt builder, 13-hook system,
│                          #   multimodal preprocessing (video upload, ms:// protocol)
├── belldandy-core/        # Gateway server (Express+WS), security/pairing, logger,
│                          #   heartbeat runner, cron scheduler, MCP bridge, CLI binaries
├── belldandy-skills/      # Tool executor framework + 20+ builtin tools
├── belldandy-memory/      # SQLite + FTS5 + sqlite-vec hybrid RAG, indexer, chunker,
│                          #   embedding provider, MemoryManager
├── belldandy-channels/    # Channel abstraction (Channel interface + ChannelManager)
│                          #   + Feishu (Lark) WebSocket implementation
├── belldandy-mcp/         # MCP (Model Context Protocol) client, tool bridge,
│                          #   config loader, multi-server manager
├── belldandy-plugins/     # Plugin registry: dynamic JS/MJS loading + hook aggregation
└── belldandy-browser/     # WebSocket-CDP relay for browser automation

apps/
├── web/public/            # WebChat frontend (vanilla JS/CSS, zero build step)
│   ├── index.html         # Main page (Ethereal Design System)
│   ├── app.js             # Frontend logic (WS, settings modal, boot sequence)
│   └── mirror.html        # Camera mirror page for loopback vision
└── browser-extension/     # Chrome Extension (MV3) for browser automation
    ├── manifest.json
    └── background.js      # chrome.debugger bridge
```

### Data Flow

1. **Client** (WebChat / Feishu) sends message via WebSocket or channel adapter
2. **Gateway** (`packages/belldandy-core/src/server.ts`) handles WS handshake, auth, pairing check, request routing
3. **Pairing** (`packages/belldandy-core/src/security/store.ts`) blocks unapproved clients (default-deny)
4. **Agent** (`packages/belldandy-agent/`) processes messages:
   - `OpenAIChatAgent` — simple streaming chat
   - `ToolEnabledAgent` — ReAct loop (think → tool call → observe → think)
   - `FailoverClient` — multi-model failover with cooldown/retry
5. **Tools** (`packages/belldandy-skills/`) execute actions (file I/O, web fetch, browser, etc.)
6. Gateway streams `chat.delta` / `chat.final` / `agent.status` / `tool_call` / `tool_result` events back

### WebSocket Protocol

Defined in `packages/belldandy-protocol/src/index.ts`:

- **Handshake**: `connect.challenge` → `connect` → `hello-ok`
- **Requests**: `req` (method + params) → `res` (ok/error)
- **Methods**: `message.send`, `config.read`, `config.update`, `system.doctor`, `system.restart`, `workspace.list`, `workspace.read`, `workspace.write`
- **Events**: `chat.delta`, `chat.final`, `agent.status`, `pairing.required`
- **Auth modes**: `none`, `token`, `password`

### Agent Stream Types

```typescript
type AgentStreamItem = AgentDelta | AgentFinal | AgentStatus | AgentToolCall | AgentToolResult;

// Multimodal input
type AgentContentPart = { type: "text"; text: string }
                      | { type: "image_url"; image_url: { url: string } }
                      | { type: "video_url"; video_url: { url: string } };
```

### Security Model

- **Pairing**: Default-deny. Unknown clients get a pairing code. Allowlist in `~/.belldandy/allowlist.json`, pending in `~/.belldandy/pairing.json` (1h TTL).
- **Origin whitelist**: `BELLDANDY_ALLOWED_ORIGINS` for CSWSH protection.
- **Bind safety**: `0.0.0.0` + `AUTH_MODE=none` → forced exit.
- **Config redaction**: `config.read` masks `*KEY*/*SECRET*/*TOKEN*/*PASSWORD*` fields.
- **Dangerous tools**: `run_command` requires `BELLDANDY_DANGEROUS_TOOLS_ENABLED=true`.
- **SSRF**: `web_fetch` has DNS rebinding protection (`isPrivateIP` post-resolve check).
- **Sensitive files**: `allowlist.json`, `pairing.json`, `mcp.json`, `feishu-state.json` blocked from workspace read.

### Hook System (13 hooks)

Defined in `packages/belldandy-agent/src/hooks.ts` + `hook-runner.ts`:

| Category | Hook | Mode | Purpose |
|----------|------|------|---------|
| Agent | `before_agent_start` | Sequential | Inject system prompt/context |
| Agent | `agent_end` | Parallel | Analyze completed conversation |
| Agent | `before_compaction` / `after_compaction` | Parallel | Context compression lifecycle |
| Message | `message_received` | Parallel | Logging |
| Message | `message_sending` | Sequential | Modify/cancel outgoing message |
| Message | `message_sent` | Parallel | Logging |
| Tool | `before_tool_call` | Sequential | Modify args or block call |
| Tool | `after_tool_call` | Parallel | Audit |
| Tool | `tool_result_persist` | Sync | Modify persisted result |
| Session | `session_start` / `session_end` | Parallel | Resource init/cleanup |
| Gateway | `gateway_start` / `gateway_stop` | Parallel | Service lifecycle |

## Builtin Tools

Registered in `packages/belldandy-skills/src/`:

| Tool | File | Description |
|------|------|-------------|
| `web_fetch` | `builtin/fetch.ts` | HTTP fetch (domain whitelist/blacklist, SSRF protection) |
| `file_read` / `file_write` / `file_delete` | `builtin/file.ts` | File I/O (path traversal protection, write modes: overwrite/append/replace/insert) |
| `list_files` | `builtin/list-files.ts` | Directory listing |
| `apply_patch` | `builtin/apply-patch/` | Unified diff / DSL patch application |
| `web_search` | `builtin/web-search/` | Brave / SerpAPI search |
| `run_command` | `builtin/system/exec.ts` | Shell execution (Safe Mode: whitelist, timeout, blocklist) |
| `process_manager` | `builtin/system/process.ts` | Long-running process management |
| `terminal` | `builtin/system/terminal.ts` | PTY terminal |
| `code_interpreter` | `builtin/code-interpreter/` | Python / JS sandboxed execution |
| `browser_open/navigate/click/type/screenshot/get_content/snapshot` | `builtin/browser/` | Browser automation via CDP relay |
| `camera_snap` | `builtin/multimedia/camera.ts` | Loopback vision (webcam via mirror page) |
| `image_generate` | `builtin/multimedia/image.ts` | DALL-E 3 image generation |
| `text_to_speech` | `builtin/multimedia/tts.ts` | TTS (Edge TTS free / OpenAI) |
| `memory_search` / `memory_get` / `memory_index` | `builtin/memory.ts` | Hybrid RAG retrieval (FTS5 + vector) |
| `method_list/read/create/search` | `builtin/methodology/` | SOP methodology CRUD |
| `log_read` / `log_search` | `builtin/log.ts` | Structured log reading & search |
| `cron` (list/add/remove/status) | `builtin/cron-tool.ts` | Scheduled task management |
| `sessions_spawn` / `sessions_history` | `builtin/session/` | Session orchestration |

## Environment Variables

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_PORT` | `28889` | Gateway port |
| `BELLDANDY_HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for LAN access) |
| `BELLDANDY_AUTH_MODE` | `none` | `none` / `token` / `password` |
| `BELLDANDY_AUTH_TOKEN` | — | Required when AUTH_MODE=token |
| `BELLDANDY_AUTH_PASSWORD` | — | Required when AUTH_MODE=password |
| `BELLDANDY_ALLOWED_ORIGINS` | — | Comma-separated Origin whitelist for CSWSH |
| `BELLDANDY_STATE_DIR` | `~/.belldandy` | Workspace/state directory |
| `BELLDANDY_WEB_ROOT` | `apps/web/public` | WebChat static files path |

### Agent & Model

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_AGENT_PROVIDER` | `mock` | `mock` / `openai` |
| `BELLDANDY_OPENAI_BASE_URL` | — | OpenAI-compatible API base URL |
| `BELLDANDY_OPENAI_API_KEY` | — | API key (env only, never commit) |
| `BELLDANDY_OPENAI_MODEL` | — | Model name |
| `BELLDANDY_OPENAI_STREAM` | `true` | Enable streaming |
| `BELLDANDY_OPENAI_SYSTEM_PROMPT` | — | Extra system prompt appended to workspace prompt |
| `BELLDANDY_AGENT_TIMEOUT_MS` | — | Agent request timeout (min 5000) |
| `BELLDANDY_MODEL_CONFIG_FILE` | `~/.belldandy/models.json` | Failover model profiles |

### Tools & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_TOOLS_ENABLED` | `false` | Enable tool calling (ReAct loop) |
| `BELLDANDY_DANGEROUS_TOOLS_ENABLED` | `false` | Enable `run_command` (requires explicit opt-in) |
| `BELLDANDY_TOOLS_POLICY_FILE` | — | JSON file to override default tool policy |
| `BELLDANDY_EXTRA_WORKSPACE_ROOTS` | — | Comma-separated extra paths for file tools |

### Memory & Embedding

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_MEMORY_DB` | `~/.belldandy/memory.db` | SQLite memory database path |
| `BELLDANDY_EMBEDDING_ENABLED` | `false` | Enable vector embedding for memory |
| `BELLDANDY_EMBEDDING_MODEL` | — | Embedding model name (e.g. `text-embedding-004`) |

### Channels

| Variable | Description |
|----------|-------------|
| `BELLDANDY_FEISHU_APP_ID` | Feishu (Lark) app ID |
| `BELLDANDY_FEISHU_APP_SECRET` | Feishu (Lark) app secret |

### Heartbeat & Cron

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_HEARTBEAT_ENABLED` | `false` | Enable periodic HEARTBEAT.md check |
| `BELLDANDY_HEARTBEAT_INTERVAL` | `30m` | Interval (supports `30m`, `1h`, `300s`) |
| `BELLDANDY_HEARTBEAT_ACTIVE_HOURS` | — | Active window (e.g. `08:00-23:00`) |
| `BELLDANDY_CRON_ENABLED` | `false` | Enable cron scheduler |

### Browser

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_BROWSER_RELAY_ENABLED` | `false` | Start WebSocket-CDP relay |
| `BELLDANDY_RELAY_PORT` | `28892` | Relay server port |

### MCP

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_MCP_ENABLED` | `false` | Enable MCP protocol support (requires TOOLS_ENABLED) |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `BELLDANDY_LOG_LEVEL` | `debug` | Minimum log level (debug/info/warn/error) |
| `BELLDANDY_LOG_DIR` | `~/.belldandy/logs` | Log directory |
| `BELLDANDY_LOG_MAX_SIZE` | `10MB` | Max single log file size before rotation |
| `BELLDANDY_LOG_RETENTION_DAYS` | `7` | Auto-cleanup threshold |
| `BELLDANDY_LOG_CONSOLE` | `true` | Output to console |
| `BELLDANDY_LOG_FILE` | `true` | Write to file |

### Other

| Variable | Description |
|----------|-------------|
| `SETUP_TOKEN` | Magic link token for auto-open browser |
| `AUTO_OPEN_BROWSER` | `true` to auto-open browser on startup |

Use `.env.local` for persistent local configuration (Git-ignored). `.env` changes are watched and trigger auto-restart via exit code 100.

## Key Entry Points

| Purpose | File |
|---------|------|
| **Process supervisor** | `packages/belldandy-core/src/bin/launcher.ts` |
| **Gateway startup & orchestration** | `packages/belldandy-core/src/bin/gateway.ts` (829 lines, loads all subsystems) |
| **HTTP/WS server** | `packages/belldandy-core/src/server.ts` |
| **Agent interface** | `packages/belldandy-agent/src/index.ts` (`BelldandyAgent`) |
| **OpenAI provider** | `packages/belldandy-agent/src/openai.ts` |
| **Tool-enabled agent (ReAct)** | `packages/belldandy-agent/src/tool-agent.ts` |
| **Model failover** | `packages/belldandy-agent/src/failover-client.ts` |
| **Workspace/persona** | `packages/belldandy-agent/src/workspace.ts` |
| **System prompt builder** | `packages/belldandy-agent/src/system-prompt.ts` |
| **Conversation store** | `packages/belldandy-agent/src/conversation.ts` |
| **Hook system** | `packages/belldandy-agent/src/hooks.ts` + `hook-runner.ts` |
| **Multimodal preprocessing** | `packages/belldandy-agent/src/multimodal.ts` |
| **Tool executor** | `packages/belldandy-skills/src/executor.ts` |
| **Memory store** | `packages/belldandy-memory/src/store.ts` |
| **Memory indexer** | `packages/belldandy-memory/src/indexer.ts` |
| **Memory manager** | `packages/belldandy-memory/src/manager.ts` |
| **Pairing/security** | `packages/belldandy-core/src/security/store.ts` |
| **Logger** | `packages/belldandy-core/src/logger/` |
| **Heartbeat runner** | `packages/belldandy-core/src/heartbeat/` |
| **Cron scheduler** | `packages/belldandy-core/src/cron/` |
| **MCP integration** | `packages/belldandy-core/src/mcp/` |
| **Feishu channel** | `packages/belldandy-channels/src/feishu.ts` |
| **Channel manager** | `packages/belldandy-channels/src/manager.ts` |
| **MCP client** | `packages/belldandy-mcp/src/client.ts` |
| **MCP tool bridge** | `packages/belldandy-mcp/src/tool-bridge.ts` |
| **Browser relay** | `packages/belldandy-browser/src/relay.ts` |
| **WebChat frontend** | `apps/web/public/app.js` |
| **Chrome extension** | `apps/browser-extension/background.js` |

## Gateway Startup Sequence

`gateway.ts` initializes subsystems in this order:

1. Load `.env.local` / `.env` (no dotenv dependency, custom parser)
2. Parse all env vars, create logger
3. Security check (reject `0.0.0.0` + `AUTH_MODE=none`)
4. Ensure state dir + methods dir
5. Init `MemoryStore` (SQLite)
6. Init `ToolExecutor` with builtin tools (conditional on `TOOLS_ENABLED`)
7. Init MCP integration (conditional on `MCP_ENABLED`)
8. Index memory files (MEMORY.md + memory/*.md)
9. Ensure workspace (create missing SOUL/IDENTITY/USER/AGENTS/TOOLS/HEARTBEAT files)
10. Load workspace files → build dynamic system prompt
11. Create agent factory (OpenAI or Mock)
12. Init `ConversationStore` (file-backed sessions)
13. Start Gateway server (Express + WebSocket)
14. Start Feishu channel (if configured)
15. Start Heartbeat runner (if enabled)
16. Start Cron scheduler (if enabled)
17. Start Browser relay (if enabled)
18. Watch `.env`/`.env.local` for changes → auto-restart

## User Workspace (`~/.belldandy/`)

```
~/.belldandy/
├── SOUL.md              # Core personality
├── IDENTITY.md          # Agent identity
├── USER.md              # User profile
├── AGENTS.md            # Workspace usage guide
├── TOOLS.md             # Local tools/environment description
├── HEARTBEAT.md         # Periodic task instructions
├── BOOTSTRAP.md         # First-run ritual (auto-deleted after)
├── TTS_ENABLED          # Signal file: presence enables TTS mode
├── allowlist.json       # Approved client IDs
├── pairing.json         # Pending pairing codes
├── models.json          # Failover model profiles
├── mcp.json             # MCP server configuration
├── feishu-state.json    # Feishu last chat ID
├── cron-jobs.json       # Cron scheduled tasks
├── memory.db            # SQLite (FTS5 + sqlite-vec)
├── logs/                # Structured logs (daily rotation + size rotation)
├── sessions/            # Conversation persistence (JSONL per conversation)
├── memory/              # Daily notes (YYYY-MM-DD.md)
├── methods/             # SOP methodology documents
├── plugins/             # User plugins (JS/MJS, auto-loaded)
└── skills/              # User custom tools
```

## Adding a New Agent Provider

1. Implement `BelldandyAgent` interface (async generator yielding `AgentStreamItem`)
2. Export from `packages/belldandy-agent/src/index.ts`
3. Add env-based selection in `packages/belldandy-core/src/bin/gateway.ts`

## Adding a New Builtin Tool

1. Create tool file in `packages/belldandy-skills/src/builtin/`
2. Implement `Tool` interface from `packages/belldandy-skills/src/types.ts`
3. Export from `packages/belldandy-skills/src/index.ts`
4. Register in `gateway.ts` `toolsToRegister` array

## Adding a New Channel

1. Implement `Channel` interface from `packages/belldandy-channels/src/types.ts`
2. Export from `packages/belldandy-channels/src/index.ts`
3. Add env-based initialization in `gateway.ts`

## Tech Stack

- Node.js ≥22.12.0, pnpm 10.x (corepack managed)
- TypeScript with project references (`tsc -b`)
- Express 5 + ws for HTTP/WebSocket
- SQLite + FTS5 + sqlite-vec for memory/RAG
- Vitest for testing
- tsx for development execution
- puppeteer-core for browser automation
