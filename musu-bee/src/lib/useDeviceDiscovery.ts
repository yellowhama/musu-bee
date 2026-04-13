"use client";

import { useState, useEffect } from "react";
import type { Device } from "@/types";
import type { DeviceStatusItem } from "@/app/api/device-status/route";

export interface UseDeviceDiscoveryReturn {
  devices: Device[];
}

function itemToDevice(item: DeviceStatusItem): Device {
  return {
    id: item.id,
    name: item.name,
    label: item.isRemote ? "Remote" : "Local",
    status: item.status,
    stats: {
      cpu: item.cpu,
      gpu: item.gpu,
      ram: item.ram,
    },
    isLeader: item.isLeader,
    isRemote: item.isRemote,
    peerUrl: item.peerUrl,
    lastSeenMs: item.lastSeenMs,
  };
}

export function useDeviceDiscovery(): UseDeviceDiscoveryReturn {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    async function fetchDevices() {
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
    const id = setInterval(fetchDevices, 10_000);
    return () => clearInterval(id);
  }, []);

  return { devices };
}
