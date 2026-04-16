import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMirrorUrl,
  normalizeCameraCaptureOptions,
  normalizeCameraFacing,
  normalizeCameraListOptions,
  sanitizeCameraScreenshotBaseName,
} from "./camera-runtime.js";

const originalPort = process.env.BELLDANDY_PORT;

afterEach(() => {
  if (originalPort === undefined) {
    delete process.env.BELLDANDY_PORT;
  } else {
    process.env.BELLDANDY_PORT = originalPort;
  }
  vi.restoreAllMocks();
});

describe("camera-runtime helpers", () => {
  it("normalizes capture options with safe defaults and bounds", () => {
    const options = normalizeCameraCaptureOptions({
      delay: 99_999,
      facing: "back",
      width: 80,
      height: 99999,
      fit: "contain",
      name: "../front cam",
      mirror: false,
      readyTimeoutMs: 10,
    });

    expect(options).toMatchObject({
      delayMs: 30_000,
      facing: "back",
      width: 160,
      height: 4096,
      fit: "contain",
      name: "front-cam",
      mirror: false,
      readyTimeoutMs: 1_000,
    });
  });

  it("normalizes list options without a capture-only delay field", () => {
    const options = normalizeCameraListOptions({
      facing: "front",
      deviceId: "cam-123",
      width: 1280,
      height: 720,
      mirror: true,
    });

    expect(options).toMatchObject({
      facing: "front",
      deviceId: "cam-123",
      width: 1280,
      height: 720,
      mirror: true,
    });
    expect("delayMs" in options).toBe(false);
  });

  it("builds mirror URLs from normalized options", () => {
    process.env.BELLDANDY_PORT = "39001";
    const options = normalizeCameraCaptureOptions({
      facing: "back",
      deviceId: "rear-cam",
      width: 1280,
      height: 720,
      fit: "contain",
      mirror: false,
    });

    expect(buildMirrorUrl(options)).toBe(
      "http://127.0.0.1:39001/mirror.html?facing=environment&width=1280&height=720&fit=contain&mirror=0&deviceId=rear-cam",
    );
  });

  it("sanitizes screenshot names and facing values", () => {
    expect(sanitizeCameraScreenshotBaseName("  my front/cam  ")).toBe("my-front-cam");
    expect(sanitizeCameraScreenshotBaseName("???")).toBeUndefined();
    expect(normalizeCameraFacing("back")).toBe("back");
    expect(normalizeCameraFacing("nope")).toBe("front");
  });
});
