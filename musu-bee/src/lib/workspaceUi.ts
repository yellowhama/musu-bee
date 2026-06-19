import "server-only";

/**
 * Runtime gate for the web workspace SaaS surface (companies / agents / ceo /
 * canvas / dashboard, backed by PAPERCLIP). That surface was built out in a
 * separate repo (yellowhama/musu-website-co); the copy still living in musu-bee
 * is leftover frontend whose bridge/PAPERCLIP calls 401 / go OFFLINE on the web,
 * because real work runs on the desktop app, not in the browser.
 *
 * Until it is re-integrated, the web /app and /workspace routes show the
 * "Use MUSU Desktop" gate instead of mounting AppShell. Mounting nothing is what
 * actually kills the companies-401 / ceo-OFFLINE symptoms — they originate at
 * AppShell mount (the data hooks fire on mount, independent of navigation), so a
 * server-side gate that prevents the mount is the only correct seam.
 *
 * This is a RUNTIME server-side flag (NOT NEXT_PUBLIC_*, NOT build-time): the
 * code stays compiled and type-checked, and the surface can be turned back on by
 * setting MUSU_WORKSPACE_UI=true without a rebuild. Default OFF — the gate shows
 * unless explicitly enabled.
 */
export function isWorkspaceUiEnabled(): boolean {
  return process.env.MUSU_WORKSPACE_UI?.trim().toLowerCase() === "true";
}
