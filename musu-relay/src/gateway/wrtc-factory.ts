// Real RTCPeerConnection factory using @roamhq/wrtc (V23.1 T1.9).
//
// Per V23 plan §10.3: @roamhq/wrtc is the community-maintained successor
// to the deprecated node-webrtc. node-datachannel is the documented
// fallback if the native build breaks; on this host the install
// succeeded so @roamhq/wrtc is the primary.
//
// Kept in its own file so the binding-agnostic GatewayClient (T1.8) is
// importable in test environments without dragging the native module in.
// The optional-dependency install pattern means we tolerate the package
// being absent at install time and surface a clear error only if a
// user actually constructs the factory.

import type {
  PeerConnectionFactory,
  SimplePeerConnection,
} from "./client";

// Dynamic require so a missing optional native build degrades to a
// runtime error at factory-construction time instead of an unloadable
// module at import time.
function loadWrtc(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@roamhq/wrtc");
  } catch (err) {
    throw new Error(
      `@roamhq/wrtc native binding is not available on this host. ` +
        `Install with \`npm install --save-optional @roamhq/wrtc\`, or ` +
        `swap to node-datachannel per V23 master plan §10.3 fallback. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class WrtcPeerConnection implements SimplePeerConnection {
  private pc: any; // RTCPeerConnection from @roamhq/wrtc
  private dc: any | null = null; // RTCDataChannel
  private localIceCb: ((c: string) => void) | null = null;
  private dcOpenCb: (() => void) | null = null;

  constructor(stunServers: string[], wrtc: any, role: "offerer" | "answerer") {
    this.pc = new wrtc.RTCPeerConnection({
      iceServers: stunServers.map((url) => ({ urls: url })),
    });

    this.pc.onicecandidate = (ev: any) => {
      if (ev.candidate && this.localIceCb) {
        // Serialize the candidate as JSON so the wire format stays string.
        // The receiver deserializes before calling addIceCandidate.
        this.localIceCb(JSON.stringify(ev.candidate.toJSON()));
      }
    };

    if (role === "offerer") {
      // Gateway is the offerer in V23.1: it creates the DataChannel up front
      // so the SDP includes a m=application section. The peer's ondatachannel
      // fires on the answerer side.
      this.dc = this.pc.createDataChannel("musu", { ordered: true });
      this.attachDcHandlers(this.dc);
    } else {
      this.pc.ondatachannel = (ev: any) => {
        this.dc = ev.channel;
        this.attachDcHandlers(this.dc);
      };
    }
  }

  private attachDcHandlers(dc: any): void {
    dc.onopen = () => {
      if (this.dcOpenCb) this.dcOpenCb();
    };
  }

  async createOffer(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer.sdp;
  }

  async createAnswer(remoteSdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp: remoteSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp;
  }

  async acceptAnswer(remoteSdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp: remoteSdp });
  }

  async addRemoteIceCandidate(candidateJson: string): Promise<void> {
    try {
      const init = JSON.parse(candidateJson);
      await this.pc.addIceCandidate(init);
    } catch (err) {
      // Some implementations send raw candidate strings; tolerate that.
      await this.pc.addIceCandidate({ candidate: candidateJson });
    }
  }

  onLocalIceCandidate(cb: (candidate: string) => void): void {
    this.localIceCb = cb;
  }

  onDataChannelOpen(cb: () => void): void {
    this.dcOpenCb = cb;
    // If the DC opened before the caller wired the callback (race with
    // a fast answerer), fire immediately.
    if (this.dc && this.dc.readyState === "open") cb();
  }

  /** Expose the DataChannel for T1.10 bridge code. */
  getDataChannel(): any {
    return this.dc;
  }

  close(): void {
    try {
      if (this.dc) this.dc.close();
      this.pc.close();
    } catch {
      // pc may already be closed
    }
  }
}

export function makeWrtcFactory(): PeerConnectionFactory {
  const wrtc = loadWrtc(); // throws clear error if missing
  return {
    create(_remotePeerId: string, stunServers: string[]): SimplePeerConnection {
      // V23.1: gateway always offers first. T1.10+ may need answerer role
      // for visitor-initiated reconnects; expose via a separate factory then.
      return new WrtcPeerConnection(stunServers, wrtc, "offerer");
    },
  };
}

/** Answerer-side factory for tests that simulate a visitor in Node. */
export function makeWrtcAnswererFactory(): PeerConnectionFactory {
  const wrtc = loadWrtc();
  return {
    create(_remotePeerId: string, stunServers: string[]): SimplePeerConnection {
      return new WrtcPeerConnection(stunServers, wrtc, "answerer");
    },
  };
}
