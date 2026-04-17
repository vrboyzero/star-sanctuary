import { DEFAULT_POLICY } from "../../executor.js";
import type {
  CameraPermissionState,
  CameraProviderCapabilities,
  CameraProviderContext,
  CameraProviderDiagnostic,
  CameraProviderDiagnosticIssue,
  CameraProviderId,
  CameraProviderStatus,
} from "./camera-contract.js";
import { browserLoopbackCameraProvider } from "./camera-browser-loopback-provider.js";
import type { CameraNativeDesktopHelperConfig } from "./camera-native-desktop-contract.js";
import { NativeDesktopCameraProvider } from "./camera-native-desktop-provider.js";
import { CameraProviderRegistry } from "./camera-provider-registry.js";
import {
  BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_REQUEST_TIMEOUT_MS_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_STARTUP_TIMEOUT_MS_ENV,
  readNativeDesktopHelperConfigFromEnv,
} from "./camera-native-desktop-stdio-client.js";
import {
  isLikelyNodeCommand,
  resolveNativeDesktopHelperLaunch,
} from "./camera-native-desktop-launch.js";

type CameraRuntimeDoctorProviderStatus =
  | CameraProviderStatus
  | "not_checked"
  | "not_configured";

export type CameraRuntimeDoctorLaunchConfig = {
  transport: string;
  command: string;
  helperEntry?: string;
  resolvedCommand?: string;
  resolvedHelperEntry?: string;
  cwd?: string;
  runtimeDir?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  idleShutdownMs?: number;
};

export type CameraRuntimeDoctorDeviceCounts = {
  total: number;
  available: number;
  unavailable: number;
  busy: number;
  external: number;
  integrated: number;
  virtual: number;
  captureCard: number;
};

export type CameraRuntimeDoctorProvider = {
  id: CameraProviderId;
  registered: boolean;
  configured: boolean;
  defaultSelected: boolean;
  diagnoseSupported: boolean;
  status: CameraRuntimeDoctorProviderStatus;
  permissionState?: CameraPermissionState;
  helperStatus?: string;
  issueCounts: {
    info: number;
    warning: number;
    error: number;
  };
  issues: CameraProviderDiagnosticIssue[];
  recoveryHints: string[];
  headline: string;
  fix?: string;
  capabilities?: CameraProviderCapabilities;
  deviceCounts?: CameraRuntimeDoctorDeviceCounts;
  sampleDevices?: string[];
  launchConfig?: CameraRuntimeDoctorLaunchConfig;
  metadata?: Record<string, unknown>;
};

export type CameraRuntimeDoctorReport = {
  observedAt: string;
  summary: {
    available: boolean;
    defaultProviderId?: CameraProviderId;
    registeredProviderIds: CameraProviderId[];
    warningCount: number;
    errorCount: number;
    headline: string;
    fix?: string;
  };
  providers: CameraRuntimeDoctorProvider[];
};

export type BuildCameraRuntimeDoctorReportOptions = {
  env?: NodeJS.ProcessEnv;
  includeBrowserLoopbackOnly?: boolean;
  context?: Partial<CameraProviderContext>;
};

