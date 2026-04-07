# MUS-162 Runtime Evidence Schema Hardening (2026-04-03)

## Goal

Remove dual-truth ambiguity in `musu-connects-runtime-transport-evidence.json` by defining one canonical scenario-truthful field and keeping backward compatibility explicit.

## Canonical Semantics

- Canonical field: `effectiveTransportEvidenceKind`
- Backward-compatible alias: `transportEvidenceKind`
  - Must always equal `effectiveTransportEvidenceKind`.
- Legacy runtime-constant field: `legacyRuntimeTransportEvidenceKind`
  - Fixed to `runtime-musu-port-http-route-plane-v1`.
- Compatibility alias: `proofTransportEvidenceKind`
  - Kept for existing readers and must equal canonical value.

## Scenario Truth Table

- `verified-peer` => `effectiveTransportEvidenceKind=runtime-musu-port-http-route-plane-v1`
- `unverified-peer` => `effectiveTransportEvidenceKind=trust-gate-suppressed`
- `blocked-peer` => `effectiveTransportEvidenceKind=trust-gate-suppressed`

## Replay Commands

- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario unverified-peer`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario blocked-peer`

## Acceptance Gate

- Terminal line: `MUS162_SCHEMA_HARDENING_GATE: GO|NO-GO`
- Parent close additionally requires QA child gate: `MUS164_SCHEMA_QA_GATE: GO`
