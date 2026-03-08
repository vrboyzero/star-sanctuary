# Star Sanctuary

<p align="center">
  <strong>🌟 Local‑first personal AI assistant</strong><br>
  Runs entirely on your own machine and talks to you through multiple channels.<br>
  <span style="color:#ff4d4f;font-weight:bold;">[Important Notice] This project is under active development and testing. Use at your own risk and do not rely on it for production workloads or storing sensitive data.</span>
</p>


<p align="center">
  <a href="./README.md"><b>简体中文</b></a> |
  <a href="./README.en.md">English</a>
</p>

---

## Introduction

Star Sanctuary is a **local‑first personal AI assistant**. It runs on your own computer, keeps your data private, and comes with powerful capabilities such as long‑term memory, tool usage, browser automation, and voice interaction.

### Design Principles

- **🔒 Single‑user, privacy‑first**: No public sharing features by default; everything is stored locally.
- **🛡️ Secure by default**: All inbound messages are treated as untrusted input. Tools run under strict allowlists and least‑privilege policies.
- **🔌 Extensible**: Channels, tools, and capabilities can be extended via the `plugins` / `skills` system.

### Tech Stack

| Category        | Tech                                       |
|-----------------|--------------------------------------------|
| **Language**    | TypeScript                                 |
| **Runtime**     | Node.js 22+                                |
| **Package**     | pnpm (monorepo)                            |
| **Database**    | SQLite + FTS5 + sqlite‑vec                 |
| **Transport**   | WebSocket                                  |
| **Frontend**    | Vanilla JS/CSS (no framework dependency)   |
| **Browser**     | Chrome Extension (MV3) + CDP relay         |
| **TTS**         | Edge TTS / OpenAI TTS                      |
| **Vector Search** | sqlite‑vec (C++ SIMD‑accelerated)       |

### Project Layout

```text
Belldandy/
├── packages/
│   ├── belldandy-core/              # Core gateway service
│   │   ├── server.ts                # Gateway entrypoint
│   │   ├── logger/                  # Logging (console + file rotation)
│   │   ├── heartbeat/               # Scheduled heartbeat jobs
│   │   └── pairing/                 # Client pairing and allowlist
│   │
│   ├── belldandy-agent/             # Agent runtime
│   │   ├── tool-agent.ts            # Tool‑enabled agent loop (ReAct)
│   │   ├── hooks.ts                 # 13 lifecycle hooks
│   │   ├── hook-runner.ts           # Hook executor
│   │   ├── system-prompt.ts         # System prompt construction
│   │   └── templates/               # Persona templates (SOUL/IDENTITY/...)
│   │
│   ├── belldandy-channels/          # Channels layer
│   │   ├── types.ts                 # Channel interfaces
│   │   ├── manager.ts               # Multi‑channel manager
│   │   └── feishu.ts                # Feishu (Lark) WebSocket channel
│   │
│   ├── belldandy-skills/            # Tools system
│   │   ├── builtin/
│   │   │   ├── fetch.ts             # Web fetch (with SSRF protection)
│   │   │   ├── file.ts              # File read/write (path traversal guard)
│   │   │   ├── list-files.ts        # Directory listing
│   │   │   ├── apply-patch/         # Apply unified diffs
│   │   │   ├── web-search/          # Web search (Brave/SerpAPI)
│   │   │   ├── system/              # System commands (Safe Mode)
│   │   │   ├── browser/             # Browser automation toolset
│   │   │   ├── memory.ts            # Memory search tools
│   │   │   ├── log.ts               # Log read/search (log_read/log_search)
│   │   │   ├── multimedia/          # TTS / image / camera
│   │   │   ├── methodology/         # SOP methodology tools
│   │   │   ├── session/             # Session orchestration (spawn/history)
│   │   │   └── code-interpreter/    # Code interpreter (Python/JS)
│   │   ├── executor.ts              # Tool executor
│   │   └── types.ts                 # Tool type definitions
│   │
│   ├── belldandy-memory/            # Memory subsystem
│   │   ├── store.ts                 # SQLite + FTS5 storage
│   │   ├── vector.ts                # sqlite‑vec vector search
│   │   ├── chunker.ts               # Text chunking
│   │   └── indexer.ts               # Incremental indexer & watcher
│   │
│   ├── belldandy-mcp/               # MCP (Model Context Protocol) support
│   │   ├── types.ts                 # MCP types
│   │   ├── config.ts                # MCP config loading & validation
│   │   ├── client.ts                # MCP client (stdio/SSE)
│   │   ├── tool-bridge.ts           # MCP tools → Star Sanctuary skills
│   │   └── manager.ts               # Multi‑server manager
│   │
│   ├── belldandy-plugins/           # Plugin system
│   │   └── registry.ts              # Dynamic loading + hook aggregation
│   │
│   └── belldandy-browser/           # Browser relay
│       └── relay.ts                 # WebSocket‑to‑CDP relay
│
├── apps/
│   ├── web/                         # WebChat frontend
│   │   └── public/
│   │       ├── index.html           # Main page
│   │       └── app.js               # Frontend logic
│   │
│   └── browser-extension/           # Chrome extension (MV3)
│       └── background.js            # chrome.debugger bridge
│
└── ~/.star_sanctuary/                    # User workspace (created at runtime)
    ├── SOUL.md                      # Core persona
    ├── IDENTITY.md                  # Identity
    ├── USER.md                      # User profile
    ├── MEMORY.md                    # Long‑term memory
    ├── HEARTBEAT.md                 # Heartbeat tasks
    ├── mcp.json                     # MCP server config
    ├── logs/                        # Runtime logs (rotated)
    ├── memory/                      # Daily notes
    ├── methods/                     # SOP methods
    ├── skills/                      # User‑defined tools
    ├── plugins/                     # User plugins
    ├── cron-jobs.json               # Cron jobs persistence
    └── sessions/                    # Session logs & compaction state
        ├── {id}.jsonl               # Session persistence
        └── {id}.compaction.json     # Compaction state
```