type CountSummary = {
  info: number;
  warning: number;
  error: number;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeIssueCounts(issues: readonly CameraProviderDiagnosticIssue[]): CountSummary {
  const counts: CountSummary = {
    info: 0,
    warning: 0,
    error: 0,
  };
  for (const issue of issues) {
    if (issue.severity === "info") {
      counts.info += 1;
      continue;
    }
    if (issue.severity === "warning") {
      counts.warning += 1;
      continue;
    }
    counts.error += 1;
  }
  return counts;
}

function summarizeDevices(
  diagnostic: Pick<CameraProviderDiagnostic, "devices">,
): {
  counts: CameraRuntimeDoctorDeviceCounts;
  samples: string[];
} | undefined {
  if (!diagnostic.devices?.length) {
    return undefined;
  }
  const counts: CameraRuntimeDoctorDeviceCounts = {
    total: diagnostic.devices.length,
    available: 0,
    unavailable: 0,
    busy: 0,
    external: 0,
    integrated: 0,
    virtual: 0,
    captureCard: 0,
  };
  const samples: string[] = [];
  for (const device of diagnostic.devices) {
    if (device.available) {
      counts.available += 1;
    } else {
      counts.unavailable += 1;
    }
    if (device.metadata?.busy === true) {
      counts.busy += 1;
    }
    switch (device.source) {
      case "external":
        counts.external += 1;
        break;
      case "integrated":
        counts.integrated += 1;
        break;
      case "virtual":
        counts.virtual += 1;
        break;
      case "capture_card":
        counts.captureCard += 1;
        break;
      default:
        break;
    }
    if (samples.length >= 4) {
      continue;
    }
    const tags = [
      device.available ? "available" : "unavailable",
      device.external ? "external" : device.source,
      device.metadata?.busy === true ? "busy" : "",
      device.stableKey ? `stable=${device.stableKey}` : "",
    ].filter(Boolean);
    samples.push(`${device.label} [${tags.join(", ")}]`);
  }
  return {
    counts,
    samples,
  };
}

function parseErrorCode(message: string): {
  code?: string;
  detail: string;
} {
  const separatorIndex = message.indexOf(":");
  if (separatorIndex <= 0) {
    return { detail: message };
  }
  const code = message.slice(0, separatorIndex).trim();
  if (!/^[a-z_]+$/u.test(code)) {
    return { detail: message };
  }
  return {
    code,
    detail: message.slice(separatorIndex + 1).trim(),
  };
}

function buildFailureIssue(error: unknown): CameraProviderDiagnosticIssue {
  const message = error instanceof Error ? error.message : String(error);
  const parsed = parseErrorCode(message);
  return {
    code: parsed.code ?? "helper_unavailable",
    severity: "error",
    message: parsed.detail,
  };
}

function buildRecoveryHints(
  providerId: CameraProviderId,
  issues: readonly CameraProviderDiagnosticIssue[],
  launchConfig?: CameraRuntimeDoctorLaunchConfig,
): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    hints.push(normalized);
  };

  for (const issue of issues) {
    switch (issue.code) {
      case "helper_not_configured":
        push(`配置 ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV} 与 ${BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV} 后再重试。`);
        break;
      case "helper_unavailable":
      case "protocol_mismatch":
        push(`确认 helper 启动命令、cwd 和 helper 入口可执行；必要时检查 ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV}、${BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV}、${BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV}。`);
        break;
      case "permission_denied":
        push("确认 Windows 摄像头权限允许当前应用访问。");
        break;
      case "device_busy":
        push("关闭正在占用摄像头的会议或录制软件后重试。");
        break;
      case "device_not_found":
        push("确认摄像头已连接，并重新执行 camera_list 获取当前 deviceRef。");
        break;
      case "timeout":
        push(`重试一次；如果持续超时，检查 helper 启动时间以及 ${BELLDANDY_CAMERA_NATIVE_HELPER_STARTUP_TIMEOUT_MS_ENV} / ${BELLDANDY_CAMERA_NATIVE_HELPER_REQUEST_TIMEOUT_MS_ENV} 是否需要放宽。`);
        break;
      case "driver_error":
      case "capture_failed":
        push("检查 ffmpeg / DirectShow 是否能看到目标设备，必要时重新插拔摄像头或重启 helper。");
        break;
      default:
        break;
    }
    if (issue.retryable) {
      push("该问题标记为可重试；在环境无改动时建议最多重试一次，再看 helper stderr / doctor 输出。");
    }
  }

  if (!hints.length && providerId === "native_desktop" && launchConfig) {
    push(`当前 helper 由 ${launchConfig.command} 拉起；若改过部署方式，请同时核对 cwd、helper entry、runtimeDir 和 ${BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV}。`);
  }

  return hints;
}

