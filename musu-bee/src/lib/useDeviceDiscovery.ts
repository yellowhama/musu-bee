"use client";

import { useState } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";
import type { Device } from "@/types";
import type { DeviceStatusItem, DeviceStatusResponse } from "@/app/api/device-status/route";

export interface UseDeviceDiscoveryReturn {
  devices: Device[];
}

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 5_000;

function itemToDevice(item: DeviceStatusItem): Device {
  return {
    id: item.id,
    name: item.name,
    label: item.isRemote ? "Remote" : "Local",
    status: item.status,
    tasks_running: item.tasks_running,
    tasks_pending: item.tasks_pending,
    version: item.version,
    isLeader: item.isLeader,
    isRemote: item.isRemote,
  };
}

function normalizeDeviceStatusResponse(payload: DeviceStatusItem[] | DeviceStatusResponse): DeviceStatusItem[] {
  return Array.isArray(payload) ? payload : payload.devices;
}

export function useDeviceDiscovery(): UseDeviceDiscoveryReturn {
  const [devices, setDevices] = useState<Device[]>([]);

  useLowDutyPolling(
    async (signal) => {
      const markOffline = () => {
        setDevices((prev) =>
          prev.length > 0
            ? prev.map((d) => ({ ...d, status: "offline" as const }))
            : prev,
        );
      };

      try {
        const res = await fetch("/api/device-status", { signal });
        if (!res.ok) {
          markOffline();
          throw new Error(`HTTP ${res.status}`);
        }
        const payload = (await res.json()) as DeviceStatusItem[] | DeviceStatusResponse;
        const items = normalizeDeviceStatusResponse(payload);
        if (!signal.aborted) setDevices(items.map(itemToDevice));
      } catch (err) {
        if (!signal.aborted) markOffline();
        throw err;
      }
    },
    { intervalMs: POLL_INTERVAL_MS, taskTimeoutMs: POLL_TIMEOUT_MS },
  );

  return { devices };
}
