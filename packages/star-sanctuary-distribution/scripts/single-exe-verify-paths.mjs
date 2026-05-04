import path from "node:path";
import os from "node:os";

function sanitizeSuffix(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveSingleExeVerifyRoots({
  product = "star-sanctuary",
  kind,
  suffix = "",
}) {
  const baseRoot = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || os.tmpdir(), "ssx")
    : path.join(os.tmpdir(), `${product}-verify`);

  const normalizedKind = sanitizeSuffix(kind);
  const normalizedSuffix = sanitizeSuffix(suffix || "default");
  const runRoot = path.join(baseRoot, `${normalizedKind}-${normalizedSuffix}`);

  return {
    runRoot,
    homeDir: path.join(runRoot, "home"),
    stateDir: path.join(runRoot, "state"),
  };
}
