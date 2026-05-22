# V26 master plan — Rust distributed actor mesh + LLM DAG builder + MCP external surface + optional musu.pro registry

**Wiki ID**: wiki/508 (master) + wiki/509..514 (W1/W7/W12/W9/W13/W10 plans+closures)
**Date**: 2026-05-22
**Branch**: `v26/distributed-actor` (master plan commit 후 cut from v24/rust-cleanup HEAD)
**Phase -1 strategic gate**: **YELLOW with 7 HIGH** (2026-05-21 panel debate, 7 expert). all HIGH reflected. W13 추가 = organization layer extension (thesis 안) → Phase -1 재호출 불필요.
**Research evidence**: gRPC vs HTTP+JSON 16-source fact-check (2026-05-22). W11 gRPC reject confirmed.

---

## §0 Strategic Gate Findings (Phase -1)

`business-panel-experts` debate mode 2026-05-21, 7 expert (Christensen + Taleb + Kim&Mauborgne + Drucker + Porter + Meadows + Collins). **Verdict: YELLOW with 7 HIGH (no RED)**. user 3 lock confirm + research agent K&M gRPC reject 16-source confirmed.

| # | Expert | Severity | Claim | Resolution (V26 plan reshape) |
|---|---|---|---|---|
| 1 | Christensen | HIGH | "cross-machine task delegation 측정 없음. 9 sub-WS overbuilt" | V26 scope split: 6 sub-WS (W1+W7+W12+W9+W13+W10), W2/W5/W6/W8 = V27 measurement-gated |
| 2 | Taleb | HIGH | "musu.pro registry SPOF risk. V23 K3s 패턴 재발. offline fallback 없이 'masterless' false" | W10 = optional. cached nodes.toml TTL 7-day + LAN mDNS + manual `musu peer add` CLI 필수 |
| 3 | Kim & Mauborgne | HIGH | "W11 gRPC = red ocean import. axum HTTP+JSON musu scale 충분. YAGNI" | **W11 REJECT outright**. research agent 16-source confirmed: musu scale (1.6 req/s peak) 가 gRPC inflection point (1000+ req/s) 보다 1000× 아래. Tailscale RTT (1-50ms) 가 serialization (0.25-0.5μs) 보다 100-1000× 큼. AI ecosystem (Ollama/vLLM/LiteLLM/LangChain) HTTP+JSON+SSE 표준화 |
| 4 | Drucker | HIGH | "9-11 sub-WS = ~28,000 LOC actual ×3.8. 1 master plan 아님" | 3-way split: V26 (6 sub-WS, ~2,500 LOC est ~9,500 actual) + V27 (W2+W5+W6 measurement-gated) + V28 (W3+W4+W8) |
| 5 | Porter | HIGH | "musu.pro = V23.4 T2-F retirement reverse 위험" | W10 = optional positioning explicit. product charter: "musu.pro 있으면 외부 access 편함, 없어도 LAN mesh 작동" |
| 6 | Meadows | HIGH | "W10 = level 5 system rules (highest leverage). 단 SPOF 시 multiplier → fragility" | W10 system invariant doc 필수 (registry healthy/degraded/absent 3 state mesh guarantee) |
| 7 | Collins | HIGH | "MVP (W1+W7+W10) consumption only. flywheel ignition = W9 LLM DAG builder" | W9 V26-core 추가. user 가 musu 사용할수록 회사 자발 추가 = 단계 3 Domain A |

**W13 추가 후 thesis 확장 검토**: W13 (MCP HTTP+SSE server endpoint) = organization layer 의 외부 interface (외부 Claude Code 가 musu fleet 을 tool 로 호출). organization layer extension 이지 thesis 변경 아님 → Phase -1 재호출 불필요. 단 W13 의 new external attack surface 는 dual security-engineer audit 으로 covered.

**Single-port multiplex 결정** (user sharpening): V26 transport 가 단일 musu 포트 (8070 default, env `MUSU_PORT`) 만 expose. axum 내부에서 `Content-Type` header routing. W13 의 MCP HTTP+SSE 도 같은 포트 `/mcp/v1/*` mount.

**Research agent fact-check** (gRPC vs HTTP+JSON at musu scale): K&M directionally correct 95%. 진짜 gap 1 = deadline propagation cascade — axum tower middleware ~100 LOC (W12) 로 동등 구현. Adoption trigger: (a) >5-hop task cascade, (b) fleet >20 PC + sustained >100 req/s, (c) non-Rust client hard requirement — 셋 다 musu scale far below.

