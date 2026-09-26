export type ApexCoreState = "idle" | "listening" | "thinking" | "speaking";

export type HealthSnapshot = {
  uptime: number;
  services: Record<string, string>;
  memory: { heapUsed: number; heapTotal: number; rss: number };
  database: { connected: boolean; size: number };
};

export type AgentSnapshot = {
  id: string;
  role?: { id?: string; name?: string };
  status?: string;
  busy?: boolean;
  current_task?: string | null;
};

export type AgentTask = {
  id: string;
  status: string;
  task: string;
  agent_name?: string;
  started_at?: number;
  completed_at?: number | null;
};

export type KnowledgeEntity = {
  id: string;
  name: string;
  type: string;
  updated_at?: number;
};

export type DocumentSnapshot = {
  id: string;
  title?: string;
  name?: string;
  format?: string;
  updated_at?: number;
  created_at?: number;
};

export type LlmSnapshot = {
  default: string | null;
  mode: "single" | "multi-tier";
  tiers?: Record<string, string | null>;
  effective?: {
    mode: string;
    tiers: Record<string, { ref: string | null }>;
  };
};

export type ProfileSnapshot = {
  profile: { answers: Record<string, string> } | null;
  has_profile: boolean;
};

export type AwarenessSnapshot = {
  enabled: boolean;
  status?: unknown;
};

export type DashboardData = {
  health: HealthSnapshot | null;
  agents: AgentSnapshot[];
  tasks: AgentTask[];
  pausedTasks: Array<{ id: string; question?: string; intent?: string }>;
  entities: KnowledgeEntity[];
  documents: DocumentSnapshot[];
  llm: LlmSnapshot | null;
  profile: ProfileSnapshot | null;
  awareness: AwarenessSnapshot | null;
  error: string | null;
  refreshedAt: number | null;
};
