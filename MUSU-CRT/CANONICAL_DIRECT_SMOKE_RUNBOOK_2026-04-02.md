# Canonical Direct Smoke Runbook

작성일: 2026-04-02

## 목적

원본 repo가 아니라 `MUSU-CRT` canonical harness 안에서 signaling + local stream proof를 직접 확인한다.

## 기준 경로

- `http://127.0.0.1:8788/MUSU-CRT/harness/canonical/`
- `http://127.0.0.1:8788/MUSU-CRT/mock/signaling_fixture.json`
- `http://127.0.0.1:8788/MUSU-CRT/mock/stream_lifecycle_fixture.json`

## 자동 smoke

```bash
cd /home/hugh51/musu-functions
python3 -m http.server 8788
```

다른 셸에서:

```bash
python3 /home/hugh51/musu-functions/MUSU-CRT/tools/canonical_harness_smoke.py
```

기대 결과:

- `index_has_root_marker = true`
- `index_has_ready_marker = true`
- `index_has_summary_marker = true`
- `app_has_smoke_global = true`
- `signaling_session_ok = true`
- `stream_ready_frame = true`

## 수동 브라우저 확인

브라우저에서 canonical harness를 열고 다음을 본다.

- 상단 `Canonical Harness`
- 우측 ready badge
- summary 카드 6개
- `Signaling State`
- `Local Stream State`
- `Metrics`
- `Timeline`

## 판정

다음 둘이 만족되면 canonical direct smoke는 통과다.

- 자동 smoke 통과
- 수동 브라우저에서 ready badge와 summary 렌더 확인
