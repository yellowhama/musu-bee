export type ChannelId =
  | "general"
  | "dev"
  | "tasks"
  | "processes"
  | "alerts"
  | "issues"
  | "approvals"
  | "projects"
  | "goals"
  | "costs"
  | "search"
  | "nodes"
  | "wiki"
  | "ceo"
  | "cto"
  | "engineer"
  | "cos"
  | "qa"
  | "worker";

/** Channels that route to a musu-core agent via WebSocket. */
export const AGENT_CHANNELS: ChannelId[] = [
  "ceo",
  "cto",
  "engineer",
  "cos",
  "qa",
  "worker",
];

export interface Channel {
  id: ChannelId;
  name: string;
  unread: number;
}

export type DeviceStatus = "online" | "offline" | "busy";

export interface DeviceStats {
  cpu: number; // 0-100
  gpu: number | null; // null if no GPU
  ram: number; // 0-100
}

export interface Device {
  id: string;
  name: string;
  label: string;
  status: DeviceStatus;
  stats: DeviceStats;
  isLeader: boolean; // current "leader" node
  isRemote?: boolean; // true for peer machines
  peerUrl?: string; // musu-port URL for remote peers
  lastSeenMs?: number; // unix ms of last successful probe
}

export interface MessageMeta {
  /** Delegation chain, e.g. ["CEO", "CTO", "Engineer"] */
  chain?: string[];
  /** musu-core agent id that produced this message */
  agentId?: string;
  /** Type of adapter used to generate this message (e.g. 'claude_local', 'gemini_local') */
  adapterType?: string;
  /** Latency of the response in seconds */
  durationSec?: number;
  /** Cost of the response in USD */
  costUsd?: number;
}

export interface PlanStep {
  id: string;
  text: string;
}

export type PlanStatus = "pending" | "approved" | "rejected";

export interface MessagePlan {
  steps: PlanStep[];
  status: PlanStatus;
}

export interface Message {
  id: string;
  channelId: ChannelId;
  sender: string;
  senderKind: "user" | "ai" | "system";
  text: string;
  timestamp: Date;
  attachment?: string;
  meta?: MessageMeta;
  plan?: MessagePlan;
}

// ---------------------------------------------------------------------------
// Agent types (mirror musu-core Python schema)
// ---------------------------------------------------------------------------

/** One entry in an agent's fallback adapter chain. */
export interface FallbackChainEntry {
  adapter_type: string;
  [key: string]: unknown;
}

export type AgentStatus = "active" | "paused" | "retired";

export interface MusuAgent {
  id: string;
  name: string;
  role: string;
  adapter_type: string;
  adapter_config: Record<string, unknown>;
  status: AgentStatus;
  /** Ordered list of fallback adapters tried on retriable failure. Null if not configured. */
  fallback_chain: FallbackChainEntry[] | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------

/** JSON message schema sent/received over the chat WebSocket. */
export interface ChatWsMessage {
  type: "user_message" | "agent_response" | "system" | "typing";
  channel: string;
  sender_id: string;
  sender_name: string;
  text: string;
  timestamp: number;
  run_id?: string;
}

export interface AgentDepartmentSnapshot {
  id: string;
  name: string;
  role: string;
  status: string;
  urlKey: string | null;
  lastHeartbeatAt: string | null;
}

export interface AgentsSurfaceSummary {
  bossHost: string | null;
  lastHandoffTarget: string | null;
  handoffReasonCode: string | null;
  handoffRecordedAtMs: number | null;
  departments: AgentDepartmentSnapshot[];
  statusCounts: Record<string, number>;
}

export interface AgentsSurfaceSnapshot {
  fetchedAt: string;
  degraded: boolean;
  degradedReason: string | null;
  stale: boolean;
  summary: AgentsSurfaceSummary;
}

// ---------------------------------------------------------------------------
// Goals (mirror musu-core Python schema)
// ---------------------------------------------------------------------------

export interface Goal {
  id: string;
  company_id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "cancelled";
  due_date: string | null;
  created_at: string;
  updated_at: string;
}
