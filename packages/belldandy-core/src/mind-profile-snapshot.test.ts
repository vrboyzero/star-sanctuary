import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { MemoryManager } from "@belldandy/memory";

import { buildMindProfileSnapshot } from "./mind-profile-snapshot.js";

describe("buildMindProfileSnapshot", () => {
  it("builds a compact mind/profile snapshot from user, memory, and resident summaries", async () => {
    if (!process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = "test-placeholder-key";
    }

    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-mind-profile-"));
    const sharedStateDir = path.join(stateDir, "team-memory");
    const sessionsDir = path.join(stateDir, "sessions");
    const memoryDir = path.join(stateDir, "memory");
    const sharedMemoryDir = path.join(sharedStateDir, "memory");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.mkdir(sharedMemoryDir, { recursive: true });

    await fs.writeFile(path.join(stateDir, "USER.md"), "# USER\n**名字：** 小星\n喜欢简洁的状态表与直接的变更说明。\n", "utf-8");
    await fs.writeFile(path.join(stateDir, "MEMORY.md"), "# MEMORY\n优先把大文件里的新增主体逻辑外移。\n", "utf-8");
    await fs.writeFile(path.join(sharedStateDir, "MEMORY.md"), "# Shared Memory\n团队约定：外部消息外发统一走 sessionKey / binding。\n", "utf-8");

    const manager = new MemoryManager({
      workspaceRoot: sessionsDir,
      additionalRoots: [memoryDir, sharedMemoryDir],
      additionalFiles: [
        path.join(stateDir, "MEMORY.md"),
        path.join(sharedStateDir, "MEMORY.md"),
      ],
      storePath: path.join(stateDir, "memory.sqlite"),
      modelsDir: path.join(stateDir, "models"),
      stateDir,
    });

    try {
      (manager as any).store.upsertChunk({
        id: "private-memory-1",
        sourcePath: "MEMORY.md",
        sourceType: "file",
        memoryType: "core",
        content: "优先把大文件里的新增主体逻辑外移，server.ts 只保留接线。",
        agentId: "default",
        visibility: "private",
      });
      (manager as any).store.upsertChunk({
        id: "shared-memory-1",
        sourcePath: "team-memory/MEMORY.md",
        sourceType: "file",
        memoryType: "core",
        content: "团队约定：外部消息外发统一走 sessionKey / binding。",
        visibility: "shared",
      });

      const snapshot = await buildMindProfileSnapshot({
        stateDir,
        residentMemoryManagers: [{
          agentId: "default",
          stateDir,
          memoryMode: "hybrid",
          policy: {
            memoryMode: "hybrid",
            managerStateDir: stateDir,
            sharedStateDir,
            writeTarget: "private",
            readTargets: ["private", "shared"],
            includeSharedMemoryReads: true,
          },
          manager,
        } as any],
        residentAgents: {
          summary: {
            activeCount: 1,
            digestReadyCount: 1,
            digestUpdatedCount: 1,
            experienceUsageLinkedCount: 1,
          },
          agents: [{
            id: "default",
            displayName: "Belldandy",
            status: "running",
            mainConversationId: "agent:default:main",
            conversationDigest: {
              status: "updated",
              pendingMessageCount: 2,
              lastDigestAt: 1710000000000,
            },
            experienceUsageDigest: {
              usageCount: 3,
              methodCount: 2,
              skillCount: 1,
              latestAssetKey: "send-channel-message",
            },
          }],
        } as any,
      });

      expect(snapshot.summary).toMatchObject({
        available: true,
        selectedAgentId: "default",
        activeResidentCount: 1,
        digestReadyCount: 1,
        digestUpdatedCount: 1,
        usageLinkedCount: 1,
        privateMemoryCount: 1,
        sharedMemoryCount: 1,
        hasUserProfile: true,
        hasPrivateMemoryFile: true,
        hasSharedMemoryFile: true,
      });
      expect(snapshot.identity).toMatchObject({
        userName: "小星",
        hasUserProfile: true,
      });
      expect(snapshot.profile.summaryLines.join("\n")).toContain("USER.md:");
      expect(snapshot.profile.summaryLines.join("\n")).toContain("Private MEMORY.md:");
      expect(snapshot.profile.summaryLines.join("\n")).toContain("Shared MEMORY.md:");
      expect(snapshot.conversation.topResidents[0]).toMatchObject({
        agentId: "default",
        pendingMessageCount: 2,
      });
      expect(snapshot.experience.topUsageResidents[0]).toMatchObject({
        agentId: "default",
        usageCount: 3,
      });
      expect(snapshot.memory.recentMemorySnippets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          scope: "private",
        }),
        expect.objectContaining({
          scope: "shared",
        }),
      ]));
    } finally {
      manager.close();
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
