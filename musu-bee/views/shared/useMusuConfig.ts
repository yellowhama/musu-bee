export interface MusuConfig {
  bridgeUrl: string;
  token: string;
}

declare global {
  interface Window {
    __MUSU_CONFIG__?: Partial<MusuConfig>;
  }
}

export function useMusuConfig(): MusuConfig {
  const injected = window.__MUSU_CONFIG__;
  if (injected?.bridgeUrl) {
    return {
      bridgeUrl: injected.bridgeUrl,
      token: injected.token ?? "",
    };
  }
  const p = new URLSearchParams(location.search);
  return {
    bridgeUrl: p.get("bridgeUrl") ?? "http://localhost:8070",
    token: p.get("token") ?? "",
  };
}
