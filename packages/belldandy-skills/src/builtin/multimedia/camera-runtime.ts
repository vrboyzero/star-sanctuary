import fs from "node:fs/promises";
import path from "node:path";

import type { Page } from "puppeteer-core";

import { raceWithAbort, sleepWithAbort, throwIfAborted } from "../../abort-utils.js";
import { browserOpenTool } from "../browser/index.js";
import { BrowserManager, getTargetId } from "../browser/tools.js";
import {
  isCameraProviderId,
  type CameraDeviceDescriptor,
  type CameraDeviceSource,
  type CameraFacing,
  type CameraFit,
  type CameraListRequest,
  type CameraListResponse,
  type CameraMirrorState,
  type CameraMirrorStatus,
  type CameraProviderContext,
  type CameraProviderId,
  type CameraSnapshotRequest,
  type CameraSnapshotResponse,
} from "./camera-contract.js";

type BrowserLoopbackMirrorDeviceInfo = {
  deviceId: string;
  label: string;
  groupId?: string;
  kind: "videoinput";
  active?: boolean;
};

type BrowserLoopbackMirrorState = {
  status: CameraMirrorStatus;
  selectedFacing: CameraFacing;
  selectedDeviceId?: string;
  devices: BrowserLoopbackMirrorDeviceInfo[];
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

export type { CameraFacing, CameraFit, CameraProviderId, CameraMirrorStatus };
export type CameraCaptureOptions = CameraSnapshotRequest;
export type CameraListOptions = CameraListRequest;
export type CameraListResult = CameraListResponse;
export type CameraCaptureResult = CameraSnapshotResponse;

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

function normalizeProviderId(value: unknown): CameraProviderId | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (!isCameraProviderId(normalized)) {
    throw new Error(`Unsupported camera provider: ${normalized}`);
  }
  return normalized;
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

export function buildBrowserLoopbackFacingDeviceRef(facing: CameraFacing): string {
  return `browser_loopback:facing:${facing}`;
}

export function buildBrowserLoopbackDeviceRef(deviceId: string): string {
  return `browser_loopback:device:${encodeURIComponent(deviceId)}`;
}

export function parseBrowserLoopbackDeviceRef(
  deviceRef: string | undefined,
): {
  deviceId?: string;
  facing?: CameraFacing;
} {
  const normalized = normalizeOptionalString(deviceRef);
  if (!normalized) {
    return {};
  }
  const parts = normalized.split(":");
  if (parts[0] !== "browser_loopback") {
    throw new Error(`deviceRef does not belong to browser_loopback: ${normalized}`);
  }
  if (parts[1] === "device") {
    const encodedDeviceId = parts.slice(2).join(":");
    if (!encodedDeviceId) {
      throw new Error(`Invalid browser_loopback deviceRef: ${normalized}`);
    }
    return {
      deviceId: decodeURIComponent(encodedDeviceId),
    };
  }
  if (parts[1] === "facing" && (parts[2] === "front" || parts[2] === "back")) {
    return {
      facing: parts[2],
    };
  }
  if (parts.length === 2 && (parts[1] === "front" || parts[1] === "back")) {
    return {
      facing: parts[1],
    };
  }
  throw new Error(`Unsupported browser_loopback deviceRef: ${normalized}`);
}

function resolveBrowserLoopbackSelection<T extends CameraCaptureOptions | CameraListOptions>(
  options: T,
): T {
  const parsedRef = parseBrowserLoopbackDeviceRef(options.deviceRef);
  if (options.deviceId && parsedRef.deviceId && options.deviceId !== parsedRef.deviceId) {
    throw new Error("deviceId and deviceRef point to different browser_loopback devices.");
  }
  const facing = parsedRef.facing ?? options.facing;
  const deviceId = options.deviceId ?? parsedRef.deviceId;
  const deviceRef = options.deviceRef
    ?? (deviceId ? buildBrowserLoopbackDeviceRef(deviceId) : buildBrowserLoopbackFacingDeviceRef(facing));
  return {
    ...options,
    provider: options.provider ?? "browser_loopback",
    deviceId,
    deviceRef,
    facing,
  } as T;
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
  const selection = resolveBrowserLoopbackSelection(options);
  return buildMirrorPath(selection);
}

export function normalizeCameraCaptureOptions(input: Record<string, unknown>): CameraCaptureOptions {
  return {
    provider: normalizeProviderId(input.provider),
    delayMs: clampInteger(input.delay ?? input.delayMs, DEFAULT_DELAY_MS, MIN_DELAY_MS, MAX_DELAY_MS),
    facing: normalizeCameraFacing(input.facing),
    deviceId: normalizeOptionalString(input.deviceId),
    deviceRef: normalizeOptionalString(input.deviceRef),
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
    provider: normalizeProviderId(input.provider),
    facing: normalizeCameraFacing(input.facing),
    deviceId: normalizeOptionalString(input.deviceId),
    deviceRef: normalizeOptionalString(input.deviceRef),
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
  context: CameraProviderContext,
  targetUrl: string,
): Promise<Page> {
  throwIfAborted(context.abortSignal);
  const manager = BrowserManager.getInstance();
  const browser = await manager.connect(context.abortSignal);
  const pages = await browser.pages();
  const mirrorPage = pages.find((page) => isMirrorPageUrl(page.url()) && !page.isClosed());

  if (mirrorPage) {
    await manager.bindToPage({
      preferredTargetId: getTargetId(mirrorPage.target()),
      preferredUrl: mirrorPage.url(),
      timeoutMs: 250,
      signal: context.abortSignal,
    });
    if (getComparableMirrorUrl(mirrorPage.url()) !== getComparableMirrorUrl(targetUrl)) {
      await raceWithAbort(
        mirrorPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }),
        context.abortSignal,
      );
    }
    return mirrorPage;
  }

  context.logger?.info(`[camera] opening mirror page ${targetUrl}`);
  await browserOpenTool.execute({ url: targetUrl }, context);
  throwIfAborted(context.abortSignal);
  const page = await manager.getPage(context.abortSignal);
  if (getComparableMirrorUrl(page.url()) !== getComparableMirrorUrl(targetUrl)) {
    await raceWithAbort(
      page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }),
      context.abortSignal,
    );
  }
  return page;
}

