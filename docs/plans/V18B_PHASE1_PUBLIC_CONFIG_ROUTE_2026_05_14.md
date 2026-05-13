# Phase 1 — /api/public-config endpoint (2026-05-14)

> Master plan §Phase 1. musu.pro 에 public env 노출하는 read-only endpoint.

## Goal

fresh clone 한 사용자가 자기 머신에서 install.ps1 돌리면 musu.pro 와 동일한 Supabase
config 자동으로 받아 로컬 musu-bee 가 같은 로그인으로 작동.

## 설계

### endpoint

```
GET /api/public-config

→ 200 application/json
{
  "supabaseUrl":     "https://poyclapxmvulvboiebxq.supabase.co",
  "supabaseAnonKey": "eyJh...",
  "appUrl":          "https://musu.pro",
  "paddleClientToken": "live_...",
  "paddleEnv":       "production"
}
```

응답 헤더:
- `Cache-Control: public, max-age=300` (5분 — 키 rotate 시 빠른 propagate)
- `Content-Type: application/json`

### strict allowlist

코드는 env 이름을 **명시 리스트** 로만 읽음. 새 env 추가 = 명시 의도 = 안전.
실수로 service_role_key 들어가지 않음.

```ts
const ALLOWED_KEYS = {
  supabaseUrl:        "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnonKey:    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  appUrl:             "NEXT_PUBLIC_APP_URL",
  paddleClientToken:  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  paddleEnv:          "NEXT_PUBLIC_PADDLE_ENV",
} as const;
```

### 빈 값 처리

env 가 unset 또는 빈 string 이면 그 키 **omit** (안 박음). placeholder 박지 않음.
client 가 `supabaseUrl` 없으면 그건 그것대로 의미 — middleware 가 auth bypass.

### 보안

- 모든 값이 정의상 public — Vercel 의 musu.pro 빌드가 이미 브라우저 JS 에 inline.
- 안 노출되는 거: `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
  `ANTHROPIC_API_KEY`. allowlist 안에 없음 → 못 들어감.
- 새 NEXT_PUBLIC_* env 추가하면 자동 노출? — **No**. ALLOWED_KEYS 에 명시해야. 안전 default.

### route 파일

`musu-bee/src/app/api/public-config/route.ts`:

```ts
import { NextResponse } from "next/server";

const ALLOWED_KEYS = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  appUrl: "NEXT_PUBLIC_APP_URL",
  paddleClientToken: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  paddleEnv: "NEXT_PUBLIC_PADDLE_ENV",
} as const;

export async function GET() {
  const body: Record<string, string> = {};
  for (const [outKey, envName] of Object.entries(ALLOWED_KEYS)) {
    const val = process.env[envName]?.trim();
    if (val) body[outKey] = val;
  }
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
```

### tests

`musu-bee/src/app/api/public-config/route.test.ts`:

`node:test` + dynamic import + env snapshot 패턴 (기존 agents/route.test.ts 와 동일).

1. **happy path** — 5 env 모두 set → response 가 5 key 다.
2. **secret 부재 보장** — SUPABASE_SERVICE_ROLE_KEY 도 set 했어도 response 에 안 들어감.
3. **빈 env 는 omit** — supabaseAnonKey 만 unset → response 에 4 key.
4. **모든 env unset** → response 가 빈 객체 `{}`, 200 status (오류 안 던짐).
5. **cache header** — `Cache-Control` = `public, max-age=300`.
6. **whitespace 처리** — env value 가 `"  abc  "` → `"abc"` 로 trim 되어 응답.

## 실행 단계

1. `route.ts` 작성.
2. `route.test.ts` 작성 (6 cases).
3. `npm run test` 또는 `node --test src/app/api/public-config/route.test.ts` 로 검증.
4. 로컬 build 안 함 (Phase 2 의 fetch 가 musu.pro 에 deploy 된 endpoint 사용 — 우리 로컬 build 와 다른 path). 단 build 자체는 commit 후 musu.pro 의 Vercel 가 자동.
5. commit `feat(musu-bee): /api/public-config endpoint for install bootstrap (v18.B Phase 1)`.

## 위험

- **route.test.ts 가 process.env 를 직접 set** — concurrent test 가 같은 env 만지면 race.
  기존 패턴이 그래왔고 node:test 가 직렬화하니 OK.
- **next.config.mjs 의 CSP** 가 `/api/public-config` GET 막을 가능성? — frame-ancestors 만 제한, GET 통과.
- **musu.pro 의 Vercel deploy 가 자동 안 일어남**? — main push 시 Vercel 이 자동 deploy 한다고 가정. 검증은 Phase 3 closure 에서 `curl https://musu.pro/api/public-config` 으로.

## Status

- [ ] route.ts
- [ ] route.test.ts (6 cases)
- [ ] tests pass
- [ ] commit
