# MUS-1810 C2 Evidence Attempt (Blocked)

## Artifact baseline
- Artifact: `/home/hugh51/musu-functions/artifacts/mus1783-work-hub-remediation.pen`
- sha256: `a2ea382aeec40230b92e4372df03c12107c2ee07b62c8ba38b802ca7434355f1`
- size: `389279` bytes

## Minimal command transcript with exit codes
- `sync_pencil_mcp.sh` → `01_sync.exit=0`
- `reload_pencil_dev.sh <artifact>` → `02_reload.exit=2`
- `check_pencil_connection.sh <artifact>` → `03_check.exit=2`
- `stop_pencil_dev.sh` → `04_stop.exit=0`
- `PENCIL_FORCE_LAUNCH=1 start_pencil_dev.sh <artifact>` → `05_start_force.exit=0`
- `check_pencil_connection.sh <artifact>` → `06_check_after_force.exit=2`
- `stop_pencil_dev.sh` → `07_stop_before_appimage.exit=0`
- `PENCIL_FORCE_LAUNCH=1 PENCIL_PREFER_APPIMAGE=1 start_pencil_dev.sh <artifact>` → `08_start_appimage.exit=0`
- `check_pencil_connection.sh <artifact>` → `09_check_appimage.exit=2`
- `codex mcp remove/add/get pencil` (rebind attempt) → `10=0,11=0,12=0`
- `pencil interactive -i <artifact> -o <session.pen> < scripted export_nodes` → `14_headless_interactive.exit=1`

Failure signals:
- `03_check.log` and `09_check_appimage.log` both show `process-running: 1` but `loadFile/addResource/initialized/claude-status/codex-status` all missing.
- Headless export log reports: `Authentication required. Run "pencil login" or set PENCIL_CLI_KEY`.

## Screenshot export rows
- `[TBD: awaiting real data] provider=PencilMCP field=screenshot_export_yTjpK(abs_path,dimensions,sha256) owner=Founding Engineer eta=2026-04-13T09:30:00+09:00`
- `[TBD: awaiting real data] provider=PencilMCP field=screenshot_export_MtTkh(abs_path,dimensions,sha256) owner=Founding Engineer eta=2026-04-13T09:30:00+09:00`
- `[TBD: awaiting real data] provider=PencilMCP field=screenshot_export_KyTms(abs_path,dimensions,sha256) owner=Founding Engineer eta=2026-04-13T09:30:00+09:00`

## State matrix rows (artifact refs)
- `default`: node `qkE48` (`content: "Alpha"`, artifact line hit around 5261)
- `[TBD: awaiting real data] provider=PencilMCP field=hover_state_node_ref owner=Founding Engineer eta=2026-04-13T09:30:00+09:00`
- `selected`: node `agJ90` (`content: "Home"`, line hit around 10491)
- `disabled`: node `YqN0M` (line hit around 10521)
- `error`: node `1e3K2` (line hit around 641)
- `unread-badge`: node `Y7Lzq` (line hit around 7295)

## Gate token
- `MUS1644_PACKET_C2_GATE: NO-GO`
