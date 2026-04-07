# 19 Device Profile Contract And Translator Binding

## 목표

사용자 PC/경로/포트를 하드코딩하지 않고,
`device_id + device profile + runtime translator` 조합으로
기기별 연결 방법을 표현하는 canonical contract를 고정한다.

## 배경

- MUSU는 여러 기기를 연결해 쓰는 제품이다.
- 따라서 특정 사용자 홈 경로, 특정 고정 포트, 특정 launcher를 제품 truth로 두면 안 된다.
- 최근 코드에는 `device_id`, `device_profile_path` baseline이 들어갔고,
  이제 그 위의 실제 profile contract가 필요하다.

관련 문서:

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/musu-port/MUSU_AS_MCP_RELATION.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`

## 이번 단계 범위

- `device_id` canonicalization 규칙 고정
- `device profile` JSON shape 초안 작성
- translator가 profile에서 읽어야 할 필드 정의
- default/reference와 per-device truth를 명확히 구분

## 제외 범위

- profile sync
- cloud registry
- actual remote device enrollment UX

## 구현 작업 목록

- device profile 파일 예시 작성
- 필수 필드 정의
  - `device_id`
  - `runtime_kind`
  - `filesystem_context`
  - `launch`
  - `health`
  - `transport`
  - `path_hints`
  - `report_roots`
- `.exe`/ELF/AppImage 선택과 profile binding 관계 문서화
- AI agent/system prompting에 필요한 가이드 필드 정의

## 검증 방법

- 문서 리뷰
- config/unit test
- `cargo check`

## 완료 기준

- "기기마다 연결 방법을 다르게 두되 하드코딩하지 않는 방식"이 한 장의 contract로 설명 가능하다
- 다음 단계에서 profile load/validation 코드 구현이 가능하다

## 현재 상태

- `DEVICE_PROFILE_CONTRACT.md`와 reference fixture를 추가했다
- `guidance.translator_hints`와 `operator_notes` 필드를 계약에 포함했다
- `/health`와 `/connect/{service}`가 profile-derived surface를 반환한다
