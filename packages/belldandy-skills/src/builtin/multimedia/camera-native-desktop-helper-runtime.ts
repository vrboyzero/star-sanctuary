import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type {
  CameraDeviceSource,
  CameraFacing,
  CameraPermissionState,
  CameraProviderStatus,
} from "./camera-contract.js";
import {
  CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
  buildNativeDesktopDisplayRef,
  buildNativeDesktopFacingDeviceRef,
  buildNativeDesktopWindowRef,
  parseNativeDesktopDisplayRef,
  parseNativeDesktopWindowRef,
  resolveNativeDesktopSelection,
  type CameraNativeDesktopCaptureScreenRequest,
  type CameraNativeDesktopCaptureScreenResponse,
  type CameraNativeDesktopCaptureConstraints,
  type CameraNativeDesktopDisplayTarget,
  type CameraNativeDesktopHelperCaptureSnapshotRequest,
  type CameraNativeDesktopHelperCaptureSnapshotResponse,
  type CameraNativeDesktopHelperConfig,
  type CameraNativeDesktopHelperDiagnoseRequest,
  type CameraNativeDesktopHelperDiagnoseResponse,
  type CameraNativeDesktopHelperDevice,
  type CameraNativeDesktopHelperHelloRequest,
  type CameraNativeDesktopHelperHelloResponse,
  type CameraNativeDesktopHelperIssue,
  type CameraNativeDesktopHelperListDevicesRequest,
  type CameraNativeDesktopHelperListDevicesResponse,
  type CameraNativeDesktopListCaptureTargetsRequest,
  type CameraNativeDesktopListCaptureTargetsResponse,
  type CameraNativeDesktopHelperShutdownRequest,
  type CameraNativeDesktopHelperShutdownResponse,
  type CameraNativeDesktopHelperCapabilities,
  type CameraNativeDesktopScreenCaptureTarget,
  type CameraNativeDesktopScreenRect,
  type CameraNativeDesktopSelectionReason,
  type CameraNativeDesktopSnapshotFormat,
  type CameraNativeDesktopWindowTarget,
} from "./camera-native-desktop-contract.js";

export const BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND";
export const BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND";
export const BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_ARGS_JSON_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_ARGS_JSON";
export const BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_ARGS_JSON_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_ARGS_JSON";

const DEFAULT_HELPER_VERSION = "0.1.0";
const DEFAULT_POWERSHELL_COMMAND = "powershell.exe";
const DEFAULT_FFMPEG_COMMAND = "ffmpeg";
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type CommandRunner = (input: {
  command: string;
  args: string[];
  timeoutMs?: number;
}) => Promise<CommandResult>;

type HelperRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  runCommand?: CommandRunner;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
  mkdir?: typeof fs.mkdir;
  now?: () => Date;
};

type WindowsPnPCameraRecord = {
  name?: string;
  description?: string;
  pnpClass?: string;
  pnpDeviceId?: string;
  manufacturer?: string;
  service?: string;
  classGuid?: string;
  status?: string;
};

type DirectShowVideoDevice = {
  label: string;
  alternativeNames: string[];
};

type RuntimeCameraDevice = CameraNativeDesktopHelperDevice & {
  ffmpegDeviceName?: string;
  ffmpegAlternativeNames?: string[];
};

type RawScreenDisplayRecord = {
  id?: string;
  name?: string;
  isPrimary?: boolean;
  bounds?: Partial<CameraNativeDesktopScreenRect>;
  workArea?: Partial<CameraNativeDesktopScreenRect>;
};

type RawScreenWindowRecord = {
  id?: string;
  title?: string;
  appName?: string;
  processId?: number;
  isVisible?: boolean;
  isMinimized?: boolean;
  bounds?: Partial<CameraNativeDesktopScreenRect>;
  displayId?: string;
};

type ScreenEnumerationPayload = {
  displays?: RawScreenDisplayRecord[];
  windows?: RawScreenWindowRecord[];
};

type PnpDeviceIdentity = {
  vendorId?: string;
  productId?: string;
  interfaceId?: string;
  instanceId?: string;
  busType?: string;
};

export class NativeDesktopHelperRuntimeError extends Error {
  readonly code:
    | "invalid_request"
    | "protocol_mismatch"
    | "helper_unavailable"
    | "permission_denied"
    | "device_not_found"
    | "device_busy"
    | "capture_failed"
    | "target_not_found"
    | "timeout"
    | "unsupported_method"
    | "unknown";
  readonly retryable: boolean;
  readonly issues?: CameraNativeDesktopHelperIssue[];
  readonly metadata?: Record<string, unknown>;

  constructor(input: {
    code:
      | "invalid_request"
      | "protocol_mismatch"
      | "helper_unavailable"
      | "permission_denied"
      | "device_not_found"
      | "device_busy"
      | "capture_failed"
      | "target_not_found"
      | "timeout"
      | "unsupported_method"
      | "unknown";
    message: string;
    retryable?: boolean;
    issues?: CameraNativeDesktopHelperIssue[];
    metadata?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "NativeDesktopHelperRuntimeError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.issues = input.issues;
    this.metadata = input.metadata;
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeJsonArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  return [value as T];
}

function parseOptionalJsonStringArray(value: string | undefined, label: string): string[] | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = JSON.parse(normalized);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }
  return [...parsed];
}

