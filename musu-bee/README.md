# musu-bee Local Development

## V24-R7 Dual-Start (Rust + Python bridge)

During the V24 R-fast Rust migration, musu-bee talks to **two** bridges:
the new Rust bridge on `:8070` (canonical paths under `/api/nodes`) and
the legacy Python bridge on `:8071` for endpoints not yet ported.

Before `npm run dev`, start both with:

```bash
./scripts/v24-rfast-dual-start.sh
```

`.env.local` should set `MUSU_BRIDGE_URL=http://127.0.0.1:8070` (the
Rust bridge); legacy callers that still need the Python bridge will
read `:8071` directly until later R-fast steps retire them.

## Billing Env Setup (Paddle)

1. Copy `.env.local.example` to `.env.local`.
2. In Paddle vendor dashboard, create/retrieve credentials for your sandbox or production environment.
3. Set the following variables in `.env.local`:
   - `PADDLE_API_KEY`
   - `PADDLE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
   - `NEXT_PUBLIC_PADDLE_ENV`
   - `PADDLE_PRICE_ID_PRO`
   - `PADDLE_PRICE_ID_TEAM`

`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` is consumed by the browser checkout path (`CheckoutButton`) for Paddle.js overlay checkout. If the token is missing or Paddle.js fails to initialize, the app falls back to Paddle hosted checkout URL redirect.
