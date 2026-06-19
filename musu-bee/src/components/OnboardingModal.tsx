"use client";

import { useState, useEffect, useCallback } from "react";
import { DESKTOP_INSTALL_SCRIPT_URL, DESKTOP_MSIX_URL } from "@/lib/publicRelease";

// The real install path (matches /download): PowerShell one-liner trusts the
// self-signed beta cert + installs the MSIX, which Windows registers for 24h
// auto-update. The desktop app (cockpit) then connects to the local bridge
// automatically — there is NO separate "run a port command" step and no
// localhost:24682 listener (that was a stale design that never shipped). Once
// the Store release lands the cert step disappears entirely.
const INSTALL_ONE_LINER = `irm https://musu.pro/install.ps1 | iex`;

type Step = "welcome" | "install" | "done";

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
        background: copied ? "rgba(34, 197, 94, 0.35)" : "var(--bg-overlay)",
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
            color: "var(--fg1)",
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
                ? "var(--accent)"
                : i === current
                ? "var(--accent)"
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
  const [isWindows, setIsWindows] = useState(true);

  // The desktop app is Windows-only today (MSIX). Detect non-Windows so we can
  // point those users at the download page rather than a PowerShell command
  // they can't run.
  useEffect(() => {
    setIsWindows(!/mac|linux|android/i.test(navigator.userAgent));
  }, []);

  const stepIndex: Record<Step, number> = {
    welcome: 0,
    install: 1,
    done: 2,
  };
  const totalSteps = 2;

  const handleComplete = useCallback(() => {
    onComplete("This PC");
  }, [onComplete]);

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
          <img src="/images/favicon-header.png" alt="MUSU" style={{ height: 24, width: "auto" }} />
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

        {step === "install" && (
          <StepIndicator current={stepIndex[step] - 1} total={totalSteps} />
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
              Install MUSU on this PC
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--fg2)",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              MUSU lets AI across your computers work as one team.
              <br />
              Install the desktop app — it connects automatically and keeps
              itself up to date.
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
                { icon: "📋", text: "Copy one PowerShell command" },
                { icon: "📦", text: "It installs the MUSU app (~1 min)" },
                { icon: "✅", text: "Open MUSU — it connects on its own" },
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
                background: "var(--accent)",
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

        {/* Step: Install (one-liner → MSIX) */}
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
              Install MUSU
            </h2>
            {isWindows ? (
              <>
                <p style={{ fontSize: 13, color: "var(--fg3)", marginBottom: 20 }}>
                  Open <strong style={{ color: "var(--fg1)" }}>PowerShell</strong>{" "}
                  and run this. It trusts the beta certificate and installs the
                  app (asks for admin once).
                </p>
                <CodeBlock label="PowerShell" cmd={INSTALL_ONE_LINER} />
                <p style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.6, marginBottom: 8 }}>
                  When it finishes, open <strong style={{ color: "var(--fg1)" }}>MUSU</strong>{" "}
                  from the Start menu. It connects to this PC automatically — no
                  extra command to run.
                </p>
                <a
                  href={DESKTOP_MSIX_URL}
                  style={{ fontSize: 12, color: "var(--fg-accent)", textDecoration: "none" }}
                >
                  Prefer to download the installer instead? →
                </a>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--fg3)", marginBottom: 20, lineHeight: 1.6 }}>
                  The MUSU desktop app is currently Windows-only. Open this page
                  on a Windows PC, or grab the installer script below.
                </p>
                <CodeBlock label="Install script" cmd={DESKTOP_INSTALL_SCRIPT_URL} />
              </>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
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
                onClick={() => setStep("done")}
                style={{
                  flex: 2,
                  background: "var(--accent)",
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

        {/* Step: Done */}
        {step === "done" && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, textAlign: "center" }}>✅</div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--fg1)",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              You&apos;re set
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg2)",
                lineHeight: 1.6,
                marginBottom: 24,
                textAlign: "center",
              }}
            >
              Open <strong style={{ color: "var(--fg1)" }}>MUSU</strong> from the
              Start menu whenever you want to give this PC a task. It stays
              connected in the background and updates itself.
            </p>
            <button
              onClick={handleComplete}
              style={{
                width: "100%",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "13px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Start MUSU →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
