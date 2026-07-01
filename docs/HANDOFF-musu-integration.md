# 핸드오프: 무수 브레인 → 무수비(musu) 통합

> MUSU-BEE local copy note (2026-07-01):
> 원본은 `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`다. 이 파일은
> musu-bee 작업자가 같은 repo 안에서 바로 찾을 수 있도록 복사한 로컬 참조다.
> 원본 handoff는 standalone brain 기본값으로 `~/.musubrain`을 설명하지만,
> MUSU 데스크탑 제품 계약은 `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`와
> `docs/CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`가 우선한다:
> product root는 `~/.musu/brain`, sidecar는 MSIX `fullTrustProcess` 선언 포함,
> 데이터 루트는 MSIX LocalState 밖이다.

대상: 무수비(musu-bee / musu 데스크탑)를 만드는 코덱스(또는 다음 작업자).
목적: (1) 이 무수 브레인이 **무엇이고 어떻게 만들어졌는가** (2) 무수비에 **어떻게 넣으면 좋은가**.
작성: 2026-06-30. 무수 브레인 repo = `F:\musu_2nd_brain` (github.com/yellowhama/musu-brain, 현재 private).

---

## Part 1 — 무수 브레인이란 무엇인가

### 한 줄
**자기가 뭘 알고 뭘 잊어야 하는지 아는, 디스크에서 영원히 도는 AI의 장기 기억.** SaaS 없고(self-contained), 쌓기만 하지 않고(자동 폐기), 썩는 걸 스스로 정리한다.

### 정체성 (musu 스택에서의 위치)
- musu **단계 3 지식 레이어** (메모리 `decision-musu-3tier-thesis`: 묶고/굴리고/발전한다 중 3단계).
- 통합 모델 = **메인보드 + 칩** (메모리 `decision-musu-brain-integration-motherboard-chip`): brain은 Go 단일 바이너리("칩"), musu가 데이터·lifecycle·UX를 묶는 "메인보드". 완제품 1대지 "부품 따로 사서 합치세요"가 아님.
- AI Context Stack = **OKF(지식) + MCP(접근)** (메모리 `decision-musubrain-okf-mcp-stack`): 라이벌 아니라 양쪽 다 확보.

### 기술 스택 (제약 = musu와 동일)
- **순수 Go 단일 바이너리** (~40k LOC, 29 패키지). modernc.org/sqlite(CGO 없음) + FTS5 내장. ★go.mod require = 단 1개★.
- **self-contained**: 필수 SaaS 의존 0. 인터넷 끊겨도 동작. (메모리 `feedback-self-contained-product`: 구독료 프로그램 의존 금지지, OSS/웹크롤은 OK.)
- **no-Python** (product 코드). Node mjs는 클라 스크립트로만 허용.
- **제품/유저데이터 철저 분리**: 제품 코드는 push, 유저 노트(journal/crm/wiki)는 절대 push 안 함.

### 핵심 구조 (데이터 레이아웃)
```
~/.musubrain/                          ← 데이터 루트 (repo 밖, env MUSUBRAIN_ROOT)
  workspaces/{tenant}/{workspace}/
    raw/         ← 수집/ingest된 원본 markdown
    wiki/sources/{id}.md   ← distill된 지식 노트 (제품 생성)
    journal/, crm/         ← 유저 저작 (절대 안 건드림)
    logs/        ← collect_state.json, search_misses.json (텔레메트리)
    config/collect-sources.txt  ← 자동수집 소스 등록 (한 줄당 1소스)
    quarantine/  ← 품질게이트 거부 raw (삭제 아님, reversible)
```
런타임 해석은 **단일 resolver** `workspace.ResolveRuntime()`: env-first(`MUSUBRAIN_BIN/ROOT/TENANT/WORKSPACE`) + PII-clean 기본값(`os.Executable()` / `$HOME/.musubrain` / `default` / `brain`).

### 핵심 기능 (CLI 서브커맨드)
`init | ingest | clip | process | query | answer | journal | crm | client | index | eval | workspace | auth | server | canary | doctor | automation | daily | lifecycle | learn | health | agent | distill-review | update | print-config | collect`

흐름: **ingest(원본) → process(distill→wiki+FTS5 index) → query/answer(회상) → learn/lifecycle(자가발전)**.

