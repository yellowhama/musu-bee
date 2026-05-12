# P1 — Auth and Navigation Coherence

Date: 2026-05-12  
Parent: `MASTER_PLAN_2026_05_12.md`  
Status: active

## Problem
Live `musu.pro` exposes `/login`, `/dashboard`, and `/workspace`, while the accessible local source is still centered on `/auth/login` and `/app`.

The immediate goal is route coherence, not a destructive `/app` removal.

## Files Owned
- `src/middleware.ts`
- `src/app/login/page.tsx`
- `src/app/workspace/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/auth/callback/page.tsx`
- `docs/command-center/*`

## Work Plan
1. Add `/login` as the public live-compatible login entry.
2. Preserve `/auth/login` as the implementation page.
3. Make protected app surfaces redirect unauthenticated users through `/login?redirect=...`.
4. Add `/workspace` as a protected route shell backed by the existing app workspace surface.
5. Keep `/app` as legacy local route for now and document it as a later cleanup item.

## Acceptance Criteria
- `GET /login?redirect=/dashboard` reaches the auth login implementation while preserving the return path.
- `/dashboard` unauthenticated redirects to `/login?redirect=/dashboard`.
- `/workspace` unauthenticated redirects to `/login?redirect=/workspace`.
- `/workspace` exists in the local build route table.
- `/app` is not removed in this slice.

## Implementation TODO
- [x] Add `/login` alias route.
- [x] Protect `/workspace` in middleware.
- [x] Add `/workspace` page.
- [x] Update dashboard server redirect to `/login?redirect=/dashboard`.
- [x] Harden auth callback return path against external URLs.
- [x] Run typecheck/build/smoke.

## Tests
- `npm run typecheck` -> pass
- `npm run build` -> pass; route table includes `/login` and `/workspace`
- `npx next start -p 3002`
- `curl -I "http://localhost:3002/login?redirect=/dashboard"` -> 307 `/auth/login?next=%2Fdashboard`
- `curl -I http://localhost:3002/dashboard` -> 307 `/login?redirect=%2Fdashboard`
- `curl -I http://localhost:3002/workspace` -> 307 `/login?redirect=%2Fworkspace`
- `curl -I "http://localhost:3002/login?redirect=https://evil.example/"` -> 307 `/auth/login?next=%2Fworkspace`

## Implementation Notes
- `/login` is a live-compatible public route alias. It sanitizes `redirect`/`next` and forwards to `/auth/login?next=...`.
- `/auth/login` remains the concrete sign-in UI.
- `/workspace` currently reuses the existing `AppShell` execution surface. Product-level differentiation from `/dashboard` remains tracked in P3.
- `/app` is intentionally kept as a legacy local route in this slice.

## Rollback
Delete `src/app/login/page.tsx` and `src/app/workspace/page.tsx`, then restore middleware/dashboard redirects to `/auth/login?next=...`.
