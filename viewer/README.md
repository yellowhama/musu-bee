# MUSU Functions Viewer

## 실행

```bash
cd /home/hugh51/musu-functions
python3 -m http.server 8788
```

브라우저:

```text
http://127.0.0.1:8788/viewer/
```

## 데이터 소스

viewer는 아래 canonical fixture를 읽는다.

- `MUSU-WORKS/mock/company_alpha.json`
- `MUSU-WORKS/mock/org_chart_alpha.json`
- `MUSU-WORKS/mock/role_templates_alpha.json`
- `MUSU-WORKS/mock/projects_alpha.json`
- `MUSU-WORKS/mock/agent_attachments_alpha.json`
- `MUSU-WORKS/mock/approvals_alpha.json`
- `MUSU-WORKS/mock/mcp_surface_examples.json`

## 현재 표시 범위

- company overview
- org chart
- role templates
- approvals
- projects with attached agents and live sessions
- contract/runtime notes
