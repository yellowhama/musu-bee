import { getBridgeUrl } from '../../../lib/bridge-config';

export function getMusuPortUrl(): string {
  return getBridgeUrl();
}

export function getMusuBridgeUrl(): string {
  return getBridgeUrl().trim().replace(/\/+$/, "");
}

export function getMusuWorkerUrl(): string {
  return getBridgeUrl();
}
