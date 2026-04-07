export interface SignalingOfferInput {
  webrtcSessionId: string;
  windowId: number;
  offerSdp: string;
  clientIceCandidates: string[];
}

export interface SignalingAnswer {
  answerSdp: string;
  hostIceCandidates: string[];
}

export interface SignalingCloseResult {
  webrtcSessionId: string;
  status: "closed";
}

export interface ExtractedSignalingAdapter {
  offer(input: SignalingOfferInput): Promise<SignalingAnswer>;
  addIce(webrtcSessionId: string, iceCandidateJson: string): Promise<void>;
  close(webrtcSessionId: string): Promise<SignalingCloseResult>;
}
