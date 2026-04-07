"use client";

import { useState, useEffect, useCallback } from "react";

const MUSU_PORT_DEFAULT_URL = "http://localhost:24682";

type Platform = "windows" | "linux" | "mac";
type Step = "welcome" | "install" | "run" | "verify" | "done";

const PLATFORM_ICONS: Record<Platform, string> = {
  windows: "🪟",
  linux: "🐧",
  mac: "🍎",
};

const INSTALL_COMMANDS: Record<Platform, { label: string; cmd: string }[]> = {
  windows: [
    {
      label: "PowerShell (관리자 권한)",
      cmd: `irm https://get.musu.pro/port | iex`,
    },
  ],
  linux: [
    {
      label: "터미널",
      cmd: `curl -fsSL https://get.musu.pro/port | sh`,
    },
  ],
  mac: [
    {
      label: "터미널",
      cmd: `curl -fsSL https://get.musu.pro/port | sh`,
    },
  ],
};

const RUN_COMMANDS: Record<Platform, string> = {
  windows: `musu-port`,
  linux: `musu-port`,
  mac: `musu-port`,
};

interface OnboardingModalProps {
  onComplete: (deviceName: string) => void;
  onSkip: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? "#166534" : "#1e1e1e",
        border: `1px solid ${copied ? "#22c55e" : "#2d2d2d"}`,
        color: copied ? "#22c55e" : "#9ca3af",
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
    >
      {copied ? "복사됨 ✓" : "복사"}
    </button>
  );
}

function CodeBlock({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#0a0a0a",
          border: "1px solid #2d2d2d",
          borderRadius: 8,
          padding: "10px 14px",
        }}
      >
        <code
          style={{
            flex: 1,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            color: "#e2e8f0",
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {cmd}
        </code>
        <CopyButton text={cmd} />
      </div>
    </div>
  );
}

function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginBottom: 28,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 3,
            flex: 1,
            borderRadius: 2,
            background:
              i < current
                ? "#7c3aed"
                : i === current
                ? "#a855f7"
                : "#1f1f1f",
            transition: "background 0.3s",
          }}
        />
      ))}
    </div>
  );
}

