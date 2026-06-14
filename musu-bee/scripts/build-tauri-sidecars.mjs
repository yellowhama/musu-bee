import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const srcTauriRoot = join(appRoot, "src-tauri");
const sidecarRoot = join(srcTauriRoot, "binaries");

const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

if (!targetTriple) {
  throw new Error("rustc --print host-tuple returned an empty target triple");
}

execFileSync(
  "cargo",
  ["build", "--manifest-path", join(repoRoot, "musu-rs", "Cargo.toml"), "--bin", "musu", "--release"],
  {
    cwd: repoRoot,
    stdio: "inherit",
  }
);

const extension = process.platform === "win32" ? ".exe" : "";
const builtBinary = join(repoRoot, "musu-rs", "target", "release", `musu${extension}`);
const sidecarBinary = join(sidecarRoot, `musu-${targetTriple}${extension}`);

mkdirSync(sidecarRoot, { recursive: true });
copyFileSync(builtBinary, sidecarBinary);

console.log(`Prepared MUSU runtime sidecar ${sidecarBinary}`);
