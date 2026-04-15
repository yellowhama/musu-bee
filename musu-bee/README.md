# musu-bee Local Development

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
