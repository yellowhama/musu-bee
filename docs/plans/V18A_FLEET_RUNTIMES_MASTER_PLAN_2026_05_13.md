# Master Plan — v18.A Fleet Layer P1: Runtime Capabilities (2026-05-13)

> P1 of `docs/PRODUCT_CHARTER/FLEET_LAYER_NEXT_STEPS_2026-05-13.md` —
> runtime capability model + per-node state. v17.B 가 infra cleanup 였다면
> v18.A 는 첫 product feature 작업.
>
> 시작 HEAD: `4891772` (v17.B Phase 5 closure).

## 0. Scope

### 포함

| 영역 | 한 줄 |
|---|---|
| **runtime capability schema** | "이 노드가 어떤 runtime 을 갖고 있나" 의 단일 source-of-truth shape |
| **per-node detection** | bridge 시작 시 + on-demand 로 각 runtime 의 install/version/health 감지 |
| **persistence** | DB 에 저장 (mesh routing decision + dashboard 표시용) |
| **bridge API surface** | `GET /api/nodes/{name}/runtimes` (read) + `POST .../probe` (refresh trigger) |
| **tests** | pytest: schema serialization, detection fallback, API endpoint |

### 제외 (P2 / 별 phase)

- `POST .../install`, `.../update` 같은 mutate API — P2.
- Dashboard runtime badges — P3.
- Onboarding flow — P4.
- Landing copy — P5.
- Mesh routing 이 runtime capability 기준으로 결정 — P2 와 함께 또는 별.

## 1. Runtime 목록

Fleet roadmap §P1 의 8 runtimes — 둘로 그룹화:

**Internal (음... 시스템이 직접 관리)**:
- `bridge` — musu-bridge 자체. 항상 'installed'.
- `paperclip` — agent management runtime.
- `openclaw` — channels + skills runtime.
- `hermes` — persistent personal agents.

**External CLIs (감지 only)**:
- `claude_cli` — Anthropic Claude Code CLI.
- `codex_cli` — OpenAI Codex CLI.
- `gemini_cli` — Google Gemini CLI.
- `ollama` — local LLM.

각 runtime 의 state 는 같은 shape (K8s NodeCondition + Nomad fingerprint 패턴 기반,
self-research 결과 반영):

```python
@dataclass
class RuntimeCapability:
    name: str
    status: Literal["installed", "missing"]     # presence
    health: Literal["healthy", "degraded", "unknown"] = "unknown"  # works?
    reason: str = ""           # machine-readable, e.g. "BinaryNotFound"
    version: str = ""
    detection_method: str = "" # "which" | "subprocess" | "http" | "static"
    binary_path: str = ""
    notes: str = ""            # operator-authored
    probe_error: str = ""      # machine-written, last failure
    detected_at: float = 0.0   # last successful detection
    last_probe_attempt_at: float = 0.0
    state_changed_at: float = 0.0  # when status/health flipped
```

**status / health 분리** 이유: "binary 있는데 작동 안 함" 케이스를 표현 가능 (ollama
설치됐는데 service down 같은). status="error" 로 collapse 하면 dashboard 가 "missing
vs broken" 못 가림.

## 2. 사이클 구조 — 4 phase

### Phase 1 — Schema + detection (musu-core) (~60분)

가장 foundational. 나머지 phase 가 다 이 모델 위에 얹힘.

**산출물**

- `musu-core/src/musu_core/fleet/runtimes.py` 신규:
  - `RuntimeStatus` Enum: installed / missing / error.
  - `@dataclass RuntimeCapability` (위의 shape).
  - 8 개 detector 함수 (`detect_bridge`, `detect_paperclip` 등). 각각 `RuntimeCapability` 반환.
  - `detect_all_runtimes()` → `dict[str, RuntimeCapability]`.
- detector 구현:
  - `claude_cli` / `codex_cli` / `gemini_cli` / `ollama`: `which X` + `X --version`. 5s timeout.
  - `bridge`: 항상 installed, version 은 musu-core 의 `__version__` 또는 git rev.
  - `paperclip` / `openclaw` / `hermes`: 우선 stub 으로 `status="missing"`. v18.B 에서 실제 detection (별 사이클).
