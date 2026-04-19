# Next Session — 2026-04-19

> Phase 19 완료 기준 (commits: 0129d284, 82e06d57, 60d5dbf7)

---

## Phase 19 완료 항목

| Track | 내용 | 커밋 | 상태 |
|-------|------|------|------|
| A | MCP 35도구 smoke test 35/35 pass | `0129d284` | ✅ |
| B | MUSU_TOKEN 활성화 → cloud_registry_enabled: true | env 설정 | ✅ |
| C-1 | musu-core v10 kvstore migration (get_kv/set_kv) | `82e06d57` | ✅ |
| C-2 | musu-bridge GET/PUT /api/workspace | `60d5dbf7` | ✅ |
| bonus | musu.pro GenerateTokenForm UX (로딩 + 팝업) | vibecode-town | ✅ |

---

## 미완료 (다음 세션 P0)

### Track C-3: musu-bee company 선택 → workspace PUT 호출
파일: `musu-bee/src/hooks/useCompanyState.ts`

현재 handleSelectActiveCompany는 Next.js API /api/company-activation에만 PATCH.
musu-bridge에 전달 안 함.

작업:
1. handleSelectActiveCompany 내부에서 PUT http://localhost:8070/api/workspace 추가 호출
2. 헤더: Authorization: Bearer ${BRIDGE_TOKEN}
3. Body: {"active_company_id": companyId}
4. 실패는 fire-and-forget (로컬 상태는 이미 업데이트됨)

테스트: company 선택 후 GET /api/workspace 응답이 해당 company_id 반환하는지 확인

---

### Track D-1: musu.pro Hero 카피 재작성
파일: /mnt/f/Aisaak/Projects/vibecode-town/src/app/page.tsx

필수 선행: branding 파일 읽기 순서
1. /mnt/f/Aisaak/Projects/vibecode-blog/branding/voice.md
2. /mnt/f/Aisaak/Projects/vibecode-blog/branding/narrative.md
3. /mnt/f/Aisaak/Projects/vibecode-blog/branding/examples.md
4. /mnt/f/Aisaak/Projects/vibecode-blog/branding/platforms.md

방향: "컴퓨터 N대, 화면 1개" — 드랍쉬핑/채굴/봇 다중 기기 운영자 타겟
- HMAC/QUIC/STRIDE 같은 기술 용어 Hero에서 제거
- 유저 승인 후 푸시

---

### Track D-2: E2E 플로우 확인
"노트북 → 데스크탑 2대 보임 → 자동화 관리 가능한가?"

Local path: musu-connectsd daemon 실행 → musu-bee NodePanel 노드 표시 확인
Cloud path: 두 노드가 GET /api/admin/peer-status에서 서로 보이는지

블로커:
- hugh-main-1 (100.121.211.106)에도 MUSU_TOKEN 설정 필요
- musu-bee NodePanel UI 구현 상태 확인 필요

---

## 운영 주의사항

musu-bridge 시작 방법 (env 자동 로드 없음):
  cd /home/hugh51/musu-functions/musu-bridge
  export $(grep -v '^#' .env | xargs)
  .venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8070

MUSU_BRIDGE_PUBLIC_URL 설정 권장 (현재 auto-detect):
  MUSU_BRIDGE_PUBLIC_URL=http://100.126.67.88:8070
  MUSU_NODE_NAME=second-pc

---

## 코드 감사 결과 (2026-04-19)

P1 | test_workspace.py MUSU_BRIDGE_TOKEN 미설정 → 401  | ✅ 픽스됨
P2 | musu-bridge .env 자동 로드 없음                   | 문서화
P2 | MUSU_BRIDGE_PUBLIC_URL 미설정 → auto-detect IP    | 설정 권장
P3 | v10_down이 no-op                                   | 허용 (dev)

상태:
- musu-core: 234 tests pass ✅
- musu-bridge workspace: 3/3 pass ✅
- MCP smoke: 35/35 ✅
- cloud registry: enabled ✅