function buildIssue(
  code: CameraNativeDesktopHelperIssue["code"],
  message: string,
  options: {
    severity?: CameraNativeDesktopHelperIssue["severity"];
    retryable?: boolean;
    metadata?: Record<string, unknown>;
  } = {},
): CameraNativeDesktopHelperIssue {
  return {
    code,
    severity: options.severity ?? "error",
    message,
    ...(options.retryable === true ? { retryable: true } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

async function defaultRunCommand(input: {
  command: string;
  args: string[];
  timeoutMs?: number;
}): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = input.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new NativeDesktopHelperRuntimeError({
        code: "timeout",
        message: `Command timed out after ${timeoutMs}ms: ${input.command}`,
        retryable: true,
        metadata: {
          command: input.command,
        },
      }));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new NativeDesktopHelperRuntimeError({
        code: "helper_unavailable",
        message: `Failed to start command ${input.command}: ${error.message}`,
        retryable: false,
        metadata: {
          command: input.command,
        },
      }));
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function inferFacing(label: string): CameraFacing | undefined {
  const normalized = label.toLowerCase();
  if (normalized.includes("rear") || normalized.includes("back") || normalized.includes("environment")) {
    return "back";
  }
  if (normalized.includes("front") || normalized.includes("user") || normalized.includes("face")) {
    return "front";
  }
  return undefined;
}

function inferSource(device: {
  label: string;
  pnpDeviceId: string;
}): CameraDeviceSource {
  const label = device.label.toLowerCase();
  const pnpDeviceId = device.pnpDeviceId.toLowerCase();
  if (
    label.includes("capture")
    || label.includes("cam link")
    || label.includes("elgato")
    || label.includes("magewell")
  ) {
    return "capture_card";
  }
  if (
    label.includes("virtual")
    || /\bobs\b/u.test(label)
    || label.includes("ndi")
    || label.includes("splitcam")
    || label.includes("vcam")
  ) {
    return "virtual";
  }
  if (pnpDeviceId.startsWith("usb\\")) {
    return "external";
  }
  if (pnpDeviceId.startsWith("acpi\\") || pnpDeviceId.startsWith("pci\\")) {
    return "integrated";
  }
  return "unknown";
}

function buildStableKey(device: {
  label: string;
  pnpDeviceId: string;
  source: CameraDeviceSource;
}): string {
  const lowerId = device.pnpDeviceId.toLowerCase();
  const usbVidPid = /usb\\vid_([0-9a-f]{4})&pid_([0-9a-f]{4})/i.exec(lowerId);
  const hash = crypto.createHash("sha1").update(lowerId).digest("hex").slice(0, 8);
  const prefix = device.source === "capture_card"
    ? "capture"
    : device.source === "external"
      ? "usb"
      : "camera";
  const body = usbVidPid
    ? `${usbVidPid[1]}-${usbVidPid[2]}`
    : slugify(device.label) || "device";
  return `${prefix}-${body}-${hash}`;
}

function parsePnpDeviceIdentity(pnpDeviceId: string): PnpDeviceIdentity {
  const normalized = normalizeString(pnpDeviceId);
  if (!normalized) {
    return {};
  }
  const usbMatch = /^usb\\vid_([0-9a-f]{4})&pid_([0-9a-f]{4})(?:&mi_([0-9a-f]{2}))?\\(.+)$/iu.exec(normalized);
  if (usbMatch) {
    return {
      vendorId: usbMatch[1].toLowerCase(),
      productId: usbMatch[2].toLowerCase(),
      interfaceId: usbMatch[3]?.toLowerCase(),
      instanceId: usbMatch[4],
      busType: "usb",
    };
  }
  if (normalized.toLowerCase().startsWith("pci\\")) {
    return {
      busType: "pci",
    };
  }
  if (normalized.toLowerCase().startsWith("acpi\\")) {
    return {
      busType: "acpi",
    };
  }
  return {};
}

function parseStableKeyIdentity(stableKey: string): {
  prefix?: "capture" | "usb" | "camera";
  vendorId?: string;
  productId?: string;
  labelSlug?: string;
} {
  const normalized = normalizeString(stableKey).toLowerCase();
  if (!normalized) {
    return {};
  }
  const usbVidPidMatch = /^(capture|usb|camera)-([0-9a-f]{4})-([0-9a-f]{4})-[0-9a-f]{8}$/u.exec(normalized);
  if (usbVidPidMatch) {
    return {
      prefix: usbVidPidMatch[1] as "capture" | "usb" | "camera",
      vendorId: usbVidPidMatch[2],
      productId: usbVidPidMatch[3],
    };
  }
  const genericMatch = /^(capture|usb|camera)-(.+)-[0-9a-f]{8}$/u.exec(normalized);
  if (!genericMatch) {
    return {};
  }
  return {
    prefix: genericMatch[1] as "capture" | "usb" | "camera",
    labelSlug: genericMatch[2],
  };
}

function isBusyCaptureError(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return [
    "requested resource is in use",
    "device or resource busy",
    "resource busy",
    "already in use",
    "currently in use",
    "access is denied",
    "permission denied",
  ].some((fragment) => normalized.includes(fragment));
}

function parseDirectShowDevices(stderr: string): DirectShowVideoDevice[] {
  const devices: DirectShowVideoDevice[] = [];
  let inVideoSection = false;
  let current: DirectShowVideoDevice | null = null;
  for (const line of stderr.split(/\r?\n/u)) {
    const content = line.replace(/^\[[^\]]+\]\s*/u, "").trim();
    if (!content) {
      continue;
    }
    if (content.toLowerCase().startsWith("directshow video devices")) {
      inVideoSection = true;
      current = null;
      continue;
    }
    if (content.toLowerCase().startsWith("directshow audio devices")) {
      inVideoSection = false;
      current = null;
      continue;
    }
    if (!inVideoSection) {
      const directVideoMatch = /^"([^"]+)"\s+\(video\)$/u.exec(content);
      if (directVideoMatch) {
        current = {
          label: directVideoMatch[1],
          alternativeNames: [],
        };
        devices.push(current);
      }
      continue;
    }
    const deviceMatch = /^"([^"]+)"$/u.exec(content);
    if (deviceMatch) {
      current = {
        label: deviceMatch[1],
        alternativeNames: [],
      };
      devices.push(current);
      continue;
    }
    const altMatch = /^Alternative name "([^"]+)"$/u.exec(content);
    if (altMatch && current) {
      current.alternativeNames.push(altMatch[1]);
    }
  }
  return devices;
}

function normalizePnpComparableId(value: string): string {
  return value.toLowerCase().replace(/[{}]/g, "");
}

function matchDirectShowDevice(
  pnpDeviceId: string,
  label: string,
  ffmpegDevices: DirectShowVideoDevice[],
): DirectShowVideoDevice | undefined {
  const normalizedId = normalizePnpComparableId(pnpDeviceId).replace(/\\/g, "#");
  const normalizedLabel = label.trim().toLowerCase();
  const byAlternative = ffmpegDevices.find((device) => device.alternativeNames.some((candidate) =>
    normalizePnpComparableId(candidate).includes(normalizedId)));
  if (byAlternative) {
    return byAlternative;
  }
  return ffmpegDevices.find((device) => device.label.trim().toLowerCase() === normalizedLabel);
}

function mapSelectionReason(value: CameraNativeDesktopSelectionReason | undefined): CameraNativeDesktopSelectionReason | undefined {
  return value;
}

async function readImageSize(
  filePath: string,
  readFileImpl: typeof fs.readFile,
): Promise<{ width?: number; height?: number }> {
  const buffer = await readFileImpl(filePath);
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  return {};
}

function toPowerShellBoolean(value: boolean): string {
  return value ? "$true" : "$false";
}

function toPowerShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildPowerShellListCommand(): string {
  return [
    "$devices = Get-CimInstance Win32_PnPEntity | Where-Object {",
    "  $_.Name -and $_.PNPDeviceID -and ($_.PNPClass -eq 'Camera' -or $_.PNPClass -eq 'Image')",
    "} | ForEach-Object {",
    "  [PSCustomObject]@{",
    "    name = $_.Name",
    "    description = $_.Description",
    "    pnpClass = $_.PNPClass",
    "    pnpDeviceId = $_.PNPDeviceID",
    "    manufacturer = $_.Manufacturer",
    "    service = $_.Service",
    "    classGuid = $_.ClassGuid",
    "    status = $_.Status",
    "  }",
    "}",
    "@($devices) | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
}

function buildPowerShellCaptureTargetsCommand(input: {
  includeDisplays: boolean;
  includeWindows: boolean;
  includeMinimizedWindows: boolean;
  windowTitleFilter?: string;
}): string {
  const titleFilter = normalizeString(input.windowTitleFilter);
  return [
    `$includeDisplays = ${toPowerShellBoolean(input.includeDisplays)}`,
    `$includeWindows = ${toPowerShellBoolean(input.includeWindows)}`,
    `$includeMinimizedWindows = ${toPowerShellBoolean(input.includeMinimizedWindows)}`,
    `$windowTitleFilter = ${toPowerShellSingleQuoted(titleFilter)}`,
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "using System.Text;",
    "public static class BelldandyWindowInterop {",
    "  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
    "  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);",
    "  [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);",
    "  [DllImport(\"user32.dll\")] public static extern int GetWindowTextLength(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);",
    "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
    "  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }",
    "}",
    "\"@",
    "$displays = @()",
    "if ($includeDisplays) {",
    "  $displays = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {",
    "    $bounds = $_.Bounds",
    "    $workArea = $_.WorkingArea",
    "    [PSCustomObject]@{",
    "      id = $_.DeviceName",
    "      name = $_.DeviceName",
    "      isPrimary = [bool]$_.Primary",
    "      bounds = [PSCustomObject]@{ x = $bounds.X; y = $bounds.Y; width = $bounds.Width; height = $bounds.Height }",
    "      workArea = [PSCustomObject]@{ x = $workArea.X; y = $workArea.Y; width = $workArea.Width; height = $workArea.Height }",
    "    }",
    "  }",
    "}",
    "$windows = @()",
    "if ($includeWindows) {",
    "  $screenList = [System.Windows.Forms.Screen]::AllScreens",
    "  $processNameCache = @{}",
    "  $collectedWindows = New-Object System.Collections.Generic.List[object]",
    "  $null = [BelldandyWindowInterop]::EnumWindows({",
    "    param($hWnd, $lParam)",
    "    if (-not [BelldandyWindowInterop]::IsWindowVisible($hWnd)) { return $true }",
    "    $isMinimized = [BelldandyWindowInterop]::IsIconic($hWnd)",
    "    if (-not $includeMinimizedWindows -and $isMinimized) { return $true }",
    "    $length = [BelldandyWindowInterop]::GetWindowTextLength($hWnd)",
    "    if ($length -le 0) { return $true }",
    "    $builder = New-Object System.Text.StringBuilder ($length + 1)",
    "    [void][BelldandyWindowInterop]::GetWindowText($hWnd, $builder, $builder.Capacity)",
    "    $title = $builder.ToString().Trim()",
    "    if ([string]::IsNullOrWhiteSpace($title)) { return $true }",
    "    if ($windowTitleFilter -and $title.IndexOf($windowTitleFilter, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { return $true }",
    "    $rect = New-Object BelldandyWindowInterop+RECT",
    "    if (-not [BelldandyWindowInterop]::GetWindowRect($hWnd, [ref]$rect)) { return $true }",
    "    $width = [Math]::Max(0, $rect.Right - $rect.Left)",
    "    $height = [Math]::Max(0, $rect.Bottom - $rect.Top)",
    "    if ($width -le 0 -or $height -le 0) { return $true }",
    "    [uint32]$processId = 0",
    "    [void][BelldandyWindowInterop]::GetWindowThreadProcessId($hWnd, [ref]$processId)",
    "    $processName = $null",
    "    if ($processId -gt 0) {",
    "      if ($processNameCache.ContainsKey($processId)) {",
    "        $processName = $processNameCache[$processId]",
    "      } else {",
    "        try {",
    "          $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName",
    "        } catch {",
    "          $processName = $null",
    "        }",
    "        $processNameCache[$processId] = $processName",
    "      }",
    "    }",
    "    $centerX = $rect.Left + [int]($width / 2)",
    "    $centerY = $rect.Top + [int]($height / 2)",
    "    $displayId = $null",
    "    foreach ($screen in $screenList) {",
    "      $screenBounds = $screen.Bounds",
    "      if ($centerX -ge $screenBounds.X -and $centerX -lt ($screenBounds.X + $screenBounds.Width) -and $centerY -ge $screenBounds.Y -and $centerY -lt ($screenBounds.Y + $screenBounds.Height)) {",
    "        $displayId = $screen.DeviceName",
    "        break",
    "      }",
    "    }",
    "    $hwndHex = ('0x{0:x}' -f $hWnd.ToInt64())",
    "    $collectedWindows.Add([PSCustomObject]@{",
    "      id = $hwndHex",
    "      title = $title",
    "      appName = $processName",
    "      processId = if ($processId -gt 0) { [int]$processId } else { $null }",
    "      isVisible = $true",
    "      isMinimized = [bool]$isMinimized",
    "      bounds = [PSCustomObject]@{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }",
    "      displayId = $displayId",
    "    }) | Out-Null",
    "    return $true",
    "  }, [IntPtr]::Zero)",
    "  $windows = $collectedWindows",
    "}",
    "[PSCustomObject]@{ displays = @($displays); windows = @($windows) } | ConvertTo-Json -Compress -Depth 6",
  ].join("\n");
}

function resolveExecutable(
  env: NodeJS.ProcessEnv,
  options: {
    commandEnv: string;
    argsEnv: string;
    defaultCommand: string;
  },
): {
  command: string;
  args: string[];
} {
  return {
    command: normalizeString(env[options.commandEnv]) || options.defaultCommand,
    args: parseOptionalJsonStringArray(env[options.argsEnv], options.argsEnv) ?? [],
  };
}

export class NativeDesktopWindowsHelperRuntime {
  private readonly env: NodeJS.ProcessEnv;
  private readonly runCommand: CommandRunner;
  private readonly readFileImpl: typeof fs.readFile;
  private readonly statImpl: typeof fs.stat;
  private readonly mkdirImpl: typeof fs.mkdir;
  private readonly now: () => Date;
  private workspaceRoot?: string;

  constructor(options: HelperRuntimeOptions = {}) {
    this.env = options.env ?? process.env;
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.readFileImpl = options.readFile ?? fs.readFile;
    this.statImpl = options.stat ?? fs.stat;
    this.mkdirImpl = options.mkdir ?? fs.mkdir;
    this.now = options.now ?? (() => new Date());
  }

  async hello(
    input: CameraNativeDesktopHelperHelloRequest,
  ): Promise<CameraNativeDesktopHelperHelloResponse> {
    this.workspaceRoot = normalizeString(input.workspaceRoot) || this.workspaceRoot;
    const capabilities = await this.detectCapabilities();
    return {
      protocol: CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
      helperVersion: DEFAULT_HELPER_VERSION,
      platform: "windows",
      transport: "stdio",
      helperStatus: "ready",
      capabilities,
    };
  }

  async diagnose(
    input: CameraNativeDesktopHelperDiagnoseRequest,
  ): Promise<CameraNativeDesktopHelperDiagnoseResponse> {
    const diagnostics = await this.gatherRuntimeDiagnostics({
      includeDevices: input.includeDevices === true,
      includeCapabilities: input.includeCapabilities !== false,
    });
    return {
      status: diagnostics.status,
      helperStatus: "ready",
      permissionState: diagnostics.permissionState,
      observedAt: diagnostics.observedAt,
      issues: diagnostics.issues,
      ...(diagnostics.devices ? { devices: diagnostics.devices } : {}),
      ...(diagnostics.capabilities ? { capabilities: diagnostics.capabilities } : {}),
      helperVersion: DEFAULT_HELPER_VERSION,
    };
  }

  async listDevices(
    input: CameraNativeDesktopHelperListDevicesRequest,
  ): Promise<CameraNativeDesktopHelperListDevicesResponse> {
    const diagnostics = await this.gatherRuntimeDiagnostics({
      includeDevices: true,
      includeCapabilities: false,
    });
    const devices = diagnostics.devices ?? [];
    const selection = this.selectDevice(devices, input.selection);
    const issues = [...diagnostics.issues];
    if (!selection.device && (
      normalizeString(input.selection?.stableKey)
      || normalizeString(input.selection?.deviceId)
      || normalizeString(input.selection?.deviceRef)
    )) {
      issues.push(buildIssue(
        "device_not_found",
        "Requested native_desktop camera device is not currently available.",
        {
          severity: "warning",
          metadata: {
            deviceId: normalizeString(input.selection?.deviceId) || undefined,
            stableKey: normalizeString(input.selection?.stableKey) || undefined,
            deviceRef: normalizeString(input.selection?.deviceRef) || undefined,
          },
        },
      ));
    }
    return {
      observedAt: diagnostics.observedAt,
      helperStatus: "ready",
      permissionState: diagnostics.permissionState,
      devices,
      ...(selection.device ? { selectedDeviceId: selection.device.deviceId } : {}),
      ...(selection.device ? { selectedStableKey: selection.device.stableKey } : {}),
      ...(selection.reason ? { selectionReason: mapSelectionReason(selection.reason) } : {}),
      ...(issues.length > 0 ? { issues } : {}),
    };
  }

  async listCaptureTargets(
    input: CameraNativeDesktopListCaptureTargetsRequest,
  ): Promise<CameraNativeDesktopListCaptureTargetsResponse> {
    const issues: CameraNativeDesktopHelperIssue[] = [];
    const capabilities = await this.detectCapabilities(issues);
    if (!capabilities.screenTargetList) {
      throw new NativeDesktopHelperRuntimeError({
        code: "helper_unavailable",
        message: "Screen target enumeration is unavailable because PowerShell screen inspection is not ready.",
        issues,
      });
    }
    const targets = await this.enumerateCaptureTargets(issues, input);
    return {
      observedAt: this.now().toISOString(),
      helperStatus: "ready",
      permissionState: "not_applicable",
      ...(input.includeDisplays !== false ? { displays: targets.displays } : {}),
      ...(input.includeWindows !== false ? { windows: targets.windows } : {}),
      ...(issues.length > 0 ? { issues } : {}),
    };
  }

  async captureSnapshot(
    input: CameraNativeDesktopHelperCaptureSnapshotRequest,
  ): Promise<CameraNativeDesktopHelperCaptureSnapshotResponse> {
    const diagnostics = await this.gatherRuntimeDiagnostics({
      includeDevices: true,
      includeCapabilities: true,
    });
    if (!diagnostics.capabilities?.snapshot) {
      throw new NativeDesktopHelperRuntimeError({
        code: "helper_unavailable",
        message: "Snapshot capture is unavailable because ffmpeg is not configured or not executable.",
        issues: diagnostics.issues,
      });
    }
    const selection = this.selectDevice(diagnostics.devices ?? [], input.selection, {
      requireCaptureSupport: true,
    });
    const device = selection.device;
    if (!device) {
      throw new NativeDesktopHelperRuntimeError({
        code: "device_not_found",
        message: "No matching native_desktop camera device is available for capture.",
        issues: diagnostics.issues,
      });
    }
    if (!device.ffmpegDeviceName) {
      throw new NativeDesktopHelperRuntimeError({
        code: "capture_failed",
        message: `Selected device "${device.label}" does not expose a DirectShow video input that the helper can capture from.`,
        issues: diagnostics.issues,
      });
    }
    const format = input.output?.format ?? "png";
    const outputPath = await this.resolveSnapshotOutputPath(input.output?.filePath, format);
    if (typeof input.delayMs === "number" && input.delayMs > 0) {
      const delayMs = Math.max(0, Math.trunc(input.delayMs));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await this.runFfmpegSnapshot(device.ffmpegDeviceName, outputPath, input.constraints, input.timeoutMs, format);
    const [stat, dimensions] = await Promise.all([
      this.statImpl(outputPath),
      readImageSize(outputPath, this.readFileImpl),
    ]);
    const observedAt = this.now().toISOString();
    return {
      observedAt,
      helperStatus: "ready",
      permissionState: diagnostics.permissionState,
      device,
      ...(selection.reason ? { selectionReason: selection.reason } : {}),
      artifact: {
        path: outputPath,
        format,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: stat.size,
        capturedAt: observedAt,
      },
      ...(diagnostics.issues.length > 0 ? { issues: diagnostics.issues } : {}),
    };
  }

  async captureScreen(
    input: CameraNativeDesktopCaptureScreenRequest,
  ): Promise<CameraNativeDesktopCaptureScreenResponse> {
    const issues: CameraNativeDesktopHelperIssue[] = [];
    const capabilities = await this.detectCapabilities(issues);
    if (!capabilities.screenCapture) {
      throw new NativeDesktopHelperRuntimeError({
        code: "helper_unavailable",
        message: "Screen capture is unavailable because ffmpeg gdigrab is not configured or not executable.",
        issues,
      });
    }

    const format = input.output?.format ?? "png";
    const outputPath = await this.resolveSnapshotOutputPath(input.output?.filePath, format);
    if (typeof input.delayMs === "number" && input.delayMs > 0) {
      const delayMs = Math.max(0, Math.trunc(input.delayMs));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    let normalizedTarget: CameraNativeDesktopScreenCaptureTarget = input.target;
    let selectedDisplay: CameraNativeDesktopDisplayTarget | undefined;
    let selectedWindow: CameraNativeDesktopWindowTarget | undefined;

    if (input.target.kind === "display" || input.target.kind === "window") {
      if (!capabilities.screenTargetList) {
        throw new NativeDesktopHelperRuntimeError({
          code: "helper_unavailable",
          message: "Display or window capture requires PowerShell screen target enumeration support.",
          issues,
        });
      }
      const targets = await this.enumerateCaptureTargets(issues, {
        includeDisplays: true,
        includeWindows: true,
        includeMinimizedWindows: true,
        windowTitleFilter: input.target.kind === "window" ? input.target.windowTitle : undefined,
      });
      if (input.target.kind === "display") {
        selectedDisplay = this.resolveDisplayTarget(targets.displays, input.target);
        if (!selectedDisplay) {
          throw new NativeDesktopHelperRuntimeError({
            code: "target_not_found",
            message: "Requested display target was not found.",
            issues,
          });
        }
        normalizedTarget = {
          kind: "display",
          displayId: selectedDisplay.id,
          displayRef: selectedDisplay.displayRef,
        };
      } else {
        selectedWindow = this.resolveWindowTarget(targets.windows, input.target);
        if (!selectedWindow) {
          throw new NativeDesktopHelperRuntimeError({
            code: "target_not_found",
            message: "Requested window target was not found.",
            issues,
          });
        }
        normalizedTarget = {
          kind: "window",
          windowId: selectedWindow.id,
          windowRef: selectedWindow.windowRef,
          windowTitle: selectedWindow.title,
        };
      }
    } else if (input.target.kind === "region") {
      normalizedTarget = this.normalizeRegionTarget(input.target);
    }

    await this.runFfmpegScreenCapture({
      target: normalizedTarget,
      display: selectedDisplay,
      window: selectedWindow,
      outputPath,
      timeoutMs: input.timeoutMs,
      format,
      includeCursor: input.includeCursor !== false,
    });

    const [stat, dimensions] = await Promise.all([
      this.statImpl(outputPath),
      readImageSize(outputPath, this.readFileImpl),
    ]);
    const observedAt = this.now().toISOString();
    return {
      observedAt,
      helperStatus: "ready",
      permissionState: "not_applicable",
      target: normalizedTarget,
      artifact: {
        path: outputPath,
        format,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: stat.size,
        capturedAt: observedAt,
      },
      ...(selectedDisplay ? { display: selectedDisplay } : {}),
      ...(selectedWindow ? { window: selectedWindow } : {}),
      ...(issues.length > 0 ? { issues } : {}),
    };
  }

  async shutdown(
    _input: CameraNativeDesktopHelperShutdownRequest,
  ): Promise<CameraNativeDesktopHelperShutdownResponse> {
    return {
      acknowledged: true,
      observedAt: this.now().toISOString(),
    };
  }

  private async gatherRuntimeDiagnostics(input: {
    includeDevices: boolean;
    includeCapabilities: boolean;
  }): Promise<{
    status: CameraProviderStatus;
    permissionState: CameraPermissionState;
    observedAt: string;
    issues: CameraNativeDesktopHelperIssue[];
    devices?: RuntimeCameraDevice[];
    capabilities?: CameraNativeDesktopHelperCapabilities;
  }> {
    const observedAt = this.now().toISOString();
    const issues: CameraNativeDesktopHelperIssue[] = [];
    let devices: RuntimeCameraDevice[] | undefined;
    if (input.includeDevices) {
      try {
        devices = await this.enumerateDevices(issues);
      } catch {
        devices = [];
      }
    }
    const capabilities = input.includeCapabilities ? await this.detectCapabilities(issues) : undefined;

    let status: CameraProviderStatus = "available";
    if (issues.some((issue) => issue.severity === "error")) {
      status = issues.some((issue) => issue.code === "helper_unavailable")
        ? "unavailable"
        : "degraded";
    } else if (issues.length > 0) {
      status = "degraded";
    }
    return {
      status,
      permissionState: "not_applicable",
      observedAt,
      issues,
      ...(devices ? { devices } : {}),
      ...(capabilities ? { capabilities } : {}),
    };
  }

  private async detectCapabilities(
    issues: CameraNativeDesktopHelperIssue[] = [],
  ): Promise<CameraNativeDesktopHelperCapabilities> {
    const powershellReady = await this.checkPowerShell(issues);
    const ffmpegReady = await this.checkFfmpeg(issues);
    return {
      diagnose: true,
      list: powershellReady,
      snapshot: powershellReady && ffmpegReady,
      clip: false,
      audio: false,
      hotplug: false,
      background: true,
      stillFormats: powershellReady && ffmpegReady ? ["png", "jpeg"] : [],
      clipFormats: [],
      selectionByStableKey: true,
      deviceChangeEvents: false,
      screenTargetList: powershellReady,
      screenCapture: ffmpegReady,
      windowCapture: ffmpegReady,
      displayCapture: powershellReady && ffmpegReady,
      regionCapture: ffmpegReady,
    };
  }

  private async checkPowerShell(
    issues: CameraNativeDesktopHelperIssue[],
  ): Promise<boolean> {
    const executable = resolveExecutable(this.env, {
      commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND_ENV,
      argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_ARGS_JSON_ENV,
      defaultCommand: DEFAULT_POWERSHELL_COMMAND,
    });
    try {
      const result = await this.runCommand({
        command: executable.command,
        args: [
          ...executable.args,
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "Write-Output 'ok'",
        ],
        timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      if (result.exitCode !== 0 || !result.stdout.toLowerCase().includes("ok")) {
        issues.push(buildIssue(
          "helper_unavailable",
          `PowerShell probe failed with exit code ${result.exitCode ?? "null"}.`,
          {
            metadata: {
              stderr: result.stderr.trim() || undefined,
            },
          },
        ));
        return false;
      }
      return true;
    } catch (error) {
      issues.push(buildIssue(
        "helper_unavailable",
        error instanceof Error ? error.message : String(error),
      ));
      return false;
    }
  }

  private async checkFfmpeg(
    issues: CameraNativeDesktopHelperIssue[],
  ): Promise<boolean> {
    const executable = resolveExecutable(this.env, {
      commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV,
      argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_ARGS_JSON_ENV,
      defaultCommand: DEFAULT_FFMPEG_COMMAND,
    });
    try {
      const result = await this.runCommand({
        command: executable.command,
        args: [...executable.args, "-hide_banner", "-version"],
        timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        issues.push(buildIssue(
          "helper_unavailable",
          `ffmpeg probe failed with exit code ${result.exitCode ?? "null"}.`,
          {
            severity: "warning",
            metadata: {
              stderr: result.stderr.trim() || undefined,
            },
          },
        ));
        return false;
      }
      return true;
    } catch (error) {
      issues.push(buildIssue(
        "helper_unavailable",
        error instanceof Error ? error.message : String(error),
        { severity: "warning" },
      ));
      return false;
    }
  }

  private async enumerateDevices(
    issues: CameraNativeDesktopHelperIssue[],
  ): Promise<RuntimeCameraDevice[]> {
    const powershellExecutable = resolveExecutable(this.env, {
      commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND_ENV,
      argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_ARGS_JSON_ENV,
      defaultCommand: DEFAULT_POWERSHELL_COMMAND,
    });
    let pnpRecords: WindowsPnPCameraRecord[];
    try {
      const result = await this.runCommand({
        command: powershellExecutable.command,
        args: [
          ...powershellExecutable.args,
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          buildPowerShellListCommand(),
        ],
        timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        throw new NativeDesktopHelperRuntimeError({
          code: "helper_unavailable",
          message: `PowerShell device enumeration failed with exit code ${result.exitCode ?? "null"}.`,
          metadata: {
            stderr: result.stderr.trim() || undefined,
          },
        });
      }
      pnpRecords = normalizeJsonArray<WindowsPnPCameraRecord>(JSON.parse(result.stdout || "[]"));
    } catch (error) {
      const helperError = error instanceof NativeDesktopHelperRuntimeError
        ? error
        : new NativeDesktopHelperRuntimeError({
          code: "helper_unavailable",
          message: error instanceof Error ? error.message : String(error),
        });
      issues.push(buildIssue(helperError.code === "timeout" ? "timeout" : "helper_unavailable", helperError.message, {
        metadata: helperError.metadata,
      }));
      throw helperError;
    }

    let ffmpegDevices: DirectShowVideoDevice[] = [];
    try {
      const ffmpegExecutable = resolveExecutable(this.env, {
        commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV,
        argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_ARGS_JSON_ENV,
        defaultCommand: DEFAULT_FFMPEG_COMMAND,
      });
      const ffmpegResult = await this.runCommand({
        command: ffmpegExecutable.command,
        args: [...ffmpegExecutable.args, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
        timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      ffmpegDevices = parseDirectShowDevices(ffmpegResult.stderr || ffmpegResult.stdout);
      if (ffmpegDevices.length === 0) {
        issues.push(buildIssue(
          "helper_unavailable",
          "ffmpeg is available but did not report any DirectShow video devices.",
          { severity: "warning" },
        ));
      }
    } catch (error) {
      issues.push(buildIssue(
        "helper_unavailable",
        error instanceof Error ? error.message : String(error),
        { severity: "warning" },
      ));
    }

    const devices = pnpRecords
      .filter((record) => normalizeString(record.pnpDeviceId) && normalizeString(record.name))
      .map((record): RuntimeCameraDevice => {
        const label = normalizeString(record.name);
        const pnpDeviceId = normalizeString(record.pnpDeviceId);
        const identity = parsePnpDeviceIdentity(pnpDeviceId);
        const source = inferSource({ label, pnpDeviceId });
        const matchedDirectShow = matchDirectShowDevice(pnpDeviceId, label, ffmpegDevices);
        return {
          deviceId: pnpDeviceId,
          stableKey: buildStableKey({ label, pnpDeviceId, source }),
          label,
          facing: inferFacing(label),
          source,
          transport: "native",
          external: source === "external" || source === "capture_card",
          available: true,
          kind: "videoinput",
          metadata: {
            instancePath: pnpDeviceId,
            hardwarePath: matchedDirectShow?.alternativeNames?.[0],
            vendorId: identity.vendorId,
            productId: identity.productId,
            busType: identity.busType,
            pnpClass: record.pnpClass,
            manufacturer: record.manufacturer,
            service: record.service,
            classGuid: record.classGuid,
            status: record.status,
            captureSupported: Boolean(matchedDirectShow),
            ...(matchedDirectShow ? {
              ffmpegDeviceName: matchedDirectShow.label,
              ffmpegAlternativeNames: matchedDirectShow.alternativeNames,
            } : {}),
          },
          ffmpegDeviceName: matchedDirectShow?.label,
          ffmpegAlternativeNames: matchedDirectShow?.alternativeNames,
        };
      });

    if (devices.length === 0) {
      issues.push(buildIssue(
        "device_not_found",
        "No Windows camera devices were enumerated by the helper.",
        { severity: "warning" },
      ));
    }
    return devices;
  }

  private async enumerateCaptureTargets(
    issues: CameraNativeDesktopHelperIssue[],
    input: CameraNativeDesktopListCaptureTargetsRequest,
  ): Promise<{
    displays: CameraNativeDesktopDisplayTarget[];
    windows: CameraNativeDesktopWindowTarget[];
  }> {
    const powershellExecutable = resolveExecutable(this.env, {
      commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND_ENV,
      argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_ARGS_JSON_ENV,
      defaultCommand: DEFAULT_POWERSHELL_COMMAND,
    });
    const command = buildPowerShellCaptureTargetsCommand({
      includeDisplays: input.includeDisplays !== false,
      includeWindows: input.includeWindows !== false,
      includeMinimizedWindows: input.includeMinimizedWindows === true,
      windowTitleFilter: input.windowTitleFilter,
    });
    let payload: ScreenEnumerationPayload;
    try {
      const result = await this.runCommand({
        command: powershellExecutable.command,
        args: [
          ...powershellExecutable.args,
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          command,
        ],
        timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        throw new NativeDesktopHelperRuntimeError({
          code: "helper_unavailable",
          message: `PowerShell screen target enumeration failed with exit code ${result.exitCode ?? "null"}.`,
          metadata: {
            stderr: result.stderr.trim() || undefined,
          },
        });
      }
      payload = (JSON.parse(result.stdout || "{}") ?? {}) as ScreenEnumerationPayload;
    } catch (error) {
      const helperError = error instanceof NativeDesktopHelperRuntimeError
        ? error
        : new NativeDesktopHelperRuntimeError({
          code: "helper_unavailable",
          message: error instanceof Error ? error.message : String(error),
        });
      issues.push(buildIssue(
        helperError.code === "timeout" ? "timeout" : "helper_unavailable",
        helperError.message,
        {
          metadata: helperError.metadata,
        },
      ));
      throw helperError;
    }

    const displays = normalizeJsonArray<RawScreenDisplayRecord>(payload.displays)
      .map((record) => this.normalizeDisplayTarget(record))
      .filter((record): record is CameraNativeDesktopDisplayTarget => Boolean(record));
    const windows = normalizeJsonArray<RawScreenWindowRecord>(payload.windows)
      .map((record) => this.normalizeWindowTarget(record))
      .filter((record): record is CameraNativeDesktopWindowTarget => Boolean(record));

    return { displays, windows };
  }

  private normalizeDisplayTarget(
    record: RawScreenDisplayRecord,
  ): CameraNativeDesktopDisplayTarget | undefined {
    const id = normalizeString(record.id);
    const name = normalizeString(record.name) || id;
    const bounds = this.normalizeScreenRect(record.bounds);
    if (!id || !name || !bounds) {
      return undefined;
    }
    const workArea = this.normalizeScreenRect(record.workArea);
    return {
      id,
      displayRef: buildNativeDesktopDisplayRef(id),
      name,
      isPrimary: record.isPrimary === true,
      bounds,
      ...(workArea ? { workArea } : {}),
    };
  }

  private normalizeWindowTarget(
    record: RawScreenWindowRecord,
  ): CameraNativeDesktopWindowTarget | undefined {
    const id = normalizeString(record.id);
    const title = normalizeString(record.title);
    const bounds = this.normalizeScreenRect(record.bounds);
    if (!id || !title || !bounds) {
      return undefined;
    }
    const processId = typeof record.processId === "number" && Number.isFinite(record.processId)
      ? Math.trunc(record.processId)
      : undefined;
    const displayId = normalizeString(record.displayId) || undefined;
    return {
      id,
      windowRef: buildNativeDesktopWindowRef(id),
      title,
      ...(normalizeString(record.appName) ? { appName: normalizeString(record.appName) } : {}),
      ...(typeof processId === "number" ? { processId } : {}),
      isVisible: record.isVisible !== false,
      isMinimized: record.isMinimized === true,
      bounds,
      ...(displayId ? { displayId } : {}),
    };
  }

  private normalizeScreenRect(
    value: Partial<CameraNativeDesktopScreenRect> | undefined,
  ): CameraNativeDesktopScreenRect | undefined {
    if (!value) {
      return undefined;
    }
    const x = typeof value.x === "number" && Number.isFinite(value.x) ? Math.trunc(value.x) : undefined;
    const y = typeof value.y === "number" && Number.isFinite(value.y) ? Math.trunc(value.y) : undefined;
    const width = typeof value.width === "number" && Number.isFinite(value.width) ? Math.trunc(value.width) : undefined;
    const height = typeof value.height === "number" && Number.isFinite(value.height) ? Math.trunc(value.height) : undefined;
    if (
      typeof x !== "number"
      || typeof y !== "number"
      || typeof width !== "number"
      || typeof height !== "number"
      || width <= 0
      || height <= 0
    ) {
      return undefined;
    }
    return { x, y, width, height };
  }

  private resolveDisplayTarget(
    displays: CameraNativeDesktopDisplayTarget[],
    target: Extract<CameraNativeDesktopScreenCaptureTarget, { kind: "display" }>,
  ): CameraNativeDesktopDisplayTarget | undefined {
    const parsedRef = parseNativeDesktopDisplayRef(target.displayRef);
    const requestedId = parsedRef.displayId ?? (normalizeString(target.displayId) || undefined);
    if (!requestedId) {
      return displays[0];
    }
    return displays.find((display) => display.id === requestedId);
  }

  private resolveWindowTarget(
    windows: CameraNativeDesktopWindowTarget[],
    target: Extract<CameraNativeDesktopScreenCaptureTarget, { kind: "window" }>,
  ): CameraNativeDesktopWindowTarget | undefined {
    const parsedRef = parseNativeDesktopWindowRef(target.windowRef);
    const requestedId = parsedRef.windowId ?? (normalizeString(target.windowId) || undefined);
    if (requestedId) {
      return windows.find((window) => window.id === requestedId);
    }
    const requestedTitle = normalizeString(target.windowTitle);
    if (!requestedTitle) {
      return undefined;
    }
    const requestedTitleLower = requestedTitle.toLowerCase();
    const exactMatch = windows.find((window) => window.title.toLowerCase() === requestedTitleLower);
    if (exactMatch) {
      return exactMatch;
    }
    const partialMatches = windows.filter((window) =>
      window.title.toLowerCase().includes(requestedTitleLower));
    if (partialMatches.length === 1) {
      return partialMatches[0];
    }
    return undefined;
  }

  private normalizeRegionTarget(
    target: Extract<CameraNativeDesktopScreenCaptureTarget, { kind: "region" }>,
  ): Extract<CameraNativeDesktopScreenCaptureTarget, { kind: "region" }> {
    const normalized = this.normalizeScreenRect(target);
    if (!normalized) {
      throw new NativeDesktopHelperRuntimeError({
        code: "invalid_request",
        message: "Screen region capture requires finite x, y, width, and height values greater than zero.",
      });
    }
    return {
      kind: "region",
      ...normalized,
    };
  }

  private reidentifyDeviceFromStableKey(
    devices: RuntimeCameraDevice[],
    stableKey: string | undefined,
    selection: CameraNativeDesktopHelperListDevicesRequest["selection"] | CameraNativeDesktopHelperCaptureSnapshotRequest["selection"],
  ): RuntimeCameraDevice | undefined {
    const identity = parseStableKeyIdentity(stableKey ?? "");
    if (!identity.prefix) {
      return undefined;
    }

    let candidates = devices.filter((device) => {
      if (identity.prefix === "usb" && device.source !== "external") {
        return false;
      }
      if (identity.prefix === "capture" && device.source !== "capture_card") {
        return false;
      }
      const metadata = device.metadata as { vendorId?: unknown; productId?: unknown } | undefined;
      const vendorId = normalizeString(metadata?.vendorId).toLowerCase();
      const productId = normalizeString(metadata?.productId).toLowerCase();
      if (identity.vendorId && identity.productId) {
        return vendorId === identity.vendorId && productId === identity.productId;
      }
      if (identity.labelSlug) {
        return slugify(device.label) === identity.labelSlug;
      }
      return false;
    });

    if (selection?.facing) {
      const byFacing = candidates.filter((device) => device.facing === selection.facing);
      if (byFacing.length === 1) {
        return byFacing[0];
      }
      if (byFacing.length > 1) {
        candidates = byFacing;
      }
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const captureSupportedCandidates = candidates.filter((device) => Boolean(device.ffmpegDeviceName));
    if (captureSupportedCandidates.length === 1) {
      return captureSupportedCandidates[0];
    }

    return undefined;
  }

  private selectDevice(
    devices: RuntimeCameraDevice[],
    selection: CameraNativeDesktopHelperListDevicesRequest["selection"] | CameraNativeDesktopHelperCaptureSnapshotRequest["selection"],
    options: {
      requireCaptureSupport?: boolean;
    } = {},
  ): {
    device?: RuntimeCameraDevice;
    reason?: CameraNativeDesktopSelectionReason;
  } {
    const requireCaptureSupport = options.requireCaptureSupport === true;
    const eligible = requireCaptureSupport
      ? devices.filter((device) => Boolean(device.ffmpegDeviceName))
      : devices;
    const captureEligible = eligible.filter((device) => Boolean(device.ffmpegDeviceName));
    if (eligible.length === 0) {
      return {};
    }
    if (selection?.stableKey) {
      const explicitMatch = eligible.find((device) => device.stableKey === selection.stableKey);
      if (explicitMatch) {
        return {
          device: explicitMatch,
          reason: "explicit_stable_key",
        };
      }
      const reidentified = this.reidentifyDeviceFromStableKey(eligible, selection.stableKey, selection);
      if (reidentified) {
        return {
          device: reidentified,
          reason: "explicit_stable_key_reidentified",
        };
      }
      return {};
    }
    if (selection?.deviceId) {
      const explicitMatch = eligible.find((device) => device.deviceId === selection.deviceId);
      if (explicitMatch) {
        return {
          device: explicitMatch,
          reason: "explicit_device_id",
        };
      }
      return {};
    }
    if (selection?.deviceRef) {
      const resolved = resolveNativeDesktopSelection({
        facing: selection.facing ?? "front",
        deviceId: selection.deviceId,
        deviceRef: selection.deviceRef,
        width: 0,
        height: 0,
        fit: "cover",
        mirror: false,
        readyTimeoutMs: 1,
      });
      if (resolved.stableKey) {
        const explicitMatch = eligible.find((device) => device.stableKey === resolved.stableKey);
        if (explicitMatch) {
          return {
            device: explicitMatch,
            reason: "explicit_device_ref",
          };
        }
        const reidentified = this.reidentifyDeviceFromStableKey(eligible, resolved.stableKey, selection);
        if (reidentified) {
          return {
            device: reidentified,
            reason: "explicit_device_ref_reidentified",
          };
        }
        return {};
      }
      if (resolved.facing) {
        const facingMatch = eligible.find((device) => device.facing === resolved.facing);
        if (facingMatch) {
          return {
            device: facingMatch,
            reason: "explicit_device_ref",
          };
        }
        return {};
      }
    }
    if (selection?.facing) {
      const byFacing = eligible.find((device) => device.facing === selection.facing);
      if (byFacing) {
        return {
          device: byFacing,
          reason: "facing_preference",
        };
      }
    }
    if (!requireCaptureSupport && captureEligible.length > 0) {
      return {
        device: captureEligible[0],
        reason: "helper_default",
      };
    }
    return {
      device: eligible[0],
      reason: "first_available",
    };
  }

  private async resolveSnapshotOutputPath(
    requestedFilePath: string | undefined,
    format: CameraNativeDesktopSnapshotFormat,
  ): Promise<string> {
    if (normalizeString(requestedFilePath)) {
      const target = path.resolve(requestedFilePath as string);
      await this.mkdirImpl(path.dirname(target), { recursive: true });
      return target;
    }
    const root = this.workspaceRoot ? path.resolve(this.workspaceRoot) : process.cwd();
    const screenshotsDir = path.join(root, "screenshots");
    await this.mkdirImpl(screenshotsDir, { recursive: true });
    const timestamp = this.now().toISOString().replace(/[:.]/g, "-");
    return path.join(screenshotsDir, `camera-native-desktop_${timestamp}.${format}`);
  }

  private async runFfmpegSnapshot(
    deviceName: string,
    outputPath: string,
    constraints: CameraNativeDesktopCaptureConstraints | undefined,
    timeoutMs: number | undefined,
    format: CameraNativeDesktopSnapshotFormat,
  ): Promise<void> {
    const ffmpegExecutable = resolveExecutable(this.env, {
      commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV,
      argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_ARGS_JSON_ENV,
      defaultCommand: DEFAULT_FFMPEG_COMMAND,
    });
    const buildArgs = (inputFormat?: {
      kind: "pixel_format" | "vcodec";
      value: string;
    }): string[] => {
      const args = [
        ...ffmpegExecutable.args,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "dshow",
      ];
      if (inputFormat) {
        args.push(`-${inputFormat.kind}`, inputFormat.value);
      }
      if (constraints?.width && constraints?.height) {
        args.push("-video_size", `${constraints.width}x${constraints.height}`);
      }
      args.push("-i", `video=${deviceName}`);
      if (constraints?.mirror === true) {
        args.push("-vf", "hflip");
      }
      args.push("-frames:v", "1");
      if (format === "jpeg") {
        args.push("-q:v", "2");
      }
      args.push(outputPath);
      return args;
    };
    const toCaptureError = (input: {
      stderr: string;
      exitCode: number | null;
      args: string[];
    }): NativeDesktopHelperRuntimeError => {
      if (isBusyCaptureError(input.stderr)) {
        return new NativeDesktopHelperRuntimeError({
          code: "device_busy",
          message: `Selected device "${deviceName}" appears to be busy or locked by another application.`,
          retryable: true,
          metadata: {
            stderr: input.stderr.trim() || undefined,
            deviceName,
            args: input.args,
          },
        });
      }
      return new NativeDesktopHelperRuntimeError({
        code: "capture_failed",
        message: `ffmpeg snapshot capture failed with exit code ${input.exitCode ?? "null"}.`,
        metadata: {
          stderr: input.stderr.trim() || undefined,
          deviceName,
          args: input.args,
        },
      });
    };

    const primaryArgs = buildArgs();
    const primaryResult = await this.runCommand({
      command: ffmpegExecutable.command,
      args: primaryArgs,
      timeoutMs: timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    });

    if (primaryResult.exitCode === 0) {
      return;
    }

    if ((primaryResult.stderr || "").includes("No JPEG data found in image")) {
      const fallbackArgs = buildArgs({
        kind: "pixel_format",
        value: "yuyv422",
      });
      const fallbackResult = await this.runCommand({
        command: ffmpegExecutable.command,
        args: fallbackArgs,
        timeoutMs: timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      });
      if (fallbackResult.exitCode === 0) {
        return;
      }
      throw toCaptureError({
        stderr: fallbackResult.stderr,
        exitCode: fallbackResult.exitCode,
        args: fallbackArgs,
      });
    }

    throw toCaptureError({
      stderr: primaryResult.stderr,
      exitCode: primaryResult.exitCode,
      args: primaryArgs,
    });
  }

  private async runFfmpegScreenCapture(input: {
    target: CameraNativeDesktopScreenCaptureTarget;
    display?: CameraNativeDesktopDisplayTarget;
    window?: CameraNativeDesktopWindowTarget;
    outputPath: string;
    timeoutMs?: number;
    format: CameraNativeDesktopSnapshotFormat;
    includeCursor: boolean;
  }): Promise<void> {
    const ffmpegExecutable = resolveExecutable(this.env, {
      commandEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV,
      argsEnv: BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_ARGS_JSON_ENV,
      defaultCommand: DEFAULT_FFMPEG_COMMAND,
    });
    const args = [
      ...ffmpegExecutable.args,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "gdigrab",
      "-draw_mouse",
      input.includeCursor ? "1" : "0",
    ];

    const region = input.target.kind === "region"
      ? input.target
      : input.target.kind === "display"
        ? input.display?.bounds
        : undefined;
    if (region) {
      args.push(
        "-offset_x",
        `${region.x}`,
        "-offset_y",
        `${region.y}`,
        "-video_size",
        `${region.width}x${region.height}`,
        "-i",
        "desktop",
      );
    } else if (input.target.kind === "window") {
      const windowId = normalizeString(input.window?.id ?? input.target.windowId);
      if (!windowId) {
        throw new NativeDesktopHelperRuntimeError({
          code: "target_not_found",
          message: "Window capture requires a resolved window target.",
        });
      }
      args.push("-i", `hwnd=${windowId}`);
    } else {
      args.push("-i", "desktop");
    }

    args.push("-frames:v", "1");
    if (input.format === "jpeg") {
      args.push("-q:v", "2");
    }
    args.push(input.outputPath);

    const result = await this.runCommand({
      command: ffmpegExecutable.command,
      args,
      timeoutMs: input.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    });
    if (result.exitCode === 0) {
      return;
    }
    throw new NativeDesktopHelperRuntimeError({
      code: input.target.kind === "window" ? "target_not_found" : "capture_failed",
      message: `ffmpeg screen capture failed with exit code ${result.exitCode ?? "null"}.`,
      metadata: {
        stderr: result.stderr.trim() || undefined,
        args,
        target: input.target.kind,
      },
    });
  }
}