- `tests/test_runtimes.py`:
  - 각 detector mock 으로 호출 → output shape.
  - detect_all 통합 호출.
  - missing 케이스 (CLI 안 깔린 경우) graceful.

**검증**: pytest 9-12 cases pass. 실제 host 에서 `detect_all_runtimes()` 직접 호출해서 ollama / claude_cli 가 detect 되는지 (개발 머신에 둘 다 있음).

**detail plan**: `V18A_PHASE1_RUNTIME_SCHEMA_2026_05_13.md`

### Phase 2 — Persistence + API (musu-bridge) (~45분)

bridge 가 runtimes 를 저장 + 노출.

**산출물**

- DB migration v27: `node_runtimes` 테이블 (`node_name`, `runtime_name`, `status`, `version`, `detected_at`, `notes`).
- `musu-bridge/handlers.py` 또는 새 `runtime_routes.py`:
  - startup 시 self-detect → 자기 node 의 runtimes 저장.
  - `GET /api/nodes/{name}/runtimes` — DB 에서 읽어 반환.
  - `POST /api/nodes/{name}/runtimes/probe` — self 면 re-detect, peer 면 mesh forward.
- 새 pytest `musu-bridge/tests/test_runtime_routes.py`.

**검증**: bridge 띄우고 `curl http://127.0.0.1:8070/api/nodes/$(hostname)/runtimes` 정상 응답.

**detail plan**: `V18A_PHASE2_RUNTIME_API_2026_05_13.md`

### Phase 3 — Mesh peer detection (~30분)

peer node 의 runtimes 도 보일 수 있도록.

**산출물**

- `mesh_router.py` 에 helper: `fetch_peer_runtimes(node_name)` — peer 의 `/api/nodes/<name>/runtimes` 호출.
- API `GET /api/nodes/{name}/runtimes` 가 self 가 아니면 mesh forward.
- error case: peer 안 닿으면 cached state 반환 + warning.

**검증**: 두 번째 node 없으니 mock peer 로 unit test 만.

**detail plan**: `V18A_PHASE3_MESH_RUNTIMES_2026_05_13.md`

### Phase 4 — Closure (~20분)

- master plan §4 status
- wiki entry `315_V18A_RUNTIME_CAPABILITIES_2026_05_13.md`
- main commit + push
- `FLEET_LAYER_NEXT_STEPS_2026-05-13.md` 의 P1 체크박스 갱신

**detail plan**: `V18A_PHASE4_CLOSURE_2026_05_13.md`

## 3. 시간 추정

| Phase | 추정 | 누적 |
|---|---|---|
| 1. Schema + detection | 60분 | 60분 |
| 2. API + persistence | 45분 | 105분 |
| 3. Mesh peer detection | 30분 | 135분 |
| 4. Closure | 20분 | 155분 |

총 ~2시간 35분. v17.A/B 와 비슷한 무게.

## 4. 위험

- **paperclip/openclaw/hermes detection 미정**: 아직 spec/구현 부재. P1 은 stub 만 — 진짜 detection 은 별 사이클. 마스터 plan 의 P0 spec 끝나야 의미 있음.
- **DB migration v27**: musu-core 의 migrations.py 는 명시 허락 필요 ([[CLAUDE.md]]). v25/v26 이 v17.A 에서 허락받고 추가됐듯이, 이번에도 허락 받아야.
- **detection timeout**: subprocess 5s × 8 runtimes = worst case 40s on startup. async 로 parallel detect 해서 5s 안에 끝나도록.
- **per-runtime version parsing**: 각 CLI 마다 `--version` 출력 포맷 다름. fragile. error tolerant 하게 — version 못 파싱하면 empty string + status=installed 로.

## 5. Status

- [ ] Phase 1 — Schema + detection
- [ ] Phase 2 — Persistence + API
- [ ] Phase 3 — Mesh peer detection
- [ ] Phase 4 — Closure
