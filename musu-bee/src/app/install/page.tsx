import type { Metadata } from "next";
import PublicSiteShell from "@/components/PublicSiteShell";
import { INSTALL_COMMANDS } from "@/lib/publicSiteContent";

export const metadata: Metadata = {
  title: "Install MUSU Port",
  description: "Install the MUSU port on Windows, Linux, or macOS.",
};

export default function InstallPage() {
  return (
    <PublicSiteShell>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px 96px" }}>
        <div style={eyebrowStyle}>INSTALL</div>
        <h1 style={titleStyle}>기기를 MUSU에 연결하는 가장 빠른 방법</h1>
        <p style={descStyle}>
          현재 제품 공개면에서 가장 설득력 있는 install story는 단순해야 한다. 기기에 port를
          설치하고, 상태를 올리고, control plane에서 그 기기를 보는 흐름이다.
        </p>

        <div style={{ display: "grid", gap: 18, marginTop: 32 }}>
          {INSTALL_COMMANDS.map((item) => (
            <article key={item.platform} style={cardStyle}>
              <div style={{ fontSize: 12, color: "var(--musu-color-brand-accent)", fontWeight: 800, marginBottom: 8 }}>
                {item.platform}
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>{item.label}</h2>
              <div style={statusPillStyle}>{item.status}</div>
              <div style={detailBlockStyle}>
                <p style={{ margin: 0 }}>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </main>
    </PublicSiteShell>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--musu-color-brand-accent)",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(34px, 6vw, 58px)",
  fontWeight: 900,
  lineHeight: 1.04,
  letterSpacing: "-0.05em",
};

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "#9ca3af",
  lineHeight: 1.75,
  maxWidth: 760,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 22,
};

const statusPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(250,204,21,0.12)",
  color: "#fde68a",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const detailBlockStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 16,
  background: "#0f0f0f",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#d1d5db",
  lineHeight: 1.7,
};
