import type { LocalFrameAdapter, RealtimeStreamFrame, StreamMetricsSnapshot } from "./contract";
import { parseRealtimeFrame } from "./frame_parser";
import { StreamMetricsCollector } from "./metrics_collector";
import { ReconnectPolicy } from "./reconnect_policy";

export interface LocalStreamFrameResult {
  frame: RealtimeStreamFrame | null;
  metrics: StreamMetricsSnapshot;
  terminalSessionId: string | null;
}

export interface LocalStreamStartOptions {
  windowId: number;
  width: number;
  height: number;
  quality: number;
}

// Canonical local polling path candidate for MUSU-CRT.
export class LocalStreamController {
  private readonly metrics = new StreamMetricsCollector();
  private readonly reconnectPolicy = new ReconnectPolicy();

  constructor(private readonly adapter: LocalFrameAdapter) {}

  async start(options: LocalStreamStartOptions): Promise<void> {
    this.metrics.reset();
    this.reconnectPolicy.reset();
    await this.adapter.start(options.windowId, options.width, options.height, options.quality);
  }

  async pullFrame(windowId: number, nowMs: number): Promise<LocalStreamFrameResult> {
    const rawData = await this.adapter.getFrame(windowId);
    const parsed = parseRealtimeFrame(rawData);
    const metrics = this.metrics.recordFrame(nowMs, parsed.payloadData.length);

    if (parsed.metadata.stream_type === "clipboard") {
      return {
        frame: null,
        metrics,
        terminalSessionId:
          typeof parsed.metadata.term_session_id === "string"
            ? parsed.metadata.term_session_id
            : null,
      };
    }

    return {
      frame: {
        status: typeof parsed.metadata.status === "string" ? parsed.metadata.status : undefined,
        stream_type:
          typeof parsed.metadata.stream_type === "string"
            ? parsed.metadata.stream_type
            : "gui",
        term_session_id:
          typeof parsed.metadata.term_session_id === "string"
            ? parsed.metadata.term_session_id
            : undefined,
        width: typeof parsed.metadata.width === "number" ? parsed.metadata.width : undefined,
        height: typeof parsed.metadata.height === "number" ? parsed.metadata.height : undefined,
        data: parsed.payloadData,
      },
      metrics,
      terminalSessionId:
        typeof parsed.metadata.term_session_id === "string"
          ? parsed.metadata.term_session_id
          : null,
    };
  }

  nextReconnectDelayMs(): number | null {
    const decision = this.reconnectPolicy.next();
    return decision.shouldRetry ? decision.nextDelayMs : null;
  }

  async update(options: LocalStreamStartOptions): Promise<void> {
    await this.adapter.update(options.windowId, options.width, options.height, options.quality);
  }

  async stop(windowId: number): Promise<void> {
    await this.adapter.stop(windowId);
  }
}
