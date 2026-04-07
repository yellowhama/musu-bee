export interface RelayBufferEntry {
  supabaseSessionId: string;
}

export interface RelayBufferStore {
  findTerminalSessionId(webrtcSessionId: string): Promise<string | null>;
}

export interface TerminalSender {
  sendTerminalBase64(terminalSessionId: string, dataBase64: string): Promise<void>;
}

export interface IncomingDataBridgeHandler {
  handleIncomingData(webrtcSessionId: string, data: Uint8Array): Promise<void>;
}

function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

// Split candidate for the callback currently embedded in `webrtc_offer`.
export class RelayBufferIncomingDataBridgeHandler implements IncomingDataBridgeHandler {
  constructor(
    private readonly relayBufferStore: RelayBufferStore,
    private readonly terminalSender: TerminalSender,
  ) {}

  async handleIncomingData(webrtcSessionId: string, data: Uint8Array): Promise<void> {
    const terminalSessionId = await this.relayBufferStore.findTerminalSessionId(webrtcSessionId);
    if (!terminalSessionId) {
      return;
    }

    await this.terminalSender.sendTerminalBase64(
      terminalSessionId,
      encodeBase64(data),
    );
  }
}