async function buildLaunchConfigSummary(
  config: CameraNativeDesktopHelperConfig | null,
  env: NodeJS.ProcessEnv,
): Promise<CameraRuntimeDoctorLaunchConfig | undefined> {
  if (!config) {
    return undefined;
  }
  const resolvedLaunch = await resolveNativeDesktopHelperLaunch(config, { env });
  const helperEntry = isLikelyNodeCommand(config.command)
    ? resolvedLaunch.helperEntry?.value
    : undefined;
  return {
    transport: config.transport,
    command: config.command,
    ...(helperEntry ? { helperEntry } : {}),
    ...(resolvedLaunch.resolvedCommandPath
      && resolvedLaunch.resolvedCommandPath.resolvedPath !== config.command
      ? { resolvedCommand: resolvedLaunch.resolvedCommandPath.resolvedPath }
      : {}),
    ...(resolvedLaunch.helperEntry
      && resolvedLaunch.helperEntry.resolvedPath !== resolvedLaunch.helperEntry.value
      ? { resolvedHelperEntry: resolvedLaunch.helperEntry.resolvedPath }
      : {}),
    ...(config.cwd ? { cwd: config.cwd } : {}),
    ...(resolvedLaunch.runtimeDir ? { runtimeDir: resolvedLaunch.runtimeDir } : {}),
    ...(config.startupTimeoutMs !== undefined ? { startupTimeoutMs: config.startupTimeoutMs } : {}),
    ...(config.requestTimeoutMs !== undefined ? { requestTimeoutMs: config.requestTimeoutMs } : {}),
    ...(config.idleShutdownMs !== undefined ? { idleShutdownMs: config.idleShutdownMs } : {}),
  };
}

function buildProviderHeadline(input: {
  providerId: CameraProviderId;
  status: CameraRuntimeDoctorProviderStatus;
  issueCounts: CountSummary;
  deviceCounts?: CameraRuntimeDoctorDeviceCounts;
  helperStatus?: string;
  configured: boolean;
}): string {
  if (!input.configured && input.providerId === "native_desktop") {
    return "native_desktop helper 未配置，当前 doctor 不会启用本机摄像头链路。";
  }
  if (input.providerId === "browser_loopback" && input.status === "not_checked") {
    return "browser_loopback 已注册；doctor 当前不主动拉起浏览器，会在真实浏览器会话中补充运行时状态。";
  }
  const issueSummary = input.issueCounts.error > 0 || input.issueCounts.warning > 0
    ? `issues error=${input.issueCounts.error}, warning=${input.issueCounts.warning}`
    : "no issues";
  const helperStatus = input.helperStatus ? `helper=${input.helperStatus}` : "";
  const deviceSummary = input.deviceCounts
    ? `devices ${input.deviceCounts.available}/${input.deviceCounts.total} available`
      + (input.deviceCounts.busy > 0 ? `, busy=${input.deviceCounts.busy}` : "")
    : "";
  return [input.providerId, `status=${input.status}`, helperStatus, deviceSummary, issueSummary]
    .filter(Boolean)
    .join("; ");
}

function createBrowserLoopbackDoctorProvider(
  defaultProviderId: CameraProviderId | undefined,
): CameraRuntimeDoctorProvider {
  const issueCounts = summarizeIssueCounts([]);
  return {
    id: "browser_loopback",
    registered: true,
    configured: true,
    defaultSelected: defaultProviderId === "browser_loopback",
    diagnoseSupported: false,
    status: "not_checked",
    issueCounts,
    issues: [],
    recoveryHints: [],
    headline: buildProviderHeadline({
      providerId: "browser_loopback",
      status: "not_checked",
      issueCounts,
      configured: true,
    }),
  };
}

function createNativeDesktopConfigErrorProvider(
  error: unknown,
  defaultProviderId: CameraProviderId | undefined,
): CameraRuntimeDoctorProvider {
  const issue = buildFailureIssue(error);
  const issues = [issue];
  const issueCounts = summarizeIssueCounts(issues);
  const recoveryHints = buildRecoveryHints("native_desktop", issues);
  return {
    id: "native_desktop",
    registered: false,
    configured: true,
    defaultSelected: defaultProviderId === "native_desktop",
    diagnoseSupported: false,
    status: "unavailable",
    issueCounts,
    issues,
    recoveryHints,
    fix: recoveryHints[0],
    headline: `native_desktop helper 配置无效: ${issue.message}`,
  };
}

