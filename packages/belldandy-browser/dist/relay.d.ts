interface Logger {
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
}
export declare class RelayServer {
    private server;
    private wssExtension;
    private wssCdp;
    private extensionWs;
    private cdpClients;
    private pending;
    private nextId;
    readonly port: number;
    private logger?;
    constructor(port?: number, logger?: Logger);
    private setupExtensionServer;
    private setupCdpServer;
    private handleExtensionMessage;
    private handleCdpCommand;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=relay.d.ts.map