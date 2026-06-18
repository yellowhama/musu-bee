# WS-1a — step3 레이아웃 재배치 세부 플랜 (2026-06-18)

**Master:** `COCKPIT_REDESIGN_MASTER_PLAN_2026_06_18.md` WS-1a. **Scope:** shell-only (index.html/main.js/styles.css). **근거:** Explore grounding(file:line).

## 목표 (스펙 D1/D3 + Critic HIGH-2/HIGH-3)

3개 분리 블록(fleet 관리 위 / 빈 중앙 / order 아래) → **단일 세로 컬럼 3존**: fleet status strip(얇게) → 활동 스트림 본체 → order composer(hero 하단). `#task-feed`(현재 맨 밑)를 본체로, `.order-box`를 hero로.

## 핵심 설계 결정: DOM 물리 이동 대신 CSS `order` + 단일 arbiter

Critic HIGH-2: `#fleet-section` 안 13형제 + 얽힌 visibility = DOM 재정렬 위험(이벤트 리스너/쿼리/visibility 로직 다 깨질 수 있음). **비파괴적 접근**:
- `#fleet-section`을 `display:flex; flex-direction:column`으로, 각 존에 **CSS `order`** 부여 → DOM은 그대로, *시각 순서*만 재배치. 이벤트/쿼리/기존 visibility 로직 전부 보존.
- 본체 zone 점유 충돌(Critic HIGH-3: fleet-empty vs task-feed)은 **단일 arbiter 함수** `updateBodyZone()`로 해소.

### CSS order 배치
| 존 | 요소 | order |
|----|------|-------|
| 1 status strip | `.section-head` + `#fleet-filters` + `#mesh-proof-strip` | 0 |
| 1 fleet list | `#fleet-list` + `#fleet-filter-empty` | 10 |
| 2 본체 | `#fleet-empty` (0task) / `#task-feed` (≥1 task) — arbiter가 택1 | 20 |
| 2 보조 | `#first-task-aha` | 21 |
| 3 hero | `#order-examples` + `.order-box` | 30 |
| (낮은 우선) | `#connector-policy` | 40 |
| (관리) | `#add-pc-panel`, `#release-evidence-strip` | 50 |

order-box가 본체 *아래* hero(하단 고정 느낌), task-feed가 그 위 본체.

### render-order arbiter (Critic HIGH-3 해소)
신규 `updateBodyZone()` — 본체 zone 점유를 단일 결정. 현재 3개 분리 predicate(`lastFleetIsEmpty&&filter==all` / `isEmpty&&!firstTaskDone` / task-card count)를 하나로 통합:

```
function updateBodyZone() {
  const hasTasks = (#task-feed의 running/done 카드 수) > 0;
  // 본체: 태스크 있으면 task-feed, 없으면 fleet-empty (둘 다 동시 표시 금지)
  #task-feed.hidden = !hasTasks;
  #fleet-empty.hidden = hasTasks || !(lastFleetIsEmpty && fleetFilter==="all");
  // connector-policy: 빈 본체(태스크0)일 때만 접힘
  #connector-policy.hidden = !hasTasks && !onboardingFlag("firstTaskDone");
}
```
- `refreshGroupVisibility`(task-feed 표시)와 `renderFleet`(fleet-empty 표시)가 **각자 끝에 `updateBodyZone()` 호출** → 단일 진실. 4상태 계약:

| 상태 | 본체 | order-box | connector-policy |
|------|------|-----------|------------------|
| 0task+1machine | fleet-empty(CTA+칩) | hero 표시 | 접힘 |
| 0task+0machine | fleet-empty(다른카피) | hero 표시 | 접힘 |
| running task | task-feed | hero 표시 | 표시 |
| done task | task-feed(done) | hero 표시 | 표시 |

## 구현 단계
1. styles.css: `#fleet-section` flex-column + 각 요소 `order`. (시각만, 비파괴)
2. main.js: `updateBodyZone()` 신규 + `renderFleet`/`refreshGroupVisibility` 끝에서 호출. 기존 분리 predicate 제거(중복 방지).
3. cockpit-contract.test.ts: 4상태 arbiter 단위 테스트(task 0→fleet-empty 본체, task≥1→task-feed 본체, 동시표시 금지).
4. 빌드 + browse 4상태 시각 + 실설치 1상태(0task+1machine = 트리거 화면).

## 위험
- CSS order가 키보드 탭 순서와 어긋날 수 있음(order는 시각만, tab은 DOM 순서) → 본체/hero는 DOM 순서도 자연스러우므로 영향 적으나 검증 필요.
- `updateBodyZone` 도입 시 기존 fleet-empty/connector-policy hide 코드 제거 — 누락하면 이중 제어. 시각 4상태로 확인.
- step1 토큰의 이동 zone spacing은 이 단계 후 polish(마스터 순서대로).

## 검증 후 Critic
구현 후 frontend-architect Critic(arbiter 4상태 정확성 + CSS order 회귀).
