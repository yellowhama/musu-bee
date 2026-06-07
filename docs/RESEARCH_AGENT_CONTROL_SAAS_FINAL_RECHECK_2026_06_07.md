# Agent Control SaaS Final Source Recheck

Date: 2026-06-07 15:50 KST

## Scope

This is a final same-day source recheck after the release relay lease readiness
gate. It does not replace
`docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`; it records the
latest official-source comparison used to keep the MUSU roadmap and AG UI/UX
direction current.

Question checked:

Can MUSU.PRO be the remote input, project room, company meeting room,
rendezvous, path-selection, relay-fallback, and evidence control plane while
MUSU Desktop on each device remains the local executor?

## Sources Rechecked

Official or primary sources rechecked:

- Claude Code Remote Control:
  `https://code.claude.com/docs/en/remote-control`
- OpenAI Codex product page:
  `https://openai.com/codex/`
- OpenAI Codex app announcement:
  `https://openai.com/index/introducing-the-codex-app/`
- OpenAI Codex GitHub repository:
  `https://github.com/openai/codex`
- GitHub Copilot cloud agent:
  `https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github`
- GitHub third-party coding agents:
  `https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents`
- Cursor Background Agents:
  `https://docs.cursor.com/background-agent`
- Cursor Web and Mobile Agents:
  `https://docs.cursor.com/en/background-agent/web-and-mobile`
- Google Jules:
  `https://jules.google/docs/`
- Devin:
  `https://docs.devin.ai/get-started/devin-intro`
- Replit Agent:
  `https://docs.replit.com/references/agent/overview`
- Tailscale control/data planes:
  `https://tailscale.com/docs/concepts/control-data-planes`
- Tailscale DERP servers:
  `https://tailscale.com/docs/reference/derp-servers`

## Findings

The strongest direct comparator remains Claude Code Remote Control: a
web/mobile surface controls a local coding session, and the local machine keeps
the filesystem, shell, tools, and project context. That validates the MUSU
boundary more strongly than generic cloud-agent products do.

OpenAI Codex validates the command-center direction. The product page and app
announcement position Codex as a multi-agent command center, while the GitHub
repo still describes Codex CLI as a local coding agent. For MUSU, the lesson is
not "move execution to cloud by default"; it is "make multi-agent supervision
first-class and label execution location clearly."

GitHub validates an agent marketplace/control surface: Copilot cloud agent can
start sessions from GitHub, issues, dashboards, and chat, while third-party
agents can be launched from the Agents tab, issues, pull requests, GitHub
Mobile, and VS Code. MUSU should borrow the multi-surface assignment and review
pattern, but it must not inherit GitHub's default cloud-execution assumption.

Cursor, Jules, Devin, and Replit validate async background work, follow-ups,
plan approval, take-over/review, and team collaboration. Most of those systems
execute in vendor infrastructure or hosted workspaces. MUSU's product edge is
showing that the same remote convenience can be applied to local runtimes and a
device mesh.

Tailscale remains the cleanest control-plane/data-plane reference. The
coordination server maintains device metadata, keys, policies, route
configuration, and DERP selection, while devices carry the data plane. MUSU.PRO
should do the analogous work for identity, room state, presence, rendezvous,
path selection, relay fallback, and evidence without becoming the local
executor or default payload path.

## Product Decision

Keep the product split:

- MUSU.PRO: remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback, evidence, notifications, and
  team policy.
- MUSU Desktop: local filesystem/process/tool/adapter executor, local
  permission boundary, resource evidence recorder, route candidate publisher,
  and relay byte-path owner.
- P2P mesh: preferred data/work route after MUSU.PRO bootstrap.
- Hosted relay: explicit fallback only after direct path failure, policy allow,
  lease readiness, transport proof, and payload delivery proof.

## AG UI/UX Implications

AG UI should be an operator cockpit, not a marketing or generic chatbot
surface.

Required first-screen controls:

- room selector
- target device or agent group selector
- execution locus label
- route policy selector
- permission/approval policy
- queue/pickup timeout
- cancel/revoke control
- evidence status

Required execution-locus strip:

- `Input from <surface>`
- `Executing on <device/runtime>`
- `Route <local|lan|direct_quic|relay|cloud>`
- `Evidence <ok|missing|failed>`

The submit path must be disabled when no eligible MUSU Desktop runtime is
online unless the order is explicitly queued with a pickup timeout. `localhost`
must remain a local diagnostic detail, not the normal user-facing release URL.

## Release Meaning

This recheck changes no release marker. Public release remains No-Go until the
same blockers close:

- successful second-PC route/CPU/matrix evidence
- release relay tunnel runtime byte path
- release payload endpoint beyond preflight
- live MUSU.PRO owner-scoped route metadata
- live transport proof and payload delivery proof
- support mailbox proof
- Microsoft Store / Partner Center proof
