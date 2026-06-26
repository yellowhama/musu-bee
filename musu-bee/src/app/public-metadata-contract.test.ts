import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("public privacy and support pages expose the current release metadata marker", () => {
  const version = source("../VERSION").trim();
  const releaseSource = source("src/lib/publicRelease.ts");
  const privacySource = source("src/app/privacy/page.tsx");
  const supportSource = source("src/app/support/page.tsx");

  assert.match(
    releaseSource,
    new RegExp(`PUBLIC_RELEASE_VERSION\\s*=\\s*"${escapeRegExp(version)}"`),
  );
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

test("public install surfaces expose the one-line Windows installer", () => {
  const command = "irm https://musu.pro/install.ps1 | iex";
  const downloadSource = source("src/app/download/page.tsx");
  const installSource = source("src/app/install/page.tsx");
  const contentSource = source("src/lib/publicSiteContent.ts");
  const routeSource = source("src/app/install.ps1/route.ts");

  assert.ok(downloadSource.includes(command));
  assert.match(downloadSource, /data-testid="install-one-liner"/);
  assert.match(downloadSource, /musu package-status/);
  assert.match(downloadSource, /musu nodes --json/);
  assert.ok(installSource.includes("INSTALL_COMMANDS"));
  assert.match(installSource, /data-testid="install-one-liner"/);
  assert.ok(contentSource.includes(command));
  assert.match(routeSource, /DESKTOP_INSTALL_SCRIPT_URL/);
  assert.match(routeSource, /cache:\s*"no-store"/);
});

test("Windows installer refuses stale desktop-latest release assets", () => {
  const version = source("../VERSION").trim();
  const installScript = source("../scripts/windows/Install-MUSU.ps1");

  assert.match(
    installScript,
    new RegExp(`\\$ExpectedReleaseVersion\\s*=\\s*"${escapeRegExp(version)}"`),
  );
  assert.match(installScript, /PublicConfigUrl\s*=\s*"https:\/\/musu\.pro\/api\/public-config"/);
  assert.match(installScript, /Convert-PublicVersionToPackageVersion/);
  assert.match(installScript, /Get-PublicConfigReleaseVersion/);
  assert.match(installScript, /Get-AppInstallerVersions/);
  assert.match(installScript, /ValidateReleaseOnly/);
  assert.match(installScript, /desktop-latest appinstaller version mismatch/);
  assert.match(installScript, /Add-AppxPackage -AppInstallerFile \$appInstallerPath/);
});

test("production site deploy is gated by the desktop-latest release canary", () => {
  const workflow = source("../.github/workflows/deploy-musu-bee.yml");
  const testWorkflow = source("../.github/workflows/test.yml");
  const packageJson = source("package.json");
  const canary = source("../scripts/windows/canary-desktop-release.ps1");
  const installChannelVerifier = source("../scripts/windows/verify-musu-pro-install-channel.ps1");
  const desktopPublisher = source("../scripts/windows/publish-desktop-latest-assets.ps1");
  const multideviceKit = source("../scripts/windows/prepare-multidevice-test-kit.ps1");
  const deployManual = source("../docs/AGENT_DEPLOY_MUSU_PRO_SITE.md");

  assert.match(packageJson, /"test:public-release"/);
  assert.match(testWorkflow, /Public release contract tests/);
  assert.match(testWorkflow, /npm run test:public-release/);
  assert.match(canary, /SkipLocalArtifactLengthChecks/);
  assert.match(canary, /function Join-PathParts/);
  assert.doesNotMatch(canary, /Join-Path \$repoRoot "[^"]*\\/);
  assert.doesNotMatch(canary, /Join-Path \$scriptDir "[^"]*\\/);
  assert.match(workflow, /Verify production desktop-latest release assets/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /canary-desktop-release\.ps1 -Json -SkipLocalArtifactLengthChecks/);
  for (const deployTriggerPath of [
    "VERSION",
    "scripts/windows/Install-MUSU.ps1",
    "scripts/windows/Uninstall-MUSU.ps1",
    "scripts/windows/canary-desktop-release.ps1",
    "scripts/windows/verify-musu-pro-install-channel.ps1",
  ]) {
    assert.match(workflow, new RegExp(`- '${escapeRegExp(deployTriggerPath)}'`));
  }
  assert.match(installChannelVerifier, /schema = "musu\.install_channel\.v1"/);
  assert.match(installChannelVerifier, /\/api\/health/);
  assert.match(installChannelVerifier, /musu\.site_health\.v1/);
  assert.match(installChannelVerifier, /health service/);
  assert.match(installChannelVerifier, /expected boolean true/);
  assert.match(installChannelVerifier, /health version/);
  assert.match(installChannelVerifier, /\/api\/public-config/);
  assert.match(installChannelVerifier, /\/install\.ps1/);
  assert.match(installChannelVerifier, /canary-desktop-release\.ps1/);
  assert.match(installChannelVerifier, /ExpectedReleaseVersion/);
  assert.match(desktopPublisher, /ValidateSiteAfterUpload/);
  assert.match(desktopPublisher, /verify-musu-pro-install-channel\.ps1/);
  assert.doesNotMatch(desktopPublisher, /Install-MUSU\.ps1[^\n]+-ValidateReleaseOnly/);
  assert.match(deployManual, /Step 3 — Production desktop-latest gate before deploy/);
  assert.match(deployManual, /Step 4 — The deploy/);
  assert.match(deployManual, /Do \*\*not\*\* run the production deploy block below/);
  assert.match(deployManual, /guarded publisher in Step 3/);
  assert.match(deployManual, /verify-musu-pro-install-channel\.ps1 -Json/);
  assert.ok(
    deployManual.indexOf("canary-desktop-release.ps1 -Json") <
      deployManual.indexOf("vercel@54.7.1 deploy --prebuilt --yes --prod"),
  );
  assert.ok(
    deployManual.indexOf("vercel@54.7.1 deploy --prebuilt --yes --prod") <
      deployManual.indexOf("verify-musu-pro-install-channel.ps1 -Json"),
  );
  assert.match(multideviceKit, /"verify-musu-pro-install-channel\.ps1"/);
  assert.match(multideviceKit, /Before using the public one-line installer on a second PC/);
  assert.match(multideviceKit, /\[System\.IO\.Path\]::GetFullPath\(\$OutputRoot\)/);
  assert.match(workflow, /Verify production health/);
  assert.match(workflow, /curl -fsS https:\/\/musu\.pro\/api\/health/);
  assert.match(workflow, /Verify production install channel/);
  assert.match(workflow, /verify-musu-pro-install-channel\.ps1 -Json/);
  const canaryStep = workflow.indexOf("- name: Verify production desktop-latest release assets");
  const deployStep = workflow.indexOf("- name: Deploy to Vercel");
  const healthStep = workflow.indexOf("- name: Verify production health");
  const installChannelStep = workflow.indexOf("- name: Verify production install channel");
  assert.ok(canaryStep >= 0);
  assert.ok(deployStep >= 0);
  assert.ok(healthStep >= 0);
  assert.ok(installChannelStep >= 0);
  assert.ok(canaryStep < deployStep);
  assert.ok(deployStep < healthStep);
  assert.ok(healthStep < installChannelStep);
});

test("fleet relay copy does not imply relay data routing is proven", () => {
  const fleetPage = source("src/app/fleet/page.tsx");
  const fleetState = source("src/lib/fleetState.ts");

  assert.doesNotMatch(fleetPage, /Reachable over relay/);
  assert.match(fleetPage, /Recent relay heartbeat; direct route not proven\./);
  assert.match(fleetState, /direct unproven/);
  assert.match(fleetState, /not counted in online_nodes/);
});
