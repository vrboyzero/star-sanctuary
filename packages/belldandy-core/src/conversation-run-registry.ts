export type ConversationRunStopState = "running" | "stop_requested" | "stopped";

export type ConversationRunHandle = {
  conversationId: string;
  runId: string;
  agentId?: string;
  startedAt: number;
  state: ConversationRunStopState;
  stopRequestedAt?: number;
  stoppedAt?: number;
  stopReason?: string;
  stop: (reason?: string) => boolean | Promise<boolean>;
};

export type ConversationRunStopRequest = {
  conversationId: string;
  runId?: string;
  reason?: string;
};

export type ConversationRunStopResult = {
  accepted: boolean;
  runId?: string;
  state: "stop_requested" | "not_found" | "run_mismatch";
};

export class ConversationRunRegistry {
  private readonly handles = new Map<string, ConversationRunHandle>();

  register(handle: ConversationRunHandle): void {
    this.handles.set(handle.conversationId, { ...handle });
  }

  get(conversationId: string): ConversationRunHandle | undefined {
    const handle = this.handles.get(conversationId);
    return handle ? { ...handle } : undefined;
  }

  async requestStop(input: ConversationRunStopRequest): Promise<ConversationRunStopResult> {
    const current = this.handles.get(input.conversationId);
    if (!current) {
      return { accepted: false, state: "not_found" };
    }
    if (input.runId && current.runId !== input.runId) {
      return { accepted: false, state: "run_mismatch", runId: current.runId };
    }

    if (current.state === "running") {
      current.state = "stop_requested";
      current.stopRequestedAt = Date.now();
      if (typeof input.reason === "string" && input.reason.trim()) {
        current.stopReason = input.reason.trim();
      }
      this.handles.set(input.conversationId, current);
    }

    await Promise.resolve(current.stop(input.reason));
    return {
      accepted: true,
      runId: current.runId,
      state: "stop_requested",
    };
  }

  markStopped(conversationId: string, runId: string, reason?: string): void {
    const current = this.handles.get(conversationId);
    if (!current || current.runId !== runId) {
      return;
    }
    current.state = "stopped";
    current.stoppedAt = Date.now();
    if (typeof reason === "string" && reason.trim()) {
      current.stopReason = reason.trim();
    }
    this.handles.set(conversationId, current);
  }

  clear(conversationId: string, runId?: string): void {
    const current = this.handles.get(conversationId);
    if (!current) {
      return;
    }
    if (runId && current.runId !== runId) {
      return;
    }
    this.handles.delete(conversationId);
  }
}
