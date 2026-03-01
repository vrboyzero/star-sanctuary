import { describe, expect, it } from "vitest";

import { createRuleBasedRouter } from "./engine.js";
import type { ChannelRouterConfig, RouteContext } from "./types.js";

function makeContext(partial: Partial<RouteContext> = {}): RouteContext {
  return {
    channel: "discord",
    chatKind: "channel",
    chatId: "room-1",
    text: "hello world",
    senderId: "u-1",
    ...partial,
  };
}

describe("channel router engine", () => {
  it("uses higher priority rule first", () => {
    const config: ChannelRouterConfig = {
      version: 1,
      rules: [
        {
          id: "low-priority-deny",
          enabled: true,
          priority: 10,
          match: { keywordsAny: ["hello"] },
          action: { allow: false },
        },
        {
          id: "high-priority-allow",
          enabled: true,
          priority: 100,
          match: { keywordsAny: ["hello"] },
          action: { allow: true, agentId: "ops" },
        },
      ],
    };

    const router = createRuleBasedRouter(config);
    const decision = router.decide(makeContext());
    expect(decision.allow).toBe(true);
    expect(decision.agentId).toBe("ops");
    expect(decision.matchedRuleId).toBe("high-priority-allow");
  });

  it("supports mention gating in group chats and keeps DM unaffected", () => {
    const config: ChannelRouterConfig = {
      version: 1,
      defaultAction: { allow: true },
      rules: [
        {
          id: "group-mention-required",
          enabled: true,
          priority: 100,
          match: { chatKinds: ["group"], mentionRequired: true },
          action: { allow: true, agentId: "group-agent" },
        },
        {
          id: "group-default-deny",
          enabled: true,
          priority: 10,
          match: { chatKinds: ["group"] },
          action: { allow: false },
        },
      ],
    };

    const router = createRuleBasedRouter(config);

    const groupNoMention = router.decide(makeContext({ chatKind: "group", mentioned: false }));
    expect(groupNoMention.allow).toBe(false);
    expect(groupNoMention.matchedRuleId).toBe("group-default-deny");

    const groupMentioned = router.decide(makeContext({ chatKind: "group", mentioned: true }));
    expect(groupMentioned.allow).toBe(true);
    expect(groupMentioned.agentId).toBe("group-agent");

    const dm = router.decide(makeContext({ chatKind: "dm", mentioned: false }));
    expect(dm.allow).toBe(true);
    expect(dm.reason).toBe("default_action");
  });

  it("supports sender allowlist and denylist", () => {
    const config: ChannelRouterConfig = {
      version: 1,
      rules: [
        {
          id: "deny-bad-user",
          enabled: true,
          priority: 100,
          match: { senderDenylist: ["u-bad"] },
          action: { allow: false },
        },
        {
          id: "allow-good-user",
          enabled: true,
          priority: 50,
          match: { senderAllowlist: ["u-good"] },
          action: { allow: true, agentId: "vip" },
        },
      ],
    };

    const router = createRuleBasedRouter(config, { defaultAllow: true });
    const denied = router.decide(makeContext({ senderId: "u-bad" }));
    expect(denied.allow).toBe(false);
    expect(denied.matchedRuleId).toBe("deny-bad-user");

    const allowed = router.decide(makeContext({ senderId: "u-good" }));
    expect(allowed.allow).toBe(true);
    expect(allowed.agentId).toBe("vip");
  });

  it("supports keyword route to specific agent", () => {
    const config: ChannelRouterConfig = {
      version: 1,
      rules: [
        {
          id: "ops-alert",
          enabled: true,
          priority: 100,
          match: { keywordsAny: ["alert", "报警"] },
          action: { allow: true, agentId: "ops" },
        },
      ],
    };

    const router = createRuleBasedRouter(config, { defaultAllow: false });
    const decision = router.decide(makeContext({ text: "prod alert: redis down" }));
    expect(decision.allow).toBe(true);
    expect(decision.agentId).toBe("ops");
  });

  it("falls back to default action when no rule matched", () => {
    const config: ChannelRouterConfig = {
      version: 1,
      defaultAction: { allow: true, agentId: "default" },
      rules: [],
    };

    const router = createRuleBasedRouter(config);
    const decision = router.decide(makeContext({ text: "nothing special" }));
    expect(decision.allow).toBe(true);
    expect(decision.agentId).toBe("default");
    expect(decision.reason).toBe("default_action");
  });
});

