# Master Plan — v18.B Auth Bootstrap (2026-05-14)

> 로컬 musu-bee 가 musu.pro 와 동일한 Supabase 인증으로 작동하도록 자동화.
> 사용자가 anon key 받아오는 manual step 없이 install.ps1 한 번이면 됨.
>
> 시작 HEAD: `d79c15e` (v18.A retrospective + candidates).

## 0. 문제 진술

현재:
- musu.pro = production 빌드 (Vercel) 가 Supabase anon key 와 함께 빌드되어 로그인 작동.
- 로컬 musu-bee = `.env.local` 부재로 빌드 → middleware 가 무한 redirect to `/login`.
- fresh clone 한 사용자는 Supabase dashboard 가서 key 받아 `.env.local` 채워야 — UX 최악.

목표:
- `install.ps1` 가 자동으로 Supabase 설정 받아옴.
- 로컬 dashboard 가 musu.pro 와 같은 사용자 계정으로 로그인 가능.
- key 가 rotate 되면 `install.ps1` 재실행 한 번으로 sync.

## 0.5 디자인 결정

**source of truth = musu.pro `/api/public-config`**:

```
GET https://musu.pro/api/public-config

→ 200 {
    "supabaseUrl": "https://poyclapxmvulvboiebxq.supabase.co",
    "supabaseAnonKey": "eyJh...",
    "appUrl": "https://musu.pro"
  }
```

- **anon key 는 정의상 public** — 모든 musu.pro 방문자의 브라우저 JS 에 inline 됨.
  endpoint 노출 = 새 위험 0.
- **server-only 값 (SUPABASE_SERVICE_ROLE_KEY, PADDLE_API_KEY, ANTHROPIC_API_KEY) 은 절대 안 노출**.
- caching: `Cache-Control: public, max-age=300` 로 5분.

`install.ps1` 의 새 Step (Step 5.5):

```powershell
$config = Invoke-RestMethod -Uri "https://musu.pro/api/public-config" -TimeoutSec 10
$envLocal = @"
NEXT_PUBLIC_SUPABASE_URL=$($config.supabaseUrl)
NEXT_PUBLIC_SUPABASE_ANON_KEY=$($config.supabaseAnonKey)
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_MUSU_WORKER_URL=http://127.0.0.1:9700
"@
Set-Content -Path "musu-bee\.env.local" -Value $envLocal -Encoding UTF8
```

그 다음 기존 Step 6 (build) 가 그것 inline 해서 정상 build.

## 1. 사이클 구조 — 3 phase

### Phase 1 — `/api/public-config` endpoint + 로컬 검증 (~40분)

**산출물**:
- `musu-bee/src/app/api/public-config/route.ts` 신규.
  - 환경변수에서 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV` 같은 public-prefix 만 모음.
  - 빈 값이면 omit (placeholder 박지 않음).
  - `Cache-Control: public, max-age=300` + CORS 만 GET 허용.
  - **절대 안 포함**: `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`, `ANTHROPIC_API_KEY`, `PADDLE_WEBHOOK_SECRET`. 명시적 allowlist 만.
- pytest 같은 unit test (next route test 패턴):
  - URL 노출 안전 — `SUPABASE_SERVICE_ROLE_KEY` 가 response 에 절대 안 들어감.
  - public env set 됐을 때 response shape.
  - public env 빈 값일 때 200 + 빈 객체 (오류 안 던짐).

**검증**: 로컬 build 후 `curl http://127.0.0.1:3001/api/public-config` 으로 JSON 응답. service_role / paddle_api_key grep 으로 부재 확인.

**detail plan**: `V18B_PHASE1_PUBLIC_CONFIG_ROUTE_2026_05_14.md`

### Phase 2 — install.ps1 fetch + .env.local 생성 (~30분)

**산출물**:
- `scripts/install.ps1` 에 새 Step 5.5: musu-bee build 직전.
  - `Invoke-RestMethod https://musu.pro/api/public-config` (15s timeout).
  - 성공 → `musu-bee/.env.local` 작성 (UTF-8, BOM 없이).
  - 실패 → `Write-Warn` 후 계속 진행 (offline install 도 작동, 단 로그인 안 됨).
  - 이미 `.env.local` 있으면 skip (idempotent) 또는 `-Force` flag 로 강제.
- `.env.local` 가 이미 `.gitignore` 되어 있는지 확인 (commit 방지).
- `MUSU_PUBLIC_CONFIG_URL` env var 로 endpoint override 가능 (테스트용).

