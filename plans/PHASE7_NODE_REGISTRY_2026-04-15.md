# Phase 7 — musu.pro Node Registry

> 작성: 2026-04-15 | 범위: musu.pro 중앙 레지스트리 + musu-bridge 하트비트 + musu-bee NodePanel 클라우드 노드

---

## 왜 이 플랜인가

Phase 6에서 HTTP 페어링은 구현됐지만 **IP를 직접 입력**해야 함.
musu.pro에 이미 계정 시스템(Supabase)이 있으므로, 거기에 노드 레지스트리를 붙이면:
- IP 몰라도 됨 — musu.pro가 주소록 역할
- 로그인 계정 하나로 내 모든 노드 관리
- musu-bridge 시작 시 자동 등록, musu-bee NodePanel에 클릭 한 번으로 페어링

---

## 아키텍처

```
musu.pro (Supabase)
  node_tokens 테이블  ←── Account 페이지: "토큰 발급" 버튼
  nodes 테이블        ←── musu-bridge: POST /api/v1/nodes/register (30s 하트비트)
                      ──→ musu-bee NodePanel: GET /api/v1/nodes?Bearer token

musu-bee (로컬)
  "My Nodes" 목록 ← musu.pro 레지스트리
  클릭 한 번 → 기존 /api/nodes/pair 호출 (IP는 registry에서 자동으로)
  수동 IP 폼: fallback으로 유지

musu-bridge (로컬)
  registry.py: 30s마다 heartbeat → musu.pro
  MUSU_TOKEN env var로 인증
```

**핵심 원칙**: musu.pro는 수동적인 주소록(address book)만 함. 실제 P2P 연결은 기존 musu-bridge 간 HTTP 직접 통신 그대로.

---

## Phase 7A — musu.pro 백엔드

### 7A-1: Supabase 마이그레이션

**신규 파일**: `docs/migrations/007_node_registry.sql`

```sql
-- 유저당 장기 API 토큰
CREATE TABLE node_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,  -- 48-char hex
  name         text NOT NULL DEFAULT 'default',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE node_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON node_tokens FOR ALL USING (auth.uid() = user_id);

-- 노드 등록 (하트비트로 upsert)
CREATE TABLE nodes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_name    text NOT NULL,
  public_url   text NOT NULL,
  last_seen    timestamptz NOT NULL DEFAULT now(),
  meta         jsonb DEFAULT '{}',
  UNIQUE(user_id, node_name)
);
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON nodes FOR SELECT USING (auth.uid() = user_id);
-- nodes 쓰기는 API route에서 service-role key로만 (anon 직접 접근 불가)
```

### 7A-2: 타입 파일

**신규**: `src/lib/types/node.ts` — `NodeToken`, `Node` 인터페이스

### 7A-3: Service-role Supabase 클라이언트

**신규**: `src/lib/supabase/service.ts`
- `@supabase/supabase-js` (not `@supabase/ssr`)로 service-role 클라이언트 생성
- `SUPABASE_SERVICE_ROLE_KEY` env var 필요

### 7A-4: node_tokens 레포지토리

**신규**: `src/lib/db/repositories/node_tokens.repo.ts`
- `generateToken(userId, name?)` — 48-char hex, INSERT, 반환
- `findByToken(token)` — API route 인증에 사용
- `listByUser(userId)` — Account 페이지용
- `deleteToken(id, userId)`

### 7A-5: nodes 레포지토리

**신규**: `src/lib/db/repositories/nodes.repo.ts` (service-role 클라이언트 사용)
- `upsertNode(userId, nodeName, publicUrl, meta?)` — ON CONFLICT DO UPDATE
- `listByUser(userId)` — last_seen DESC 정렬

### 7A-6: nodes 서비스

