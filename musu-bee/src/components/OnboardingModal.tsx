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
      label: "PowerShell (Administrator)",
      cmd: `irm https://get.musu.pro/port | iex`,
    },
  ],
  linux: [
    {
      label: "Terminal",
      cmd: `curl -fsSL https://get.musu.pro/port | sh`,
    },
  ],
  mac: [
    {
      label: "Terminal",
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
        background: copied ? "#166534" : "var(--bg-overlay)",
        border: `1px solid ${copied ? "var(--musu-status-online)" : "var(--border-default)"}`,
        color: copied ? "var(--musu-status-online)" : "var(--fg2)",
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function CodeBlock({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 4 }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-base)",
          border: "1px solid var(--border-default)",
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
                : "var(--border-subtle)",
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
          data?.hostname ?? data?.device_name ?? data?.name ?? "My device";
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
    onComplete(detectedName || "My device");
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
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
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
              color: "var(--fg1)",
              letterSpacing: "-0.02em",
            }}
          >
            Set up MUSU
          </span>
          <button
            onClick={onSkip}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "var(--fg3)",
              fontSize: 13,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            Later
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
                color: "var(--fg1)",
                marginBottom: 12,
                lineHeight: 1.3,
              }}
            >
              Connect your first device
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--fg2)",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              MUSU lets AI across multiple computers work as one team.
              <br />
              To get started, install <strong style={{ color: "var(--fg1)" }}>musu-port</strong> on this device.
            </p>
            <div
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                padding: "16px 18px",
                marginBottom: 28,
              }}
            >
              {[
                { icon: "📦", text: "Install musu-port (1 min)" },
                { icon: "▶️", text: "Run it in the background" },
                { icon: "✅", text: "Verify the connection and start" },
              ].map(({ icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    fontSize: 14,
                    color: "var(--fg1)",
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
              Get started →
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
                color: "var(--fg1)",
                marginBottom: 6,
              }}
            >
              Install musu-port
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg3)",
                marginBottom: 20,
              }}
            >
              Pick your operating system and run the command.
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
                    background: platform === p ? "#1e1b4b" : "var(--bg-card)",
                    border: `1px solid ${platform === p ? "#7c3aed" : "var(--border-default)"}`,
                    color: platform === p ? "#a78bfa" : "var(--fg3)",
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
                  border: "1px solid var(--border-default)",
                  color: "var(--fg3)",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ← Back
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
                Installed →
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
                color: "var(--fg1)",
                marginBottom: 6,
              }}
            >
              Run musu-port
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg3)",
                marginBottom: 20,
              }}
            >
              After installation, run the command below. It will keep running in the background.
            </p>

            <CodeBlock
              label="Run command"
              cmd={RUN_COMMANDS[platform]}
            />

            <div
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: "12px 14px",
                marginTop: 8,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg3)",
                  marginBottom: 6,
                  fontWeight: 600,
                }}
              >
                Example output
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
                  border: "1px solid var(--border-default)",
                  color: "var(--fg3)",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ← Back
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
                It is running →
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
                color: "var(--fg1)",
                marginBottom: 6,
              }}
            >
              Verify connection
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg3)",
                marginBottom: 24,
              }}
            >
              Check whether musu-port is running correctly.
            </p>

            <div
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: 12,
                padding: "20px",
                textAlign: "center",
                marginBottom: 20,
                background: "var(--bg-base)",
              }}
            >
              {verifyStatus === "idle" && (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontSize: 14, color: "var(--fg2)" }}>
                    Click verify connection
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
                      border: "3px solid var(--border-default)",
                      borderTopColor: "#7c3aed",
                      margin: "0 auto 12px",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <div style={{ fontSize: 14, color: "var(--fg2)" }}>
                    Checking localhost:24682...
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
                      color: "var(--musu-status-online)",
                      marginBottom: 4,
                    }}
                  >
                    Connected!
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg3)" }}>
                    Device name:{" "}
                    <strong style={{ color: "var(--fg1)" }}>
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
                      color: "var(--musu-status-error)",
                      marginBottom: 6,
                    }}
                  >
                    Connection failed
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--fg3)",
                      lineHeight: 1.5,
                    }}
                  >
                    Make sure musu-port is running.
                    <br />
                    Port 24682 must be open.
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
                    verifyStatus === "checking" ? "var(--bg-overlay)" : "#7c3aed",
                  color: verifyStatus === "checking" ? "var(--fg3)" : "#fff",
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
                  ? "Checking..."
                  : verifyStatus === "fail"
                  ? "Try again"
                  : "Verify connection"}
              </button>
            )}

            {verifyStatus === "ok" && (
              <button
                onClick={handleComplete}
                style={{
                  width: "100%",
                  background: "#166534",
                  color: "#fff",
                  border: "1px solid var(--musu-status-online)",
                  borderRadius: 10,
                  padding: "12px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 10,
                }}
              >
                Start MUSU →
              </button>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("run")}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  color: "var(--fg3)",
                  borderRadius: 10,
                  padding: "10px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
              {verifyStatus !== "ok" && (
                <button
                  onClick={onSkip}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    color: "var(--fg3)",
                    borderRadius: 10,
                    padding: "10px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Connect later
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
