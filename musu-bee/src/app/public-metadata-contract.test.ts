import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("public privacy and support pages expose the current release metadata marker", () => {
  const releaseSource = source("src/lib/publicRelease.ts");
  const privacySource = source("src/app/privacy/page.tsx");
  const supportSource = source("src/app/support/page.tsx");

  assert.match(releaseSource, /PUBLIC_RELEASE_VERSION\s*=\s*"1\.15\.0-rc\.1"/);
  assert.match(releaseSource, /PUBLIC_CONFIG_SCHEMA\s*=\s*"musu\.public_config\.v1"/);
  assert.match(releaseSource, /MUSU public release metadata:/);

  for (const pageSource of [privacySource, supportSource]) {
    assert.match(pageSource, /PUBLIC_RELEASE_METADATA_TEXT/);
    assert.match(pageSource, /releaseMetadataStyle/);
    assert.match(pageSource, /position:\s*"absolute"/);
    assert.match(pageSource, /clip:\s*"rect\(0, 0, 0, 0\)"/);
  }
});

test("store public metadata verifier requires the release marker from VERSION", () => {
  const verifierSource = source("../scripts/windows/verify-store-public-metadata.ps1");

  assert.match(verifierSource, /expectedReleaseVersion/);
  assert.match(verifierSource, /Join-Path \$repoRoot "VERSION"/);
  assert.match(verifierSource, /MUSU public release metadata: \$expectedReleaseVersion/);
  assert.match(verifierSource, /expected_release_metadata_text/);
  assert.match(verifierSource, /\$expectedReleaseMetadataText/);
  assert.match(verifierSource, /schema\s*=\s*"musu\.public_config\.v1"/);
});
