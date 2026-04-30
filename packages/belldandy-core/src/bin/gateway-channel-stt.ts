import {
  transcribeSpeechWithCache,
  type TranscribeOptions,
  type TranscribeResult,
} from "@belldandy/skills";

type ChannelSttLogger = {
  info: (module: string, message: string, data?: unknown) => void;
};

export function createCachedChannelSttTranscribe(input: {
  stateDir: string;
  logger: ChannelSttLogger;
  transcribe: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
}): (opts: TranscribeOptions) => Promise<TranscribeResult | null> {
  return async (opts: TranscribeOptions) => {
    const { result, cacheHit } = await transcribeSpeechWithCache({
      stateDir: input.stateDir,
      ...opts,
      transcribe: input.transcribe,
    });
    if (result) {
      input.logger.info(
        "stt",
        `Transcribed audio (${result.durationSec?.toFixed(1) ?? "?"}s) via ${result.provider}${cacheHit ? " [cache]" : ""}: "${result.text.slice(0, 50)}${result.text.length > 50 ? "..." : ""}"`,
      );
    }
    return result;
  };
}
