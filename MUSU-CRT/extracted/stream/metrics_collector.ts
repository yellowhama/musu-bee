import type { StreamMetricsSnapshot } from "./contract";

export class StreamMetricsCollector {
  private readonly frameTimes: number[] = [];
  private totalBytes = 0;
  private reconnects = 0;

  constructor(private readonly fpsWindow = 20) {}

  recordReconnect(): void {
    this.reconnects += 1;
  }

  recordFrame(nowMs: number, payloadBytes: number): StreamMetricsSnapshot {
    this.frameTimes.push(nowMs);
    if (this.frameTimes.length > this.fpsWindow) {
      this.frameTimes.shift();
    }

    this.totalBytes += payloadBytes;

    const fps =
      this.frameTimes.length >= 2
        ? (this.frameTimes.length - 1) /
          ((this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0]) / 1000)
        : 0;

    return {
      fps: Math.round(fps * 10) / 10,
      frameSizeKB: Math.round((payloadBytes / 1024) * 10) / 10,
      totalMB: Math.round((this.totalBytes / (1024 * 1024)) * 100) / 100,
      reconnects: this.reconnects,
    };
  }
}
