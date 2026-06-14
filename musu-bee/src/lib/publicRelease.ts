export const PUBLIC_CONFIG_SCHEMA = "musu.public_config.v1";
export const PUBLIC_RELEASE_VERSION = "1.15.0-rc.1";
export const PUBLIC_RELEASE_METADATA_TEXT = `MUSU public release metadata: ${PUBLIC_RELEASE_VERSION}`;

// Public desktop download artifacts, hosted on the fixed-tag GitHub release
// (desktop-latest). The .appinstaller is the primary entry point: double-
// clicking it installs MUSU and registers it for 24h auto-update. The .cer is
// the self-signed public certificate the user must trust BEFORE installing
// (the package is self-signed, not Store-signed). The .msix is the raw package
// for manual Add-AppxPackage installs. These exact filenames match what
// build-msix.ps1 publishes; the tag stays put while artifacts are overwritten
// per build, so the URLs never rot.
const DESKTOP_RELEASE_BASE =
  "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest";
export const DESKTOP_APPINSTALLER_URL = `${DESKTOP_RELEASE_BASE}/musu.appinstaller`;
export const DESKTOP_MSIX_URL = `${DESKTOP_RELEASE_BASE}/musu-desktop-x64.msix`;
export const DESKTOP_CERT_URL = `${DESKTOP_RELEASE_BASE}/blossompark.musu.cer`;
