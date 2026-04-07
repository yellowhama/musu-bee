# MUSU-WORKS Viewer

## 목적

`MUSU-WORKS`의 mock fixtures를 사람이 바로 읽을 수 있는 read-only company viewer다.

## 실행

`MUSU-WORKS` 루트에서:

```bash
python3 -m http.server 8788
```

그 다음 브라우저에서:

```text
http://127.0.0.1:8788/viewer/
```

## 읽는 데이터

- `mock/company_alpha.json`
- `mock/org_chart_alpha.json`
- `mock/projects_alpha.json`
- `mock/approvals_alpha.json`
- `mock/mcp_surface_examples.json`
- `mock/runtime_contract_alpha.json`

## 현재 범위

- company overview
- org chart summary
- approvals queue
- runtime lane and safety summary
- projects list
- contract notes

## 다음 단계

- interactive filters
- project detail drawer
- original app parity comparison
