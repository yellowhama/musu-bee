export const MUSU_PORT_URL = (process.env.MUSU_PORT_URL ?? "http://localhost:1355").trim().replace(/\/+$/, "");
export const MUSU_BRIDGE_URL = (process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070").trim().replace(/\/+$/, "");
export const MUSU_WORKER_URL = (process.env.MUSU_WORKER_URL ?? "http://localhost:9700").trim().replace(/\/+$/, "");
