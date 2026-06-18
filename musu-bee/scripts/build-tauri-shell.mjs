import {
  createHash,
} from "node:crypto";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const sourceRoot = join(appRoot, "src-tauri-shell");
const outRoot = join(appRoot, "out");
const version = readFileSync(join(repoRoot, "VERSION"), "utf8").trim();

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

for (const name of ["styles.css", "main.js"]) {
  copyFileSync(join(sourceRoot, name), join(outRoot, name));
}

// Bundled fonts (local woff2 @font-face — no Google Fonts network fetch). Copy
// the whole fonts/ dir so the desktop shell renders offline / instantly.
cpSync(join(sourceRoot, "fonts"), join(outRoot, "fonts"), { recursive: true });

// Brand assets (real musu logo + favicon, copied from the site's public/images
// so the cockpit uses the SAME mark as the website/favicon). Bundled locally —
// no network fetch.
cpSync(join(sourceRoot, "assets"), join(outRoot, "assets"), { recursive: true });

const html = readFileSync(join(sourceRoot, "index.html"), "utf8")
  .replaceAll("__MUSU_VERSION__", version);
writeFileSync(join(outRoot, "index.html"), html);

const metadata = {
  schema: "musu.tauri_shell_build.v1",
  product: "MUSU",
  version,
  generated_at: new Date().toISOString(),
  shell: "tauri-runtime-launcher",
  source_root: "src-tauri-shell",
  output_root: "out",
  source_hashes: {
    "index.html": sha256File(join(sourceRoot, "index.html")),
    "main.js": sha256File(join(sourceRoot, "main.js")),
    "styles.css": sha256File(join(sourceRoot, "styles.css")),
  },
  output_hashes: {
    "index.html": sha256File(join(outRoot, "index.html")),
    "main.js": sha256File(join(outRoot, "main.js")),
    "styles.css": sha256File(join(outRoot, "styles.css")),
  },
  source_to_output: {
    "index.html": "replace __MUSU_VERSION__ with VERSION file value",
    "main.js": "copy byte-for-byte",
    "styles.css": "copy byte-for-byte",
    "fonts/": "copy recursively",
  },
};
writeFileSync(join(outRoot, "desktop-shell.json"), JSON.stringify(metadata, null, 2));

console.log(`Built Tauri desktop shell ${version} -> ${outRoot}`);
