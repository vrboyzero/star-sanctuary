const suppressedConfigRestartUntil = new Map<string, number>();

function cleanupExpiredSuppressedConfigRestarts(now = Date.now()) {
  for (const [fileName, expiresAt] of suppressedConfigRestartUntil.entries()) {
    if (expiresAt <= now) {
      suppressedConfigRestartUntil.delete(fileName);
    }
  }
}

export function suppressConfigFileRestart(fileName: string, windowMs = 5000): void {
  const normalized = String(fileName || "").trim();
  if (!normalized) return;
  const now = Date.now();
  cleanupExpiredSuppressedConfigRestarts(now);
  suppressedConfigRestartUntil.set(normalized, now + Math.max(0, windowMs));
}

export function isConfigFileRestartSuppressed(fileName: string): boolean {
  const normalized = String(fileName || "").trim();
  if (!normalized) return false;
  const now = Date.now();
  cleanupExpiredSuppressedConfigRestarts(now);
  const expiresAt = suppressedConfigRestartUntil.get(normalized);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    suppressedConfigRestartUntil.delete(normalized);
    return false;
  }
  return true;
}

export function resetSuppressedConfigFileRestarts(): void {
  suppressedConfigRestartUntil.clear();
}
