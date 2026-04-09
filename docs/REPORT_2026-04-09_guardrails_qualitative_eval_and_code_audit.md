# Guardrails Wave 1–3 — Qualitative Evaluation + Code Audit (2026-04-09)

대상: `musu-worker` 기반 “원격 실행(sidecar)” 운용.

목표: MUSU가 주 프로그램이 아니라 **보조 프로그램**으로 상시 떠 있어도,
- CPU를 독점하지 않고,
- RAM 폭주(OOM)로 시스템을 죽이지 않고,
- 디스크 누적(로그/아티팩트)으로 장애를 만들지 않게 한다.

---

## 1) What shipped (facts)

### Wave 1 — Worker concurrency cap
- `/execute/process`, `/execute/cli`에 동시 실행 cap 적용.
- 환경변수 기반(머신별/유저별 로컬에서만 조절):
  - `MUSU_WORKER_MAX_CONCURRENT_RUNS` (default 2)
  - `MUSU_WORKER_CONCURRENCY_MODE` (default reject; wait 옵션)
  - `MUSU_WORKER_CONCURRENCY_WAIT_TIMEOUT_SEC` (default 2s)

### Wave 1.5 — Output caps (OOM 방지)
- 원격 실행 결과의 stdout/stderr를 메모리 상한으로 캡(기본 2MB) + 파이프 드레인 처리.
  - `MUSU_WORKER_MAX_STDOUT_BYTES`, `MUSU_WORKER_MAX_STDERR_BYTES`

### Wave 2 — systemd/cgroup guardrails (sidecar default)
- user service unit 제공(기본값: 127.0.0.1 바인딩 + CPUQuota/MemoryMax/TasksMax).
- 튜닝은 drop-in 권장(`systemctl --user edit musu-worker`).

### Wave 3 — disk hygiene (TTL + size caps)
- `~/.musu/logs`, `~/.musu/run`, `~/.musu/artifacts` 대상으로 TTL/size cap 정책.
- 기본은 dry-run, optional daily timer는 `--apply`로 실행.

---

## 2) Qualitative evaluation (정성 평가)

### “보조 프로그램” 기준으로 좋아진 점
- 폭주 방어가 3중으로 걸림:
  - **동시성 cap**(프로세스 폭증 방지)
  - **cgroup**(CPU/RAM/Tasks 상한 강제)
  - **TTL/size cap cleanup**(디스크 누적 방지)
- 기본값이 보수적이며, 고급 사용자는 env로 확장 가능.
- 로컬 기본 바인딩을 `127.0.0.1`로 두는 방향(서비스 유닛)이라 안전.

### 아직 남은 “운영/제품” 갭
- 실제 성능 튜닝(benchmark/profiling)은 아직 체계화가 부족:
  - 요청당 latency/failure rate, 큐잉/거절률, 평균 output size 등 메트릭을 쌓아야 “감”이 아니라 “숫자”로 운영 가능.
- remote exposure(0.0.0.0)는 여전히 고위험:
  - 토큰이 없으면 OPEN MODE가 되므로, Pro/외부 노출에서는 토큰 강제가 사실상 필수.

---

## 3) Code audit (간단 감사)

### Security boundary
- `musu-worker`는 “의도된 RCE”이므로, 안전의 대부분이 **운영 정책/권한/네트워크**에 달려 있다.
- Open mode는 dev/Tailscale 같은 신뢰망에서만 허용하는 게 맞다.

### Resource safety
- stdout/stderr 캡은 OOM을 줄이는데 효과적이며, 파이프를 drain 하므로 deadlock 위험도 낮춤.
- 동시성 cap은 “프로세스 폭증”의 1차 방어로 적절.
- systemd guardrails로 OS 레벨에서 강제 가능(실수 방어).

### Data loss risk (cleanup)
- cleanup은 `~/.musu/*`로 스코프가 제한되어 레포/작업물 삭제 사고를 줄임.
- 그래도 `~/.musu/artifacts`를 “증거 보관소”로 쓰는 경우, TTL/size cap이 증거를 지울 수 있음.
  - 권장: 중요 아티팩트는 별도 경로(예: `work/` 또는 외부 저장소)로 이동/보관 정책 필요.

---

## 4) Recommended next steps (최소 비용으로 효과 큰 순서)

1) `musu-worker` 메트릭(거절률/대기/평균 실행시간/출력 크기) 최소 수집
2) systemd timer 운영 가이드(실제 운영자가 “켜고 끄는” 법) 문서 강화
3) “Pro/외부 노출 시 토큰 강제”를 제품 정책/배포 체크리스트에 고정

