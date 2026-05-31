"use client";

import { useState, useEffect } from "react";
import type { Device } from "@/types";
import type { DeviceStatusItem } from "@/app/api/device-status/route";

export interface UseDeviceDiscoveryReturn {
  devices: Device[];
}

const POLL_INTERVAL_MS = 15_000;

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

export function useDeviceDiscovery(): UseDeviceDiscoveryReturn {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    async function fetchDevices() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/device-status");
        if (!res.ok) {
          setDevices((prev) =>
            prev.length > 0
              ? prev.map((d) => ({ ...d, status: "offline" as const }))
              : prev,
          );
          return;
        }
        const items = (await res.json()) as DeviceStatusItem[];
        setDevices(items.map(itemToDevice));
      } catch {
        setDevices((prev) =>
          prev.length > 0
            ? prev.map((d) => ({ ...d, status: "offline" as const }))
            : prev,
        );
      }
    }

    fetchDevices();
    const id = setInterval(fetchDevices, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return { devices };
}
