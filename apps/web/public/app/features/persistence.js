function safeStorageRead(readFn) {
  try {
    return readFn(globalThis.localStorage);
  } catch {
    return undefined;
  }
}

function safeStorageWrite(writeFn) {
  try {
    writeFn(globalThis.localStorage);
  } catch {
    // ignore storage failures
  }
}

function safeSessionStorageRead(readFn) {
  try {
    return readFn(globalThis.sessionStorage);
  } catch {
    return undefined;
  }
}

function safeSessionStorageWrite(writeFn) {
  try {
    writeFn(globalThis.sessionStorage);
  } catch {
    // ignore storage failures
  }
}

export function restoreAuthFields({ storeKey, authModeEl, authValueEl }) {
  const raw = safeStorageRead((storage) => storage.getItem(storeKey));
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    if (parsed.mode && authModeEl) authModeEl.value = String(parsed.mode);
    if (parsed.value && authValueEl) authValueEl.value = String(parsed.value);
  } catch {
    // ignore invalid payloads
  }
}

export function persistAuthFields({ storeKey, authModeEl, authValueEl, transientUrlToken = null }) {
  if (!authModeEl || !authValueEl) return;
  const mode = authModeEl.value;
  const value = authValueEl.value.trim();
  if (transientUrlToken && mode === "token" && value === transientUrlToken) {
    return;
  }
  safeStorageWrite((storage) => {
    storage.setItem(storeKey, JSON.stringify({ mode, value }));
  });
}

export function restoreSessionAuthToken({ sessionStoreKey, authModeEl, authValueEl }) {
  if (!sessionStoreKey || !authModeEl || !authValueEl) return null;
  const token = safeSessionStorageRead((storage) => storage.getItem(sessionStoreKey));
  if (!token) return null;
  authModeEl.value = "token";
  authValueEl.value = String(token);
  return String(token);
}

export function persistSessionAuthToken({ sessionStoreKey, authModeEl, authValueEl }) {
  if (!sessionStoreKey || !authModeEl || !authValueEl) return;
  const mode = authModeEl.value;
  const value = authValueEl.value.trim();
  safeSessionStorageWrite((storage) => {
    if (mode === "token" && value) {
      storage.setItem(sessionStoreKey, value);
      return;
    }
    storage.removeItem(sessionStoreKey);
  });
}

export function restoreWorkspaceRootsField({ workspaceRootsKey, workspaceRootsEl }) {
  const saved = safeStorageRead((storage) => storage.getItem(workspaceRootsKey));
  if (saved && workspaceRootsEl) {
    workspaceRootsEl.value = saved;
  }
}

export function persistWorkspaceRootsField({ workspaceRootsKey, workspaceRootsEl }) {
  if (!workspaceRootsEl) return;
  safeStorageWrite((storage) => {
    storage.setItem(workspaceRootsKey, workspaceRootsEl.value);
  });
}

export function restoreUuidField({ uuidKey, userUuidEl }) {
  const saved = safeStorageRead((storage) => storage.getItem(uuidKey));
  if (saved && userUuidEl) {
    userUuidEl.value = saved;
  }
}

export function persistUuidField({ uuidKey, userUuidEl }) {
  if (!userUuidEl) return;
  safeStorageWrite((storage) => {
    storage.setItem(uuidKey, userUuidEl.value.trim());
  });
}

export function persistConnectionFields({
  storeKey,
  workspaceRootsKey,
  uuidKey,
  authModeEl,
  authValueEl,
  workspaceRootsEl,
  userUuidEl,
  transientUrlToken = null,
}) {
  persistAuthFields({ storeKey, authModeEl, authValueEl, transientUrlToken });
  persistWorkspaceRootsField({ workspaceRootsKey, workspaceRootsEl });
  persistUuidField({ uuidKey, userUuidEl });
}
