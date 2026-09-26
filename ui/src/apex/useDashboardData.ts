import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData } from "./types";

const INITIAL: DashboardData = {
  health: null,
  agents: [],
  tasks: [],
  pausedTasks: [],
  entities: [],
  documents: [],
  llm: null,
  profile: null,
  awareness: null,
  error: null,
  refreshedAt: null,
};

async function jsonOrNull(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function useDashboardData(): DashboardData & {
  refresh: () => Promise<void>;
  setAwarenessEnabled: (enabled: boolean) => Promise<boolean>;
} {
  const [data, setData] = useState<DashboardData>(INITIAL);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [health, agents, taskPayload, pausedPayload, entities, documents, llm, profile, awareness] = await Promise.all([
        jsonOrNull("/api/health"),
        jsonOrNull("/api/agents"),
        jsonOrNull("/api/agents/tasks"),
        jsonOrNull("/api/tasks/paused"),
        jsonOrNull("/api/vault/entities"),
        jsonOrNull("/api/documents"),
        jsonOrNull("/api/config/llm"),
        jsonOrNull("/api/user-profile"),
        jsonOrNull("/api/awareness/status"),
      ]);

      const failedCore = !health && !agents && !llm;
      setData({
        health: health as DashboardData["health"],
        agents: arrayOf(agents),
        tasks: arrayOf((taskPayload as { tasks?: unknown } | null)?.tasks),
        pausedTasks: arrayOf((pausedPayload as { tasks?: unknown } | null)?.tasks),
        entities: arrayOf(entities),
        documents: arrayOf(documents),
        llm: llm as DashboardData["llm"],
        profile: profile as DashboardData["profile"],
        awareness: awareness as DashboardData["awareness"],
        error: failedCore ? "Daemon verileri şu an alınamıyor." : null,
        refreshedAt: Date.now(),
      });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const setAwarenessEnabled = useCallback(async (enabled: boolean) => {
    try {
      const response = await fetch("/api/awareness/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) return false;
      setData((current) => ({
        ...current,
        awareness: { ...(current.awareness ?? {}), enabled },
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { ...data, refresh, setAwarenessEnabled };
}
