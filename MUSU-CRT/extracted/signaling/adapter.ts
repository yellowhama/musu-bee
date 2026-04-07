import type {
  ExtractedSignalingAdapter,
  SignalingAnswer,
  SignalingCloseResult,
  SignalingOfferInput,
} from "./contract";

export interface TauriInvokeLike {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

// Thin adapter around the original Tauri command surface.
export class TauriExtractedSignalingAdapter implements ExtractedSignalingAdapter {
  constructor(private readonly invoke: TauriInvokeLike) {}

  async offer(input: SignalingOfferInput): Promise<SignalingAnswer> {
    const raw = await this.invoke<{
      answer_sdp: string;
      host_ice_candidates: string[];
    }>("webrtc_offer", {
      webrtcSessionId: input.webrtcSessionId,
      windowId: input.windowId,
      offerSdp: input.offerSdp,
      clientIceCandidates: input.clientIceCandidates,
    });

    return {
      answerSdp: raw.answer_sdp,
      hostIceCandidates: raw.host_ice_candidates,
    };
  }

  async addIce(webrtcSessionId: string, iceCandidateJson: string): Promise<void> {
    await this.invoke<void>("webrtc_add_ice", { webrtcSessionId, iceCandidateJson });
  }

  async close(webrtcSessionId: string): Promise<SignalingCloseResult> {
    await this.invoke<void>("webrtc_close", { webrtcSessionId });
    return {
      webrtcSessionId,
      status: "closed",
    };
  }
}