---

## Quick Start

### Requirements

- **OS**: Windows / macOS / Linux
- **Node.js**: **22.12.0** or later (LTS recommended)
- **Package manager**: `pnpm` (managed via corepack)

### One‑click Launch (Recommended)

**Windows**:

```bash
# In Explorer, double‑click
start.bat
```

**macOS / Linux**:

```bash
./start.sh
```

The script will: check your environment → install dependencies → verify and build `dist/` when needed → start the gateway → open the browser.

> **Note**: This repository is maintained primarily as source code, so the GitHub repo usually does not include committed `dist/` build artifacts. If `dist/` is missing on first launch, `start.bat` / `start.sh` will automatically run `corepack pnpm build`.

### Manual Launch

```bash
# 1. Enter project directory
cd Star Sanctuary

# 2. Install dependencies
corepack pnpm install

# 3. Build project (compile TypeScript into `dist/`)
corepack pnpm build

# 4. Start Gateway (Dev mode)
corepack pnpm bdd dev

# 5. Start Gateway (With supervisor auto-restart)
corepack pnpm bdd start

# 6. Open WebChat
# http://localhost:28889/
```

> **Note**: `pnpm bdd dev` runs TypeScript source directly via `tsx`, so it can skip the build step. `pnpm bdd start` runs compiled files from `dist/`, so you must run `corepack pnpm build` first or you may hit `Cannot find module` errors.

### First‑time Pairing

For security reasons, the first client must be paired:

1. Send any message in WebChat. A pairing code (e.g. `ABC123XY`) will be shown.
2. Approve the pairing in your terminal:
   ```bash
   corepack pnpm bdd pairing approve ABC123XY
   ```
3. Send another message — you can now chat normally.

---

## Features

### ✅ Implemented Modules

