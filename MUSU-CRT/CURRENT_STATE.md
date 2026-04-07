# MUSU-CRT Current State

## 현재 목적

원본 MUSU의 WebRTC / realtime stream / remote terminal viewer 축을 `MUSU-CRT`라는 canonical 구현 작업공간에서 bounded context로 정리한다.

## 2026-04-01 기준 상태

- `MUSU-CRT` 루트 작업공간이 생성됐다.
- 원본 WebRTC source anchor를 확인했다.
- frontend `commandCatalog`, `tauri.ts`, `StreamViewer`, `useRealtimeStream`를 확인했다.
- backend `commands/webrtc.rs`를 확인했다.
- screen tab source analysis 문서가 추가됐다.
- screen tab repro fixture와 viewer가 추가됐다.
- signaling / stream lifecycle / terminal data plane / harness 계획 문서가 추가됐다.
- signaling / stream lifecycle / terminal data plane mock harness가 추가됐다.
- backport notes 문서가 추가됐다.
- harness smoke proof, signaling extracted candidate, final parity note가 추가됐다.
- refactor entry slicing과 stream extraction candidate 문서가 추가됐다.
- transport-first architecture 문서가 추가됐다.
- signaling adapter slice map, stream path split map, runtime refactor gate 문서가 추가됐다.
- signaling thin adapter / bridge handler와 stream split candidate code가 추가됐다.
- `MUSU-CRT`가 canonical implementation workspace라는 원칙이 문서화됐다.
- signaling coordinator와 local stream controller candidate가 추가됐다.
- canonical implementation board가 추가됐다.
- canonical harness가 추가됐다.
- remote session controller candidate가 추가됐다.
- backport-later checklist와 final implementation status가 추가됐다.
- canonical harness HTTP proof가 추가됐다.
- original repo proof runbook, decision note, final closure note가 추가됐다.
- original repo proof progress 문서가 추가됐다.
- canonical direct smoke runbook과 proof 문서가 추가됐다.
- remote session canonical fixture / plan / harness proof가 추가됐다.

## 이미 알고 있는 것

- 원본 MUSU에는 `webrtc_offer`, `webrtc_add_ice`, `webrtc_close`, `v4_webrtc_data_send` command가 있다.
- WebRTC는 `StreamViewer`와 realtime stream hook에서 실제 viewer 경험과 연결된다.
- backend는 data channel input을 terminal send bridge로 연결한다.
- screen tab은 `ScreenGalleryView + useScreenGallery + StreamViewer + LiveView`의 결합이다.
- `startRealtimeStream/getRealtimeFrame` 경로는 로컬 realtime frame path 성격이 강하다.
- cross-computer CRT 관점의 primary transport는 HTTP polling이 아니라 `WebRTC + WebSocket`이어야 한다.
- 현재 `MUSU-CRT`의 정적 HTTP harness는 local proof 용도다.
- `webrtc_offer` 내부에는 signaling 외에 terminal/data bridge callback이 일부 섞여 있다.
- `useRealtimeStream`는 추출 전에 local polling path와 remote path를 다시 나눠서 봐야 한다.
- `extracted/signaling`은 이제 mock뿐 아니라 thin tauri adapter와 bridge handler 후보까지 가진다.
- `extracted/stream`은 local adapter / parser / metrics / reconnect / remote session placeholder까지 분리됐다.
- 원본 repo는 reference / backport-later 대상으로만 써야 한다.
- 이후 구현 우선순위는 `MUSU-CRT` 내부 candidate code와 harness 쪽이다.
- signaling은 adapter 위에 coordinator layer까지 올라왔다.
- stream은 local polling path 기준 controller 후보까지 올라왔다.
- canonical harness가 signaling + local stream candidate를 한 화면에서 보여준다.
- remote path도 controller 단위 초안까지 올라왔다.
- 이제 남은 일은 canonical 설계보다 `Slice 3` 정리와 backport timing 판단에 가깝다.
- canonical harness는 로컬 HTTP 기준으로 실제 200 proof가 확보됐다.
- original repo proof는 reference로만 유지한다.
- canonical harness smoke script 기준 proof는 확보됐다.
- 따라서 현재 단계는 `canonical complete, canonical smoke complete, backport timing decision only`로 본다.
- 다음 구조화 과제는 `무엇을 먼저 옮길지`가 아니라 `어떤 slice로 나눠서 옮길지`를 고정하는 일이다.
- 첫 slice는 signaling thin slice로 고정됐고, entry file / 검증 순서 / rollback 기준을 문서화하는 단계다.
- 현재는 slice 1 signaling이 원본 repo 기준 `applied + proven` 상태다.
- 다음 active는 `Slice 2 - local stream split` 준비다.
- `Slice 2`는 코드 반영 흔적이 이미 있으나, frontend build / local smoke proof는 아직 닫히지 않았다.
- `Slice 2`의 frontend build proof는 확보됐다.
- `Slice 2`의 canonical proof gap은 닫혔다.
- `Slice 3 - remote session controller`는 entry note가 준비된 상태다.
- original repo direct viewer smoke는 bootstrap 이슈 때문에 reference-only로 내렸다.
- `MUSU-CRT` canonical harness에는 deterministic root/ready/summary marker가 있다.
- canonical smoke script는 현재 통과한다.
- canonical harness에는 remote session state panel이 추가됐다.
- remote session canonical smoke도 통과한다.
- canonical harness의 inline remote session demo logic은 별도 runtime module로 분리됐다.
- `Slice 3 - remote session controller` backport timing 결정은 `later`로 고정됐다.
- runtime-facing prep checklist, reference-only note, final workspace closure 문서가 추가됐다.
- lane 2 proof (`work/mus27-live-harness/musu-connects-live-proof.json`)를 읽는 CRT-side adapter runtime이 canonical harness에 추가됐다.
- canonical harness에 `Lane-2 Remote Operator View` read-only panel이 추가돼 selected service / projected routes / pairing session / trust / freshness / health를 표시한다.
- lane 3 smoke command가 추가됐다: `./scripts/mus28-crt-remote-smoke.sh`
- lane 3 smoke 산출물:
  - `work/mus28-crt-remote-smoke/summary.json`
  - `work/mus28-crt-remote-smoke/operator-view.json`
  - `work/mus28-crt-remote-smoke/mus28-crt-remote-smoke-manifest.json`
- MUS-58 coherence replay command가 추가됐다: `node MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs`
- MUS-58 matrix 산출물:
  - `work/mus28-crt-qa-states/trusted_fresh.operator-view.json`
  - `work/mus28-crt-qa-states/degraded.operator-view.json`
  - `work/mus28-crt-qa-states/stale_withdrawn.operator-view.json`
- MUS-58 proof note:
  - `MUS58_REMOTE_SESSION_HEALTH_COHERENCE_PROOF_2026-04-03.md`
- 현재 lane 3 read path는 lane 2 harness proof JSON을 source-of-truth로 사용한다.
- boundary: transport ownership/attach lifecycle은 여전히 기존 remote session controller path에 두고, lane 3 read path는 read-only operator projection만 담당한다.

## 즉시 다음 단계

1. 다음 backport window 전까지 canonical contract를 유지한다
2. runtime-facing prep checklist를 기준으로 재검토한다
3. original repo는 reference-only로 유지한다
