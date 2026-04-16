# musu-bee Deployment Guide

musu-bee is the Next.js 16 web UI for the MUSU agent mesh.

---

## Prerequisites

- Node.js 20+
- A running musu-bridge instance (`:8070` by default)
- Supabase project (for auth + subscription features)

---

## Local Development

```bash
cd musu-bee
cp .env.example .env.local   # fill in required vars
npm install
npm run dev                   # starts on http://localhost:3001
```

---

## Vercel Deployment

1. Push the repo to GitHub
2. Import the `musu-bee` directory in Vercel (set root directory to `musu-bee/`)
3. Set environment variables (see table below)
4. Deploy — Vercel auto-detects Next.js

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `MUSU_BRIDGE_URL` | URL of the musu-bridge backend, e.g. `https://bridge.example.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

### Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_AUTH_ENABLED` | `false` | Set `true` to require Supabase login |

### Paddle (payments — optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_PADDLE_ENV` | `sandbox` or `production` |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle client-side token |
| `PADDLE_API_KEY` | Paddle server-side API key |
| `PADDLE_PRICE_ID_PRO` | Paddle price ID for Pro plan |
| `PADDLE_PRICE_ID_TEAM` | Paddle price ID for Team plan |

### Subscription cache (optional)

| Variable | Description |
|----------|-------------|
| `KV_REST_API_URL` | Upstash/Vercel KV URL (caches subscription state) |
| `KV_REST_API_TOKEN` | KV auth token |

### Worker (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_MUSU_WORKER_URL` | `http://localhost:9700` | musu-worker endpoint visible to the browser |

---

## Health Check

```
GET /api/health
```

Returns `{"ok": true}` when the server is up. Use this for Vercel health checks or uptime monitoring.

---

## Troubleshooting

**Bridge requests fail with 502**
- Verify `MUSU_BRIDGE_URL` is set and reachable from Vercel's edge network
- musu-bridge requires `Authorization: Bearer <MUSU_BRIDGE_TOKEN>` — ensure the bridge token is configured on both sides

**Auth loop / infinite redirect**
- Set `NEXT_PUBLIC_AUTH_ENABLED=false` to bypass auth during debugging
- Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

**Build fails with TypeScript errors**
- Run `npm run build` locally first to catch type errors before pushing
- Node.js SQLite `ExperimentalWarning` during build is expected and harmless