**신규**: `src/lib/services/nodes.service.ts`
- `registerNode(token, nodeName, publicUrl, meta?)` — token → user_id 조회 후 upsert
- `listNodes(token)` — token → user_id → nodes 목록
- `generateToken(ctx, name?)` — Account 페이지 서버 액션용
- `listTokens(ctx)`, `deleteToken(ctx, id)`

### 7A-7: API 라우트

**신규**: `src/app/api/v1/nodes/route.ts`
```
GET /api/v1/nodes
Header: Authorization: Bearer <MUSU_TOKEN>
Returns: Node[]
```

**신규**: `src/app/api/v1/nodes/register/route.ts`
```
POST /api/v1/nodes/register
Header: Authorization: Bearer <MUSU_TOKEN>
Body: { node_name, public_url, meta? }
Returns: { id, node_name, public_url, last_seen }
```

### 7A-8: Account 페이지 — 토큰 UI

**수정**: `src/app/account/page.tsx` — "Node Tokens" 섹션 추가
**수정**: `src/app/account/actions.ts` — `generateNodeTokenAction`, `deleteNodeTokenAction`

- 토큰 목록 표시 (마스킹, last 8자만)
- "Generate Token" 버튼 → 생성 직후 **한 번만** 전체 토큰 공개 (one-time reveal banner)
- 각 토큰에 revoke 버튼

---

## Phase 7B — musu-bridge 하트비트

### 7B-1: 신규 파일 `registry.py`

```python
async def heartbeat_loop(token, node_name, public_url, interval=30):
    """30s마다 musu.pro에 POST /api/v1/nodes/register. 에러 시 로그만 남기고 재시도."""
    while True:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    REGISTRY_URL,
                    json={"node_name": node_name, "public_url": public_url},
                    headers={"Authorization": f"Bearer {token}"},
                )
                # log ok / warning
        except httpx.ConnectError:
            logger.warning("registry: cannot reach musu.pro — will retry")
        await asyncio.sleep(interval)
```

### 7B-2: `server.py` lifespan 수정

MUSU_TOKEN 있으면 `heartbeat_loop` asyncio task 시작.

### 7B-3: `config.py` 수정

`musu_token`, `node_name` 필드 추가.

### 7B-4: `.env.example` 업데이트

```bash
# MUSU_TOKEN=            # musu.pro Account → Node Tokens에서 발급
# MUSU_NODE_NAME=        # 기본값: hostname
# MUSU_REGISTRY_URL=     # 기본값: https://musu.pro (로컬 dev: http://localhost:3000)
```

---

## Phase 7C — musu-bee NodePanel 업데이트

### 7C-1: 신규 프록시 라우트

**신규**: `src/app/api/registry/route.ts`
- `MUSU_TOKEN` (server-side only, `NEXT_PUBLIC_` 없음)으로 `GET musu.pro/api/v1/nodes` 호출
- `{ nodes: [], token_configured: false }` 반환 (토큰 없으면 graceful degradation)

### 7C-2: NodePanel.tsx 수정

**레이아웃 변경**:
1. **"My Nodes" 섹션** (`token_configured === true`일 때만 표시)
   - musu.pro 레지스트리 노드 목록
   - last_seen > 90s → 회색 dot (stale)
   - 이미 페어링된 노드 → "Connected" 배지
   - "Pair" 버튼 → 기존 `/api/nodes/pair` 호출 (IP는 registry에서 자동 추출)
2. **수동 IP 폼**: 그대로 유지, `token_configured`이면 "Manual IP" 레이블로 변경
3. `token_configured === false`이면 Phase 6 그대로 동작

---

## Phase 7D — E2E 검증

```
[ ] Supabase 마이그레이션 적용
[ ] musu.pro dev 서버 시작
[ ] Account 페이지에서 토큰 발급, 복사
[ ] MUSU_TOKEN 설정 후 musu-bridge 시작 → "heartbeat ok" 로그 확인
[ ] Supabase Table Editor에서 nodes 테이블 row 확인
[ ] curl GET /api/v1/nodes → 노드 목록 반환 확인
[ ] musu-bee .env.local에 MUSU_TOKEN 추가 → NodePanel "My Nodes" 섹션 표시
[ ] "Pair" 클릭 → 기존 HTTP 페어링 성공
[ ] 토큰 없을 때 → Phase 6 IP 폼 그대로 동작 확인
```

