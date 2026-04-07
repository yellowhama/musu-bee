# Reference Only Evidence Note

작성일: 2026-04-02

## 목적

원본 repo 관련 증거를 `reference-only`로 유지하는 이유를 명확히 남긴다.

## 포함 문서

- [ORIGINAL_REPO_PROOF_PROGRESS_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REPO_PROOF_PROGRESS_2026-04-02.md)
- [BACKPORT_DECISION_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_DECISION_NOTE_2026-04-02.md)
- [FINAL_CLOSURE_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_CLOSURE_NOTE_2026-04-02.md)

## 원칙

- canonical 구현과 proof의 source of truth는 `MUSU-CRT`
- 원본 repo 증거는 backport feasibility를 보여주는 참고 자료
- 원본 repo의 smoke/bootstrap 문제는 canonical 상태 판정에 직접 쓰지 않는다

## 결론

현재 `MUSU-CRT`는 원본 repo와 독립적으로 closure 가능한 상태이며, 원본 repo 관련 문서는 reference-only로 유지한다.
