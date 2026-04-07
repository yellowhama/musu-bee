import type { LocalFrameAdapter } from "./contract";

export interface TauriStreamInvokeLike {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

// Thin adapter around the local realtime frame command set.
export class TauriLocalFrameAdapter implements LocalFrameAdapter {
  constructor(private readonly invoke: TauriStreamInvokeLike) {}

  async start(windowId: number, width: number, height: number, quality: number): Promise<void> {
    await this.invoke<void>("start_realtime_stream", { windowId, width, height, quality });
  }

  async getFrame(windowId: number): Promise<Uint8Array> {
    return this.invoke<Uint8Array>("get_realtime_frame", { windowId });
  }

  async update(windowId: number, width: number, height: number, quality: number): Promise<void> {
    await this.invoke<void>("update_realtime_stream", { windowId, width, height, quality });
  }

  async stop(windowId: number): Promise<void> {
    await this.invoke<void>("stop_realtime_stream", { windowId });
  }
}