function mapDiagnosticToDoctorProvider(
  providerId: CameraProviderId,
  diagnostic: CameraProviderDiagnostic,
  options: {
    defaultProviderId?: CameraProviderId;
    configured: boolean;
    launchConfig?: CameraRuntimeDoctorLaunchConfig;
  },
): CameraRuntimeDoctorProvider {
  const issues = diagnostic.issues ?? [];
  const issueCounts = summarizeIssueCounts(issues);
  const deviceSummary = summarizeDevices(diagnostic);
  const helperStatus = normalizeString(diagnostic.metadata?.helperStatus);
  const recoveryHints = buildRecoveryHints(providerId, issues, options.launchConfig);
  return {
    id: providerId,
    registered: true,
    configured: options.configured,
    defaultSelected: options.defaultProviderId === providerId,
    diagnoseSupported: true,
    status: diagnostic.status,
    permissionState: diagnostic.permissionState,
    ...(helperStatus ? { helperStatus } : {}),
    issueCounts,
    issues,
    recoveryHints,
    ...(recoveryHints[0] ? { fix: recoveryHints[0] } : {}),
    headline: buildProviderHeadline({
      providerId,
      status: diagnostic.status,
      issueCounts,
      deviceCounts: deviceSummary?.counts,
      helperStatus,
      configured: options.configured,
    }),
    capabilities: diagnostic.capabilities,
    ...(deviceSummary ? { deviceCounts: deviceSummary.counts, sampleDevices: deviceSummary.samples } : {}),
    ...(options.launchConfig ? { launchConfig: options.launchConfig } : {}),
    ...(diagnostic.metadata ? { metadata: diagnostic.metadata } : {}),
  };
}

function mapFailureToDoctorProvider(
  providerId: CameraProviderId,
  error: unknown,
  options: {
    defaultProviderId?: CameraProviderId;
    configured: boolean;
    launchConfig?: CameraRuntimeDoctorLaunchConfig;
  },
): CameraRuntimeDoctorProvider {
  const issues = [buildFailureIssue(error)];
  const issueCounts = summarizeIssueCounts(issues);
  const recoveryHints = buildRecoveryHints(providerId, issues, options.launchConfig);
  return {
    id: providerId,
    registered: true,
    configured: options.configured,
    defaultSelected: options.defaultProviderId === providerId,
    diagnoseSupported: true,
    status: "unavailable",
    permissionState: "unknown",
    issueCounts,
    issues,
    recoveryHints,
    ...(recoveryHints[0] ? { fix: recoveryHints[0] } : {}),
    headline: `${providerId} doctor 诊断失败: ${issues[0].message}`,
    ...(options.launchConfig ? { launchConfig: options.launchConfig } : {}),
  };
}

function buildReportSummary(
  providers: readonly CameraRuntimeDoctorProvider[],
  defaultProviderId: CameraProviderId | undefined,
): CameraRuntimeDoctorReport["summary"] {
  const registeredProviderIds = providers.filter((item) => item.registered).map((item) => item.id);
  const warningCount = providers.reduce((total, item) => total + item.issueCounts.warning, 0);
  const errorCount = providers.reduce((total, item) => total + item.issueCounts.error, 0);
  const nativeDesktop = providers.find((item) => item.id === "native_desktop");
  const headline = nativeDesktop?.headline
    ?? `${registeredProviderIds.length} camera provider(s) registered; default=${defaultProviderId ?? "-"}.`;
  const fix = providers.find((item) => item.fix)?.fix;
  return {
    available: registeredProviderIds.length > 0,
    ...(defaultProviderId ? { defaultProviderId } : {}),
    registeredProviderIds,
    warningCount,
    errorCount,
    headline,
    ...(fix ? { fix } : {}),
  };
}

