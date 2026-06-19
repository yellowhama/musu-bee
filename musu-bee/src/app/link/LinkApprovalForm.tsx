"use client";

import { useState } from "react";

type ApproveState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "approved"; nodeName: string | null }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  cross_origin_rejected: "Request blocked (cross-origin). Reload this page and try again.",
  unauthorized: "Your session expired. Please sign in again.",
  device_approval_not_configured:
    "Device approval is not configured on the server (missing approver allowlist).",
  approver_not_allowlisted: "Your account is not allowed to approve devices.",
  invalid_approve_request: "Enter a valid device code (XXXX-XXXX).",
  device_code_not_found: "That code was not found. Check it and try again.",
  device_code_expired: "That code has expired. Start `musu login` again.",
  device_code_locked: "Too many attempts on that code. Start `musu login` again.",
  device_code_not_pending: "That code was already used or approved.",
  device_code_store_failed: "Server storage error. Try again shortly.",
};

export default function LinkApprovalForm({
  initialUserCode,
  hasCode = false,
}: {
  initialUserCode: string;
  hasCode?: boolean;
}) {
  const [userCode, setUserCode] = useState(initialUserCode);
  const [state, setState] = useState<ApproveState>({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/v1/auth/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same-origin so the browser sends the Origin header (M-1) and the
        // Supabase cookie. Body carries only the short user code.
        credentials: "same-origin",
        body: JSON.stringify({ user_code: userCode }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        node_name?: string | null;
      };
      if (res.ok && body.ok) {
        setState({ kind: "approved", nodeName: body.node_name ?? null });
        return;
      }
      const message =
        (body.error && ERROR_MESSAGES[body.error]) ||
        body.error ||
        `Approval failed (HTTP ${res.status}).`;
      setState({ kind: "error", message });
    } catch {
      setState({ kind: "error", message: "Network error. Try again." });
    }
  }

  if (state.kind === "approved") {
    return (
      <div role="status" style={{ marginTop: 24 }}>
        <p style={{ fontWeight: 600 }}>Signed in.</p>
        <p>
          This app is now signed in to your MUSU account. You can return to MUSU — it will finish
          automatically.
        </p>
      </div>
    );
  }

  // One-click path: MUSU put the code in the URL, so the user just confirms the
  // sign-in. No code field to read or type — a single "Sign in" button. (This
  // is the LOGIN step; adding this machine to the fleet is a separate action in
  // the app after sign-in.)
  if (hasCode) {
    return (
      <form onSubmit={handleSubmit} style={{ marginTop: 24, maxWidth: 360 }}>
        {state.kind === "error" ? (
          <p role="alert" style={{ color: "#b00020", marginBottom: 12 }}>
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={state.kind === "submitting"}
          style={{ padding: "12px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
        >
          {state.kind === "submitting" ? "Signing in…" : "Sign in to this app"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 24, maxWidth: 360 }}>
      <label htmlFor="user_code" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
        Device code
      </label>
      <input
        id="user_code"
        name="user_code"
        value={userCode}
        onChange={(event) => setUserCode(event.target.value)}
        placeholder="XXXX-XXXX"
        autoComplete="one-time-code"
        spellCheck={false}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 18,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      />
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={state.kind === "submitting" || userCode.trim().length === 0}
        style={{ marginTop: 16, padding: "10px 20px", fontSize: 16, cursor: "pointer" }}
      >
        {state.kind === "submitting" ? "Approving…" : "Approve device"}
      </button>
    </form>
  );
}