export default function OnboardingModal({
  onComplete,
  onSkip,
}: OnboardingModalProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [platform, setPlatform] = useState<Platform>("windows");
  const [verifyStatus, setVerifyStatus] = useState<
    "idle" | "checking" | "ok" | "fail"
  >("idle");
  const [detectedName, setDetectedName] = useState<string>("");

  // Detect platform on mount
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) setPlatform("mac");
    else if (ua.includes("linux")) setPlatform("linux");
    else setPlatform("windows");
  }, []);

  const stepIndex: Record<Step, number> = {
    welcome: 0,
    install: 1,
    run: 2,
    verify: 3,
    done: 4,
  };
  const totalSteps = 4;

  const checkConnection = useCallback(async () => {
    setVerifyStatus("checking");
    try {
      const res = await fetch(`${MUSU_PORT_DEFAULT_URL}/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const name: string =
          data?.hostname ?? data?.device_name ?? data?.name ?? "내 기기";
        setDetectedName(name);
        setVerifyStatus("ok");
      } else {
        setVerifyStatus("fail");
      }
    } catch {
      setVerifyStatus("fail");
    }
  }, []);

  const handleComplete = useCallback(() => {
    onComplete(detectedName || "내 기기");
  }, [onComplete, detectedName]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "#111111",
          border: "1px solid #2d2d2d",
          borderRadius: 16,
          padding: "36px 40px",
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 24 }}>🐝</span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#f3f4f6",
              letterSpacing: "-0.02em",
            }}
          >
            MUSU 설정
          </span>
          <button
            onClick={onSkip}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "#6b7280",
              fontSize: 13,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            나중에
          </button>
        </div>

        {step !== "welcome" && step !== "done" && (
          <StepIndicator current={stepIndex[step] - 1} total={totalSteps - 1} />
        )}

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#f3f4f6",
                marginBottom: 12,
                lineHeight: 1.3,
              }}
            >
              첫 기기를 연결해 보세요
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "#9ca3af",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              MUSU는 여러 대 컴퓨터의 AI가 팀으로 일합니다.
              <br />
              시작하려면 이 기기에 <strong style={{ color: "#e5e7eb" }}>musu-port</strong>를
              설치하세요.
            </p>
            <div
              style={{
                background: "#0d0d0d",
                border: "1px solid #1f1f1f",
                borderRadius: 10,
                padding: "16px 18px",
                marginBottom: 28,
              }}
            >
              {[
                { icon: "📦", text: "musu-port 설치 (1분)" },
                { icon: "▶️", text: "백그라운드 실행" },
                { icon: "✅", text: "연결 확인 후 시작" },
              ].map(({ icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    fontSize: 14,
                    color: "#d1d5db",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  {text}
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep("install")}
              style={{
                width: "100%",
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "13px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              시작하기 →
            </button>
          </div>
        )}

        {/* Step: Install */}
        {step === "install" && (
          <div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#f3f4f6",
                marginBottom: 6,
              }}
            >
              musu-port 설치
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#6b7280",
                marginBottom: 20,
              }}
            >
              운영체제를 선택하고 명령어를 실행하세요.
            </p>

            {/* Platform selector */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {(["windows", "linux", "mac"] as Platform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  style={{
                    flex: 1,
                    background: platform === p ? "#1e1b4b" : "#1a1a1a",
                    border: `1px solid ${platform === p ? "#7c3aed" : "#2d2d2d"}`,
                    color: platform === p ? "#a78bfa" : "#6b7280",
                    borderRadius: 8,
                    padding: "8px 4px",
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s",
                  }}
                >
                  {PLATFORM_ICONS[p]} {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {INSTALL_COMMANDS[platform].map(({ label, cmd }) => (
              <CodeBlock key={label} label={label} cmd={cmd} />
            ))}

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 24,
              }}
            >
              <button
                onClick={() => setStep("welcome")}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #2d2d2d",
                  color: "#6b7280",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ← 이전
              </button>
              <button
                onClick={() => setStep("run")}
                style={{
                  flex: 2,
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                설치 완료 →
              </button>
            </div>
          </div>
        )}

        {/* Step: Run */}
        {step === "run" && (
          <div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#f3f4f6",
                marginBottom: 6,
              }}
            >
              musu-port 실행
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#6b7280",
                marginBottom: 20,
              }}
            >
              설치 후 아래 명령어로 실행하세요. 백그라운드에서 계속 실행됩니다.
            </p>

            <CodeBlock
              label="실행 명령어"
              cmd={RUN_COMMANDS[platform]}
            />

            <div
              style={{
                background: "#0a0a0a",
                border: "1px solid #1f1f1f",
                borderRadius: 8,
                padding: "12px 14px",
                marginTop: 8,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 6,
                  fontWeight: 600,
                }}
              >
                실행 확인 화면 예시
              </div>
              <pre
                style={{
                  margin: 0,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 12,
                  color: "#4ade80",
                  lineHeight: 1.5,
                }}
              >
                {`musu-port v0.x.x starting...
Listening on http://0.0.0.0:24682
Ready ✓`}
              </pre>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("install")}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #2d2d2d",
                  color: "#6b7280",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ← 이전
              </button>
              <button
                onClick={() => {
                  setStep("verify");
                  setVerifyStatus("idle");
                }}
                style={{
                  flex: 2,
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                실행 중입니다 →
              </button>
            </div>
          </div>
        )}

        {/* Step: Verify */}
        {step === "verify" && (
          <div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#f3f4f6",
                marginBottom: 6,
              }}
            >
              연결 확인
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#6b7280",
                marginBottom: 24,
              }}
            >
              musu-port가 정상적으로 실행 중인지 확인합니다.
            </p>

            <div
              style={{
                border: "1px solid #2d2d2d",
                borderRadius: 12,
                padding: "20px",
                textAlign: "center",
                marginBottom: 20,
                background: "#0d0d0d",
              }}
            >
              {verifyStatus === "idle" && (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontSize: 14, color: "#9ca3af" }}>
                    연결 확인 버튼을 눌러주세요
                  </div>
                </>
              )}
              {verifyStatus === "checking" && (
                <>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "3px solid #2d2d2d",
                      borderTopColor: "#7c3aed",
                      margin: "0 auto 12px",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <div style={{ fontSize: 14, color: "#9ca3af" }}>
                    localhost:24682 확인 중...
                  </div>
                </>
              )}
              {verifyStatus === "ok" && (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#22c55e",
                      marginBottom: 4,
                    }}
                  >
                    연결됨!
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    기기 이름:{" "}
                    <strong style={{ color: "#e5e7eb" }}>
                      {detectedName}
                    </strong>
                  </div>
                </>
              )}
              {verifyStatus === "fail" && (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>❌</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#ef4444",
                      marginBottom: 6,
                    }}
                  >
                    연결 실패
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      lineHeight: 1.5,
                    }}
                  >
                    musu-port가 실행 중인지 확인해 주세요.
                    <br />
                    포트 24682가 열려있어야 합니다.
                  </div>
                </>
              )}
            </div>

            {verifyStatus !== "ok" && (
              <button
                onClick={checkConnection}
                disabled={verifyStatus === "checking"}
                style={{
                  width: "100%",
                  background:
                    verifyStatus === "checking" ? "#1e1e1e" : "#7c3aed",
                  color: verifyStatus === "checking" ? "#6b7280" : "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor:
                    verifyStatus === "checking" ? "not-allowed" : "pointer",
                  marginBottom: 10,
                }}
              >
                {verifyStatus === "checking"
                  ? "확인 중..."
                  : verifyStatus === "fail"
                  ? "다시 시도"
                  : "연결 확인"}
              </button>
            )}

            {verifyStatus === "ok" && (
              <button
                onClick={handleComplete}
                style={{
                  width: "100%",
                  background: "#166534",
                  color: "#fff",
                  border: "1px solid #22c55e",
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                MUSU 시작하기 →
              </button>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("run")}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #2d2d2d",
                  color: "#6b7280",
                  borderRadius: 10,
                  padding: "10px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                ← 이전
              </button>
              {verifyStatus !== "ok" && (
                <button
                  onClick={onSkip}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid #2d2d2d",
                    color: "#6b7280",
                    borderRadius: 10,
                    padding: "10px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  나중에 연결
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