function buildProviderContext(
  context: Partial<CameraProviderContext> | undefined,
): CameraProviderContext {
  return {
    conversationId: context?.conversationId ?? "doctor-camera-runtime",
    workspaceRoot: context?.workspaceRoot ?? process.cwd(),
    logger: context?.logger,
    policy: context?.policy ?? DEFAULT_POLICY,
    abortSignal: context?.abortSignal,
  };
}

export async function buildCameraRuntimeDoctorReport(
  options: BuildCameraRuntimeDoctorReportOptions = {},
): Promise<CameraRuntimeDoctorReport | null> {
  const env = options.env ?? process.env;
  const observedAt = new Date().toISOString();
  const registry = new CameraProviderRegistry();
  registry.register(browserLoopbackCameraProvider, { makeDefault: true });

  let nativeDesktopConfig: CameraNativeDesktopHelperConfig | null = null;
  let nativeDesktopConfigError: unknown;
  try {
    nativeDesktopConfig = readNativeDesktopHelperConfigFromEnv(env);
  } catch (error) {
    nativeDesktopConfigError = error;
  }

  if (nativeDesktopConfig) {
    registry.register(new NativeDesktopCameraProvider({
      helper: nativeDesktopConfig,
    }));
  }

  const defaultProviderId = registry.getDefaultProviderId();
  const hasNativeDesktopSurface = Boolean(nativeDesktopConfig || nativeDesktopConfigError || registry.has("native_desktop"));
  if (!hasNativeDesktopSurface && !options.includeBrowserLoopbackOnly) {
    return null;
  }

  const providerContext = buildProviderContext(options.context);
  const providers: CameraRuntimeDoctorProvider[] = [
    createBrowserLoopbackDoctorProvider(defaultProviderId),
  ];

  if (nativeDesktopConfigError) {
    const provider = createNativeDesktopConfigErrorProvider(nativeDesktopConfigError, defaultProviderId);
    const nativeDesktopLaunchConfig = await buildLaunchConfigSummary(nativeDesktopConfig, env);
    if (nativeDesktopLaunchConfig) {
      provider.launchConfig = nativeDesktopLaunchConfig;
    }
    providers.push(provider);
  } else if (registry.has("native_desktop")) {
    const nativeDesktopLaunchConfig = await buildLaunchConfigSummary(nativeDesktopConfig, env);
    const nativeDesktopProvider = registry.get("native_desktop");
    if (!nativeDesktopProvider) {
      providers.push({
        id: "native_desktop",
        registered: false,
        configured: true,
        defaultSelected: defaultProviderId === "native_desktop",
        diagnoseSupported: false,
        status: "unavailable",
        issueCounts: {
          info: 0,
          warning: 0,
          error: 1,
        },
        issues: [{
          code: "helper_unavailable",
          severity: "error",
          message: "native_desktop provider 未注册成功。",
        }],
        recoveryHints: [
          `确认 ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV} 与 helper entry 配置有效后重试。`,
        ],
        fix: `确认 ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV} 与 helper entry 配置有效后重试。`,
        headline: "native_desktop provider 未注册成功。",
        ...(nativeDesktopLaunchConfig ? { launchConfig: nativeDesktopLaunchConfig } : {}),
      });
    } else if (typeof nativeDesktopProvider.diagnose === "function") {
      try {
        const diagnostic = await nativeDesktopProvider.diagnose(providerContext);
        providers.push(mapDiagnosticToDoctorProvider("native_desktop", diagnostic, {
          defaultProviderId,
          configured: true,
          launchConfig: nativeDesktopLaunchConfig,
        }));
      } catch (error) {
        providers.push(mapFailureToDoctorProvider("native_desktop", error, {
          defaultProviderId,
          configured: true,
          launchConfig: nativeDesktopLaunchConfig,
        }));
      }
    }
  }

  return {
    observedAt,
    summary: buildReportSummary(providers, defaultProviderId),
    providers,
  };
}
