import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsController } from "./settings.js";

class FakeHTMLElement {}

class FakeButton extends FakeHTMLElement {
  constructor(attrs = {}) {
    super();
    this.attrs = attrs;
    this.disabled = false;
    this.textContent = attrs.textContent || "批准";
  }

  closest(selector) {
    if (selector === "button[data-pairing-action]") return this;
    return null;
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
}

function createFakeList() {
  const listeners = new Map();
  return {
    innerHTML: "",
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    trigger(type, event) {
      listeners.get(type)?.(event);
    },
    scrollIntoView: vi.fn(),
  };
}

function createFakeModal() {
  const classes = new Set(["hidden"]);
  return {
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

function createController(overrides = {}) {
  const pairingPendingList = overrides.pairingPendingList || createFakeList();
  const settingsModal = overrides.settingsModal || createFakeModal();
  const onApprovePairing = overrides.onApprovePairing || vi.fn().mockResolvedValue({ ok: true });
  const controller = createSettingsController({
    refs: {
      settingsModal,
      pairingPendingList,
    },
    isConnected: overrides.isConnected || (() => true),
    sendReq: vi.fn(),
    makeId: () => "req-1",
    setStatus: vi.fn(),
    loadServerConfig: vi.fn(),
    invalidateServerConfigCache: vi.fn(),
    syncAttachmentLimitsFromConfig: vi.fn(),
    onApprovePairing,
  });
  return {
    controller,
    pairingPendingList,
    settingsModal,
    onApprovePairing,
  };
}

describe("settings pairing pending", () => {
  beforeEach(() => {
    globalThis.HTMLElement = FakeHTMLElement;
    globalThis.document = {
      getElementById: vi.fn(() => null),
    };
    globalThis.alert = vi.fn();
    globalThis.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    delete globalThis.HTMLElement;
    delete globalThis.document;
    delete globalThis.alert;
    delete globalThis.confirm;
  });

  it("renders pairing approvals inside settings", () => {
    const { controller, pairingPendingList } = createController();

    controller.renderPairingPending([
      {
        code: "ABCD1234",
        clientId: "client-1",
        message: "需要批准当前配对码。",
        updatedAt: "2026-04-12T09:30:00.000Z",
      },
    ]);

    expect(pairingPendingList.innerHTML).toContain("ABCD1234");
    expect(pairingPendingList.innerHTML).toContain("client-1");
    expect(pairingPendingList.innerHTML).toContain("批准");
  });

  it("routes pairing approval clicks through the provided handler", async () => {
    const { controller, pairingPendingList, onApprovePairing } = createController();

    controller.renderPairingPending([
      {
        code: "ABCD1234",
        message: "需要批准当前配对码。",
        updatedAt: "2026-04-12T09:30:00.000Z",
      },
    ]);

    const button = new FakeButton({
      "data-pairing-action": "approve",
      "data-pairing-code": "ABCD1234",
    });
    pairingPendingList.trigger("click", { target: button });
    await Promise.resolve();
    await Promise.resolve();

    expect(onApprovePairing).toHaveBeenCalledWith("ABCD1234");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("处理中...");
  });
});
