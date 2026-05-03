import type { ModelProfile } from "./failover-client.js";

export function applyOpenAICompatibleReasoningConfig(
  payload: Record<string, unknown>,
  profile: Pick<ModelProfile, "thinking" | "reasoningEffort" | "options">,
): void {
  if (profile.thinking) {
    payload.thinking = profile.thinking;
  }
  if (profile.reasoningEffort) {
    payload.reasoning_effort = profile.reasoningEffort;
  }
  if (profile.options) {
    payload.options = profile.options;
  }
}
