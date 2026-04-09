import type { Metadata } from "next";
import PublicSiteShell from "@/components/PublicSiteShell";
import { FAQ_ITEMS } from "@/lib/publicSiteContent";

export const metadata: Metadata = {
  title: "MUSU FAQ",
  description: "Frequently asked questions about MUSU, access, and product scope.",
};

export default function FaqPage() {
  return (
    <PublicSiteShell>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px 96px" }}>
        <div style={eyebrowStyle}>FAQ</div>
        <h1 style={titleStyle}>무엇을 약속하고, 무엇은 아직 early access인가</h1>
        <p style={descStyle}>
          FAQ는 objection handling과 honest framing을 맡는다. 강한 주장을 늘리는 곳이 아니라,
          실제 제품 상태와 기대치를 맞추는 곳이다.
        </p>
        <div style={{ display: "grid", gap: 16, marginTop: 32 }}>
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} style={faqCardStyle}>
              <h2 style={questionStyle}>{item.question}</h2>
              <p style={answerStyle}>{item.answer}</p>
            </article>
          ))}
        </div>
      </main>
    </PublicSiteShell>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#facc15",
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

const faqCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 22,
};

const questionStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const answerStyle: React.CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  fontSize: 14,
  lineHeight: 1.75,
};
