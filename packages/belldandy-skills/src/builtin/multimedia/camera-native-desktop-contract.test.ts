import { describe, expect, it } from "vitest";

import {
  buildNativeDesktopDeviceRef,
  buildNativeDesktopDisplayRef,
  buildNativeDesktopFacingDeviceRef,
  buildNativeDesktopWindowRef,
  parseNativeDesktopDeviceRef,
  parseNativeDesktopDisplayRef,
  parseNativeDesktopWindowRef,
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

  it("builds and parses native_desktop display refs", () => {
    const displayRef = buildNativeDesktopDisplayRef("\\\\.\\DISPLAY1");
    expect(displayRef).toBe("native_desktop:display:%5C%5C.%5CDISPLAY1");
    expect(parseNativeDesktopDisplayRef(displayRef)).toEqual({
      displayId: "\\\\.\\DISPLAY1",
    });
  });

  it("builds and parses native_desktop window refs", () => {
    const windowRef = buildNativeDesktopWindowRef("0x00010203");
    expect(windowRef).toBe("native_desktop:window:0x00010203");
    expect(parseNativeDesktopWindowRef(windowRef)).toEqual({
      windowId: "0x00010203",
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
