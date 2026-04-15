MUS-1810 C2 evidence attempt (clean-context replay, 2026-04-13 KST)

Frozen source artifact (verified):
- path: `/home/hugh51/musu-functions/artifacts/mus1783-work-hub-remediation.pen`
- sha256: `a2ea382aeec40230b92e4372df03c12107c2ee07b62c8ba38b802ca7434355f1`
- bytes: `389279`

Required screenshot rows:
- [TBD: awaiting real data] provider=PencilMCP field=screenshot_export_yTjpK_abs_path_dimensions_sha256 owner=Founding Engineer eta=2026-04-13T12:00:00+09:00
- [TBD: awaiting real data] provider=PencilMCP field=screenshot_export_MtTkh_abs_path_dimensions_sha256 owner=Founding Engineer eta=2026-04-13T12:00:00+09:00
- [TBD: awaiting real data] provider=PencilMCP field=screenshot_export_KyTms_abs_path_dimensions_sha256 owner=Founding Engineer eta=2026-04-13T12:00:00+09:00

State matrix (artifact-backed node refs):
- default: id=`qkE48` name=`proj1Text` content=`Alpha` fill=`#2D1D19`
- hover: [TBD: awaiting real data] provider=PencilMCP field=hover_state_node_ref owner=Founding Engineer eta=2026-04-13T12:00:00+09:00
- selected: id=`agJ90` name=`mhTab1Txt` content=`Home` fill=`#2D1D19`
- disabled: id=`YqN0M` name=`mhTab2Txt` content=`Chat` fill=`#2d1d1966`
- error: id=`1e3K2` name=`Badge/Error` fill=`$status-error`
- unread-badge: id=`Y7Lzq` name=`recBadge` fill=`#A8C99D`

Minimal command transcript with exit codes:
- `/home/hugh51/musu-functions/artifacts/mus1810-c2-evidence-20260413T074839+0900/15_command_transcript.txt`
- Key exits: sync=0, reload=2, check=2, force-start-check=2, appimage-check=2, mcp-rebind=0/0/0, headless-cli-probes=1(auth required)

Runtime blocker evidence:
- connection checks show missing IPC markers (`loadFile/addResource/initialized`) despite running process:
  - `/home/hugh51/musu-functions/artifacts/mus1810-c2-evidence-20260413T074839+0900/03_check.log`
  - `/home/hugh51/musu-functions/artifacts/mus1810-c2-evidence-20260413T074839+0900/06_check_after_force.log`
  - `/home/hugh51/musu-functions/artifacts/mus1810-c2-evidence-20260413T074839+0900/09_check_appimage.log`
- headless CLI path blocked by auth:
  - `/home/hugh51/musu-functions/artifacts/mus1810-c2-evidence-20260413T074839+0900/13_headless_smoke.log`
  - `/home/hugh51/musu-functions/artifacts/mus1810-c2-evidence-20260413T074839+0900/14_cli_export_smoke.log`

@CTO unblock requested: provide one of
1) healthy Pencil MCP desktop attach window for this run, or
2) `PENCIL_CLI_KEY`/auth path for headless export replay.

MUS1644_PACKET_C2_GATE: NO-GO
