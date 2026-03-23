import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const discordMock = vi.hoisted(() => {
  type LoginController = {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  };

  const loginControllers: LoginController[] = [];
  const clientInstances: any[] = [];

  class FakeDiscordClient {
    public destroyed = false;
    public ready = false;
    public user = { id: "bot-user", tag: "bot#0001" };
    public channels = {
      fetch: vi.fn(),
    };
    private readonly handlers = new Map<string, Set<(...args: any[]) => void>>();
    private readonly onceHandlers = new Map<string, Set<(...args: any[]) => void>>();

    constructor() {
      clientInstances.push(this);
    }

    on(event: string, handler: (...args: any[]) => void): this {
      const handlers = this.handlers.get(event) ?? new Set();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    once(event: string, handler: (...args: any[]) => void): this {
      const handlers = this.onceHandlers.get(event) ?? new Set();
      handlers.add(handler);
      this.onceHandlers.set(event, handlers);
      return this;
    }

    emit(event: string, ...args: any[]): boolean {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
      const onceHandlers = this.onceHandlers.get(event);
      if (onceHandlers) {
        this.onceHandlers.delete(event);
        for (const handler of onceHandlers) {
          handler(...args);
        }
      }
      return true;
    }

    isReady(): boolean {
      return this.ready && !this.destroyed;
    }

    async login(): Promise<void> {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      loginControllers.push({ promise, resolve, reject });
      return promise;
    }

    destroy(): void {
      this.destroyed = true;
      this.ready = false;
    }

    emitReady(): void {
      if (this.destroyed) return;
      this.ready = true;
      this.emit("clientReady");
    }
  }

  return {
    FakeDiscordClient,
    clientInstances,
    loginControllers,
  };
});

vi.mock("discord.js", () => ({
  Client: discordMock.FakeDiscordClient,
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    DirectMessages: 4,
    MessageContent: 8,
  },
  TextChannel: class {},
}));

import { DiscordChannel } from "./discord.js";

describe("DiscordChannel", () => {
  beforeEach(() => {
    discordMock.loginControllers.length = 0;
    discordMock.clientInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createChannel(stateFilePath: string) {
    return new DiscordChannel({
      botToken: "discord-token",
      stateFilePath,
      agent: {
        run: vi.fn(),
      } as any,
    });
  }

  it("deduplicates concurrent start calls before ready", async () => {
    const stateFilePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "discord-state-")), "discord-state.json");
    const channel = createChannel(stateFilePath);

    const firstStart = channel.start();
    const secondStart = channel.start();

    expect(discordMock.clientInstances).toHaveLength(1);
    expect(discordMock.loginControllers).toHaveLength(1);

    discordMock.clientInstances[0]?.emitReady();
    discordMock.loginControllers[0]?.resolve();
    await Promise.all([firstStart, secondStart]);

    expect(channel.isRunning).toBe(true);
    await channel.stop();
  });

  it("ignores late ready from a stopped startup client", async () => {
    const stateFilePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "discord-state-")), "discord-state.json");
    const channel = createChannel(stateFilePath);
    const listener = vi.fn();
    channel.addEventListener(listener);

    const startPromise = channel.start();
    expect(discordMock.clientInstances).toHaveLength(1);

    await channel.stop();
    expect(channel.isRunning).toBe(false);
    expect(discordMock.clientInstances[0]?.destroyed).toBe(true);

    discordMock.clientInstances[0]?.emitReady();
    discordMock.loginControllers[0]?.resolve();
    await startPromise;

    expect(channel.isRunning).toBe(false);
    expect(listener).toHaveBeenCalledWith({ type: "stopped", channel: "discord" });
    expect(listener).not.toHaveBeenCalledWith({ type: "started", channel: "discord" });
  });
});
