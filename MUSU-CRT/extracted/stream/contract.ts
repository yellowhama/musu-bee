export interface RawFrameEnvelope {
  rawData: Uint8Array;
}

export interface ParsedFrameMetadata {
  status?: string;
  stream_type?: string;
  term_session_id?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface ParsedFramePayload {
  metadata: ParsedFrameMetadata;
  payload: Uint8Array;
}

export interface StreamMetricsSnapshot {
  fps: number;
  frameSizeKB: number;
  totalMB: number;
  reconnects: number;
}

export interface LocalFrameAdapter {
  start(windowId: number, width: number, height: number, quality: number): Promise<void>;
  getFrame(windowId: number): Promise<Uint8Array>;
  update(windowId: number, width: number, height: number, quality: number): Promise<void>;
  stop(windowId: number): Promise<void>;
}

export interface RemoteSessionAdapter {
  attach(webrtcSessionId: string): Promise<void>;
  close(webrtcSessionId: string): Promise<void>;
}
