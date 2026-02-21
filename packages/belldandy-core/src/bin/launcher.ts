/**
 * Belldandy Gateway Launcher（自动重启包装器）
 *
 * 以子进程方式启动 gateway.ts，当子进程以 exit code 100 退出时
 * 自动重新启动（复用 system.restart 的约定）。
 *
 * 用法：node --import tsx packages/belldandy-core/src/bin/launcher.ts
 */
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 根据当前文件扩展名判断是开发模式(.ts)还是生产模式(.js)
const ext = path.extname(__filename);
const GATEWAY_SCRIPT = path.join(__dirname, `gateway${ext}`);

// 重启信号 exit code（与 system.restart 保持一致）
const RESTART_EXIT_CODE = 100;
// 重启前等待时间（毫秒），避免过快循环
const RESTART_DELAY_MS = 500;

function launchGateway(): void {
    console.log(`[Launcher] 启动 Gateway (pid will be assigned)...`);

    const child = fork(GATEWAY_SCRIPT, process.argv.slice(2), {
        stdio: "inherit",
        // 生产模式(.js)不需要 tsx loader
        execArgv: path.extname(__filename) === ".ts" ? ["--import", "tsx"] : [],
    });

    child.on("exit", (code, signal) => {
        if (code === RESTART_EXIT_CODE) {
            console.log(`[Launcher] Gateway 请求重启 (exit code ${RESTART_EXIT_CODE})，${RESTART_DELAY_MS}ms 后重新启动...`);
            setTimeout(() => launchGateway(), RESTART_DELAY_MS);
        } else {
            // 非重启退出 → launcher 自身也退出
            const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
            console.log(`[Launcher] Gateway 已退出 (${reason})，Launcher 结束。`);
            process.exit(code ?? 1);
        }
    });

    // 处理 launcher 自身被终止的情况 → 转发信号给子进程
    const forwardSignal = (sig: NodeJS.Signals) => {
        child.kill(sig);
    };
    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);
}

// 启动
launchGateway();