| Module            | Feature                        | Description                                                      |
|-------------------|--------------------------------|------------------------------------------------------------------|
| **Core**          | Gateway + WebChat              | WebSocket, streaming replies, Markdown rendering                 |
| **Security**      | Pairing                        | ClientId allowlist; unauthorized clients cannot trigger Agent    |
| **Skills**        | Tool system                    | `web_fetch`, `file_read/write`, `list_files`, `apply_patch`, `log_read`, `log_search` |
| **Memory**        | Hybrid RAG                     | SQLite FTS5 + sqlite‑vec hybrid retrieval                        |
| **Persona**       | SOUL system                    | Configurable persona, identity, and user profile                 |
| **Plugins**       | 13 lifecycle hooks             | HookRegistry + HookRunner + priorities                           |
| **Browser**       | Browser extension              | Snapshot, screenshot, click, type, automation via CDP relay      |
| **System exec**   | Safe Mode                      | Secure shell command execution with strict allowlist             |
| **Multimedia**    | TTS + image generation         | Free Edge TTS, DALL‑E 3 image generation                         |
| **Vision**        | Loopback Vision                | Use camera via browser to let Agent "see" the world             |
| **Methodology**   | SOP system                     | Agent self‑improvement and SOP reuse                             |
| **MCP**           | Model Context Protocol support | Connect external MCP servers as tools                            |
| **Channels**      | Feishu channel + channel API   | Extensible multi‑channel architecture                            |
| **Cron**          | Cron Tasks + Heartbeat         | `cron` tools for `at`/`every` scheduling; Heartbeat periodic checks |
| **Persona**       | FACET System                   | `switch_facet` tool to switch persona modules instantly          |
| **Vision**        | Native Vision & Video          | Support Kimi K2.5 for understanding uploaded images/videos (`ms://`) |
| **Memory**        | Context Compaction             | 3-tier context compression (Working/Rolling/Archival) prevents token overflow |
| **Management**    | Service Restart                | Agent can autonomously restart the gateway via `service_restart` |
| **UI**            | Config & Tools UI              | Web UI for settings, tool toggles, and System Doctor self-check  |
| **CLI Framework** | Unified `bdd` Command          | citty declarative subcommands, lazy loading, `--json` output     |


---

## Configuration

Create `.env.local` in the project root (Git ignored). You can use `.env.example` as a template.

### Basic Configuration (Required)

```env
# Choose an OpenAI‑compatible provider
BELLDANDY_AGENT_PROVIDER=openai

# API endpoint
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
# Or Gemini: https://generativelanguage.googleapis.com/v1beta/openai
# Or local Ollama: http://127.0.0.1:11434/v1

# API Key
BELLDANDY_OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# Model name
BELLDANDY_OPENAI_MODEL=gpt-4o
```

> 💡 You can also edit configuration in the Web UI: click the gear icon (⚙️) in the top‑right corner. Changes are written to `.env.local` and the backend restarts automatically.

### Advanced Configuration (Optional)

```env
# ------ Network & Security ------
BELLDANDY_PORT=28889                    # Server port
BELLDANDY_AUTH_MODE=none                # none | token | password

# ------ AI Capabilities ------
BELLDANDY_TOOLS_ENABLED=true            # Enable tool calling
BELLDANDY_EMBEDDING_ENABLED=true        # Enable memory retrieval
BELLDANDY_EMBEDDING_MODEL=text-embedding-004

# ------ Heartbeat ------
BELLDANDY_HEARTBEAT_ENABLED=true        # Periodically check HEARTBEAT.md
BELLDANDY_HEARTBEAT_INTERVAL=30m        # 30m, 1h, 300s
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00  # Quiet at night

# ------ Browser relay ------
BELLDANDY_BROWSER_RELAY_ENABLED=true    # Start browser relay automatically

# ------ MCP ------
BELLDANDY_MCP_ENABLED=true              # Enable MCP support

# ------ Logging ------
BELLDANDY_LOG_LEVEL=debug               # debug / info / warn / error
BELLDANDY_LOG_DIR=~/.star_sanctuary/logs     # Log directory
BELLDANDY_LOG_MAX_SIZE=10MB             # Rotate when exceeded
BELLDANDY_LOG_RETENTION_DAYS=7          # Auto‑delete old logs
BELLDANDY_LOG_CONSOLE=true              # Log to console
BELLDANDY_LOG_FILE=true                 # Log to files

# ------ Long-term Memory & Compaction ------
BELLDANDY_COMPACTION_ENABLED=true       # Enable automatic context compression
BELLDANDY_COMPACTION_THRESHOLD=20000    # Token usage threshold to trigger compaction
BELLDANDY_COMPACTION_KEEP_RECENT=10     # Number of recent messages to keep raw

# ------ Cron Tasks ------
BELLDANDY_CRON_ENABLED=true             # Enable the Cron scheduling engine

# ------ Failover & Multimodal ------
BELLDANDY_MODEL_CONFIG_FILE=~/.star_sanctuary/models.json # Fallback models & video upload config

```

