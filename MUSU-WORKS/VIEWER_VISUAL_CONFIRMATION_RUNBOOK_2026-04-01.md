# Viewer Visual Confirmation Runbook 2026-04-01

## 목적

root-level viewer의 마지막 수동 확인 항목을 한 번에 끝낼 수 있도록 확인 절차를 고정한다.

## 실행

```bash
cd /home/hugh51/musu-functions
python3 -m http.server 8788
```

브라우저:

```text
http://127.0.0.1:8788/viewer/
```

## 확인 항목

### 1. Overview

- `Active Agents`
- `Active Projects`
- `Role Templates`
- `Live Sessions`
- `Approval Backlog`
- `Pending Approvals`

위 6개 stat 카드가 보이면 통과.

### 2. Org Chart

- CEO root card가 보이는지
- direct reports가 보이는지
- 상태 chip이 보이는지

### 3. Role Templates

- `CEO`
- `Engineering Manager`
- `Builder`
- `Reviewer`
- `QA`
- `Policy Officer`

최소 6개 role card가 보이면 통과.

### 4. Projects

각 project card에 아래가 보여야 한다.

- attached agents 수
- live sessions 수
- pipeline stage
- channel chip
- session list

### 5. Contract Notes

아래 성격의 note가 보여야 한다.

- company overview surface
- project overview surface
- role template surface
- session runtime surface
- runtime isolation

## 캡처 권장

- 전체 페이지 1장
- Projects section 1장
- Role Templates section 1장

## 결과 기록 형식

- `pass` / `fail`
- 보이지 않은 섹션
- 레이아웃 깨짐 여부
- 텍스트 잘림 여부

## 현재 결론

이 문서 기준으로 한 번만 확인하면 `PLAN_11`의 수동 렌더링 검증은 닫을 수 있다.
