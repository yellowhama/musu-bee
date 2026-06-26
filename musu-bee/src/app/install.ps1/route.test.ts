import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PUBLIC_RELEASE_VERSION } from "@/lib/publicRelease";
import { GET } from "./route";

const PACKAGE_VERSION = PUBLIC_RELEASE_VERSION.replace("-rc.", ".");
const CERT_BYTES = new TextEncoder().encode("musu test certificate");
const CERT_THUMBPRINT = createHash("sha1").update(CERT_BYTES).digest("hex").toUpperCase();
const originalFetch = globalThis.fetch;

function installScript(releaseVersion: string, certThumbprint: string | null = CERT_THUMBPRINT) {
  const certParam = certThumbprint
    ? `    [string]$ExpectedCertThumbprint = "${certThumbprint}"`
    : `    [string]$NoExpectedCertThumbprint = "missing"`;
  return `
param(
    [string]$ExpectedReleaseVersion = "${releaseVersion}",
${certParam}
)
Write-Host "install"
`;
}

function appInstallerXml(packageVersion: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AppInstaller Version="${packageVersion}">
  <MainPackage Version="${packageVersion}" />
</AppInstaller>`;
}

function mockReleaseAssets({
  scriptRelease = PUBLIC_RELEASE_VERSION,
  scriptCertThumbprint = CERT_THUMBPRINT,
  appInstallerVersion = PACKAGE_VERSION,
  certBytes = CERT_BYTES,
}: {
  scriptRelease?: string;
  scriptCertThumbprint?: string | null;
  appInstallerVersion?: string;
  certBytes?: Uint8Array;
} = {}) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("Install-MUSU.ps1")) {
      return new Response(installScript(scriptRelease, scriptCertThumbprint), { status: 200 });
    }
    if (url.includes("blossompark.musu.cer")) {
      const body = new ArrayBuffer(certBytes.byteLength);
      new Uint8Array(body).set(certBytes);
      return new Response(body, { status: 200 });
    }
    if (url.includes("musu.appinstaller")) {
      return new Response(appInstallerXml(appInstallerVersion), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("/install.ps1 proxies installer when script and appinstaller match the site release", async () => {
  mockReleaseAssets();

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 200);
  assert.match(body, new RegExp(`ExpectedReleaseVersion\\s*=\\s*"${PUBLIC_RELEASE_VERSION}"`));
  assert.match(body, new RegExp(`ExpectedCertThumbprint\\s*=\\s*"${CERT_THUMBPRINT}"`));
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
});

test("/install.ps1 fails closed when hosted Install-MUSU.ps1 targets an older release", async () => {
  mockReleaseAssets({ scriptRelease: "1.15.0-rc.20" });

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 409);
  assert.match(body, /temporarily unavailable/);
  assert.match(body, /Install-MUSU\.ps1 expects 1\.15\.0-rc\.20/);
});

test("/install.ps1 fails closed when hosted Install-MUSU.ps1 pins the wrong cert", async () => {
  mockReleaseAssets({ scriptCertThumbprint: "0".repeat(40) });

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 409);
  assert.match(body, /temporarily unavailable/);
  assert.match(body, /blossompark\.musu\.cer is/);
});

test("/install.ps1 fails closed when hosted Install-MUSU.ps1 has no cert pin", async () => {
  mockReleaseAssets({ scriptCertThumbprint: null });

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 409);
  assert.match(body, /expected certificate thumbprint/);
});

test("/install.ps1 fails closed when hosted appinstaller targets an older package", async () => {
  mockReleaseAssets({ appInstallerVersion: "1.15.0.20" });

  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 409);
  assert.match(body, /temporarily unavailable/);
  assert.match(body, /musu\.appinstaller is 1\.15\.0\.20 \/ 1\.15\.0\.20/);
});
