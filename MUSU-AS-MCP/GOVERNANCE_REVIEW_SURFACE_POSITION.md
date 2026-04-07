# Governance Review Surface Position

## 목적

`musu_corp`에서 도그푸딩된 approval / escalation / morning review / board review 중,
`MUSU-AS-MCP`가 읽기 surface로 가져갈 수 있는 범위를 고정한다.

## 원칙

- governance domain의 정식 owner는 `MUSU-WORKS`다.
- `MUSU-AS-MCP`는 owner가 아니라 consumer surface 후보다.
- 즉 `MUSU-AS-MCP`는 review/governance 데이터를 “보여주고 호출하는” 쪽이지, source of truth가 아니다.

## `MUSU-AS-MCP`가 가질 수 있는 것

### read surface

- current approval summary
- escalation summary
- morning review summary
- board decision recent entries

### action surface

- approval decision trigger
- review packet open/read action
- queue/report deep link action

## `MUSU-AS-MCP`가 직접 가지지 않는 것

- board decision canonical storage
- approval queue canonical ownership
- escalation record canonical ownership
- worker result canonical contract

이건 여전히 `MUSU-WORKS` 또는 루트 runtime capability가 가진다.

## 의미

- `MUSU-AS-MCP`는 self-control / native UI mirror product다.
- 따라서 governance/review는 “운영판넬에서 읽고 조작하는 surface”로 들어갈 수 있다.
- 하지만 domain source는 company ops 쪽에 남는 것이 맞다.

## 즉시 다음 단계

1. 어떤 review/governance surface를 MCP tool family로 읽을지 정한다.
2. source owner와 consumer surface를 분리한 채 문서화한다.
