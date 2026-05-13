# Phase 0 — WSL fleet 문서 회수 (2026-05-13)

> Master plan [BOUNDARY_MASTER_PLAN_2026_05_13.md](./BOUNDARY_MASTER_PLAN_2026_05_13.md) §Phase 0.

## 목표

사용자가 별 세션에서 WSL `~/musu-functions/docs/PRODUCT_CHARTER/` 에 작업한 fleet positioning 문서들을 truth source (`C:\dev\musu-bee`, main branch) 로 회수하여 github main 에 land 한다.

## 회수 대상

WSL `git status --short` 결과:

```
 M docs/PRODUCT_CHARTER/README.md
 M docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md
?? docs/PRODUCT_CHARTER/FLEET_LAYER_NEXT_STEPS_2026-05-13.md
?? docs/PRODUCT_CHARTER/FLEET_LAYER_POSITIONING_SPEC_2026-05-13.md
?? musu-bridge/uv.lock
```

회수:
1. `docs/PRODUCT_CHARTER/FLEET_LAYER_POSITIONING_SPEC_2026-05-13.md` (untracked, 7314B)
2. `docs/PRODUCT_CHARTER/FLEET_LAYER_NEXT_STEPS_2026-05-13.md` (untracked, 2875B)
3. `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md` (modified — Windows clone 이 기존 버전 3236B 가짐, WSL 측 modified 가 새 fleet 포지션 반영)
4. `docs/PRODUCT_CHARTER/README.md` (modified)

**제외**: `musu-bridge/uv.lock` — uv 도구 부산물, 코드 변경 아님. WSL 에 그대로.

## 단계

1. **사전 확인**: Windows clone HEAD `e9e2780` 와 origin/main 일치 확인.
2. **diff 미리 보기**: 각 modified 파일이 Windows clone 의 현재 버전과 무엇이 다른지 print.
3. **복사**: WSL 4 파일 → Windows 같은 경로.
4. **확인**: `git status` 가 4 파일을 modified/added 로 표시.
5. **검증**: `npx tsc --noEmit` 가 clean — 문서 변경이라 영향 없어야 하지만 markdown 안에 jsdoc 같은 게 있을 수도.
6. **commit**: 단일 commit `docs(charter): fleet layer positioning + next steps (Phase 0 recovery)`.
7. **push**: `git push origin main`.
8. **WSL 측 보존 확인**: WSL working tree 4 파일 그대로 있는지 확인 (사용자가 일시 backup 으로 가지고 있을 가능성).

## 위험

- **diff 충돌 가능성**: SSOT_1PAGE 와 README 가 그 사이 다른 commit 으로 수정됐다면 conflict. 현재 `git status` 로는 modified 만 표시 — git log 로 base commit 확인 필요.
- **파일 인코딩**: WSL 측 가 LF, Windows clone CRLF 가능. git autocrlf 가 정상화하므로 큰 문제 없음.
- **`SSOT_1PAGE` 의 modified 가 minor edit 인지 fleet 반영인지 확인 필요** — 사용자 보고에 "MUSU는 Paperclip/OpenClaw/Hermes의 대체제가 아니라..." 가 SSOT 에 들어갔어야 함.

## 검증 체크리스트

- [ ] 4 파일 모두 Windows clone 에 land
- [ ] diff 가 합리적 (예상치 못한 제3의 변경 없음)
- [ ] typecheck clean
- [ ] commit 1개 push 됨
- [ ] WSL working tree 4 파일 그대로 보존

## Status — COMPLETE

- [x] 사전 확인 — Windows HEAD `e9e2780`, origin/main 일치
- [x] diff 미리 보기 — SSOT/README content diff 확인, base commit 동일 (conflict 없음)
- [x] 복사 — 4 파일 sha256 일치 확인
- [x] git status 확인 — 9개 phantom modification 은 line ending 차이, `git add` 후 정상화
- [x] typecheck — clean (문서만 변경)
- [x] commit — `9b62fd1 docs(charter): fleet/control layer positioning lock (Phase 0)`
- [x] push — `e9e2780..9b62fd1  main -> main`
- [x] WSL 보존 검증 — 4 파일 그대로 (modified + untracked status 유지)

## 발견

- `cp` 가 mtime 만 바꿔서 `git status` 가 9개 phantom modification 표시 — `git diff --stat` 가 empty 라 진짜 변경 아님 확인. `git add` 가 autocrlf 정상화하며 사라짐.
- `core.autocrlf = true` 가 Windows clone 표준. WSL 에서 cp 한 LF 파일이 working tree 에서 CRLF 로 자동 변환.
- `e1ecc123..main` 사이 fleet 관련 4 파일에 변경 없어서 WSL 의 modified 그대로 적용 시 conflict 없었음.
- SSOT_1PAGE 의 진짜 diff: "2026-05-13 positioning lock" 5 라인 추가 + trailing newline 1 line 삭제. 정확히 사용자가 보고한 fleet 포지션.

## 다음

Phase 1 — Indexer Windows 이주 진입.
