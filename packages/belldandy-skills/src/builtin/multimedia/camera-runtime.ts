import fs from "node:fs/promises";
import path from "node:path";

import type { Page } from "puppeteer-core";

import type { ToolContext } from "../../types.js";
import { browserOpenTool } from "../browser/index.js";
import { BrowserManager, getTargetId } from "../browser/tools.js";

export type CameraFacing = "front" | "back";
export type CameraFit = "cover" | "contain";
export type CameraProviderId = "browser_loopback";
export type CameraMirrorStatus = "booting" | "requesting-permission" | "ready" | "error";

export type CameraDeviceInfo = {
  deviceId: string;
  label: string;
  groupId?: string;
  kind: "videoinput";
  active?: boolean;
};

export type CameraMirrorState = {
  status: CameraMirrorStatus;
  selectedFacing: CameraFacing;
  selectedDeviceId?: string;
  devices: CameraDeviceInfo[];
  videoWidth?: number;
  videoHeight?: number;
  settings?: {
    width?: number;
    height?: number;
    frameRate?: number;
    deviceId?: string;
  };
  error?: {
    name?: string;
    message?: string;
  };
  startedAt?: string;
  updatedAt?: string;
};

export type CameraCaptureOptions = {
  delayMs: number;
  facing: CameraFacing;
  deviceId?: string;
  width: number;
  height: number;
  fit: CameraFit;
  name?: string;
  mirror: boolean;
  readyTimeoutMs: number;
};

export type CameraListOptions = {
  facing: CameraFacing;
  deviceId?: string;
  width: number;
  height: number;
  fit: CameraFit;
  mirror: boolean;
  readyTimeoutMs: number;
};

export type CameraListResult = {
  provider: CameraProviderId;
  mirrorUrl: string;
  state: CameraMirrorState;
};

export type CameraCaptureResult = {
  provider: CameraProviderId;
  mirrorUrl: string;
  path: string;
  state: CameraMirrorState;
};

const DEFAULT_PORT = "28889";
const DEFAULT_DELAY_MS = 1200;
const DEFAULT_READY_TIMEOUT_MS = 15_000;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const MIN_DIMENSION = 160;
const MAX_DIMENSION = 4096;
const MIN_DELAY_MS = 0;
const MAX_DELAY_MS = 30_000;
const MIN_READY_TIMEOUT_MS = 1_000;
const MAX_READY_TIMEOUT_MS = 60_000;
const MIRROR_PATHNAME = "/mirror.html";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFit(value: unknown): CameraFit {
  return value === "contain" ? "contain" : "cover";
}

export function normalizeCameraFacing(value: unknown): CameraFacing {
  return value === "back" ? "back" : "front";
}

export function sanitizeCameraScreenshotBaseName(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return sanitized || undefined;
}

