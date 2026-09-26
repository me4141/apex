import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useVoice, type UseVoiceReturn } from "../hooks/useVoice";
import { useWebSocket } from "../hooks/useWebSocket";
import { openRoom, ROOM_KEYS, type RoomKey } from "../v2/router";
import { useSpacebarPTT } from "../v2/voice/useSpacebarPTT";
import { deriveApexCoreState } from "./coreState";
import { useDashboardData } from "./useDashboardData";
import type { ApexCoreState } from "./types";

type WebSocketState = ReturnType<typeof useWebSocket>;
type DashboardState = ReturnType<typeof useDashboardData>;

type ApexContextValue = {
  live: WebSocketState;
  voice: UseVoiceReturn;
  data: DashboardState;
  coreState: ApexCoreState;
  cinematic: boolean;
  setCinematic: (next: boolean) => void;
  chatOpen: boolean;
  setChatOpen: (next: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (next: boolean) => void;
  notificationOpen: boolean;
  setNotificationOpen: (next: boolean) => void;
  send: (text: string) => void;
  stop: () => void;
  toggleMic: () => void;
  approve: (id: string, decision: "approve" | "deny") => Promise<void>;
  resolveVoicePrompt: (kind: "clarifier" | "repeat-back", id: string, decision: "confirm" | "cancel") => Promise<void>;
};

const ApexContext = createContext<ApexContextValue | null>(null);

export function useApex(): ApexContextValue {
  const value = useContext(ApexContext);
  if (!value) throw new Error("useApex must be used inside ApexProvider");
  return value;
}

export function ApexProvider({ children }: { children: React.ReactNode }) {
  const live = useWebSocket();
  const data = useDashboardData();
  const [cinematic, setCinematicState] = useState(() => localStorage.getItem("apex.cinematic") !== "off");
  const [chatOpen, setChatOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  const getCurrentRoom = useCallback(() => {
    const match = window.location.hash.match(/^#\/?_room_([a-z]+)/);
    return match?.[1] ?? "home";
  }, []);

  const voice = useVoice({
    wsRef: live.wsRef,
    wakeWordEnabled: true,
    nativeWakeActive: true,
    getCurrentRoom,
  });

  useEffect(() => {
    live.voiceCallbacksRef.current = {
      onTTSBinary: voice.handleTTSBinary,
      onTTSStart: voice.handleTTSStart,
      onTTSContainsWake: voice.handleTTSContainsWake,
      onTTSEnd: voice.handleTTSEnd,
      onError: voice.handleError,
      onRealtimeClosed: voice.handleRealtimeClosed,
      onRealtimeError: voice.handleRealtimeError,
      onDisconnect: voice.handleDisconnect,
    };
  }, [live.voiceCallbacksRef, voice.handleDisconnect, voice.handleError, voice.handleRealtimeClosed, voice.handleRealtimeError, voice.handleTTSBinary, voice.handleTTSContainsWake, voice.handleTTSEnd, voice.handleTTSStart]);

  const setCinematic = useCallback((next: boolean) => {
    setCinematicState(next);
    localStorage.setItem("apex.cinematic", next ? "on" : "off");
  }, []);

  const stop = useCallback(() => {
    live.cancelResponse();
    voice.cancelTTS();
    voice.forceIdle();
  }, [live.cancelResponse, voice.cancelTTS, voice.forceIdle]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !live.isConnected) return;
    if (voice.voiceState === "speaking") voice.cancelTTS();
    live.sendMessage(trimmed, { currentRoom: getCurrentRoom() });
  }, [getCurrentRoom, live.isConnected, live.sendMessage, voice.cancelTTS, voice.voiceState]);

  const toggleMic = useCallback(() => {
    if (voice.muted || !voice.isMicAvailable) return;
    if (voice.voiceState === "recording") voice.stopRecording();
    else if (voice.voiceState === "idle") voice.startRecording();
    else {
      stop();
      voice.startRecording();
    }
  }, [stop, voice]);

  const interruptAndArm = useCallback(() => {
    stop();
    voice.startRecording();
  }, [stop, voice.startRecording]);

  useSpacebarPTT({
    enabled: live.isConnected && voice.isMicAvailable && !voice.muted,
    voiceState: voice.voiceState,
    startRecording: voice.startRecording,
    stopRecording: voice.stopRecording,
    interrupt: interruptAndArm,
  });

  const latest = live.messages[live.messages.length - 1];
  const coreState = deriveApexCoreState({
    voiceState: voice.voiceState,
    daemonThinking: live.thinking,
    isResponding: live.isResponding,
    hasStreamingReply: latest?.role === "assistant" && latest.isStreaming === true,
  });

  const approve = useCallback(async (id: string, decision: "approve" | "deny") => {
    const response = await fetch(`/api/authority/approvals/${encodeURIComponent(id)}/${decision}`, { method: "POST" });
    if (!response.ok) throw new Error(`Approval ${decision} failed: ${response.status}`);
  }, []);

  const resolveVoicePrompt = useCallback(async (
    kind: "clarifier" | "repeat-back",
    id: string,
    decision: "confirm" | "cancel",
  ) => {
    const response = await fetch(`/api/voice/${kind}/${encodeURIComponent(id)}/${decision}`, { method: "POST" });
    if (!response.ok) throw new Error(`${kind} ${decision} failed: ${response.status}`);
  }, []);

  useEffect(() => {
    const key = live.roomNavRequest?.key;
    if (key && ROOM_KEYS.has(key as RoomKey)) {
      openRoom(key as RoomKey);
      voice.forceIdle();
    }
  }, [live.roomNavRequest?.ts]);

  useEffect(() => {
    const open = () => setPaletteOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<ApexContextValue>(() => ({
    live,
    voice,
    data,
    coreState,
    cinematic,
    setCinematic,
    chatOpen,
    setChatOpen,
    paletteOpen,
    setPaletteOpen,
    notificationOpen,
    setNotificationOpen,
    send,
    stop,
    toggleMic,
    approve,
    resolveVoicePrompt,
  }), [approve, chatOpen, cinematic, coreState, data, live, notificationOpen, paletteOpen, resolveVoicePrompt, send, setCinematic, stop, toggleMic, voice]);

  return <ApexContext.Provider value={value}>{children}</ApexContext.Provider>;
}
