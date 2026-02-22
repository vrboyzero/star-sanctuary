import { Tool } from "../../types.js";
interface Logger {
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
}
export declare function setBrowserLogger(logger: Logger): void;
export declare const browserOpenTool: Tool;
export declare const browserNavigateTool: Tool;
export declare const browserClickTool: Tool;
export declare const browserTypeTool: Tool;
export declare const browserScreenshotTool: Tool;
export declare const browserGetContentTool: Tool;
export declare const browserSnapshotTool: Tool;
export {};
//# sourceMappingURL=tools.d.ts.map