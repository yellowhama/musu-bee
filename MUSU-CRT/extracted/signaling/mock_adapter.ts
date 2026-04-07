import type {
  ExtractedSignalingAdapter,
  SignalingAnswer,
  SignalingCloseResult,
  SignalingOfferInput,
} from "./contract";

const DEFAULT_ANSWER: SignalingAnswer = {
  answerSdp: "v=0\no=- 981725119114 2 IN IP4 127.0.0.1\ns=-\nt=0 0\nm=video 9 UDP/TLS/RTP/SAVPF 96",
  hostIceCandidates: [
    "candidate:1 1 udp 2122260223 10.0.0.15 48121 typ host",
    "candidate:2 1 udp 1686052607 121.134.10.8 55341 typ srflx",
  ],
};

export class MockExtractedSignalingAdapter implements ExtractedSignalingAdapter {
  async offer(_input: SignalingOfferInput): Promise<SignalingAnswer> {
    return DEFAULT_ANSWER;
  }

  async addIce(_webrtcSessionId: string, _iceCandidateJson: string): Promise<void> {
    return;
  }

  async close(webrtcSessionId: string): Promise<SignalingCloseResult> {
    return {
      webrtcSessionId,
      status: "closed",
    };
  }
}
