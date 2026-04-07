import type { ParsedFramePayload } from "./contract";

export function parseRealtimeFrame(rawData: Uint8Array): ParsedFramePayload {
  const view = new DataView(rawData.buffer, rawData.byteOffset, 4);
  const jsonLength = view.getUint32(0, true);

  const jsonBytes = rawData.subarray(4, 4 + jsonLength);
  const metadataJson = new TextDecoder("utf-8").decode(jsonBytes);
  const metadata = JSON.parse(metadataJson) as ParsedFramePayload["metadata"];
  const payload = rawData.subarray(4 + jsonLength);

  return { metadata, payload };
}
