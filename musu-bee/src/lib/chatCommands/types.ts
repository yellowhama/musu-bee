import type { ChannelId, Message } from "@/types";

export type { ChannelId, Message };

export interface CommandContext {
  appendChatMessage: (msg: Message) => void;
  channel: ChannelId;
  setIsAgentTyping: (v: boolean) => void;
}
