# Session: 계정 로그인 = 자동 mesh join (2026-06-18)

**Branch:** `feature/account-auto-mesh-join` (commits `0fbefea8`, `2cb8385e`, `f9545575`, `4f3ddb29` — pushed, NOT merged to main)
**Status:** single-node E2E 완주 + 라이브 검증 완료. 2-machine E2E 미완(실기기 필요).

## 문제 (왜 이 작업을 했나)

사용자가 무수를 2번째 PC에 깔았는데 mesh 연결이 안 됐다. 진단: 1번 PC조차 `private_mesh.toml`이 없어 정식 join이 안 된 상태였고, 합류 자체가 "device-add pass 발급 → 파일 복사 → 2번 PC paste → Join 클릭"의 수동 4~5단계였다. Tailscale/Tesla는 로그인 한 번이면 모든 기기가 자동으로 붙는다 — 이 갭이 V28 thesis("fleet as one device")와 S등급 목표("안 쓸 수 없게")의 정면 위반.

**목표 UX:** `irm musu.pro/install.ps1 | iex` → musu.pro 계정 로그인 → 끝. 같은 계정의 모든 기기가 자동으로 같은 isolated fleet에 합류. pass 복사 없음.

## 구현 (무엇을 만들었나)

### 클라우드 (musu-bee, Vercel = musu-pro 프로젝트)
- **`POST /api/account/mesh-join-key`** (`src/app/api/account/mesh-join-key/route.ts`): CLI 엔드포인트. 단일소유자 control bearer 토큰으로 인증(`authorizeP2pControl`), owner_key로 acct user 도출 → Headscale에 1회용 short-TTL preauthkey 발급 → `{login_server, authkey, tailnet}` 반환. Headscale admin API key는 서버 env only.
- **`src/lib/headscaleProvisioning.ts`**: Headscale v0.28.0 REST 클라이언트. `headscaleUserNameForOwnerKey`(owner_key→`acct-<sha256hex>`), `ensureHeadscaleUser`(멱등), `ensureSelfIsolationPolicy`(file-mode 거부는 정상 처리), `createOneTimePreauthKey`(user=숫자id). 격리=`autogroup:self`(v0.28.0 `acls` 문법).
- **`src/lib/meshJoinRateLimit.ts`**: per-owner mint 한도.

### Rust CLI (musu-rs)
- **`cloud/mod.rs` `request_mesh_join_key()`**: bearer control token으로 mesh-join-key 호출.
- **`install/private_mesh.rs` `JoinAccount` action / `run_join_account`**: load_token → request_mesh_join_key → 기존 `run_join`(login_server+authkey 경로) 재사용. `--dry-run` 지원.
- **`join_tail_args`**: `tailscale up --reset --login-server --authkey` (--reset로 재join 가능).
- **`device_login.rs` `poll_and_finalize`**: register_node 직후 best-effort `auto_join_account_mesh` (soft-fail). CLI/desktop/autostart 모든 로그인 경로가 자동 join.

### Desktop
- **`src-tauri/src/lib.rs` `private_mesh_join_account`** Tauri command + cockpit 자동 재연결.

## 인프라 (라이브)

- **VPS** `158.247.209.227` (`mesh.musu.pro`), `/opt/musu-mesh/docker-compose.yaml`:
  - headscale v0.28.0 (policy.mode=**file**, `policy.json`=autogroup:self 격리)
  - caddy (mesh.musu.pro→headscale, kv.musu.pro→srh)
  - **redis + serverless-redis-http(SRH)** = `@vercel/kv` 호환 self-contained KV (device-flow 저장소; 외부 SaaS 0)
  - DERP 3478/udp
- **Vercel env (production)** — 모두 REST API로 설정(⚠️ `vercel env add` 파이프=빈값 버그): HEADSCALE_API_URL/LOGIN_SERVER/API_KEY, KV_REST_API_URL(=kv.musu.pro)/TOKEN(=SRH), MUSU_P2P_CONTROL_TOKEN(+SHA256S), MUSU_DEVICE_APPROVER_USER_IDS.

## 작업 중 잡은 버그 5개 (연쇄 — 다 라이브 검증)

1. **누락 env들** (KV/allowlist/device-approver) — `vercel env add` stdin 파이프가 빈 문자열로 저장. → REST API로 설정.
2. **raw 토큰 503** (`p2p_control_token_not_issuable`) — `MUSU_P2P_CONTROL_TOKEN`(raw) 미설정. device approve까지 됐는데 consume이 토큰 발급 불가. → raw 생성 + sha256 allowlist 정합.
3. **same-origin 403** (`cross_origin_rejected`) — mesh-join-key를 브라우저(쿠키+same-origin) 패턴으로 짰으나 실제 호출자는 CLI(control token). → `authorizeP2pControl` bearer 인증으로 전환.
4. **policy PUT 500** (`update is disabled for modes other than 'database'`) — file-mode 컨트롤플레인은 PUT 거부. 정책은 파일로 이미 적용됨. → file-mode 거부를 soft-fail.
5. **tailscale --reset 누락** — 이미 tailnet 연결된 호스트 재join 거부. → `--reset` 추가.

## 검증 결과 (single-node, 라이브)

`musu mesh join-account --json` (이 PC):
```
mode: musu_headscale, device_add_pass_used: false, control_server_verified: true,
command.exit_code: 0, local_tailnet_ip: 100.64.0.2, private_mesh.toml 생성됨
```
서버 측: Headscale users에 `acct-f7e76...`(id=2) 생성, nodes에 새 노드가 그 acct user 소속(`100.64.0.2`)으로 합류 (baseline `musu`/`win-node-a`에서 정확히 변화). **device-add pass 0회.**

테스트: route 9 + provisioning 14 + rate-limit 4 (TS) 모두 green; musu-rs join_tail_args 테스트 --reset 반영; tsc/cargo clean.

## 미완 / 다음 단계

1. **2-machine E2E** (실기기 2대 필요): 2번째 PC에서 같은 계정 로그인 → 같은 `acct-*` fleet 자동 합류 → 두 노드 ping(`musu mesh verify`) → **격리 검증**(다른 계정 노드는 도달 불가, autogroup:self). 이게 사용자 원래 문제("딴 컴터 연결")의 진짜 종결이자 V28 thesis 증명.
2. **main 머지** (현재 feature 브랜치).
3. **online=false 추적**: join 직후 노드 online=false (핸드셰이크 전). 잠시 후 online 되는지 확인 권장.
4. **legacy `musu` user**: 기존 win-node-a가 legacy user 소속. autogroup:self가 acct-* 와 격리하나, 정리(노드를 acct user로 이전) 여부 결정 필요.

## 관련 메모리
- `reference-musu-mesh-cloud-infra` — VPS 구조 + env 함정
- `reference-skill-guard` — 별개(스킬 보안), 이번 세션 부산물
