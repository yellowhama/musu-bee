import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const sourceRoot = join(appRoot, "src-tauri-shell");
const outRoot = join(appRoot, "out");
const metadataPath = join(outRoot, "desktop-shell.json");
const version = readFileSync(join(repoRoot, "VERSION"), "utf8").trim();
const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function requireFile(path, label) {
  if (!existsSync(path)) {
    fail(`${label} missing at ${path}`);
    return false;
  }
  return true;
}

if (requireFile(metadataPath, "desktop shell metadata")) {
  const metadata = JSON.parse(readText(metadataPath));
  if (metadata.schema !== "musu.tauri_shell_build.v1") {
    fail(`metadata schema mismatch: ${metadata.schema || "(missing)"}`);
  }
  if (metadata.version !== version) {
    fail(`metadata version mismatch: expected ${version}, got ${metadata.version || "(missing)"}`);
  }
  if (metadata.source_root !== "src-tauri-shell") {
    fail(`metadata source_root mismatch: ${metadata.source_root || "(missing)"}`);
  }
  if (metadata.output_root !== "out") {
    fail(`metadata output_root mismatch: ${metadata.output_root || "(missing)"}`);
  }

  for (const name of ["index.html", "main.js", "styles.css"]) {
    const sourcePath = join(sourceRoot, name);
    const outputPath = join(outRoot, name);
    if (!requireFile(sourcePath, `source ${name}`) || !requireFile(outputPath, `output ${name}`)) {
      continue;
    }
    const sourceHash = sha256File(sourcePath);
    const outputHash = sha256File(outputPath);
    if (metadata.source_hashes?.[name] !== sourceHash) {
      fail(`source hash mismatch for ${name}`);
    }
    if (metadata.output_hashes?.[name] !== outputHash) {
      fail(`output hash mismatch for ${name}`);
    }
  }

  if (requireFile(join(sourceRoot, "index.html"), "source index.html") &&
      requireFile(join(outRoot, "index.html"), "output index.html")) {
    const expectedHtml = readText(join(sourceRoot, "index.html"))
      .replaceAll("__MUSU_VERSION__", version);
    const actualHtml = readText(join(outRoot, "index.html"));
    if (sha256Bytes(expectedHtml) !== sha256Bytes(actualHtml)) {
      fail("output index.html does not match source index.html after VERSION substitution");
    }
  }

  for (const name of ["main.js", "styles.css"]) {
    const sourcePath = join(sourceRoot, name);
    const outputPath = join(outRoot, name);
    if (requireFile(sourcePath, `source ${name}`) && requireFile(outputPath, `output ${name}`)) {
      if (sha256File(sourcePath) !== sha256File(outputPath)) {
        fail(`output ${name} is not a byte-for-byte copy of source ${name}`);
      }
    }
  }
}

if (failures.length) {
  console.error("Tauri shell artifact verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Tauri shell artifact verification passed");