### 자가발전 루프 (musu의 "발전한다" = brain의 차별점)
- **importance counter**: 회상될 때마다 hit_count +1, 안 불리면 매 틱 0.99 decay → 안 쓰는 지식 0으로 fade.
- **3-signal 랭킹**: relevance × recency × importance.
- **failure note**: 실패 패턴 자동 캡처(근본원인 날조 안 함).
- **lifecycle archive**: stale+hit0+non-core 자동 아카이브(core-fact 보호, reversible).
- **자동수집(2026-06-30 추가)**: OSS 크롤러(musu-crawl)를 사이드카로 꾸준히 긁어다 누적. ★욕조 모델: 배수구(폐기)를 수집보다 먼저★.

---

## Part 2 — 어떻게 만들어졌는가 (설계 결정의 근거)

코덱스가 무수비에 통합할 때 "왜 이렇게 됐나"를 알아야 잘못 건드리지 않으므로 핵심 결정과 그 근거를 남긴다.

### 4대 설계 기준 (모든 신규 기능의 검증 축, 메모리 `decision-musubrain-4-design-criteria`)
1. **지속가능**: 1년 2년 꾸준히, self-contained라 안 멈춤.
2. **운영가능**: 상태를 보고 손볼 수 있어야(health/doctor). 블랙박스 금지.
3. **직관적**: "이 주제 수집해줘" 한 마디. 복잡 설정 금지.
4. **★쌓기만 하면 다냐(accumulation ≠ value)★**: 가장 무거운 축. 쌓인 걸 인사이트로 안 바꾸면 noise 무덤. 1·2·3 다 돼도 4가 약하면 시스템이 noise로 붕괴(Meadows 욕조 모델: inflow만 키우면 신호대잡음 단조감소).

### 오픈소스 공개배포 작업 (메모리 `decision-musubrain-oss-release`)
- 단일 런타임 resolver(G2), owner-PII doctor 게이트, print-config(남의 config 자동편집 금지, paste 스니펫만), README/MIT/CONTRIBUTING.
- Go 모듈 개명 `musubrain` → `github.com/yellowhama/musu-brain`.
- ★레포 아직 private. 공개 전환은 별개 사용자 게이트(비가역). 코드/데이터 PII 0, 커밋메시지에만 잔존★.

### 자동수집 마스터플랜 (메모리 `decision-musubrain-autocollect-master-plan`, 2026-06-30)
- thesis: "1년 2년 누적분 위에서 회상 품질이 단조 증가하는 엔진."
- 4축: WS-1 회상품질 측정 → WS-2 배수구(dedup/품질게이트/age-drain) → WS-3 수집(crawl-ai 사이드카) → WS-4 운영가능성.
- crawl-ai(`F:\Aisaak\Projects\musu-crawl-ai`, 순수 Go) = **exec 사이드카로만** 붙임(import 안 함 → bleve를 brain go.mod에 안 들임). 미설치 시 graceful degrade.

### doctor 8게이트 (품질 = vibe 아니라 게이트)
protected /v1 routes / workspace path mutation / maintainability(파일 400줄) / docs sync(코드 변경시 spec+wiki+code-index 강제) / dependency justification(새 require 정당화) / evidence fixtures / **owner PII absence** / gofmt. 매 커밋 강제.

---

## Part 3 — 무수비(musu)에 어떻게 넣으면 좋은가

### 통합 원칙 (메인보드+칩, 메모리 `decision-musu-brain-integration-motherboard-chip`)
brain은 **Go 바이너리 그대로(칩)**. musu가 묶는 것(메인보드):
1. **데이터** = `~/.musubrain/brain` (MSIX 패키지 밖, 유저 데이터). musu 설치가 이 루트를 잡아줌.
2. **lifecycle** = brain 바이너리를 Tauri **사이드카**로 spawn/관리(musu 데스크탑이 켜질 때 brain server 또는 on-demand CLI).
3. **UX** = musu cockpit에서 recall 노출(brain_query/brain_health 결과를 보여줌).