async function readMirrorState(page: Page): Promise<BrowserLoopbackMirrorState> {
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

  return state as BrowserLoopbackMirrorState;
}

async function waitForMirrorReady(
  page: Page,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<BrowserLoopbackMirrorState> {
  await raceWithAbort(page.waitForFunction(() => {
    const bridge = (globalThis as {
      __BELLDANDY_CAMERA_MIRROR__?: {
        getState?: () => { status?: string } | null;
      };
    }).__BELLDANDY_CAMERA_MIRROR__;
    const state = bridge?.getState?.();
    return state?.status === "ready" || state?.status === "error";
  }, { timeout: timeoutMs }), signal);

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
  context: Pick<CameraProviderContext, "workspaceRoot">,
  options: CameraCaptureOptions,
): string {
  const screenshotsDir = path.join(context.workspaceRoot, "screenshots");
  const facing = options.deviceId ? "device" : options.facing;
  const baseName = options.name ?? `camera-${facing}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(screenshotsDir, `${baseName}_${timestamp}.png`);
}

function inferBrowserLoopbackDeviceSource(label: string): CameraDeviceSource {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("capture")) {
    return "capture_card";
  }
  if (normalized.includes("virtual")) {
    return "virtual";
  }
  if (
    normalized.includes("usb")
    || normalized.includes("brio")
    || normalized.includes("logitech")
    || normalized.includes("webcam")
  ) {
    return "external";
  }
  return "unknown";
}

function mapBrowserLoopbackDevice(
  device: BrowserLoopbackMirrorDeviceInfo,
  state: BrowserLoopbackMirrorState,
): CameraDeviceDescriptor {
  const source = inferBrowserLoopbackDeviceSource(device.label);
  return {
    provider: "browser_loopback",
    deviceId: device.deviceId,
    deviceRef: buildBrowserLoopbackDeviceRef(device.deviceId),
    label: device.label,
    groupId: device.groupId,
    kind: "videoinput",
    active: device.active,
    facing: device.active ? state.selectedFacing : undefined,
    source,
    transport: "browser",
    external: source === "external" || source === "capture_card",
    available: true,
  };
}

function toCameraMirrorState(state: BrowserLoopbackMirrorState): CameraMirrorState {
  const devices = state.devices.map((device) => mapBrowserLoopbackDevice(device, state));
  return {
    ...state,
    selectedDeviceRef: state.selectedDeviceId
      ? buildBrowserLoopbackDeviceRef(state.selectedDeviceId)
      : buildBrowserLoopbackFacingDeviceRef(state.selectedFacing),
    devices,
  };
}

export async function listCameraDevices(
  context: CameraProviderContext,
  options: CameraListOptions,
): Promise<CameraListResult> {
  const resolvedOptions = resolveBrowserLoopbackSelection(options);
  const mirrorUrl = buildMirrorUrl(resolvedOptions);
  const page = await resolveMirrorPage(context, mirrorUrl);
  const state = await waitForMirrorReady(page, resolvedOptions.readyTimeoutMs, context.abortSignal);
  return {
    provider: "browser_loopback",
    mirrorUrl,
    state: toCameraMirrorState(state),
  };
}

export async function captureCameraSnapshot(
  context: CameraProviderContext,
  options: CameraCaptureOptions,
): Promise<CameraCaptureResult> {
  const resolvedOptions = resolveBrowserLoopbackSelection(options);
  const mirrorUrl = buildMirrorUrl(resolvedOptions);
  const page = await resolveMirrorPage(context, mirrorUrl);

  await waitForMirrorReady(page, resolvedOptions.readyTimeoutMs, context.abortSignal);
  if (resolvedOptions.delayMs > 0) {
    await sleepWithAbort(resolvedOptions.delayMs, context.abortSignal);
  }

  throwIfAborted(context.abortSignal);
  const filePath = buildScreenshotPath(context, resolvedOptions);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const video = await raceWithAbort(page.waitForSelector("#webcam", {
    visible: true,
    timeout: 2_000,
  }), context.abortSignal);
  if (!video) {
    throw new Error("镜像页未找到视频元素。");
  }
  throwIfAborted(context.abortSignal);
  await video.screenshot({
    path: filePath,
    type: "png",
  });

  const state = await readMirrorState(page);
  return {
    provider: "browser_loopback",
    mirrorUrl,
    path: filePath,
    state: toCameraMirrorState(state),
  };
}
