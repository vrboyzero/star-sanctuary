import { describe, expect, it, vi } from "vitest";

import { RelayServer } from "./relay.js";

describe("RelayServer", () => {
    it("serializes debugged JSON responses only once per send", () => {
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const relay = new RelayServer(28892, logger);
        const socket = {
            send: vi.fn(),
        };
        const stringifySpy = vi.spyOn(JSON, "stringify");

        try {
            (relay as any).sendJson(socket, { ok: true, value: 1 }, "Sending test payload");

            expect(stringifySpy).toHaveBeenCalledTimes(1);
            expect(socket.send).toHaveBeenCalledWith('{"ok":true,"value":1}');
            expect(logger.debug).toHaveBeenCalledWith('Sending test payload: {"ok":true,"value":1}');
        } finally {
            stringifySpy.mockRestore();
        }
    });
});
