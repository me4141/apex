import type { VoiceState } from "../hooks/useVoice";
import type { ApexCoreState } from "./types";

export function deriveApexCoreState(input: {
  voiceState: VoiceState;
  daemonThinking: boolean;
  isResponding: boolean;
  hasStreamingReply: boolean;
}): ApexCoreState {
  if (input.voiceState === "recording" || input.voiceState === "wake_detected") return "listening";
  if (input.voiceState === "speaking" || input.hasStreamingReply) return "speaking";
  if (input.voiceState === "processing" || input.daemonThinking || input.isResponding) return "thinking";
  return "idle";
}