**검증**: musu-bee/.venv 와 `.env.local` 삭제 → install.ps1 -Service 재실행 → `.env.local` 자동 생성 → build → curl `/app` 가 200 (auth 통과) 또는 진짜 로그인 페이지 응답.

**detail plan**: `V18B_PHASE2_INSTALL_FETCH_2026_05_14.md`

### Phase 3 — Closure (~15분)

- master plan §5 status + cycle result.
- wiki entry `316_V18B_AUTH_BOOTSTRAP_2026_05_14.md`.
- Phase 3 detail plan + commit.

## 2. 시간 추정

| Phase | 추정 | 누적 |
|---|---|---|
| 1. public-config route | 40분 | 40분 |
| 2. install.ps1 fetch | 30분 | 70분 |
| 3. Closure | 15분 | 85분 |

총 약 1시간 25분. 가벼운 사이클.

## 3. 위험

- **musu.pro 가 응답 안 함**: Phase 2 의 fetch 가 timeout → graceful warn + 계속. 사용자 manual fallback (anon key 직접 입력) 안내.
- **anon key rotation**: 가능. install.ps1 재실행 한 번이면 풀림. `.env.local` 의 `# 자동생성됨, install.ps1 재실행으로 갱신` 헤더 박음.
- **public-config 의 information leak risk**: server-side 변수가 실수로 들어가지 않게 — Phase 1 의 allowlist 가 strict positive list (env 이름 명시).
- **musu.pro 가 아직 새 endpoint 없음**: Phase 1 끝나고 main push → Vercel 자동 deploy → endpoint 살아남. install.ps1 fetch 는 deploy 후에야 작동. 사이클 안에 musu.pro 의 deploy 검증 필요 (`curl https://musu.pro/api/public-config` 200 후 Phase 2 commit).

## 4. 비스코프 (v18.B에 안 함)

- **secret env (SUPABASE_SERVICE_ROLE_KEY, PADDLE_API_KEY 등) 의 배포**: server-side 만 필요. musu-bridge 가 본인 머신에서 사용. 별 사이클 (operator 가 musu.pro 의 organization settings 로 받음).
- **로컬 supabase 프로젝트 옵션**: 사용자가 "musu.pro 안 쓰고 내 supabase 쓰겠다" 케이스. 이번 사이클은 musu.pro 와 동일 환경만.
- **mobile / cross-machine 시나리오**: 사용자 다른 머신에 install.ps1 돌리면 그 머신도 musu.pro 의 같은 supabase 사용 (= 같은 사용자 계정 공유 가능). 이게 의도된 결과.

## 5. Status

- [x] Phase 1 — public-config route + tests (commit `50a3bd7`)
- [x] Phase 2 — install.ps1 fetch + .env.local (commit `b4684ed`)
- [x] Phase 3 — Closure (wiki 316 + master plan + push)

## 6. 사이클 결과 (2026-05-14)

**HEAD**: `d79c15e` → `b4684ed` (+ Phase 3 closure commit) over 2 functional commits.

**산출물**:
- `musu-bee/src/app/api/public-config/route.ts` — strict-allowlist GET endpoint.
  6 cases pass (`node --test src/app/api/public-config/route.test.ts`): happy
  path, secret-leak negative (defense-in-depth assertion that raw secret strings
  appear nowhere in response), omit-unset, all-empty → `{}`, Cache-Control
  `public, max-age=300`, whitespace trim.
- `scripts/install.ps1` Step 5.5 — `Invoke-RestMethod` fetches public-config
  (15s timeout), writes UTF-8-no-BOM `.env.local` with 5 public env keys +
  3 local URL defaults. Three install paths verified end-to-end against a local
  mock HTTP server: graceful failure (dead port → warn + continue, no
  `.env.local`), happy path (10-line `.env.local` written), idempotent skip
  (existing `.env.local` untouched).

**검증된 비스코프**:
- musu.pro deploy 의 Vercel 자동화 — Phase 1 commit `50a3bd7` push 시 Vercel 이
  `/api/public-config` 을 deploy. Phase 3 push 후 `curl https://musu.pro/api/public-config`
  로 응답 200 + 실제 Supabase config 확인.

**다음 사이클 후보**:
- `.env.local` 의 nondestructive refresh 모드 — install.ps1 에 `-RefreshEnv` flag.
- musu-bridge 와 musu-worker 의 동일 bootstrap (`.env.local` 도 fetch 로). 현재는
  install.ps1 의 다른 step 이 직접 채움.
- public-config endpoint 에 server-side rate-limit (Vercel edge middleware) — 현재
  Cache-Control 만 보호.
