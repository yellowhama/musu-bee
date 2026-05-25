import { getBridgeUrl } from '../../../lib/bridge-config';
export const MUSU_PORT_URL = getBridgeUrl();
export const MUSU_BRIDGE_URL = (getBridgeUrl()).trim().replace(/\/+$/, "");
export const MUSU_WORKER_URL = getBridgeUrl();
