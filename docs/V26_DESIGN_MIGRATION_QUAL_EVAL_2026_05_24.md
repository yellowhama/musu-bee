# V26 VibeCode Town Design Migration — Qualitative Evaluation

**Wiki ID**: wiki/516
**Date**: 2026-05-24
**Scope**: musu-bee frontend design system → VibeCode Town brand identity
**Commit**: `8089197` on `v26/distributed-actor`

---

## 1. Summary

musu-bee 프론트엔드의 디자인 시스템을 VibeCode Town 브랜드 아이덴티티(`design.md`)로 통일.
CSS 변수 레이어 교체 방식을 채택하여, **전면 재작성 없이** 25개 파일의 브랜드 정체성을 일관되게 변환했음.

## 2. Evaluation Criteria & Scores

| Criteria | Score | Comment |
|----------|-------|---------|
| **색상 일관성** | ⭐⭐⭐⭐⭐ | 레거시 hex(`#FFD166`, `#2D1D19`, `#FDFCF0`) 100% 제거. brand-tokens 테스트 3/3 통과 |
| **타이포그래피** | ⭐⭐⭐⭐ | Outfit/Inter/Space Mono 로드 확인. heading 글로벌 규칙 적용. 실제 렌더링은 브라우저 확인 필요 |
| **섀도우/브루탈리즘** | ⭐⭐⭐⭐ | 8px 하드 섀도우 + brand-ink 색상. neo-radius 16→8px. 실제 UI에서 카드 비주얼 검증 필요 |
| **테스트 커버리지** | ⭐⭐⭐⭐⭐ | brand-tokens.test.ts 3/3 pass, TS build clean |
| **회귀 리스크** | ⭐⭐⭐⭐ | CSS 변수 교체만으로 진행. 기능 코드 변경 없음. 인라인 스타일 hex 교체는 정확한 패턴 매칭으로 수행 |
| **기술 부채** | ⭐⭐⭐ | 19개 컴포넌트가 여전히 인라인 hex 사용 (CSS var로 교체 미완) |

**총점: 4.2 / 5.0** — 색상 통일은 완벽하나, 인라인 스타일→CSS 변수 마이그레이션이 잔여 부채.

## 3. Code Audit Results

### ✅ PASS
- **레거시 색상 완전 제거**: `#FFD166`, `#2D1D19`, `#FDFCF0` — globals.css 외 0건
- **TypeScript 빌드**: `tsc --noEmit` 에러 없음
- **CSS 변수 체인 무결성**: 모든 `var(--xxx)` 참조가 새 값을 올바르게 반영
- **폰트 로딩**: layout.tsx + globals.css 동기화 완료 (Outfit, Inter, Space Mono)

### ⚠️ WARN
- **인라인 hex 기술 부채**: 19개 파일이 `#FFA602`, `#432c1c`, `#FDFBF7`를 직접 사용
  - 추후 `var(--accent)`, `var(--fg-on-accent)`, `var(--fg1)` 교체 필요
  - 우선도: P2 (기능 영향 없음, 유지보수 비용만)
- **CRLF 혼재**: Windows 개발 환경으로 CRLF/LF 혼재. `.gitattributes` 설정 권장

### ❌ FAIL: 없음

## 4. Before → After Comparison

| 요소 | Before (Musu Yellow) | After (VibeCode Town) |
|------|---------------------|----------------------|
| 엑센트 버튼 | 밝은 레몬 노랑 `#FFD166` | 깊은 골든 오렌지 `#FFA602` |
| 텍스트 on 엑센트 | 어두운 코코아 `#2D1D19` | 따뜻한 다크커피 `#432c1c` |
| 기본 텍스트 | 쿨 그레이 `#F3F4F6` | 따뜻한 크림 `#FDFBF7` |
| 배경 | 거의 검정 `#1A110C` | 딥 에스프레소 `#251714` |
| 카드 그림자 | 4px 블랙 | **8px brand-ink** (brutalist) |
| heading 폰트 | Nunito (UI 전체와 동일) | **Outfit** (구분감 ↑) |
| 코드 폰트 | JetBrains Mono | **Space Mono** |

## 5. Next Steps

### P1 (필수)
- [ ] 브라우저 렌더링 검증 — `npm run dev` 후 각 페이지 비주얼 체크
- [ ] heading Outfit 폰트가 실제 로드되는지 DevTools Network 확인

### P2 (권장)
- [ ] 인라인 hex → CSS variable 마이그레이션 (19개 컴포넌트)
- [ ] 다크/라이트 모드 토큰 분리 (`design.md` §4의 라이트모드 팔레트)
- [ ] `.gitattributes` CRLF 통일

### P3 (미래)
- [ ] `mix-blend-luminosity` 이미지 합성 규칙 (`design.md` §5)
- [ ] 마케팅 페이지에 레트로 리소그래프 이미지 가이드 적용
- [ ] Storybook 또는 디자인 토큰 문서 자동 생성

---

**End of wiki/516 qualitative evaluation.**
