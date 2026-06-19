import Link from "next/link";

/**
 * Shown at /app and /workspace when the web workspace UI is gated off
 * (see lib/workspaceUi.ts). Tells the user that work runs in the desktop app and
 * MUSU.PRO only connects to that local runtime. Extracted from the previously
 * dead `if (false)` block in app/app/page.tsx so /app and /workspace share one
 * gate instead of duplicating it.
 */
export default function UseDesktopGate() {
  return (
    <div className="app-gate-outer">
      <div className="app-gate-card">
        <div className="app-gate-bee">
          <img
            src="/images/favicon-header.png"
            alt="MUSU"
            style={{ height: 40, width: "auto" }}
          />
        </div>
        <h1 className="app-gate-title">Use MUSU Desktop</h1>
        <p className="app-gate-body">
          MUSU work runs on the device where the desktop app is installed.
          <br />
          MUSU.PRO only connects to that local runtime and sends user input.
        </p>
        <div className="app-gate-actions">
          <Link href="/download" className="btn btn-primary app-gate-btn">
            Get MUSU Desktop →
          </Link>
          <Link href="/" className="btn btn-ghost app-gate-btn">
            Back to Home
          </Link>
        </div>
        <div className="app-gate-footer">
          <strong className="app-gate-footer-label">
            How to Use the Local Runtime
          </strong>
          Open the MUSU desktop app on the machine that should do the work, then
          <br />
          connect it from the MUSU.PRO workspace.
        </div>
      </div>
    </div>
  );
}
