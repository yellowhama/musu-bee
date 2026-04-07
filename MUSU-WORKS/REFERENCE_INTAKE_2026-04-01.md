# Reference Intake 2026-04-01

## 받은 레퍼런스

### PaperClip

- GitHub source:
  - `/home/hugh51/musu-functions/references/paperclip-github/paperclip-master`
- npm package tarball:
  - `/home/hugh51/musu-functions/references/paperclipai-2026.325.0`
  - archive:
    `/home/hugh51/musu-functions/references/paperclipai-2026.325.0.tgz`

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/README.md)
- [`docs/start/architecture.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/start/architecture.md)
- [`docs/start/core-concepts.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/start/core-concepts.md)
- [`docs/api/companies.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/api/companies.md)
- [`docs/api/goals-and-projects.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/api/goals-and-projects.md)
- [`docs/api/approvals.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/api/approvals.md)
- [`docs/adapters/overview.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/adapters/overview.md)
- [`docs/adapters/codex-local.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/adapters/codex-local.md)

핵심 판단:

- `company`가 최상위 orchestration unit이다.
- `agent`, `goal`, `project`, `approval`, `cost`, `activity`가 회사를 중심으로 묶인다.
- adapter 구조가 분명하다.

### GStack

- GitHub source:
  - `/home/hugh51/musu-functions/references/gstack-main`
- archive:
  - `/home/hugh51/musu-functions/references/gstack-main.tar.gz`

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/gstack-main/README.md)
- [`ARCHITECTURE.md`](/home/hugh51/musu-functions/references/gstack-main/ARCHITECTURE.md)
- [`BROWSER.md`](/home/hugh51/musu-functions/references/gstack-main/BROWSER.md)
- [`docs/skills.md`](/home/hugh51/musu-functions/references/gstack-main/docs/skills.md)

핵심 판단:

- 회사 model이 아니라 skill/workflow system이다.
- role-driven specialist mode가 강점이다.
- persistent browser daemon과 QA/review/ship workflow가 강하다.

### OpenClaw

- GitHub source:
  - `/home/hugh51/musu-functions/references/openclaw-github/openclaw-main`
- npm package tarball:
  - `/home/hugh51/musu-functions/references/openclaw-npm-2026.3.31`
  - archive:
    `/home/hugh51/musu-functions/references/openclaw-2026.3.31.tgz`

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/openclaw-github/openclaw-main/README.md)
- [`VISION.md`](/home/hugh51/musu-functions/references/openclaw-github/openclaw-main/VISION.md)
- [`docs.acp.md`](/home/hugh51/musu-functions/references/openclaw-github/openclaw-main/docs.acp.md)

핵심 판단:

- OpenClaw는 회사 control plane이 아니라 execution runtime / autonomous employee 쪽 reference다.
- PaperClip README의 표현처럼 `If OpenClaw is an employee, Paperclip is the company` 구도가 성립한다.
- MUSU에는 `project-attached execution agent` reference로 보는 게 맞다.

### NanoClaw

- GitHub source:
  - `/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main`
- archive:
  - `/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main.tar.gz`

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/README.md)
- [`src/index.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/index.ts)
- [`src/container-runner.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/container-runner.ts)
- [`src/group-queue.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/group-queue.ts)
- [`src/db.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/db.ts)
- [`src/channels/registry.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/channels/registry.ts)

핵심 판단:

- NanoClaw는 OpenClaw와 비슷한 문제를 더 작은 코드베이스와 더 강한 container isolation으로 푼다.
- company model reference는 아니다.
- MUSU에는 lightweight worker runtime / isolation reference로 보는 게 맞다.

## MUSU에 대한 요약

- PaperClip에서 가져올 것:
  - company control plane
  - org chart
  - approvals / costs / activity / company-scoped APIs
  - adapter architecture

- GStack에서 가져올 것:
  - role templates
  - specialist workflows
  - persistent browser + QA loop
  - plan/review/ship 분리

- OpenClaw에서 가져올 것:
  - autonomous worker runtime 관점
  - employee-style execution loop
  - company/project plane 아래서 움직이는 agent runtime reference

- NanoClaw에서 가져올 것:
  - isolated container execution
  - per-context queue separation
  - lightweight runtime topology
  - group or project scoped memory partitioning
