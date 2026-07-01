import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DESKTOP_APPINSTALLER_URL,
  DESKTOP_CERT_URL,
  DESKTOP_INSTALL_SCRIPT_URL,
  PUBLIC_RELEASE_VERSION,
} from "@/lib/publicRelease";

// GET /install.ps1 — serve the one-line installer so users can run:
//     irm https://musu.pro/install.ps1 | iex
// We proxy the canonical Install-MUSU.ps1 from the GitHub release (single source
// of truth, kept in sync with the published cert/msix) rather than duplicating
// the script body here. text/plain so `irm` returns a string `iex` can run.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function textResponse(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function unavailable(reason: string) {
  return textResponse(
    `# MUSU installer is temporarily unavailable.\n` +
      `# ${reason}\n` +
      `# Ask the operator to publish the current desktop-latest assets, then retry.\n`,
    409,
  );
}

function publicVersionToPackageVersion(version: string) {
  const rc = version.match(/^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/);
  if (rc) {
    return `${rc[1]}.${rc[2]}.${rc[3]}.${rc[4]}`;
  }
  const stable = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (stable) {
    return `${stable[1]}.${stable[2]}.${stable[3]}.0`;
  }
  throw new Error(`unsupported public release version: ${version}`);
}

function parseScriptExpectedReleaseVersion(script: string) {
  return script.match(/\$ExpectedReleaseVersion\s*=\s*"([^"]+)"/)?.[1] ?? null;
}

function parseScriptExpectedCertThumbprint(script: string) {
  return script.match(/\$ExpectedCertThumbprint\s*=\s*"([A-Fa-f0-9]+)"/)?.[1]?.toUpperCase() ?? null;
}

function certificateThumbprint(bytes: ArrayBuffer) {
  let cert = Buffer.from(bytes);
  const text = cert.toString("utf8");
  const pem = text.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (pem) {
    cert = Buffer.from(pem[1].replace(/\s+/g, ""), "base64");
  }
  return createHash("sha1").update(cert).digest("hex").toUpperCase();
}

function parseAppInstallerVersions(xml: string) {
  const appInstallerVersion =
    xml.match(/<AppInstaller[\s\S]*?\sVersion="([^"]+)"/)?.[1] ?? null;
  const mainPackageVersion =
    xml.match(/<MainPackage[\s\S]*?\sVersion="([^"]+)"/)?.[1] ?? null;
  return { appInstallerVersion, mainPackageVersion };
}

export async function GET() {
  try {
    const res = await fetch(DESKTOP_INSTALL_SCRIPT_URL, { cache: "no-store" });
    if (!res.ok) {
      return textResponse(
        `# MUSU installer temporarily unavailable (upstream ${res.status}).\n` +
          `# Download manually from https://musu.pro/download\n`,
        502,
      );
    }
    const script = await res.text();
    const scriptRelease = parseScriptExpectedReleaseVersion(script);
    if (scriptRelease !== PUBLIC_RELEASE_VERSION) {
      return unavailable(
        `Install-MUSU.ps1 expects ${scriptRelease ?? "unknown"}, but musu.pro is ${PUBLIC_RELEASE_VERSION}.`,
      );
    }
    const scriptCertThumbprint = parseScriptExpectedCertThumbprint(script);
    if (!scriptCertThumbprint) {
      return unavailable("Install-MUSU.ps1 does not expose an expected certificate thumbprint.");
    }

    const certRes = await fetch(DESKTOP_CERT_URL, { cache: "no-store" });
    if (!certRes.ok) {
      return textResponse(
        `# MUSU certificate temporarily unavailable (upstream ${certRes.status}).\n` +
          `# Download manually from https://musu.pro/download\n`,
        502,
      );
    }
    const hostedCertThumbprint = certificateThumbprint(await certRes.arrayBuffer());
    if (hostedCertThumbprint !== scriptCertThumbprint) {
      return unavailable(
        `blossompark.musu.cer is ${hostedCertThumbprint}, but Install-MUSU.ps1 expects ${scriptCertThumbprint}.`,
      );
    }

    const expectedPackageVersion = publicVersionToPackageVersion(PUBLIC_RELEASE_VERSION);
    const appInstallerRes = await fetch(DESKTOP_APPINSTALLER_URL, { cache: "no-store" });
    if (!appInstallerRes.ok) {
      return textResponse(
        `# MUSU appinstaller temporarily unavailable (upstream ${appInstallerRes.status}).\n` +
          `# Download manually from https://musu.pro/download\n`,
        502,
      );
    }
    const versions = parseAppInstallerVersions(await appInstallerRes.text());
    if (
      versions.appInstallerVersion !== expectedPackageVersion ||
      versions.mainPackageVersion !== expectedPackageVersion
    ) {
      return unavailable(
        `musu.appinstaller is ${versions.appInstallerVersion ?? "unknown"} / ` +
          `${versions.mainPackageVersion ?? "unknown"}, expected ${expectedPackageVersion}.`,
      );
    }

    return new NextResponse(script, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return textResponse(
      `# MUSU installer fetch failed. Download manually from https://musu.pro/download\n`,
      502,
    );
  }
}
