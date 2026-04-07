import type { RemoteSessionAdapter } from "./contract";

export interface RemoteSessionGateway {
  attachRemoteSession(webrtcSessionId: string): Promise<void>;
  closeRemoteSession(webrtcSessionId: string): Promise<void>;
}

// Candidate abstraction for the remote WebRTC-side lifecycle.
export class GatewayRemoteSessionAdapter implements RemoteSessionAdapter {
  constructor(private readonly gateway: RemoteSessionGateway) {}

  async attach(webrtcSessionId: string): Promise<void> {
    await this.gateway.attachRemoteSession(webrtcSessionId);
  }

  async close(webrtcSessionId: string): Promise<void> {
    await this.gateway.closeRemoteSession(webrtcSessionId);
  }
}
