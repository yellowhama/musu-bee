import type { ExtractedSignalingAdapter, SignalingAnswer, SignalingOfferInput } from "./contract";

export interface SignalingSessionState {
  sessionId: string;
  status: "idle" | "offering" | "connected" | "closed" | "error";
  answer?: SignalingAnswer;
  error?: string;
}

// Canonical coordinator candidate that keeps the signaling slice UI-agnostic.
export class SignalingSessionCoordinator {
  constructor(private readonly adapter: ExtractedSignalingAdapter) {}

  async startOffer(input: SignalingOfferInput): Promise<SignalingSessionState> {
    try {
      const answer = await this.adapter.offer(input);
      return {
        sessionId: input.webrtcSessionId,
        status: "connected",
        answer,
      };
    } catch (error) {
      return {
        sessionId: input.webrtcSessionId,
        status: "error",
        error: String(error),
      };
    }
  }

  async appendIce(webrtcSessionId: string, iceCandidateJson: string): Promise<SignalingSessionState> {
    try {
      await this.adapter.addIce(webrtcSessionId, iceCandidateJson);
      return {
        sessionId: webrtcSessionId,
        status: "connected",
      };
    } catch (error) {
      return {
        sessionId: webrtcSessionId,
        status: "error",
        error: String(error),
      };
    }
  }

  async close(webrtcSessionId: string): Promise<SignalingSessionState> {
    try {
      await this.adapter.close(webrtcSessionId);
      return {
        sessionId: webrtcSessionId,
        status: "closed",
      };
    } catch (error) {
      return {
        sessionId: webrtcSessionId,
        status: "error",
        error: String(error),
      };
    }
  }
}
