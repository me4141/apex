import { describe, expect, test } from "bun:test";
import { deriveApexCoreState } from "./coreState";

describe("deriveApexCoreState", () => {
  test("maps live voice and daemon signals in interaction priority order", () => {
    expect(deriveApexCoreState({ voiceState: "idle", daemonThinking: false, isResponding: false, hasStreamingReply: false })).toBe("idle");
    expect(deriveApexCoreState({ voiceState: "recording", daemonThinking: true, isResponding: true, hasStreamingReply: false })).toBe("listening");
    expect(deriveApexCoreState({ voiceState: "processing", daemonThinking: false, isResponding: false, hasStreamingReply: false })).toBe("thinking");
    expect(deriveApexCoreState({ voiceState: "idle", daemonThinking: true, isResponding: false, hasStreamingReply: false })).toBe("thinking");
    expect(deriveApexCoreState({ voiceState: "idle", daemonThinking: false, isResponding: true, hasStreamingReply: true })).toBe("speaking");
    expect(deriveApexCoreState({ voiceState: "speaking", daemonThinking: true, isResponding: true, hasStreamingReply: false })).toBe("speaking");
  });
});
