# Uninstall Lifecycle E2E Checklist (2026-06-24)

Validates the full packaged-MSIX install → uninstall → reinstall lifecycle so a
machine cleanly removes itself (local + cloud) and can be reinstalled fresh.
WS-B B-3. User-gated (real packaged MSIX, two paths: cockpit button +
`Uninstall-MUSU.ps1`).

> Components under test (all shipped): U-A (update reconcile, boot-time stale
> bin/ cleanup), U-B (local purge), U-C (cloud self-deregister, PR #20), and
> Method A (mesh.env hot-reload). See CHANGELOG + the U-series tasks.

## Prereqs
- rc.9 MSIX installed from the `desktop-latest` release (or local build-msix.ps1).
- Logged in to a musu account; at least one node registered in the cloud fleet.
- `https://musu.pro/uninstall.ps1` → 200 (verified; the bootstrap of Uninstall-MUSU.ps1).

## Path 1 — cockpit "Uninstall" button
1. Open cockpit → settings → Uninstall.
2. Confirm the destructive prompt (type the confirm phrase).
3. Expect, in order (loud fail-open — every step records pass/fail, uninstall
   always completes):
   - [ ] U-C cloud deregister runs FIRST (token + tailnet identity still live) →
         the node disappears from the owner's fleet (check another machine's
         cockpit or `musu nodes`). Resolved by tailnet-IP overlap, never by name.
   - [ ] mesh leave + logout.
   - [ ] U-B local purge (with `--purge --i-understand-this-deletes-data
         --i-have-a-backup` when data deletion is intended).
   - [ ] MSIX package removed (`blossompark.musu` gone from `Get-AppxPackage`).
4. [ ] No ghost node left in the cloud fleet.

## Path 2 — `Uninstall-MUSU.ps1` (standalone script)
1. `irm https://musu.pro/uninstall.ps1 | iex` (or run the downloaded script).
2. Step [1/5] runs `musu uninstall --deregister` (cloud deregister) — confirm it
   reaches the cloud before the package is torn down.
3. Confirm phrase "REMOVE MUSU".
4. [ ] Cert thumbprint `65F5926444D563966C75F000C384C8530B1D8DD8` cleaned.
5. [ ] Package `blossompark.musu` removed.
6. [ ] Legacy `~/.musu` + `~/.musubrain` (if requested) handled per flags.
7. [ ] No ghost node in cloud fleet.

## Reinstall (fresh)
1. Reinstall rc.9 MSIX.
2. [ ] U-A reconcile runs at first boot: no stale bin/ from the prior install;
       bridge.json/PID consistent (G-1 PID-aware discover prevents ghost records).
3. [ ] Cockpit comes up, login works (device-flow), node re-registers cleanly.
4. [ ] Fleet shows exactly one entry for this machine (no duplicate/ghost from
       the pre-uninstall registration).

## Pass criteria
- [ ] Both uninstall paths converge: local gone + cloud node evicted + no ghost.
- [ ] Reinstall is clean (no stale bin/, no duplicate fleet node).
- [ ] Loud fail-open honored: any failed step left a "remove manually from
      cockpit fleet" hint and uninstall still completed.

## Notes
- U-C resolves the self-node by tailnet-IP overlap (live `tailscale ip`
  preferred; persisted IP ignored when live is available) — never by name, since
  ghosts share names. Cross-account eviction is impossible (owner-scope re-assert).
- This is the lifecycle counterpart to the fleet 3-state E2E
  (`E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`); run both on the same rc.9 build.
