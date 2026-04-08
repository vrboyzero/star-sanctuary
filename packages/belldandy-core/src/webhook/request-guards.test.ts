import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createFixedWindowRateLimiter } from "./memory-guards.js";
import {
  createWebhookInFlightLimiter,
  isJsonContentType,
  readRequestBodyWithLimit,
  WebhookBodyReadError,
} from "./request-guards.js";

describe("webhook request guards", () => {
  it("accepts standard and suffix json content types", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/cloudevents+json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
  });

  it("limits concurrent webhook requests per key", () => {
    const limiter = createWebhookInFlightLimiter({ maxInFlightPerKey: 1, maxTrackedKeys: 16 });
    expect(limiter.tryAcquire("alpha")).toBe(true);
    expect(limiter.tryAcquire("alpha")).toBe(false);
    limiter.release("alpha");
    expect(limiter.tryAcquire("alpha")).toBe(true);
  });

  it("rate limits after the configured request budget", () => {
    const limiter = createFixedWindowRateLimiter({ windowMs: 1_000, maxRequests: 1, maxTrackedKeys: 16 });
    expect(limiter.isRateLimited("alpha", 0)).toBe(false);
    expect(limiter.isRateLimited("alpha", 1)).toBe(true);
    expect(limiter.isRateLimited("alpha", 1_500)).toBe(false);
  });

  it("times out slow request bodies", async () => {
    const req = new PassThrough() as PassThrough & { destroy: () => void };
    try {
      await readRequestBodyWithLimit(req as never, {
        maxBytes: 128,
        timeoutMs: 20,
        profile: "pre-auth",
      });
      throw new Error("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(WebhookBodyReadError);
      expect(error).toMatchObject({ code: "REQUEST_BODY_TIMEOUT" });
    }
  });
});
