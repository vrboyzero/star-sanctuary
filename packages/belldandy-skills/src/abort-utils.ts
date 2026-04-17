export function readAbortReason(signal?: AbortSignal, fallback = "Stopped by user."): string {
  const reason = signal?.reason;
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }
  if (reason instanceof Error && reason.message.trim()) {
    return reason.message.trim();
  }
  return fallback;
}

export function toAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    reason.name = "AbortError";
    return reason;
  }
  const error = new Error(typeof reason === "string" && reason.trim() ? reason.trim() : "The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw toAbortError(signal.reason);
  }
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(toAbortError(signal?.reason));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(toAbortError(signal.reason));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function createLinkedAbortController(input: {
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutReason?: string;
}): {
  controller: AbortController;
  cleanup: () => void;
  wasTimedOut: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: NodeJS.Timeout | undefined;

  const forwardAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(input.signal?.reason);
    }
  };

  if (input.signal?.aborted) {
    controller.abort(input.signal.reason);
  } else if (input.signal) {
    input.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  if (typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      if (!controller.signal.aborted) {
        controller.abort(toAbortError(input.timeoutReason ?? `Timeout after ${input.timeoutMs}ms`));
      }
    }, input.timeoutMs);
  }

  return {
    controller,
    cleanup: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      input.signal?.removeEventListener("abort", forwardAbort);
    },
    wasTimedOut: () => timedOut,
  };
}