---

## §1 Thesis lock + Scope

**V26 thesis** (user-confirmed 2026-05-21, W13 added 2026-05-22):

> **V26 = Rust native distributed actor mesh with masterless P2P + LLM DAG builder + MCP external surface + optional musu.pro registry + single-port multiplex.**
>
> 모든 PC 가 같은 `musu` 단일 binary (V24 SHIP) 실행. 각 binary 가 local Rust actor (Supervisor/Brain/Worker role 동시 보유) + Tokio + axum HTTP+JSON+SSE transport (gRPC reject per panel + research) + sidecar pattern 으로 Python AI worker (Ollama/ComfyUI/vLLM 등) supervise + musu.pro registry optional (cached + mDNS + manual peer fallback) + W9 LLM DAG builder = flywheel 첫 spin + **W13 외부 MCP HTTP+SSE endpoint = Claude Code / Cursor / Claude Desktop 이 musu fleet 을 tool 로 호출**. operator 가 어느 PC 잡든 그 PC 가 통제탑 — masterless. Single port (default 8070) 만 expose.

**4 architectural lock** (user-locked, panel verdict + research evidence):

1. **Rust Native** — V24 [[decision-musu-backend-rust]] lock 유지. musu product code = Rust only. operator user-space code 자유 ([[feedback-no-python]] boundary)
2. **Masterless P2P** — 모든 binary 가 Supervisor/Brain/Worker 3 role 동시 보유
3. **Sidecar pattern** — Rust actor = supervise + route, Python AI worker (Ollama/vLLM/ComfyUI) = external process via HTTP localhost. PyO3 binding 거부 (build complexity)
4. **Optional Central Registry + Single-Port Multiplex**:
   - musu.pro `/api/v1/nodes/register` (V23.2 SHIP) 위에 capability field 추가 (W10)
   - cached nodes.toml TTL 7-day default + heartbeat refresh
   - LAN mDNS (zero-config)
   - manual `musu peer add <addr>` CLI
   - 단일 포트 (`MUSU_PORT` default 8070) 만 expose. axum 내부 `Content-Type` routing

**IN** (6 sub-WS, ~2,500 LOC est, ~9,500 actual ×3.8):
- W1: Rust OpenAI-compat adapter
- W7: `musu peer register` worker helper
- W12: axum tower deadline middleware
- W9: LLM DAG builder (single-pass, §9.12 attestation gate)
- W13: MCP HTTP+SSE server endpoint (stdio + HTTP dual mount)
- W10: registry hardening (capability + cached + mDNS + manual + invariant doc)

**Out of scope (operator manual)**:
- V24-R10 Python deletion (operator gate)
- V24 §9.12 attestation 본문 작성 (Goodhart firewall)
- #436 main-merge (operator authority)

**Out of scope (deferred V27 measurement-gated)**:
- W2 agent tool use mechanism (cross-machine HTTP tool call routing) — V26 사용 후 cross-machine task delegation 주간 ≥5 회 측정 시 trigger
- W5 capability label scheduler (현재 nodes.toml `gpu = "RTX 4060"` description string → structured `capability=[ollama:qwen2.5-32b, comfyui:8188]` array)
- W6 GPU live telemetry (nvml-wrapper + fleet GPU map UI)