---

## 파일 변경 요약

### musu.pro (`/mnt/f/Aisaak/Projects/vibecode-town/`)
| 파일 | 변경 | 내용 |
|------|------|------|
| `docs/migrations/007_node_registry.sql` | 신규 | node_tokens + nodes 테이블 |
| `src/lib/types/node.ts` | 신규 | NodeToken, Node 타입 |
| `src/lib/supabase/service.ts` | 신규 | service-role 클라이언트 |
| `src/lib/db/repositories/node_tokens.repo.ts` | 신규 | 토큰 CRUD |
| `src/lib/db/repositories/nodes.repo.ts` | 신규 | 노드 upsert/list |
| `src/lib/services/nodes.service.ts` | 신규 | 비즈니스 로직 |
| `src/app/api/v1/nodes/route.ts` | 신규 | GET /api/v1/nodes |
| `src/app/api/v1/nodes/register/route.ts` | 신규 | POST /api/v1/nodes/register |
| `src/app/account/page.tsx` | 수정 | Node Tokens 섹션 추가 |
| `src/app/account/actions.ts` | 수정 | 토큰 생성/삭제 액션 |

### musu-bridge (`/home/hugh51/musu-functions/musu-bridge/`)
| 파일 | 변경 | 내용 |
|------|------|------|
| `registry.py` | 신규 | heartbeat_loop asyncio task |
| `server.py` | 수정 | lifespan에 heartbeat 시작 |
| `config.py` | 수정 | musu_token, node_name 필드 |
| `.env.example` | 수정 | 새 env var 문서화 |

### musu-bee (`/home/hugh51/musu-functions/musu-bee/`)
| 파일 | 변경 | 내용 |
|------|------|------|
| `src/app/api/registry/route.ts` | 신규 | musu.pro 프록시 |
| `src/components/NodePanel.tsx` | 수정 | "My Nodes" 클라우드 섹션 |
| `.env.local.example` | 수정 | MUSU_TOKEN 등 문서화 |

---

## 환경변수 요약

### musu.pro `.env.local`
```bash
SUPABASE_SERVICE_ROLE_KEY=<Supabase 대시보드 → Project Settings → API>
```

### musu-bridge
```bash
MUSU_TOKEN=<musu.pro Account에서 발급>
MUSU_BRIDGE_PUBLIC_URL=http://100.x.x.x:8070
MUSU_NODE_NAME=second-pc           # optional
MUSU_REGISTRY_URL=https://musu.pro # optional
```

### musu-bee
```bash
MUSU_TOKEN=<같은 토큰 또는 별도 토큰>
MUSU_REGISTRY_URL=https://musu.pro # optional
```

---

## 투두

```
[ ] 7A-1: Supabase 마이그레이션 SQL 작성
[ ] 7A-2: src/lib/types/node.ts
[ ] 7A-3: src/lib/supabase/service.ts (service-role 클라이언트)
[ ] 7A-4: node_tokens.repo.ts
[ ] 7A-5: nodes.repo.ts
[ ] 7A-6: nodes.service.ts
[ ] 7A-7: API 라우트 2개 (GET /nodes, POST /nodes/register)
[ ] 7A-8: Account 페이지 토큰 UI
[ ] 7B-1: musu-bridge registry.py
[ ] 7B-2: server.py lifespan 수정
[ ] 7B-3: config.py 수정
[ ] 7B-4: .env.example 업데이트
[ ] 7C-1: musu-bee /api/registry 프록시
[ ] 7C-2: NodePanel.tsx "My Nodes" 섹션
[ ] 7D: E2E 검증 + commit
```