### Tool Permissions (Brief)

- **File access**: confined to workspace roots by default; sensitive files like `.env` / `SOUL.md` are protected.
- **`file_write` capabilities**: supports `overwrite/append/replace/insert`; replace by line or regex; auto‑create parent dirs; dotfiles and base64 writes are policy‑controlled; `.sh` writes auto‑`chmod +x` on non‑Windows.
- **Multi‑workspace**: extend writable roots via `BELLDANDY_EXTRA_WORKSPACE_ROOTS` for cross‑project work.
- **System commands**: Safe Mode allowlist with non‑interactive injection, quick/build timeouts, and forced kill; dangerous args like `rm -r/-rf` and `del /s /q` are blocked.
- **Firewall rules**: path guard blocks access to `SOUL.md`; `exec` is forbidden from reading `.env`.
- **Policy overrides**: use `BELLDANDY_TOOLS_POLICY_FILE` to point at a JSON policy file (see `.env.example`).


### MCP Configuration


[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is a standard protocol for connecting AI assistants to external data sources and tools.

Example `~/.star_sanctuary/mcp.json`:

```json
{
  "version": "1.0.0",
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "description": "Access to local filesystem",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
      },
      "autoConnect": true,
      "enabled": true
    },
    {
      "id": "github",
      "name": "GitHub",
      "description": "GitHub API access",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
        }
      },
      "autoConnect": true,
      "enabled": true
    }
  ],
  "settings": {
    "defaultTimeout": 30000,
    "debug": false,
    "toolPrefix": true
  }
}
```

Supported transport types:

- `stdio`: local subprocess communication (recommended for most MCP servers)
- `sse`: HTTP Server‑Sent Events (for remote servers)

> 💡 MCP requires the tools system to be enabled (`BELLDANDY_TOOLS_ENABLED=true`).

---

## Personalization

Star Sanctuary stores all user data under `~/.star_sanctuary/`.

### Persona Files

| File          | Purpose           | Example                                   |
|---------------|-------------------|-------------------------------------------|
| `SOUL.md`     | Core personality  | "You are a meticulous TypeScript expert…" |
| `IDENTITY.md` | Identity profile  | "Your name is Star Sanctuary, a first‑class god…" |
| `USER.md`     | User profile      | "User is vrboyzero, a full‑stack engineer…" |

### Memory System

| Path                    | Purpose                      |
|-------------------------|------------------------------|
| `MEMORY.md`             | Long‑term curated facts      |
| `memory/YYYY-MM-DD.md`  | Daily notes / raw transcripts |

### Heartbeat Tasks

Edit `HEARTBEAT.md`:

```markdown
- [ ] Remind me to review my schedule every morning
- [ ] Drink water reminder
```

### Logging

Runtime logs are stored in `~/.star_sanctuary/logs/`.

| Feature              | Description                                   |
|----------------------|-----------------------------------------------|
| **Dual outputs**     | Log to both console and files                 |
| **Daily files**      | `gateway-2025-02-05.log`, etc.                |
| **Size‑based rotate**| Split automatically when size > 10MB          |
| **Auto cleanup**     | Logs older than retention days are deleted    |
| **Agent readable**   | Agent can read logs via `log_read/log_search` |

See `BELLDANDY_LOG_*` variables for configuration.

### Methodology System (Methods)

> Tools define what the Agent is able to do; methods define how it should do those things in the future.

On top of a standard skills/tooling system, Star Sanctuary adds a **Methodology System** designed specifically for **long‑memory, long‑term companion Agents**. It consists of four parts:

- **Agent**: The decision‑making layer shaped by workspace files like `SOUL.md`, `AGENTS.md`, `USER.md`, and `TOOLS.md`.
- **Skills**: The concrete tools that perform actions (file I/O, web fetch, browser control, shell commands, memory search, etc.).
- **Methods**: Markdown SOP documents under `~/.star_sanctuary/methods/`, acting as the Agent’s "how‑to" memory, managed via `method_list`, `method_read`, and `method_create`.
- **Logs**: Structured runtime logs under `~/.star_sanctuary/logs/*.log`, which the Agent can read with `log_read` / `log_search` to review executions, errors, and performance.

These four pieces form a closed loop so the Agent doesn’t just "rethink from scratch next time" but gradually grows its own methodology:

- **Before: look up methods instead of improvising**
  - For complex tasks (deployments, system configuration, multi‑file refactors, external integrations, etc.):
    - Use `method_list` to see if there is already a relevant method.
    - Use `method_read` to load the SOP and follow the steps.
    - If there is no method yet, treat this as a "first‑time exploration" and freely combine skills to solve it.
- **During: every attempt leaves a factual trace**
  - Each tool call, error, slow query, and heartbeat run is logged to `~/.star_sanctuary/logs/YYYY-MM-DD.log` with timestamp, module, level, argument summary, and duration.
  - The Agent can use `log_read` / `log_search` at any time to inspect which steps failed, which calls were slow, and whether certain errors repeat.
- **After: turn logs into methods and capture experience**
  - Once a task is solved (even after many failures), the Agent can:
    - Use `log_search` to replay the errors and fixes from that time window.
    - Distill a stable, reusable procedure.
    - Use `method_create` to write a method document (for example, `Feishu-connection-debug.md` or `Project-deploy-basic.md`) with context, steps, skills used, and common pitfalls.
- **Next time: start from methods, then fine‑tune**
  - When a similar task appears again:
    - Start with `method_list` / `method_read` to load the relevant method.
    - Adjust on top of the SOP instead of repeating the full "trial → debug → success" cycle.
    - If the environment changed and new issues appear, update the method based on logs so the SOP evolves with reality.

**In short:**

- **Skills** define what the Agent *can* do.
- **Logs** record what it *actually* did.
- **Methods** capture how it *should* do things next time.
- **Agent** loops through these three, evolving from "tool‑user" into a long‑term partner with its own way of doing things.

**Key benefits: Automation, continuous improvement, and composability for long‑memory Agents**

- **Automation**:
  - Repetitive business workflows no longer rely on ad‑hoc prompts; they are written as versioned SOPs (methods) and executed repeatedly via heartbeat (`HEARTBEAT.md`) or explicit tasks.
  - Updating a method document is effectively shipping a new version of the automation pipeline — the next run follows the new process.

- **Continuous improvement**:
  - Every failure/debugging session is logged; the Agent can aggregate errors with `log_search` and then use `method_create` to encode the lessons into methods.
  - Updating methods changes the Agent’s default behavior for that scenario, making it more stable and efficient on the same machine and project over time.

- **Composability**:
  - Each method document is a reusable "business brick" (for example, "1688 sourcing", "Amazon listing", "daily monitoring").
  - More complex revenue‑generating or operations workflows can then be defined as pipeline‑style methods that compose these bricks, instead of rebuilding everything from raw skills each time.

> For a concrete Chinese example of an end‑to‑end workflow (sourcing from 1688 and continuously listing on Amazon), and how methods integrate with heartbeat and the logging system to run the pipeline, see [`Methods方法论示例与说明.md`](./Methods方法论示例与说明.md).

---

## Feishu (Lark) Integration


Talk to Star Sanctuary via Feishu without exposing your machine to the internet.

High‑level steps (see Chinese docs for screenshots):

1. **Create a Feishu app** on [Feishu Open Platform](https://open.feishu.cn/).
2. **Enable the bot** and request permissions:
   - `im:message` (receive messages)
   - `im:message:send_as_bot` (send messages)
   - `im:resource` (access resources)
3. **Configure long‑lived connection**: enable `im.message.receive_v1` in event subscriptions.
4. **Configure Star Sanctuary** via `.env.local`:

   ```env
   BELLDANDY_FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
   BELLDANDY_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

5. Start the gateway:

   ```bash
   corepack pnpm dev:gateway
   ```

When you see `Feishu WebSocket Channel started.` and `ws client ready` in logs, you can start chatting with the bot from Feishu.

---

## Advanced Features

### Browser Automation

Let the Agent control your browser: open pages, click buttons, type into inputs, capture screenshots, and extract content.

1. Enable the relay:
   ```env
   BELLDANDY_BROWSER_RELAY_ENABLED=true
   ```
2. Install the browser extension:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select `apps/browser-extension`
3. Click the extension icon and confirm it shows **Connected**.

### Voice Interaction

High‑quality voice via Edge TTS (free) or OpenAI TTS.

- **Enable**: tell the Agent "enable voice mode".
- **Disable**: tell the Agent "disable voice".

### Vision

Use the camera via browser to let the Agent "see" the physical world.

- Requires browser automation to be connected.
- Ask the Agent to "take a photo" or "look where I am now".

### Plugin System

13 lifecycle hooks enable deep customization:

| Category | Hooks |
|----------|-------|
| Agent    | `before_agent_start`, `agent_end`, `before_compaction`, `after_compaction` |
| Message  | `message_received`, `message_sending`, `message_sent` |
| Tool     | `before_tool_call`, `after_tool_call`, `tool_result_persist` |
| Session  | `session_start`, `session_end` |
| Gateway  | `gateway_start`, `gateway_stop` |

Place plugins under `~/.star_sanctuary/plugins/`. They are loaded automatically when the gateway starts.

497: ---
498: 
499: ## Key New Features
500: 
501: ### 1. Native Vision & Video Understanding
502: 
503: Directly send images and videos (requires a vision-capable model like Kimi k2.5).
504: 
505: - **Images**: Upload directly; the model "sees" it immediately.
506: - **Videos**: Upload video files (mp4/mov, etc.). The Agent automatically uploads them to the cloud and references them via `ms://` protocol for long-video understanding.
507: 
508: ### 2. Cron Tasks
509: 
510: More flexible than Heartbeat. Just tell the Agent:
511: 
512: > "Remind me to meet at 3 PM" (One-time)
513: > "Remind me to drink water every 4 hours" (Recurring)
514: 
515: Managed automatically via `cron` tools with persistence.
516: 
517: ### 3. Context Compaction
518: 
519: Solves token overflow in long conversations using a **3-tier progressive compression** architecture:
520: 
521: 1. **Working Memory**: Keeps the last N raw messages.
522: 2. **Rolling Summary**: Incrementally summarizes overflowed messages.
523: 3. **Archival Summary**: Further condenses summaries into core conclusions when they get too long.
524: 
525: Keeps "core memory" intact even after thousands of turns while saving tokens.
526: 
527: ### 4. FACET Persona Switching
528: 
529: Tell the Agent "Switch module to coder" or "Switch FACET to translator" to instantly swap the persona module in `SOUL.md` and auto-restart to apply changes.
530: 
531: ---
532: 
533: ## CLI Commands

Star Sanctuary provides a unified `bdd` CLI entry point (based on [citty](https://github.com/unjs/citty)). All commands support `--help` for usage and `--json` for machine-readable output.

```bash
# View full command tree
corepack pnpm bdd --help

# Start service
corepack pnpm bdd start              # With supervisor (Recommended for production)
corepack pnpm bdd dev                # Dev mode (No auto-restart)
```

### Pairing Management

```bash
corepack pnpm bdd pairing list                          # List approved devices
corepack pnpm bdd pairing pending                       # List pending requests
corepack pnpm bdd pairing approve <CODE>                # Approve pairing code
corepack pnpm bdd pairing revoke <CLIENT_ID>            # Revoke authorization
corepack pnpm bdd pairing cleanup [--dry-run]           # Clean up expired requests
corepack pnpm bdd pairing export --out backup.json      # Export pairing state
corepack pnpm bdd pairing import --in backup.json       # Import pairing state (Merge by default)
```

### Diagnostics & Config

```bash
corepack pnpm bdd doctor                                # Health check (Node/pnpm/Port/Config/DB)
corepack pnpm bdd doctor --check-model                  # Include model connectivity test
corepack pnpm bdd doctor --json                         # JSON output

corepack pnpm bdd config list                           # List .env.local config (Secrets masked)
corepack pnpm bdd config list --show-secrets             # Show secrets
corepack pnpm bdd config get <KEY>                      # Get single config value
corepack pnpm bdd config set <KEY> <VALUE>              # Set config value
corepack pnpm bdd config edit                           # Open .env.local in editor
corepack pnpm bdd config path                           # Print config file path
```

### Browser Relay

```bash
corepack pnpm bdd relay start                           # Start CDP relay (Default port 28892)
corepack pnpm bdd relay start --port 9222               # Specify port
```

### Setup Wizard

```bash
corepack pnpm bdd setup                                 # Interactive setup (Provider/API/Port/Auth)
corepack pnpm bdd setup --provider openai \
  --base-url https://api.openai.com/v1 \
  --api-key sk-xxx --model gpt-4o                       # Non-interactive mode
```

---

## FAQ

**Q: `EADDRINUSE` error on startup?**

A: Change the port in `.env.local`: `BELLDANDY_PORT=28890`

**Q: How to access from the internet?**

A: Use tools like Cloudflare Tunnel or Frp, and enable authentication with `BELLDANDY_AUTH_MODE=token`.

**Q: Memory retrieval is inaccurate?**

A: Ensure you have configured an Embedding model and set `BELLDANDY_EMBEDDING_ENABLED=true`.

**Q: Can I run CMD commands on Windows?**

A: Yes. Native commands like `copy`, `move`, `del`, `ipconfig` are supported. Note that `del` blocks `/s` and `/q` arguments for safety.

**Q: No reply after sending message in Feishu?**

A: Check:
1. App is published and approved.
2. Permissions are correctly granted.
3. `im.message.receive_v1` event subscription is added.

---

## Project Structure (Monorepo)

```text
packages/
├── belldandy-core/      # Gateway, protocol, config, security
├── belldandy-agent/     # Agent runtime, tool orchestration, streaming
├── belldandy-channels/  # Channel interfaces (Feishu, Telegram, ...)
├── belldandy-skills/    # Skill definitions and execution
├── belldandy-memory/    # Memory indexing and retrieval
├── belldandy-plugins/   # Plugin system
├── belldandy-mcp/       # MCP protocol support
└── belldandy-browser/   # Browser automation relay

apps/
├── web/                 # WebChat frontend
└── browser-extension/   # Chrome extension
```

---

## Developer Info

### References

This project is architecturally inspired by [moltbot](https://github.com/moltbot/moltbot), with a complete codebase rewrite.

### Related Docs

- [Star Sanctuary实现内容说明.md](./Star%20Sanctuary实现内容说明.md) - Detailed feature breakdown (Chinese)
- [Star Sanctuary使用手册.md](./Star%20Sanctuary使用手册.md) - Full user manual (Chinese)

English docs are still work-in-progress; for now, please refer to the README and source code.

---

## Sponsorship

If Star Sanctuary is helpful, you can support the author:

- Afdian: <https://afdian.com/a/vrboyzero777>
- See `README.md` for QR code images (WeChat / Alipay, Chinese only).

---

## Contact

- **Email**: <fyyx4918822@gmail.com>
- **QQ Group** (Chinese): 1080383003
- **Issue Tracker**: <https://github.com/vrboyzero/star-sanctuary/issues>

Feedback and suggestions are very welcome.

---

## License

Star Sanctuary is released under the **MIT License**. See [`LICENSE`](./LICENSE) for details.





