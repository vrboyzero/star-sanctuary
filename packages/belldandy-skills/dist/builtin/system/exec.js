import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
// 安全策略配置
const BLOCKLIST = new Set([
    "sudo", "su", "mkfs", "dd", "shutdown", "reboot", "poweroff", "init",
    ":(){:|:&};:" // Fork bomb
]);
// 受保护文件（禁止通过 exec 触达）
const PROTECTED_FILES = ["soul.md"];
// 通用命令（所有平台）
const COMMON_SAFELIST = [
    // 核心系统/文本
    "pwd", "whoami", "echo", "cat", "grep", "head", "tail", "less",
    "which", "uname", "who", "id", "uptime", "time",
    "sed", "awk", "sort", "uniq", "cut", "wc", "tee", "tr", "xargs",
    // JS/TS
    "git", "npm", "pnpm", "node", "yarn", "bun", "npx", "tsc", "vite", "next", "vue", "vue-cli",
    "eslint", "prettier", "storybook", "turbo", "nx",
    // Python
    "python", "python3", "pip", "pip3", "pipenv", "conda", "pytest", "pipx", "poetry", "ruff", "black",
    // 编译/底层
    "gcc", "g++", "make", "cmake", "cargo", "go",
    // 其他语言工具
    "java", "mvn", "dotnet", "dotnet-format",
    // 文件与进程
    "touch", "mkdir", "cp", "mv", "rmdir", "rm",
    "ps", "df", "du", "hostname",
    // 网络/传输
    "curl", "wget", "scp", "rsync",
    "dig", "nslookup", "traceroute", "tracert", "ip", "ifconfig",
    // 文件搜索/过滤
    "rg", "fd", "jq", "yq",
    // 媒体与文档
    "ffmpeg", "magick", "pandoc",
    // 版本控制辅助
    "gh", "glab",
    // 常见 create-* 初始化命令
    "create-react-app",
];
// Unix 特定命令 (Linux + macOS)
const UNIX_SAFELIST = [
    "date",
    "ls", "top", "free", "chmod", "chown", "ln", "which", "find", "xargs",
    "uname", "who", "id", "uptime", "time",
    "sed", "awk", "sort", "uniq", "cut", "wc", "tee", "tr",
    "tar", "gzip", "gunzip", "zip", "unzip",
    "dig", "nslookup", "traceroute", "ip", "ifconfig",
    "gh", "glab",
    "gradle", "gradlew", "mvnw",
    "pipx", "poetry", "ruff", "black",
    "eslint", "prettier", "storybook", "turbo", "nx",
    "golangci-lint", "goimports",
    "open", // macOS 特有：打开文件/URL
    "ssh", "ping", "netstat",
];
// Windows 特定命令
const WINDOWS_SAFELIST = [
    "dir", "copy", "move", "del", "ren", "type", "ls",
    "ipconfig", "netstat", "tasklist", "where", "ping", "hostname", "ssh",
    "tracert",
    "powershell", "powershell.exe", "pwsh", // Windows shell (可通过 policy extraBlocklist 禁用)
    "start" // Windows 特有：打开文件/URL
];
// 根据平台构建白名单
function buildSafelist() {
    const list = [...COMMON_SAFELIST];
    if (process.platform === "win32") {
        list.push(...WINDOWS_SAFELIST);
    }
    else {
        // macOS (darwin) 和 Linux 共享 Unix 命令
        list.push(...UNIX_SAFELIST);
    }
    return new Set(list);
}
const SAFELIST = buildSafelist();
const DEFAULT_EXEC_POLICY = {
    quickTimeoutMs: 5_000,
    longTimeoutMs: 300_000,
    quickCommands: [],
    longCommands: [],
    extraSafelist: [],
    extraBlocklist: [],
    nonInteractive: {
        enabled: true,
        additionalFlags: [],
        defaultFlags: [],
        rules: {},
    },
};
const ENV_FILE_PATTERN = /\.env(\.|$)/i;
const ENV_READ_KEYWORDS = ["cat", "type", "more", "less", "head", "tail", "grep", "rg", "sed", "awk", "get-content"];
const NON_INTERACTIVE_FLAGS = ["--yes", "-y", "--assume-yes", "--non-interactive", "--no-interaction"];
const QUICK_COMMANDS = new Set([
    "pwd", "whoami", "echo", "git", "ls", "dir", "cat", "head", "tail",
    "rg", "fd", "jq", "yq", "hostname", "df", "du", "netstat", "ping", "ipconfig", "tasklist", "where",
    "which", "uname", "who", "id", "uptime", "time",
    "sed", "awk", "sort", "uniq", "cut", "wc", "tee", "tr", "xargs",
    "dig", "nslookup", "traceroute", "tracert", "ip", "ifconfig"
]);
const LONG_COMMANDS = new Set([
    "npm", "pnpm", "yarn", "npx", "node", "python", "python3", "pip", "pip3", "pipenv", "conda", "pytest", "pipx", "poetry",
    "tsc", "vite", "next", "vue", "vue-cli", "gcc", "g++", "make", "cmake", "cargo", "go", "java", "mvn", "dotnet",
    "gradle", "gradlew", "mvnw",
    "ffmpeg", "pandoc", "magick",
    "powershell", "powershell.exe", "pwsh"
]);
const DEFAULT_NON_INTERACTIVE_RULES = [
    { cmd: "npm", sub: ["init"], flags: ["-y"] },
    { cmd: "npx", flags: ["--yes"] },
    { cmd: "yarn", flags: ["--non-interactive"] },
    { cmd: "pnpm", sub: ["dlx", "create", "init"], flags: ["--yes"] },
    { cmd: "conda", sub: ["install", "update", "remove", "uninstall", "create"], flags: ["-y"] },
];
function normalizeExecPolicy(policy) {
    if (!policy)
        return DEFAULT_EXEC_POLICY;
    return {
        quickTimeoutMs: policy.quickTimeoutMs ?? DEFAULT_EXEC_POLICY.quickTimeoutMs,
        longTimeoutMs: policy.longTimeoutMs ?? DEFAULT_EXEC_POLICY.longTimeoutMs,
        quickCommands: policy.quickCommands ?? DEFAULT_EXEC_POLICY.quickCommands,
        longCommands: policy.longCommands ?? DEFAULT_EXEC_POLICY.longCommands,
        extraSafelist: policy.extraSafelist ?? DEFAULT_EXEC_POLICY.extraSafelist,
        extraBlocklist: policy.extraBlocklist ?? DEFAULT_EXEC_POLICY.extraBlocklist,
        nonInteractive: {
            enabled: policy.nonInteractive?.enabled ?? DEFAULT_EXEC_POLICY.nonInteractive.enabled,
            additionalFlags: policy.nonInteractive?.additionalFlags ?? DEFAULT_EXEC_POLICY.nonInteractive.additionalFlags,
            defaultFlags: policy.nonInteractive?.defaultFlags ?? DEFAULT_EXEC_POLICY.nonInteractive.defaultFlags,
            rules: policy.nonInteractive?.rules ?? DEFAULT_EXEC_POLICY.nonInteractive.rules,
        },
    };
}
function normalizeList(list) {
    if (!Array.isArray(list))
        return [];
    return list.map(v => v.trim()).filter(Boolean);
}
function buildSafelistWithPolicy(policy) {
    const base = new Set(SAFELIST);
    for (const cmd of normalizeList(policy.extraSafelist)) {
        base.add(cmd.toLowerCase());
    }
    for (const cmd of normalizeList(policy.extraBlocklist)) {
        base.delete(cmd.toLowerCase());
    }
    return base;
}
function buildBlocklistWithPolicy(policy) {
    const base = new Set(Array.from(BLOCKLIST));
    for (const cmd of normalizeList(policy.extraBlocklist)) {
        base.add(cmd.toLowerCase());
    }
    return base;
}
function buildCommandSet(defaultSet, extra) {
    const set = new Set(defaultSet);
    for (const cmd of normalizeList(extra)) {
        set.add(cmd.toLowerCase());
    }
    return set;
}
function parsePolicyRules(rules) {
    const parsed = [];
    for (const [key, value] of Object.entries(rules ?? {})) {
        const trimmed = key.trim().toLowerCase();
        if (!trimmed)
            continue;
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0];
        const sub = parts.length > 1 ? [parts[1]] : undefined;
        const flags = Array.isArray(value) ? value.map(v => String(v)) : [String(value)];
        parsed.push({ cmd, sub, flags });
    }
    return parsed;
}
function containsProtectedPath(command) {
    const lower = command.toLowerCase();
    return PROTECTED_FILES.some(p => lower.includes(p));
}
function isEnvReadAttempt(command) {
    const lower = command.toLowerCase();
    if (!ENV_FILE_PATTERN.test(lower))
        return false;
    return ENV_READ_KEYWORDS.some(k => lower.includes(`${k} `) || lower.startsWith(`${k} `));
}
function applyNonInteractiveFlags(command, policy) {
    if (!policy.nonInteractive.enabled)
        return command;
    const trimmed = command.trim();
    if (!trimmed)
        return trimmed;
    const lower = trimmed.toLowerCase();
    const detectionFlags = new Set([
        ...NON_INTERACTIVE_FLAGS,
        ...normalizeList(policy.nonInteractive.additionalFlags),
        ...normalizeList(policy.nonInteractive.defaultFlags),
    ]);
    for (const flag of detectionFlags) {
        if (flag && lower.includes(flag.toLowerCase()))
            return trimmed;
    }
    const parts = trimmed.split(/\s+/);
    const executable = parts[0]?.toLowerCase() ?? "";
    const sub = parts[1]?.toLowerCase();
    const rules = [
        ...DEFAULT_NON_INTERACTIVE_RULES,
        ...parsePolicyRules(policy.nonInteractive.rules ?? {}),
    ];
    for (const rule of rules) {
        if (rule.cmd !== executable)
            continue;
        if (rule.sub && (!sub || !rule.sub.includes(sub)))
            continue;
        const flags = normalizeList(rule.flags);
        if (flags.length > 0)
            return `${trimmed} ${flags.join(" ")}`;
    }
    const defaultFlags = normalizeList(policy.nonInteractive.defaultFlags);
    if (defaultFlags.length > 0) {
        return `${trimmed} ${defaultFlags.join(" ")}`;
    }
    return trimmed;
}
function determineTimeoutMs(command, provided, policy) {
    if (typeof provided === "number" && provided > 0)
        return provided;
    const executable = command.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const quickSet = buildCommandSet(QUICK_COMMANDS, policy.quickCommands);
    const longSet = buildCommandSet(LONG_COMMANDS, policy.longCommands);
    if (longSet.has(executable))
        return policy.longTimeoutMs;
    if (quickSet.has(executable))
        return policy.quickTimeoutMs;
    return policy.quickTimeoutMs;
}
function killChildProcess(child) {
    try {
        child.kill("SIGKILL");
        return;
    }
    catch {
        // ignore
    }
    try {
        child.kill();
    }
    catch {
        // ignore
    }
    if (child.pid) {
        try {
            process.kill(child.pid, "SIGKILL");
        }
        catch {
            // ignore
        }
    }
}
function validateCommand(cmd, safelist, blocklist) {
    const trimmed = cmd.trim();
    if (!trimmed)
        return { valid: false, reason: "Empty command" };
    // 1. 拆分命令 (简单拆分，不处理复杂引号引用，优先保证安全)
    const parts = trimmed.split(/\s+/);
    const executable = parts[0].toLowerCase(); // Windows 命令不区分大小写，统一转小写判断
    // 2. 检查黑名单
    if (blocklist.has(executable)) {
        return { valid: false, reason: `Command '${executable}' is blocked by security policy.` };
    }
    // 3. 检查白名单
    // 注意：如果我们不在白名单中，默认拒绝（Strict Mode）
    // 为了灵活性，我们允许本地脚本与 create-* 命令
    const isLocalScript = executable.startsWith("./") || executable.startsWith("../") || executable.endsWith(".sh") || executable.endsWith(".js");
    const isCreateCommand = executable.startsWith("create-");
    if (!safelist.has(executable) && !isLocalScript && !isCreateCommand) {
        // 允许 rm/del 但要检查参数
        if (executable === "rm" || executable === "del") {
            // pass to arg check
        }
        else {
            return { valid: false, reason: `Command '${executable}' is not in the safe list.` };
        }
    }
    // 4. 检查参数风险
    // 针对 rm
    if (executable === "rm") {
        const args = parts.slice(1).join(" ");
        if (args.includes("-r") || args.includes("-R") || args.includes("-f") || args.includes("-F")) {
            return { valid: false, reason: "Recursive/Force deletion with 'rm' is blocked. Please use 'delete_file' tool or manual verification." };
        }
    }
    // 针对 del (Windows)
    if (executable === "del") {
        const args = parts.slice(1).join(" ").toLowerCase();
        // /s (recursive), /q (quiet mode), /f (force) - Windows style
        if (args.includes("/s") || args.includes("/q") || args.includes("/f")) {
            return { valid: false, reason: "Recursive/Quiet deletion with 'del' is blocked. Please use 'delete_file' tool or manual verification." };
        }
    }
    // 5. 检查管道/重定向中的高危操作 (简单检查)
    // 如果包含 sudo 即使在中间也不行
    if (trimmed.includes(" sudo ")) {
        return { valid: false, reason: "Command contains 'sudo' which is forbidden." };
    }
    return { valid: true };
}
export const runCommandTool = {
    definition: {
        name: "run_command",
        description: "在宿主机执行 Shell 命令。仅允许安全列表内的开发工具 (git, npm, ls, etc.)。**禁止** sudo, mkfs 等高危操作。",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "要执行的 Shell 命令",
                },
                cwd: {
                    type: "string",
                    description: "工作目录（可选，默认工作区根目录）",
                },
                timeoutMs: {
                    type: "number",
                    description: "超时时间（毫秒），默认 5000",
                },
            },
            required: ["command"],
        },
    },
    async execute(args, context) {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "run_command";
        const makeResult = (success, output, error) => ({
            id,
            name,
            success,
            output,
            error,
            durationMs: Date.now() - start,
        });
        const commandRaw = args.command;
        if (!commandRaw || typeof commandRaw !== "string") {
            return makeResult(false, "", "Command is required");
        }
        // 路径拦截优先：禁止触达 SOUL.md
        if (containsProtectedPath(commandRaw)) {
            const reason = "Access to protected file 'SOUL.md' is blocked.";
            context.logger?.warn(`[Security Block] ${commandRaw} -> ${reason}`);
            return makeResult(false, "", `Security Error: ${reason}`);
        }
        // 环境变量保护：禁止通过 exec 读取 .env
        if (isEnvReadAttempt(commandRaw)) {
            const reason = "Reading .env via exec is forbidden.";
            context.logger?.warn(`[Security Block] ${commandRaw} -> ${reason}`);
            return makeResult(false, "", `Security Error: ${reason}`);
        }
        const execPolicy = normalizeExecPolicy(context.policy.exec);
        const safelist = buildSafelistWithPolicy(execPolicy);
        const blocklist = buildBlocklistWithPolicy(execPolicy);
        const command = applyNonInteractiveFlags(commandRaw, execPolicy);
        // 安全验证
        const validation = validateCommand(command, safelist, blocklist);
        if (!validation.valid) {
            context.logger?.warn(`[Security Block] ${command} -> ${validation.reason}`);
            return makeResult(false, "", `Security Error: ${validation.reason}`);
        }
        const cwd = args.cwd ? path.resolve(context.workspaceRoot, args.cwd) : context.workspaceRoot;
        const timeoutMs = determineTimeoutMs(command, args.timeoutMs, execPolicy);
        context.logger?.info(`[exec] Run: ${command} in ${cwd}`);
        return new Promise((resolve) => {
            const child = spawn(command, {
                cwd,
                shell: true,
                env: { ...process.env, FORCE_COLOR: "0" }, // 禁用颜色代码
            });
            let stdout = "";
            let stderr = "";
            const timeoutTimer = setTimeout(() => {
                killChildProcess(child);
                resolve(makeResult(false, stdout, `Timeout after ${timeoutMs}ms\nStderr: ${stderr}`));
            }, timeoutMs);
            child.stdout.on("data", (data) => {
                stdout += data.toString();
            });
            child.stderr.on("data", (data) => {
                stderr += data.toString();
            });
            child.on("close", (code) => {
                clearTimeout(timeoutTimer);
                if (code === 0) {
                    resolve(makeResult(true, stdout));
                }
                else {
                    resolve(makeResult(false, stdout, `Process exited with code ${code}\nStderr: ${stderr}`));
                }
            });
            child.on("error", (err) => {
                clearTimeout(timeoutTimer);
                resolve(makeResult(false, stdout, `Spawn error: ${err.message}`));
            });
        });
    },
};
//# sourceMappingURL=exec.js.map