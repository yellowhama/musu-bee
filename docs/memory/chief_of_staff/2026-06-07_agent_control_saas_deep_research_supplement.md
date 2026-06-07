# 2026-06-07 Agent Control SaaS Deep Research Supplement

The existing SaaS landscape research and AG UI/UX design were supplemented with
new primary-source comparisons checked on 2026-06-07.

Added comparators:

- GitHub Copilot CLI Remote Control:
  `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control`
- GitHub Copilot cloud/local sandboxes:
  `https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes`
- GitHub Actions self-hosted runners:
  `https://docs.github.com/en/actions/reference/runners/self-hosted-runners`
- VS Code Remote Tunnels:
  `https://code.visualstudio.com/docs/remote/tunnels`
- Cloudflare Tunnel:
  `https://developers.cloudflare.com/tunnel/`
- Tailscale DERP servers:
  `https://tailscale.com/docs/reference/derp-servers`
- Factory Droids:
  `https://factory.ai/product/droids`

Key product conclusions:

- Claude Code Remote Control and GitHub Copilot CLI Remote Control are now the
  closest direct comparators for MUSU.PRO remote input into local execution.
- Web/mobile may submit prompts, answer questions, approve/deny plans and
  permission requests, cancel current work, and view status/evidence.
- Local files, shell commands, tools, adapters, and process ownership must stay
  on the selected MUSU Desktop device unless a separate hosted-worker mode is
  explicitly introduced later.
- Self-hosted-runner semantics should shape device scheduling: online/idle
  matching, capability labels, assignment, pickup timeout, queued state, stale
  runner detection, and externalized logs.
- Tunnel/relay features must be authenticated, non-anonymous, owner-scoped,
  expiring, revocable, and backed by route metadata, transport proof, and
  payload delivery proof before closing release gates.

Updated files:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`
- `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs\MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md`

Release impact:

- This is docs/spec/research progress only.
- Public release remains No-Go until second-PC route/CPU/matrix, live
  `musu.pro` release-grade relay proof, support mailbox proof, and Store proof
  pass.

Search terms should include `agent control SaaS deep research supplement`,
`GitHub Copilot CLI Remote Control`, `self-hosted runners`, `VS Code Remote
Tunnels`, `Cloudflare Tunnel`, `Tailscale DERP`, `MUSU.PRO remote input`,
`local MUSU Desktop execution`, `remote control local execution`, and `no
anonymous agent tunnels`.
