export const PUBLIC_CONFIG_SCHEMA = "musu.public_config.v1";
export const PUBLIC_RELEASE_VERSION = "1.15.0-rc.21";
export const PUBLIC_RELEASE_METADATA_TEXT = `MUSU public release metadata: ${PUBLIC_RELEASE_VERSION}`;

// Public desktop download artifacts, hosted on the fixed-tag GitHub release
// (desktop-latest). The .appinstaller is the primary entry point: double-
// clicking it installs MUSU and registers it for 24h auto-update. The .cer is
// the self-signed public certificate the user must trust BEFORE installing
// (the package is self-signed, not Store-signed). The .msix is the raw package
// for manual Add-AppxPackage installs. These exact filenames match what
// build-msix.ps1 publishes to the fixed `desktop-latest` tag. NOTE: publishing
// is currently a MANUAL step (no CI uploads these artifacts), so the URLs only
// stay valid as long as each release re-uploads these exact names — a post-
// deploy HEAD canary on all four is the cheapest guard against drift.
const DESKTOP_RELEASE_BASE =
  "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest";
export const DESKTOP_APPINSTALLER_URL = `${DESKTOP_RELEASE_BASE}/musu.appinstaller`;
export const DESKTOP_MSIX_URL = `${DESKTOP_RELEASE_BASE}/musu-desktop-x64.msix`;
export const DESKTOP_CERT_URL = `${DESKTOP_RELEASE_BASE}/blossompark.musu.cer`;
// One-click installer: downloads + trusts the cert + installs the .appinstaller
// in a single elevated run, so the beta user never types a certificate command.
// (Removed entirely once the Store release ships — Store re-signs the package.)
export const DESKTOP_INSTALL_SCRIPT_URL = `${DESKTOP_RELEASE_BASE}/Install-MUSU.ps1`;
// One-line post-install fleet repair/check for another PC:
//     irm https://musu.pro/repair-fleet.ps1 | iex
// Proxies the canonical repair-fleet-node-public-url.ps1 from the same fixed
// GitHub release, so a freshly installed machine can verify/re-publish its
// LAN-usable fleet URL without cloning this repo.
export const DESKTOP_REPAIR_FLEET_SCRIPT_URL = `${DESKTOP_RELEASE_BASE}/repair-fleet-node-public-url.ps1`;
// One-line uninstaller, served at /uninstall.ps1 (mirror of the installer):
//     irm https://musu.pro/uninstall.ps1 | iex
// Proxies the canonical Uninstall-MUSU.ps1 from the same fixed GitHub release —
// single source of truth, kept in lockstep with the pinned package family + cert
// thumbprint the CLI's --print-removal-command emits. (Removed once the Store
// release ships — Store owns the uninstall lifecycle.)
export const DESKTOP_UNINSTALL_SCRIPT_URL = `${DESKTOP_RELEASE_BASE}/Uninstall-MUSU.ps1`;
// Classic double-click installer (NSIS .exe). Bundles the WebView2 offline
// installer, so it works on a clean PC with no prerequisites. For users who
// prefer a familiar "download the .exe and run it" flow over the one-line PS.
export const DESKTOP_SETUP_EXE_URL = `${DESKTOP_RELEASE_BASE}/MUSU_1.15.0_x64-setup.exe`;
