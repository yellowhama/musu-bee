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

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

for (const name of ["styles.css", "main.js"]) {
  copyFileSync(join(sourceRoot, name), join(outRoot, name));
}

// Bundled fonts (local woff2 @font-face — no Google Fonts network fetch). Copy
// the whole fonts/ dir so the desktop shell renders offline / instantly.
cpSync(join(sourceRoot, "fonts"), join(outRoot, "fonts"), { recursive: true });

const html = readFileSync(join(sourceRoot, "index.html"), "utf8")
  .replaceAll("__MUSU_VERSION__", version);
writeFileSync(join(outRoot, "index.html"), html);

const metadata = {
  product: "MUSU",
  version,
  generated_at: new Date().toISOString(),
  shell: "tauri-runtime-launcher",
};
writeFileSync(join(outRoot, "desktop-shell.json"), JSON.stringify(metadata, null, 2));

console.log(`Built Tauri desktop shell ${version} -> ${outRoot}`);