function resolveMirrorOrigin(): string {
  const port = normalizeOptionalString(process.env.BELLDANDY_PORT) ?? DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

function toMirrorFacing(facing: CameraFacing): "user" | "environment" {
  return facing === "back" ? "environment" : "user";
}

function buildMirrorPath(options: {
  facing: CameraFacing;
  deviceId?: string;
  width: number;
  height: number;
  fit: CameraFit;
  mirror: boolean;
}): string {
  const url = new URL(MIRROR_PATHNAME, resolveMirrorOrigin());
  url.searchParams.set("facing", toMirrorFacing(options.facing));
  url.searchParams.set("width", String(options.width));
  url.searchParams.set("height", String(options.height));
  url.searchParams.set("fit", options.fit);
  url.searchParams.set("mirror", options.mirror ? "1" : "0");
  if (options.deviceId) {
    url.searchParams.set("deviceId", options.deviceId);
  }
  return url.toString();
}

export function buildMirrorUrl(options: CameraCaptureOptions | CameraListOptions): string {
  return buildMirrorPath(options);
}

export function normalizeCameraCaptureOptions(input: Record<string, unknown>): CameraCaptureOptions {
  return {
    delayMs: clampInteger(input.delay ?? input.delayMs, DEFAULT_DELAY_MS, MIN_DELAY_MS, MAX_DELAY_MS),
    facing: normalizeCameraFacing(input.facing),
    deviceId: normalizeOptionalString(input.deviceId),
    width: clampInteger(input.width, DEFAULT_WIDTH, MIN_DIMENSION, MAX_DIMENSION),
    height: clampInteger(input.height, DEFAULT_HEIGHT, MIN_DIMENSION, MAX_DIMENSION),
    fit: normalizeFit(input.fit),
    name: sanitizeCameraScreenshotBaseName(input.name),
    mirror: normalizeBoolean(input.mirror, true),
    readyTimeoutMs: clampInteger(
      input.readyTimeoutMs,
      DEFAULT_READY_TIMEOUT_MS,
      MIN_READY_TIMEOUT_MS,
      MAX_READY_TIMEOUT_MS,
    ),
  };
}

export function normalizeCameraListOptions(input: Record<string, unknown>): CameraListOptions {
  return {
    facing: normalizeCameraFacing(input.facing),
    deviceId: normalizeOptionalString(input.deviceId),
    width: clampInteger(input.width, DEFAULT_WIDTH, MIN_DIMENSION, MAX_DIMENSION),
    height: clampInteger(input.height, DEFAULT_HEIGHT, MIN_DIMENSION, MAX_DIMENSION),
    fit: normalizeFit(input.fit),
    mirror: normalizeBoolean(input.mirror, true),
    readyTimeoutMs: clampInteger(
      input.readyTimeoutMs,
      DEFAULT_READY_TIMEOUT_MS,
      MIN_READY_TIMEOUT_MS,
      MAX_READY_TIMEOUT_MS,
    ),
  };
}

function getComparableMirrorUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function isMirrorPageUrl(url: string): boolean {
  try {
    return new URL(url).pathname === MIRROR_PATHNAME;
  } catch {
    return false;
  }
}

async function resolveMirrorPage(
  context: Pick<ToolContext, "logger" | "workspaceRoot" | "policy">,
  targetUrl: string,
): Promise<Page> {
  const manager = BrowserManager.getInstance();
  const browser = await manager.connect();
  const pages = await browser.pages();
  const mirrorPage = pages.find((page) => isMirrorPageUrl(page.url()) && !page.isClosed());

  if (mirrorPage) {
    await manager.bindToPage({
      preferredTargetId: getTargetId(mirrorPage.target()),
      preferredUrl: mirrorPage.url(),
      timeoutMs: 250,
    });
    if (getComparableMirrorUrl(mirrorPage.url()) !== getComparableMirrorUrl(targetUrl)) {
      await mirrorPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    return mirrorPage;
  }

  context.logger?.info(`[camera] opening mirror page ${targetUrl}`);
  await browserOpenTool.execute({ url: targetUrl }, context as ToolContext);
  const page = await manager.getPage();
  if (getComparableMirrorUrl(page.url()) !== getComparableMirrorUrl(targetUrl)) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }
  return page;
}

async function readMirrorState(page: Page): Promise<CameraMirrorState> {
  const state = await page.evaluate(() => {
    const bridge = (globalThis as {
      __BELLDANDY_CAMERA_MIRROR__?: {
        getState?: () => unknown;
      };
    }).__BELLDANDY_CAMERA_MIRROR__;
    return bridge?.getState?.() ?? null;
  });

  if (!state || typeof state !== "object") {
    throw new Error("镜像页未暴露摄像头状态。");
  }

  return state as CameraMirrorState;
}

async function waitForMirrorReady(page: Page, timeoutMs: number): Promise<CameraMirrorState> {
  await page.waitForFunction(() => {
    const bridge = (globalThis as {
      __BELLDANDY_CAMERA_MIRROR__?: {
        getState?: () => { status?: string } | null;
      };
    }).__BELLDANDY_CAMERA_MIRROR__;
    const state = bridge?.getState?.();
    return state?.status === "ready" || state?.status === "error";
  }, { timeout: timeoutMs });

  const state = await readMirrorState(page);
  if (state.status === "error") {
    const message = state.error?.message?.trim() || "摄像头初始化失败。";
    const name = state.error?.name?.trim();
    throw new Error(name ? `${name}: ${message}` : message);
  }
  if (state.status !== "ready") {
    throw new Error(`摄像头未进入 ready 状态：${state.status}`);
  }
  return state;
}

function buildScreenshotPath(
  context: Pick<ToolContext, "workspaceRoot">,
  options: CameraCaptureOptions,
): string {
  const screenshotsDir = path.join(context.workspaceRoot, "screenshots");
  const facing = options.deviceId ? "device" : options.facing;
  const baseName = options.name ?? `camera-${facing}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(screenshotsDir, `${baseName}_${timestamp}.png`);
}

export async function listCameraDevices(
  context: Pick<ToolContext, "logger" | "workspaceRoot" | "policy">,
  options: CameraListOptions,
): Promise<CameraListResult> {
  const mirrorUrl = buildMirrorUrl(options);
  const page = await resolveMirrorPage(context, mirrorUrl);
  const state = await waitForMirrorReady(page, options.readyTimeoutMs);
  return {
    provider: "browser_loopback",
    mirrorUrl,
    state,
  };
}

export async function captureCameraSnapshot(
  context: Pick<ToolContext, "logger" | "workspaceRoot" | "policy">,
  options: CameraCaptureOptions,
): Promise<CameraCaptureResult> {
  const mirrorUrl = buildMirrorUrl(options);
  const page = await resolveMirrorPage(context, mirrorUrl);

  await waitForMirrorReady(page, options.readyTimeoutMs);
  if (options.delayMs > 0) {
    await sleep(options.delayMs);
  }

  const filePath = buildScreenshotPath(context, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const video = await page.waitForSelector("#webcam", {
    visible: true,
    timeout: 2_000,
  });
  if (!video) {
    throw new Error("镜像页未找到视频元素。");
  }
  await video.screenshot({
    path: filePath,
    type: "png",
  });

  const state = await readMirrorState(page);
  return {
    provider: "browser_loopback",
    mirrorUrl,
    path: filePath,
    state,
  };
}
