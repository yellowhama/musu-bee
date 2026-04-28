"use client";

import WikiPanel from "@/components/WikiPanel";
import ResearchForm from "@/components/ResearchForm";
import { useState } from "react";

export default function WikiPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ResearchForm onComplete={() => setRefreshKey((k) => k + 1)} />
      <div style={{ flex: 1, overflow: "auto" }}>
        <WikiPanel key={refreshKey} companyId={null} />
      </div>
    </div>
  );
}
