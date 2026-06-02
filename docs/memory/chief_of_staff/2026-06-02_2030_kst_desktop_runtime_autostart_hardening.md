# 2026-06-02 20:30 KST Desktop Runtime Autostart Hardening

Decision: MUSU Desktop activation should start or reuse the bridge runtime. The
previous evidence found that desktop activation alone left runtime `0`, and
process ownership only passed after an explicit packaged `musu up --json`.

Implementation:

- `musu-bee\src-tauri\src\lib.rs` spawns one background
  `musu-runtime-autostart` thread during setup when bridge health is missing or
  failed.
- Manual `Start Runtime` and autostart now prefer the packaged sibling
  `musu.exe` next to `musu-desktop.exe` before PATH fallback.
- This reduces the known developer alias shadowing risk from
  `C:\Users\empty\.cargo\bin\musu.exe`.

Validation:

- `cargo fmt --manifest-path .\musu-bee\src-tauri\Cargo.toml`
- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -- --test-threads=1`
  passed 7/7
- `git diff --check` passed

Release caveat: this is Tauri source. Fresh MSIX install/evidence is required
before current release evidence is clean again.
