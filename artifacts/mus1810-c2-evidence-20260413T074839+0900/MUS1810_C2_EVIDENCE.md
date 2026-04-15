MUS-1810 C2 evidence bundle (runtime-blocked)

Artifact (frozen source)
- path: /home/hugh51/musu-functions/artifacts/mus1783-work-hub-remediation.pen
- sha256: a2ea382aeec40230b92e4372df03c12107c2ee07b62c8ba38b802ca7434355f1
- bytes: 389279

Screenshot export rows (required: yTjpK, MtTkh, KyTms)
- [TBD: awaiting real data] provider=PencilMCP field=screenshot_export_yTjpK_absolute_path_dimensions_sha256 owner=Founding Engineer eta=2026-04-13T12:05:27+09:00
- [TBD: awaiting real data] provider=PencilMCP field=screenshot_export_MtTkh_absolute_path_dimensions_sha256 owner=Founding Engineer eta=2026-04-13T12:05:27+09:00
- [TBD: awaiting real data] provider=PencilMCP field=screenshot_export_KyTms_absolute_path_dimensions_sha256 owner=Founding Engineer eta=2026-04-13T12:05:27+09:00

State matrix (concrete node refs from frozen artifact)
- default: id=qkE48 path=LJrCv/daGEE/qkE48 name=proj1Text content="Alpha"
- hover: id=RDgpz path=RDgpz name=IconButton/Default supporting-note-id=tZoaA("Hover to see elevated shadow effect.")
- selected: id=agJ90 path=f7nL0/5DJc7/VPpBC/agJ90 name=mhTab1Txt content="Home"
- disabled: id=YqN0M path=f7nL0/5DJc7/FWvVb/YqN0M name=mhTab2Txt content="Chat"
- error: id=1e3K2 path=1e3K2 name=Badge/Error
- unread-badge: id=Y7Lzq path=E6wnS/hN5S4/dS4zZ/ZIUA1/2RPKV/Y7Lzq name=recBadge

Minimal command transcript (with exit codes)
- sync MCP binding: /home/hugh51/.agents/skills/pencil-dev-design-workflow/scripts/sync_pencil_mcp.sh -> exit 0 (01_sync.exit)
- reload+check target pen: reload -> exit 2 (02_reload.exit), check -> exit 2 (03_check.exit)
- forced start path: stop -> exit 0, start -> exit 0, check -> exit 2 (04/05/06)
- AppImage path: stop -> exit 0, start -> exit 0, check -> exit 2 (07/08/09)
- headless CLI fallback: pencil interactive --in ... --out ... -> exit 1, error="Authentication required" (13_headless_interactive_probe.log)
- desktop binary export fallback: timeout 20s pencil -i ... -e ... --export-scale 1 -> exit 124, output file missing (14_desktop_cli_export_probe.exit)

Runtime blocker row
- [TBD: awaiting real data] provider=runtime-process field=mus1810_clean_export_window owner=Founding Engineer eta=2026-04-13T12:05:27+09:00

MUS1644_PACKET_C2_GATE: NO-GO
