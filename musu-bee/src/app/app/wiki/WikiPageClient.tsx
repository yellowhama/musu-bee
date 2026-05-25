"use client";
import { getBridgeUrl } from '../../../lib/bridge-config';

import WikiPanel from "@/components/WikiPanel";
import ResearchForm from "@/components/ResearchForm";
import { useState, useEffect } from "react";

export default function WikiPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const bridgeUrl = getBridgeUrl();
    fetch(`${bridgeUrl}/api/workspace`)
      .then((r) => r.json())
      .then((d) => setCompanyId(d.active_company_id || null))
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ResearchForm onComplete={() => setRefreshKey((k) => k + 1)} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WikiPanel key={refreshKey} companyId={companyId} />
      </div>
    </div>
  );
}
