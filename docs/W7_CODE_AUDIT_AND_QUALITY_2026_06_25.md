# W-7 코드 감사 + 정성 평가 보고서 (2026-06-25)

> 대상: W-7 M1 lease-node 바인딩 가드 (PR #27, main `ecf90c64`)
> 방식: agent-team 병렬 2-fork — quality-engineer 코드 감사 + Explore 스펙 정합성
> 기준 커밋: `F:\workspace\musu-bee` main HEAD `ecf90c64` (W-7 머지 확인됨)
> ⚠️ 실제 package root = `musu-bee/musu-bee/` (toplevel 한 단계 안쪽, package.json 위치)

---

## 1. 정성 평가 (요약)

| 축 | 평가 | 근거 |
|----|------|------|
| **정확성** | ✅ 높음 | M1 가드가 의도대로 동작. 13/13 테스트 + tsc 0 에러. 소유자 격리 전 경로 강제. |
| **보안** | ✅ SHIP-CLEAN | HIGH/MEDIUM 0건. owner_key 격리·auth 순서·에러 위생 전부 통과. |
| **설계 정직성** | ✅ 모범 | Critic이 "ALREADY_CLOSED" 판정 시 억지 화이트박스 테스트 안 만들고 트립와이어+블랙박스 회귀로 처리(무당짓 회피). |
| **문서화** | ✅ 충분 | W-7 plan doc closure가 Phase -1 RED·M1·재오픈 트리거까지 완전 기록. musubrain 인덱싱 완료. |
| **YAGNI 정합** | ✅ | 전면 per-node PKI(Opt-B)는 Phase -1 RED로 빌드 안 함. 새 primitive 0, 스키마 무변경. |

**종합 판정: SHIP-CLEAN.** 수정 필요 항목 없음. 선택적 코스메틱 1건(아래 INFO-1).

---

## 2. 코드 감사 (quality-engineer fork)

**스코프**: relay payload 라우트 + lease store + control auth + payload store + KV 스크립트 + 테스트.

### 발견 (전부 INFO — HIGH/MEDIUM 0)

- **INFO-0 (확인) — M1 가드는 현재 도달 불가능, 타당한 트립와이어.**
  `route.ts:119-126`가 `queryRelayLeases`에 body의 source/target을 필터 술어로 넘김 → `p2pRelayLeaseStore.ts:290-295`가 `.find()` 전에 엄격 동일성 필터 적용. 따라서 불일치 쌍 lease는 후보에서 빠져 `matchedLease`로 존재 불가 → `route.ts:160-163` 단언은 도달 불가능. **W-7 "ALREADY_CLOSED" 주장 정확.** 가치 = refactor 트립와이어(향후 query 필터 누락/zod 완화 시 same-account injection 재차단) + 회귀 테스트(`route.test.ts:783-829`).

- **INFO — 소유자 격리, 모든 경로 견고.**
  POST 저장(`route.ts:184`), GET 조회(`route.ts:249`), claim(`route.ts:315` + Lua `matches()` `p2pRelayPayloadStore.ts:156-158`), delivery(Lua deliver gate `:218`). 파일 백엔드 등가물도 동일(`:573-575`, `:773-775`). **cross-owner 읽기/변경 경로 없음.**

- **INFO — auth 순서 정확, principal은 owner_key만.**
  POST/GET/PATCH 모두 `authorizeP2pControl(req)` 먼저, 실패 시 `req.json()`·store 호출 전 조기 반환(`route.ts:89-92, 239-242, 283-286`). `P2pControlPrincipal = { owner_key }`만(`p2pControlAuth.ts:27-29`). 토큰 비교 `timingSafeEqual`+길이 사전검사(`:45-52, 88-95`). per-node 신원 없음 = W-7 RED 정합.

- **INFO-1 (선택 폴리시) — `.passthrough()`는 store 침투 불가, 단 불필요.**
  3개 zod 스키마가 `.passthrough()`(`route.ts:33, 45, 51`) 쓰나, 어느 핸들러도 `parsed.data`를 store에 spread 안 함. `createRelayPayload`는 명시 allow-list 필드만 복사(`route.ts:180-193` + `p2pRelayPayloadStore.ts:507-535`). 잉여 키 자동 폐기. **무해하나 `.passthrough()` 제거/`.strip()`이 trust-boundary 의도에 더 부합.** 블로커 아님 — 후속 코스메틱.

- **INFO — 에러 응답 누출 없음.** catch 블록은 고정 문자열 또는 `error.message`만, `error.stack`·`owner_key`·토큰 절대 노출 안 함. `publicPayload`가 `owner_key`(+ 요청 안 한 `payload_base64`) strip(`route.ts:68-77`), 테스트 검증(`route.test.ts:346, 371, 435, 557`).

- **INFO — TOCTOU: claim/deliver 원자적.** KV claim/deliver는 단일 Lua `EVAL`(`p2pRelayPayloadStore.ts:133-200, 202-238`) = Redis 원자 실행. 동시-claim 테스트가 둘 중 하나만 이김 확인(`route.test.ts:700-747`). 파일 백엔드는 `withLocalLock` 직렬화. `pattern-toctou-atomic-update` 메모리 정합. (POST의 lease조회→저장은 비원자이나, 경쟁적 lease 만료 시 결과는 곧 TTL로 자가 만료 — 격리/정확성 위반 없음.)

### 검증 결과
- `tsc --noEmit`: **clean, exit 0** (package root `musu-bee/musu-bee/`에서 실행).
- `npx tsx --test .../route.test.ts`: **13 passed / 0 failed / 0 skipped** (~9.2s). M1 mismatch(source/target), owner-scoping, auth 거부, 원자 동시-claim, hash mismatch 포함.

---

## 3. 스펙 정합성 (Explore fork)

**핵심 결론: 살아있는(canonical living) P2P/relay 스펙은 존재하지 않는다.**

| 문서 | 종류 | live 라우트 보안모델 기록? | W-7 M1 기록? |
|------|------|--------------------------|--------------|
| `W7_..._PLAN_2026_06_21.md` | plan/design (점시점) | ✅ 정확 (gap+lease lookup) | **✅ 완전** (closure L9-27, 에러코드 L18) |
| `MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md` | RC1 evidence-trail (366 dated markers) | ⚠️ live 라우트를 "non-release preview queue"로 분류만 | ❌ |
| `P2P_CONTROL_PLANE.md` | RC1 evidence (88 markers) | ❌ legacy preflight만 앎 | ❌ |
| `MASTER_PLAN_V28_...md` | 전략 master plan | ❌ relay v1 OUT | ❌ |

- `relay_payload_lease_node_mismatch`는 **non-evidence 문서 중 W-7 plan doc 단 1곳에만** 존재.
- **권고: W-7 plan doc closure를 system of record로 유지.** dated evidence 문서에 live 라우트 불변식을 욱여넣는 건 안티패턴(유지 안 되는 진실 원천 오염). 추가 스펙 편집 안 함 = 최저위험.

---

## 4. 액션 결과

- ✅ **인덱싱**: W-7 plan doc(`src_ba85119838f637f5`) + WSU_FOLLOWUPS musubrain ingest+process. hybrid recall 최상위 검증.
- ✅ **스펙 반영**: W-7 closure가 정식 system of record (추가 문서 편집 불요 — 정합성 fork 권고).
- ✅ **감사**: SHIP-CLEAN, HIGH/MEDIUM 0.
- ⬜ **후속(선택)**: INFO-1 `.passthrough()` → `.strip()` 코스메틱 정리(블로커 아님, 다음 relay 작업 시 묶음).