### 연결 방법: MCP (이미 reachable, 권장 1순위)
brain은 **MCP 서버 mcp-server.mjs**(Node, 7툴: brain_ingest/brain_query/brain_health 등)를 갖고 있음. 이게 Claude/Codex/Gemini가 brain을 읽고 쓰는 표준 경로.
- musu가 AI 레인(Claude CLI 등)을 띄울 때 brain MCP를 등록하면 끝.
- ★등록은 자동편집 금지(print-don't-write 원칙)★ — `musu-brain print-config <claude|codex|gemini>`가 paste 스니펫을 stdout에 출력. musu installer/cockpit이 이 스니펫을 사용자에게 보여주거나, 사용자 동의 하에 적용.
- `mcp-server.mjs` 경로 = `runtimeAssetRoot(BIN)/mcp-server.mjs` (BIN 디렉토리 기준, ROOT 아님 — 주의).

### 연결 방법: CLI/HTTP (직접 제어가 필요할 때)
- CLI: `musu-brain <cmd> -tenant <t> -workspace <w> -root <r>`. musu가 직접 spawn해서 ingest/query/health.
- HTTP: `musu-brain server -automation-interval <dur>`로 띄우면 `/v1/sources`, `/v1/clips`, health 등. 자동수집 스케줄러도 이 server 틱에서 돔.

### 자동수집을 무수비에서 켜기 (1년 2년 누적)
1. musu가 워크스페이스 `config/collect-sources.txt`에 소스 한 줄씩 등록(UX로 노출하면 좋음): `web https://... 24h`.
2. `musu-brain server -automation-interval 1h`로 스케줄 → 무수비가 켜져있는 동안 꾸준히 수집·누적·자가발전.
3. crawl-ai(`musu-crawl`)가 PATH에 있어야 실수집. ★없으면 graceful degrade(코어 동작)★ — musu installer가 crawl-ai를 같이 깔아주면 완전체.
4. `musu-brain health -json`의 `collect_sources`로 수집 상태(어떤 소스 성공/실패) 노출 → musu cockpit에 표시.

### ★주의 (musu 통합 시 깨지 말 것)★
- **데이터 루트는 MSIX 밖.** `~/.musubrain` (또는 `MUSUBRAIN_ROOT`)는 유저 데이터라 패키지 안에 넣으면 안 됨. musu 재설치/업데이트에도 보존돼야 함.
- **유저 노트(journal/crm) 절대 push/외부전송 금지.** brain은 이미 제품/유저 분리 enforce하나, musu가 brain 데이터를 어디 동기화할 때 이 경계 지켜야 함.
- **self-contained 유지.** musu가 brain에 SaaS 의존(유료 API 필수)을 주입하면 안 됨. crawl-ai 같은 OSS 수집기는 OK.
- **print-don't-write.** brain은 남의 config(claude/codex/gemini)를 자동편집 안 함. musu가 그 정책을 깨고 자동주입하려면 사용자 동의 게이트 필수.
- **단일 resolver 경유.** brain 데이터/바이너리 경로는 `MUSUBRAIN_*` env로 musu가 제어. 하드코딩 금지.

### 권장 통합 순서 (musu 쪽)
1. **MCP 등록** (가장 빠름): musu AI 레인에 brain MCP 붙임 → "recall 읽기/capture 쓰기" 즉시 동작.
2. **데이터 루트 배선**: musu가 `MUSUBRAIN_ROOT=<musu 유저데이터 경로>/brain` 설정 + brain 바이너리 번들.
3. **lifecycle**: Tauri 사이드카로 `musu-brain server -automation-interval` 관리(켜질 때 시작, 꺼질 때 정리).
4. **UX**: cockpit에 recall 검색 + health(자가발전 상태/수집 상태) 노출.
5. **자동수집**(선택): config-sources UX + crawl-ai 번들.

### native Go MCP 승격 (DEFER, 메모리 `decision-musubrain-okf-mcp-stack`)
현재 MCP는 Node mjs 래퍼. 순수 Go 단일 바이너리로 MCP를 내장하는 건 self-contained 패키징이 진짜 필요할 때(예: Node 없는 환경 배포) 승격. 지금은 mjs로 충분(reachable).

---

## 참고 (brain repo 안 문서/메모리)
- 제품 스펙: `docs/specs/current-product-spec.md` (19a~19s = 자가발전+OSS+자동수집).
- 코드 인덱스: `docs/index/code-index.md`.
- 자동수집 마스터플랜: `docs/plans/brain-autocollect-master-plan.md` + WS 세부플랜 4개.
- 통합/공개배포 작업 기록: `docs/plans/brain-oss-release-*.md`, `brain-autocollect-qualitative-and-next-steps.md`.
- 사용법: `README.md`(공개), `docs/DEVELOPMENT.md`(내부 상세).
