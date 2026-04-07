import type { RemoteSessionAdapter } from "./contract";

export interface RemoteSessionControllerState {
  webrtcSessionId: string;
  status: "idle" | "attaching" | "active" | "closing" | "closed" | "error";
  detail?: string;
}

// Canonical remote WebRTC-side controller candidate.
export class RemoteSessionController {
  constructor(private readonly adapter: RemoteSessionAdapter) {}

  async attach(webrtcSessionId: string): Promise<RemoteSessionControllerState> {
    try {
      await this.adapter.attach(webrtcSessionId);
      return {
        webrtcSessionId,
        status: "active",
      };
    } catch (error) {
      return {
        webrtcSessionId,
        status: "error",
        detail: String(error),
      };
    }
  }

  async close(webrtcSessionId: string): Promise<RemoteSessionControllerState> {
    try {
      await this.adapter.close(webrtcSessionId);
      return {
        webrtcSessionId,
        status: "closed",
      };
    } catch (error) {
      return {
        webrtcSessionId,
        status: "error",
        detail: String(error),
      };
    }
  }
}
