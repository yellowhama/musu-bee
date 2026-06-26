import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const srcTauriRoot = join(appRoot, "src-tauri");
const sidecarRoot = join(srcTauriRoot, "binaries");
const brainPinPath = join(srcTauriRoot, "musu-brain.pin.json");
const packageJsonPath = join(appRoot, "package.json");
const brainOnly = process.argv.includes("--brain-only");

const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

if (!targetTriple) {
  throw new Error("rustc --print host-tuple returned an empty target triple");
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const brainPin = JSON.parse(readFileSync(brainPinPath, "utf8"));
if (brainPin.product_version !== packageJson.version) {
  throw new Error(
    `musu-brain pin product_version ${brainPin.product_version} does not match package.json ${packageJson.version}`
  );
}

const brainRepo =
  process.env.MUSU_BRAIN_REPO ||
  resolve(repoRoot, "..", "..", "musu_2nd_brain");
if (!existsSync(join(brainRepo, "go.mod"))) {
  throw new Error(
    `Musu Brain repo not found at ${brainRepo}; set MUSU_BRAIN_REPO to the Go engine checkout`
  );
}

function assertBrainRepoMatchesPin() {
  const brainRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: brainRepo,
    encoding: "utf8",
  }).trim();
  if (brainRevision !== brainPin.vcs_revision) {
    throw new Error(
      `musu-brain pin revision ${brainPin.vcs_revision} does not match ${brainRepo} HEAD ${brainRevision}`
    );
  }
  const brainDirty = execFileSync("git", ["status", "--porcelain=v1"], {
    cwd: brainRepo,
    encoding: "utf8",
  }).trim();
  if (brainDirty) {
    throw new Error("musu-brain repo has uncommitted changes; refusing to bundle a dirty knowledge chip");
  }
}

assertBrainRepoMatchesPin();
mkdirSync(sidecarRoot, { recursive: true });

const extension = process.platform === "win32" ? ".exe" : "";
const builtBinary = join(repoRoot, "musu-rs", "target", "release", `musu${extension}`);
const sidecarBinary = join(sidecarRoot, `musu-${targetTriple}${extension}`);
const brainSidecarBinary = join(sidecarRoot, `musu-brain-${targetTriple}${extension}`);

if (!brainOnly) {
  execFileSync(
    "cargo",
    ["build", "--manifest-path", join(repoRoot, "musu-rs", "Cargo.toml"), "--bin", "musu", "--release"],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  );

  copyFileSync(builtBinary, sidecarBinary);
  console.log(`Prepared MUSU runtime sidecar ${sidecarBinary}`);
}

assertBrainRepoMatchesPin();
execFileSync("go", ["build", "-o", brainSidecarBinary, brainPin.main_package], {
  cwd: brainRepo,
  stdio: "inherit",
});

console.log(`Prepared MUSU Brain knowledge sidecar ${brainSidecarBinary}`);
