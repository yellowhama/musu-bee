import type { Metadata } from "next";
import CheckoutButton from "@/components/CheckoutButton";

export const metadata: Metadata = {
  title: "MUSU Pricing",
  description: "MUSU 요금제 — Pro ₩29,000/월, Team ₩49,000/월",
};

interface PageProps {
  searchParams: Promise<{ success?: string; cancelled?: string; tier?: string }>;
}

export default async function PricingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isSuccess = params.success === "1";
  const isCancelled = params.cancelled === "1";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f3f4f6",
        fontFamily:
          "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "48px 20px",
      }}
    >
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(32px, 6vw, 56px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
          }}
        >
          MUSU Pricing
        </h1>
        <p
          style={{
            margin: "12px 0 0",
            color: "#9ca3af",
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          결제는 Paddle Checkout으로 처리됩니다.
        </p>

        {isSuccess && (
          <div
            style={{
              marginTop: 20,
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 12,
              color: "#86efac",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            결제가 완료되었습니다! MUSU {params.tier?.toUpperCase() ?? "PRO"} 플랜이 활성화되었습니다.
          </div>
        )}
        {isCancelled && (
          <div
            style={{
              marginTop: 20,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 12,
              color: "#fca5a5",
              padding: "12px 16px",
              fontSize: 14,
            }}
          >
            결제가 취소되었습니다. 언제든지 다시 시도할 수 있습니다.
          </div>
        )}

        <div
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          <article
            style={{
              background: "#facc15",
              color: "#111827",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Pro</h2>
            <p style={{ margin: "10px 0 0", fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em" }}>
              ₩29,000
              <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 600 }}>/월</span>
            </p>
            <p style={{ margin: "8px 0 20px", fontSize: 14, fontWeight: 600 }}>
              기기 최대 5대
            </p>
            <CheckoutButton
              tier="pro"
              label="Pro 시작하기"
              style={{
                background: "#111827",
                color: "#facc15",
              }}
            />
          </article>

          <article
            style={{
              background: "#111",
              border: "1px solid #1f2937",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Team</h2>
            <p style={{ margin: "10px 0 0", fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em" }}>
              ₩49,000
              <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 600 }}>/월</span>
            </p>
            <p style={{ margin: "8px 0 20px", fontSize: 14, color: "#9ca3af" }}>
              기기 무제한
            </p>
            <CheckoutButton
              tier="team"
              label="Team 시작하기"
              style={{
                background: "#1f2937",
                color: "#f3f4f6",
                border: "1px solid #374151",
              }}
            />
          </article>
        </div>
      </section>
    </main>
  );
}
