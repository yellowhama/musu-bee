export type ChannelId = "general" | "dev" | "tasks" | "alerts";

export interface Channel {
  id: ChannelId;
  name: string;
  unread: number;
}

export type DeviceStatus = "online" | "offline" | "busy";

export interface DeviceStats {
  cpu: number;  // 0-100
  gpu: number | null;  // null if no GPU
  ram: number;  // 0-100
}

export interface Device {
  id: string;
  name: string;
  label: string;
  status: DeviceStatus;
  stats: DeviceStats;
  isLeader: boolean;  // current "사장"
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
