---
name: pencil-design
description: 'Pencil.dev AI 디자인 도구 사용 가이드. CLI로 .pen 파일 생성/수정, MCP 도구로 디자인 조작. 트리거: "pencil", "펜슬", "디자인 만들어", "UI 디자인", ".pen 파일", "디자인 토큰"'
---

# Pencil.dev 디자인 가이드

Pencil은 AI 네이티브 벡터 디자인 도구. `.pen` 파일은 순수 JSON이라 AI가 직접 읽고 수정 가능.

## 설치

### Pencil CLI (터미널에서 디자인)

```bash
npm install -g @pencil.dev/cli
```

Node.js 18+ 필요

### 인증

```bash
pencil login      # 브라우저 인증 (세션: ~/.pencil/session-cli.json)
pencil status     # 인증 상태 확인
```

CI/CD 환경: `PENCIL_CLI_KEY` 환경변수 설정

## CLI 핵심 명령어

### 디자인 생성 (Agent 모드)

```bash
# 새 디자인 생성
pencil -o design.pen -p "모바일 로그인 화면 만들어줘"

# 기존 파일 수정
pencil -i existing.pen -o updated.pen -p "버튼 색상 파란색으로 변경"

# PNG로 내보내기
pencil -i design.pen -e output.png --export-scale 2
```

**주요 옵션:**
| 옵션 | 설명 |
|------|------|
| `-i, --in <path>` | 입력 .pen 파일 |
| `-o, --out <path>` | 출력 파일 경로 (필수) |
| `-p, --prompt <text>` | AI 명령어 |
| `-m, --model <id>` | 모델 선택 |
| `-e, --export <path>` | PNG/JPEG/WEBP/PDF 내보내기 |
| `--export-scale <n>` | 내보내기 배율 |

**사용 가능 모델:**
- `claude-opus-4-6` - 가장 강력 (기본값)
- `claude-sonnet-4-6` - 균형
- `claude-haiku-4-5` - 가장 빠름/저렴

### Interactive 모드 (MCP 직접 호출)

```bash
pencil interactive -o design.pen
```

쉘에서 MCP 도구 직접 호출:
```
> batch_design({ operations: [...] })
> get_screenshot({ nodeId: "frame-1" })
> save()
> exit()
```

**모드:**
- `-a desktop` - 실행 중인 Pencil 앱에 연결 (WebSocket)
- 기본 - 헤드리스 에디터 실행

### 배치 처리

```bash
pencil --tasks batch.json
```

```json
[
  { "out": "login.pen", "prompt": "로그인 화면" },
  { "out": "home.pen", "prompt": "홈 대시보드", "model": "claude-sonnet-4-6" }
]
```

## MCP 도구 (Claude Code에서 사용)

Pencil 앱이 실행 중이면 MCP 서버가 자동 시작 (ws://127.0.0.1:33457)

### 사용 전 체크

1. **Pencil 앱 먼저 실행** → Claude Code 시작
2. `mcp__pencil__get_editor_state` 호출로 연결 확인
3. 실패 시: Pencil 재시작 → Claude Code 재시작

### 도구 목록

| 도구 | 용도 |
|------|------|
| `mcp__pencil__batch_design` | 요소 생성/수정/삭제 |
| `mcp__pencil__batch_get` | 디자인 구조 읽기 |
| `mcp__pencil__get_screenshot` | 프레임 렌더링 |
| `mcp__pencil__snapshot_layout` | 레이아웃 분석 |
| `mcp__pencil__get_editor_state` | 현재 에디터 상태 |
| `mcp__pencil__get_variables` | 디자인 토큰 읽기 |
| `mcp__pencil__set_variables` | 디자인 토큰 수정 |

### batch_design 예시

```javascript
mcp__pencil__batch_design({
  operations: [
    {
      type: "insert",
      element: {
        type: "frame",
        name: "LoginScreen",
        width: 375,
        height: 812
      }
    }
  ],
  postProcess: true  // 자동 정리 (ID 유니크화, 레이아웃 정리)
})
```

### batch_get 예시

```javascript
mcp__pencil__batch_get({
  filePath: "design.pen",
  nodeIds: ["frame-1"],
  readDepth: 10,
  resolveInstances: true,
  resolveVariables: true
})
```

## 디자인 → 코드 워크플로우

1. **구조 읽기**: `batch_get` (resolveInstances: true)
2. **토큰 추출**: `get_variables` → Tailwind/CSS 변환
3. **코드 생성**: 노드 → React 컴포넌트
4. **검증**: `get_screenshot`으로 시각 비교

### 속성 매핑

| Pencil | Tailwind |
|--------|----------|
| `layout: "horizontal"` | `flex flex-row` |
| `layout: "vertical"` | `flex flex-col` |
| `gap: 16` | `gap-4` |
| `cornerRadius: [8,8,8,8]` | `rounded-lg` |
| `padding: [16,16,16,16]` | `p-4` |

## 환경변수

| 변수 | 용도 |
|------|------|
| `PENCIL_CLI_KEY` | CI/CD용 API 키 |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `PENCIL_API_BASE` | 백엔드 URL (기본: https://api.pencil.dev) |
| `DEBUG` | 디버그 로깅 |

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| MCP 도구 없음 | Pencil 앱 먼저 실행 → Claude Code 재시작 |
| 연결 타임아웃 | 포트 33457 WebSocket 확인 |
| Invalid API key | `pencil login` 재실행 |
| 권한 오류 | 폴더 접근 프롬프트 허용 |

## 팁

1. **Pencil 먼저 실행** - MCP 서버가 앱과 함께 시작
2. **프레임 이름 지정** - batch_get 타겟팅 용이
3. **get_screenshot 자주** - 변경 후 시각 검증
4. **.pen = JSON** - Git diff 가능, 자동화 워크플로우에 유리
