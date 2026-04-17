import { describe, expect, it } from "vitest";

import {
  buildNativeDesktopDeviceRef,
  buildNativeDesktopFacingDeviceRef,
  parseNativeDesktopDeviceRef,
  resolveNativeDesktopSelection,
} from "./camera-native-desktop-contract.js";

describe("camera native desktop contract", () => {
  it("builds and parses native_desktop device refs", () => {
    const deviceRef = buildNativeDesktopDeviceRef("usb-logitech-brio");
    expect(deviceRef).toBe("native_desktop:device:usb-logitech-brio");
    expect(parseNativeDesktopDeviceRef(deviceRef)).toEqual({
      stableKey: "usb-logitech-brio",
    });
  });

  it("builds and parses native_desktop facing refs", () => {
    const deviceRef = buildNativeDesktopFacingDeviceRef("back");
    expect(deviceRef).toBe("native_desktop:facing:back");
    expect(parseNativeDesktopDeviceRef(deviceRef)).toEqual({
      facing: "back",
    });
  });

  it("resolves native_desktop selection from provider-facing input", () => {
    expect(resolveNativeDesktopSelection({
      facing: "front",
      deviceRef: "native_desktop:device:conference-cam",
      width: 1920,
      height: 1080,
      fit: "cover",
      mirror: false,
      readyTimeoutMs: 15_000,
    })).toEqual({
      deviceRef: "native_desktop:device:conference-cam",
      stableKey: "conference-cam",
      facing: "front",
    });
  });
});
