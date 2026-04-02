import type { Tool } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import { imageGenerateTool as baseImageGenerateTool } from "./image.js";
import { textToSpeechTool as baseTextToSpeechTool } from "./tts.js";
import { synthesizeSpeech } from "./tts-synthesize.js";
import type { SynthesizeResult, SynthesizeOptions } from "./tts-synthesize.js";
import { transcribeSpeech } from "./stt-transcribe.js";
import type { TranscribeResult, TranscribeOptions } from "./stt-transcribe.js";
import { cameraSnapTool as baseCameraSnapTool } from "./camera.js";

function withMultimediaContract(
  tool: Tool,
  options: {
    activityDescription: string;
    safeScopes: readonly ("remote-safe" | "bridge-safe" | "local-safe")[];
    riskLevel?: "low" | "medium" | "high";
    needsPermission?: boolean;
  },
): Tool {
  return withToolContract(tool, {
    family: "other",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: options.needsPermission ?? true,
    riskLevel: options.riskLevel ?? "medium",
    channels: ["gateway", "web"],
    safeScopes: options.safeScopes,
    activityDescription: options.activityDescription,
    resultSchema: {
      kind: "text",
      description: "Multimedia generation result text or artifact reference.",
    },
    outputPersistencePolicy: "artifact",
  });
}

export const imageGenerateTool = withMultimediaContract(baseImageGenerateTool, {
  activityDescription: "Generate an image from a text prompt",
  safeScopes: ["remote-safe"],
});
export const textToSpeechTool = withMultimediaContract(baseTextToSpeechTool, {
  activityDescription: "Synthesize spoken audio from text",
  safeScopes: ["remote-safe", "local-safe"],
});
export { synthesizeSpeech };
export type { SynthesizeResult, SynthesizeOptions };
export { transcribeSpeech };
export type { TranscribeResult, TranscribeOptions };
export const cameraSnapTool = withMultimediaContract(baseCameraSnapTool, {
  activityDescription: "Capture a camera snapshot through the connected browser",
  safeScopes: ["bridge-safe"],
  riskLevel: "high",
});
