import { describe, expect, it } from "vitest";

import { resolvePreferredAgentSelection } from "./chat-network.js";

describe("chat network agent selection", () => {
  const agents = [
    { id: "coder", displayName: "代码专家" },
    { id: "default", displayName: "Belldandy" },
    { id: "researcher", displayName: "调研助手" },
  ];

  it("keeps the current selection when the roster order changes", () => {
    expect(resolvePreferredAgentSelection(agents, "default", "")).toBe("default");
  });

  it("falls back to the saved selection when current selection is unavailable", () => {
    expect(resolvePreferredAgentSelection(agents, "missing", "researcher")).toBe("researcher");
  });

  it("falls back to the first roster entry when no selection can be restored", () => {
    expect(resolvePreferredAgentSelection(agents, "missing", "also-missing")).toBe("coder");
  });
});
