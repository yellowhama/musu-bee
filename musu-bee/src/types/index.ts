export type ChannelId =
  | "general"
  | "dev"
  | "tasks"
  | "alerts"
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
  isLeader: boolean; // current "사장"
}

export interface Message {
  id: string;
  channelId: ChannelId;
  sender: string;
  senderKind: "user" | "ai" | "system";
  text: string;
  timestamp: Date;
  attachment?: string;
}

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
