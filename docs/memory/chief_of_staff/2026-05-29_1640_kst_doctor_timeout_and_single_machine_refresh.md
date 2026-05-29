# 2026-05-29 16:40 KST: doctor timeout and single-machine refresh

Context:

- After hardening the second-PC kit packet verifier, single-machine smoke had to be refreshed again on current code.
- The first rerun exposed a false negative in `musu doctor`: direct `GET /health` and dashboard `/api/doctor` were ok, but CLI doctor's bridge check timed out on Windows loopback.

Durable decisions:

- `musu doctor` bridge `/health` timeout is now 10 seconds instead of 3 seconds.
- Treat WindowsApps/MSIX alias shadowing as a `doctor` warning, not a single-machine beta blocker.
- A separate stale `claude.exe` process was spawning repeated `vercel ls` / Node CLI processes; it was terminated. The MUSU Next dev server was not the source of the Node fan-out.

Current evidence:

- Code commit: `d1a8e280f7a11726265aecca0bef8b7c4ac9ca48`
- Recorded evidence: `docs/evidence/single-machine/1.15.0-rc.1/20260529-163756-HUGH_SECOND.evidence.json`
- Verification: `docs/evidence/single-machine/1.15.0-rc.1/20260529-163756-HUGH_SECOND.verification.json`
- Summary: `docs/evidence/single-machine/1.15.0-rc.1/20260529-163756-HUGH_SECOND.summary.md`
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1640`
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_1640`
- Dashboard task: `4456cc33-bd26-4ae9-94dd-20245163296c`
- Bridge: `http://127.0.0.1:8723`

Remaining release truth:

- Public desktop release remains No-Go until clean/current second-PC MSIX install evidence, real two-machine multi-device evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store approval evidence are recorded.