**Out of scope (deferred V28+)**:
- W3 ComfyUI workflow template store
- W4 file proxy in mesh router (binary 운반)
- W8 cross-machine task handoff (V23.4 T2-A' runner 확장)
- **W11 gRPC Tonic — REJECT outright** per panel + research 16-source
- **Paperclip autonomous loop (observe→think→act)** — V25-OPS §9.12 firewall 안에서, V27+ 별도 master

> Callout (V24): V24 Rust-cleanup 이 25,885 LOC Python deprecate + V24-R10 = operator manual gate. V26 가 V24 substrate 위에 distributed actor + LLM DAG + 외부 MCP 추가. V24 R8 (4060Ti single-machine E2E) = V26 prerequisite.

---

## §2 Sub-WS table

| Phase | Sub-WS | Wiki | Module | Scope | Risk | LOC est ×2 (×3.8 actual) | Existing infra (Phase 1) |
|---|---|---|---|---|---|---|---|
| V26-W1 | Rust OpenAI-compat adapter | wiki/509 | `musu-rs/src/adapter/openai_compat.rs` + trait + `musu-rs/src/adapter/claude.rs` shim | **1 unified `OpenaiCompatAdapter` + 3 `BackendKind` enum (Ollama/vLLM/LmStudio) + `ClaudeAdapter` shim wrapping V24-R5 writer subprocess**. V24 R5 writer adapter trait reference (Python `musu-core/adapters/base.py` AdapterContext + claude_local 패턴) | LOW | 600 → **2,280** | V24 R5 writer Rust adapter start, Python musu-core 9 adapter pattern |
| V26-W7 | `musu peer register` worker helper | wiki/510 | `musu-rs/src/install/service_helper.rs` + capability autodetect | `musu peer register --type {ollama\|comfyui\|script} --start "<cmd>"` + systemd/launchd/SCM cross-platform + local node manifest | LOW | 300 → **1,140** | V24 R6 installer service registration |
| V26-W12 | axum tower deadline middleware | wiki/511 | `musu-rs/src/bridge/middleware/deadline.rs` | `X-Musu-Deadline-Unix-Ms` header propagation through reqwest sidecar hop + cancellation within 50ms | LOW | 100 → **380** | axum tower middleware (V24 R1) |
| V26-W9 | LLM DAG builder (single-pass) | wiki/512 | `musu-rs/src/workflow/llm_dag_builder.rs` + musu-bee UI | natural-language → workflow DAG JSON. LLM = Claude default (W1 SHIP 후 회사별 override). schema 100% reuse from `workflow_routes.py:99-171` WorkflowSpec (Kahn cycle detection port). §9.12 attestation gate 강제 (operator-attest 없이 실행 X) | MED | 800 → **3,040** | V23.4 T2-A' asyncio runner WorkflowSpec, T2-D-mini form builder |
| V26-W13 | MCP HTTP+SSE server endpoint | wiki/513 | `musu-rs/src/control/http_server.rs` + Anthropic MCP HTTP spec | 현재 stdio (`musu control` subcommand) 14 tool 그대로 reuse + axum 위에 `/mcp/v1/messages` mount. Bearer 인증 share with bridge. loopback-only default + `--mcp-bind-external` opt-in. SSE streaming for tool output | **HIGH** (new external attack surface) | 400 → **1,520** | V24-R3 musu-control stdio MCP (14 tool, rmcp 1.7) + V24-R5 SSE endpoint pattern |
| V26-W10 | Registry hardening + invariant doc | wiki/514 | `musu-rs/src/mesh/registry.rs` + `discovery.rs` + cross-repo musu-pro capability field | (a) musu.pro `/api/v1/nodes/register` endpoint capability field 추가 (cross-repo ~80 LOC TypeScript), (b) musu-rs cached `~/.musu/nodes.cache.json` TTL 7-day, (c) `mdns-sd` crate LAN fallback, (d) `musu peer add <addr>` CLI, (e) system invariant doc (registry healthy/degraded/absent mesh guarantee) | **HIGH** (cross-repo + auth-touching + system invariant) | 300 → **1,140** | V23.2 B1+B2+B4 musu.pro registry SHIP (registry.py:1-76 `/api/v1/nodes/register` heartbeat + peer discovery, Bearer MUSU_TOKEN) |

**Total V26 estimate**: ~2,500 LOC est → **~9,500 LOC actual ×3.8** ([[feedback-loc-estimate-x2]] V24 R-cleanup avg multiplier)

LOC est ×2 column literal "×2" (U+00D7) per PLAN_TEMPLATE.md. ×3.8 = V24 R-cleanup 실제 multiplier (R5 4.95×, R6 6.97×, R3 1.56×, R4 1.73× 평균).

---

## §3 Sequence + parallelization

**Strict sequential**: W1 → W7 → W12 → W9 → W13 → W10.

Rationale: W1 의 Rust adapter trait shape 가 downstream governing. W12 deadline middleware 먼저 land 해야 W9 (LLM call) + W13 (MCP HTTP) deadline propagation uniform. W10 마지막 (cross-repo + dual-audit = slowest gate).

**Operator gate (halt /loop)**:
- W13 ship 후 W10 시작 전: external MCP attack surface review (security-engineer dual audit). operator 가 LAN-only restrict vs internet exposure 결정
- W10 ship 후 V26 close 전: V23.4 T2-F self-host 결정 reverse 안 함을 user-attest (invariant doc 확인)

**/loop autonomous** ([[feedback-autonomous-loop]]): W1+W7+W12 batched Const VII, W9+W13+W10 별도 user gate (dual-audit + cross-repo)

---

## §4 Constitution gates predicted

| Gate | Triggers? | Note |
|---|---|---|
| Const III (schema) | YES — W10 | musu-bridge audit.db 에 `nodes_snapshot` table 추가 (cached TTL 7-day). schema v3 → v4 migration |
| Const VI (perf) | NO | gRPC reject 으로 perf 비교 안 함. axum HTTP+JSON V24 R1 SHIP, 패턴 확장 |
| Const VII (push) | YES per-W or batched | W1+W7+W12 batched, W9+W13 별도 (LLM correctness + security), W10 cross-repo per-W |
| Phase -1 strategic | DONE 2026-05-21 | YELLOW + 7 HIGH 모두 본 plan §0 resolved. W13 추가 = organization layer extension (thesis 안) → 재호출 불필요 |

---

## §5 Sub-WS detail specs

| Sub-WS | Wiki | Critic | Auditor | Dual? |
|---|---|---|---|---|
| **W1** Rust OpenAI-compat adapter | wiki/509 | system-architect single | quality-engineer single | NO (4 조건 0 매치) |
| **W7** `musu peer register` worker helper | wiki/510 | system-architect single | quality-engineer single | NO |
| **W12** axum tower deadline middleware | wiki/511 | system-architect single | quality-engineer single | NO |
| **W9** LLM DAG builder | wiki/512 | system-architect + ml-systems (LLM-generated DAG correctness) **dual Critic** | quality-engineer single | dual Critic, single Auditor |
| **W13** MCP HTTP+SSE server endpoint | wiki/513 | system-architect + security-engineer **dual Critic** | quality-engineer + security-engineer **dual Auditor** | **YES** — condition 1 (auth-touching, new external) + condition 4 (one-way blast radius — external MCP exposure) |
| **W10** Registry hardening + invariant doc | wiki/514 | system-architect + distributed-systems (masterless invariant + cached drift) **dual Critic** | quality-engineer + security-engineer **dual Auditor** | **YES** — condition 1 (auth) + condition 2 (Const III schema) + condition 4 (one-way registry data integrity) |

Dual-audit per [[feedback-dual-audit-trigger-narrow]]: W10 + W13 match. W9 = dual Critic only (LLM correctness 가 single Critic 영역 밖이지만 auth/install 아니므로 Auditor single OK).

---

## §6 Wiki ID reservations

- wiki/508 = this master plan
- wiki/509, 509c = W1 plan + closure
- wiki/510, 510c = W7
- wiki/511, 511c = W12
- wiki/512, 512c = W9
- wiki/513, 513c = W13
- wiki/514, 514c = W10
- wiki/515 = V26 master closure HTML (Scribe)
- next free: wiki/516

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| RV1 | HIGH | W13 외부 MCP HTTP endpoint = new attack surface. unauthorized fleet access | W13 dual security-engineer Critic+Auditor + Bearer 강화 + loopback-only default + explicit `--mcp-bind-external` opt-in |
| RV2 | HIGH | W9 LLM 이 잘못된 DAG 생성 → workflow_runner destructive action 실행 | §9.12 attestation gate 강제 (operator-attest 없이 실행 X) + dry-run preview + ml-systems Critic schema validation |
| RV3 | HIGH | W10 musu.pro registry 가 사실상 required 됨 — Taleb SPOF 재현 | W10 §5(e) invariant doc + offline E2E test (musu.pro down → mDNS + cached snapshot 로 mesh 작동, acceptance §9.8 operator-attested) |
| RV4 | MED | V24 R-cleanup 의 Python adapter 9 개 (musu-core) 가 V27 까지 잔존 → W1 Rust adapter 와 dual maintenance | V26 W1 = 신규 OpenAI-compat 만. 기존 Python 9 adapter Rust port = V27 별도 sub-WS |
| RV5 | MED | W9 LLM cost (Claude default API 회사당 monthly $$) | operator 가 회사별 model override 가능 — W1 SHIP 후 로컬 Ollama Qwen 으로 cost zero |
| RV6 | MED | W13 single-port multiplex `/mcp/v1/*` 가 musu-bridge 기존 11 endpoint 와 path 충돌 | W13 mount path explicit reserve + axum route conflict test |
| RV7 | LOW | W12 deadline default 가 long-running LLM (10+s) vs short audit log read (<100ms) 둘 다 같은 ceiling | per-route override (axum route metadata) + default 30s ceiling |
| RV8 | LOW | mDNS LAN fallback 가 cross-subnet (가정 Wi-Fi + 회사 VPN) 에서 fail | W10 invariant doc 명시: cross-subnet = musu.pro 또는 manual `musu peer add` |
| RV9 | LOW | W7 Windows SCM service registration 가 Powershell admin 권한 필요 | V24 R6 installer 이미 same admin 처리. W7 reuse |
| RV10 | LOW | W13 의 14 tool 이 stdio + HTTP 둘 다 expose → consistency drift risk (한쪽만 tool 추가 시) | shared tool registry module — 14 tool definition 1 곳, 두 transport adapter |

---

## §8 Phase 0 frame correction check

Phase 0 Researcher 가 V26 sub-WS 진입 시 catch 할 frame correction 후보:

- **W1**: Ollama OpenAI-compat API 가 musu adapter trait 100% 호환? `function_call` 같은 OpenAI-only feature 가 Ollama 미지원 — Phase 0 fact-check
- **W7**: V24 R6 installer 의 service registration helper 가 already `musu service register` CLI 인지, 또는 신규 `musu peer register` 가 필요한지
- **W9**: workflow_routes.py:99-171 WorkflowSpec schema 의 Rust port shape (serde + Python parity 보장)
- **W13**: rmcp 1.7 의 HTTP transport 지원 여부 (현재 stdio 만 — HTTP transport adapter 추가 필요)
- **W10**: musu.pro V23.2 `registry.py:1-76` 의 정확한 capability field 추가 위치 (server + client 양쪽 cross-repo coordination)

각 W detail plan §1.1 의 F1 frame correction row 가 Phase 0 결과 흡수 ([[feedback-phase0-scope-cutter]]).

---

## §9 Acceptance criteria (V26 close)

1. 6 sub-WS (W1+W7+W12+W9+W13+W10) 모두 SHIP-OK (Critic resolved + Auditor SHIP-OK)
2. `musu` 단일 binary 가 single port (default 8070) 만 expose. `netstat -an | grep 8070` verify
3. W1 OpenAI-compat adapter: Ollama local + vLLM remote 둘 다 동작 (`musu agent run --adapter openai_compat_local --model qwen2.5:32b`)
4. W7: `musu peer register --type ollama --start "ollama serve"` Linux + macOS + Windows 3 OS 등록 + capability autodetect (Ollama port 11434 detect)
5. W12: `X-Musu-Deadline-Unix-Ms` header propagation — bridge → adapter → external API 까지 통과. cancellation within 50ms of deadline
6. W9: operator 가 musu-bee UI 에서 자연어 "매주 wiki digest workflow" 입력 → DAG JSON 생성 → §9.12 attestation gate (operator-attest 필수) → V23.4 T2-A' runner 실행. **Goodhart firewall: attestation 가 operator-authored**, orchestrator prefill 불가
7. W13: stdio (`musu control`) + HTTP+SSE (`/mcp/v1/messages`) 동일 14 tool surface. Bearer 인증 share. 외부 Claude Code 가 HTTP MCP 로 호출 verify (single `mcp-server-stdio.json` config 로 둘 다 등록)
8. W10: musu.pro registry stop → 새 PC LAN start → mDNS 로 기존 mesh 자동 join → operator task delegate 성공. **본 test 가 operator-attested**, orchestrator fake 불가 (musu.pro daemon 실제 stop 필요)
9. W10 invariant doc: registry healthy / degraded (cached snapshot) / absent (mDNS + manual) 3 state 의 mesh guarantee 명시
10. `musu peer add 192.168.1.50` CLI → manual peer add 성공 (mDNS 안 닿는 subnet fallback)
11. CHANGELOG.md [1.15.0] entry + V26 closure HTML (wiki/515) per [[feedback-scribe-html-only]]
12. **Operator-attested** (Goodhart firewall): V26 ship 후 7-day soak — (a) W9 DAG builder 로 회사 ≥3 개 자발 추가, (b) W13 외부 MCP 호출 ≥10 회 (Claude Code 또는 Cursor 에서), (c) W10 offline E2E test timestamp + operator git authorship + terminal history reference. **V26 close 의 ungameable Goodhart firewall**
13. V27 trigger measurement: cross-machine task delegation 주간 ≥5 회 = V27 진입 (W2/W5/W6/W8 build). <5 회 = V27 보류, 다른 thesis (Paperclip autonomous loop 또는 musu-pro reactivation) 시작

---

## §10 Channel to V27 (measurement-gated)

V26 ship + 14-day operator measurement:
- 주간 cross-machine task delegation ≥5 회 = V27 진입 → W2 (agent tool use) + W5 (capability label) + W6 (GPU telemetry)
- <5 회 = V27 보류, 다른 thesis 시작

V27 PRIOR ARTIFACTS:
- 본 wiki/508 + 6 sub-WS closure (wiki/509c..514c)
- V26 master closure (wiki/515)
- W10 offline E2E test 결과 (Goodhart firewall evidence)
- [[decision-musu-3tier-thesis]] + [[feedback-no-yagni-architecture]]

---

## §11 References

- `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md` (2026-05-21 3-tier reshape + 2026-05-22 V26 status add)
- `docs/WIKI_MUSU_NOT_CATEGORIES_2026_05_21.html` (wiki/507) §9 3-tier + §10 V26 candidate + §11 process layer
- `docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` (V24 thesis)
- `docs/V24_CLOSURE_2026_05_21.html` (wiki/500) V24 master closure
- `docs/V25_OPS_CLOSURE_2026_05_21.html` (wiki/506) V25-OPS retrospective + V26 entry point
- `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` — §9.12 firewall (W9 attestation gate base)
- `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` — main-merge bundle (V26 위에 build)
- `docs/V23_4_PHASE4_T2A_PRIME_CLOSURE_2026_05_18.md` — V23.4 panel YELLOW K3s+Argo+Operator reject precedent
- `docs/BRAINSTORM_PAPERCLIP_OBSERVER_2026_05_18.md` — V23.5 W8 Paperclip deferred (W9 boundary, V27+ deferred)
- `docs/PLAN_TEMPLATE.md` — V25-OPS W1 산출물 (sub-WS plan template)
- `musu-rs/src/control/mod.rs` — V24-R3 stdio MCP 14 tool (W13 reuse 100%)
- `musu-rs/src/control/bridge_client.rs` — bridge HTTP proxy pattern (W13 reuse)
- `musu-rs/src/bridge/handlers/mod.rs` — axum router 11 endpoint (W12 + W13 mount target)
- `musu-rs/src/bridge/auth.rs` — Bearer + subtle::ConstantTimeEq (W13 share)
- `musu-rs/src/bridge/sse.rs` — SSE pattern (W13 + W9 reuse)
- `musu-bridge/musu_bridge/workflow_routes.py:99-171` — WorkflowSpec schema (W9 100% reuse + Kahn cycle detection port)
- `musu-bridge/musu_bridge/registry.py:1-76` — V23.2 SHIP musu.pro client (W10 capability field 추가)
- `musu-core/src/musu_core/adapters/base.py` — AdapterContext + BaseAdapter (W1 Rust port reference)
- `musu-core/src/musu_core/adapters/claude_local.py:183-195` — subprocess pattern (W1 OpenAI-compat similar)
- Phase -1 panel 2026-05-21 (7 expert, internal session log)
- Research agent 2026-05-22 (gRPC vs HTTP+JSON 16-source 2024-2026 benchmark)
- Memory: [[decision-musu-3tier-thesis]] (V26 thesis tier), [[feedback-strategic-critic-gate]] (Phase -1), [[feedback-no-yagni-architecture]] (W11 reject + W10 K3s 회피), [[feedback-self-contained-product]] (W10 optional), [[feedback-loc-estimate-x2]] (×3.8), [[feedback-dual-audit-trigger-narrow]] (W9/W13/W10 dual), [[feedback-no-python]] (musu product Rust only, operator user-space 자유), [[feedback-phase0-scope-cutter]] (Phase 0 frame correction), [[feedback-const-vii-batched-approval]] (W1+W7+W12 batched), [[feedback-autonomous-loop]] (/loop), [[feedback-scribe-html-only]] (W515 closure HTML), [[decision-musu-backend-rust]] (V24 Rust lock 유지)
