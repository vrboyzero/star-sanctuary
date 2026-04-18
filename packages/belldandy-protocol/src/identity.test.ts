import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildIdentityAuthorityMayDirect,
  buildIdentityAuthorityReportsTo,
  deriveAuthorityRelationToManager,
  evaluateRuntimeIdentityAuthority,
  extractOwnerUuid,
  loadIdentityAuthorityProfile,
  parseIdentityAuthorityProfile,
} from "./identity.js";

describe("extractOwnerUuid", () => {
  it("returns owner uuid from IDENTITY.md", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-identity-test-"));
    try {
      await fs.writeFile(path.join(dir, "IDENTITY.md"), "# IDENTITY\n\n- **主人UUID**：a10001\n", "utf-8");
      await expect(extractOwnerUuid(dir)).resolves.toBe("a10001");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when IDENTITY.md is missing or owner uuid is absent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-identity-test-"));
    try {
      await expect(extractOwnerUuid(dir)).resolves.toBeUndefined();

      await fs.writeFile(path.join(dir, "IDENTITY.md"), "# IDENTITY\n\n- **名字：** 贝露丹蒂\n", "utf-8");
      await expect(extractOwnerUuid(dir)).resolves.toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("identity authority profile", () => {
  const identityFixture = `
# IDENTITY

- **当前身份标签**：首席执行官 (CEO)
- **上级身份标签**：董事会成员, 董事长
- **下级身份标签**：CTO, 项目经理, 员工
- **主人UUID**：vr777
`;

  it("parses identity authority profile from IDENTITY.md content", () => {
    expect(parseIdentityAuthorityProfile(identityFixture)).toEqual({
      currentLabel: "首席执行官 (CEO)",
      superiorLabels: ["董事会成员", "董事长"],
      subordinateLabels: ["CTO", "项目经理", "员工"],
      ownerUuids: ["vr777"],
      authorityMode: "verifiable_only",
      responsePolicy: {
        ownerOrSuperior: "execute",
        subordinate: "guide",
        other: "refuse_or_inform",
      },
      source: "identity_md",
    });
  });

  it("loads identity authority profile from workspace file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-identity-test-"));
    try {
      await fs.writeFile(path.join(dir, "IDENTITY.md"), identityFixture, "utf-8");
      await expect(loadIdentityAuthorityProfile(dir)).resolves.toMatchObject({
        currentLabel: "首席执行官 (CEO)",
        ownerUuids: ["vr777"],
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("evaluates runtime identity authority with owner, subordinate, and other senders", () => {
    const profile = parseIdentityAuthorityProfile(identityFixture)!;

    expect(evaluateRuntimeIdentityAuthority(profile, {
      userUuid: "vr777",
      senderId: "vr777",
      senderType: "user",
    })).toMatchObject({
      authorityActive: true,
      actorRelation: "owner",
      recommendedAction: "execute",
      ownerUuidVerified: true,
    });

    expect(evaluateRuntimeIdentityAuthority(profile, {
      senderId: "agent-cto",
      senderType: "agent",
      senderIdentity: "CTO",
    })).toMatchObject({
      authorityActive: true,
      actorRelation: "subordinate",
      recommendedAction: "guide_only",
    });

    expect(evaluateRuntimeIdentityAuthority(profile, {
      senderId: "agent-other",
      senderType: "agent",
      senderIdentity: "访客",
    })).toMatchObject({
      authorityActive: true,
      actorRelation: "other",
      recommendedAction: "refuse_or_inform",
    });
  });

  it("derives manager-to-member authority relation and reporting edges", () => {
    const manager = parseIdentityAuthorityProfile(identityFixture)!;
    const worker = parseIdentityAuthorityProfile(`
- **当前身份标签**：CTO
- **上级身份标签**：首席执行官 (CEO)
- **下级身份标签**：员工
`)!;

    expect(deriveAuthorityRelationToManager({
      managerAgentId: "default",
      memberAgentId: "coder",
      managerProfile: manager,
      memberProfile: worker,
    })).toBe("subordinate");
    expect(buildIdentityAuthorityReportsTo(worker, manager)).toEqual(["首席执行官 (CEO)"]);
    expect(buildIdentityAuthorityMayDirect(worker)).toEqual(["员工"]);
  });
});
