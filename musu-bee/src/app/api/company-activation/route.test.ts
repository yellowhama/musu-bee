import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

const setupDir = path.join(process.cwd(), "data", "company-setups");
const activationDir = path.join(process.cwd(), "data", "company-activations");

function cleanupStateFiles() {
  try {
    fs.rmSync(setupDir, { recursive: true, force: true });
  } catch {}
  try {
    fs.rmSync(activationDir, { recursive: true, force: true });
  } catch {}
}

function makeRequest(method: "GET" | "POST" | "PUT", search = "?workspaceId=alpha&userKey=owner") {
  return new NextRequest(`http://example.test/api/company-activation${search}`, {
    method,
  });
}

function makeSetupRequest(
  search = "?workspaceId=alpha&userKey=owner",
  body: Record<string, unknown> = {
    companyName: "Acme Ops",
    selectedProjects: ["musu.pro public surface", "core app shell"],
  }
) {
  return new NextRequest(`http://example.test/api/company-setup${search}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadSetupHandlers(cacheBust: string) {
  const moduleUrl = new URL(`../company-setup/route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as {
    PUT: (req: NextRequest) => Promise<Response>;
  };
}

async function loadActivationHandlers(cacheBust: string) {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as {
    GET: (req: NextRequest) => Promise<Response>;
    POST: (req: NextRequest) => Promise<Response>;
  };
}

test("company activation route creates and retrieves an activation record", async () => {
  cleanupStateFiles();
  const { PUT } = await loadSetupHandlers(`setup-${Date.now()}`);
  const { GET, POST } = await loadActivationHandlers(`activation-${Date.now()}`);

  await PUT(makeSetupRequest());

  const postRes = await POST(makeRequest("POST"));
  assert.equal(postRes.status, 200);
  const postData = await postRes.json();
  assert.equal(postData.activation.companyName, "Acme Ops");
  assert.equal(postData.activation.workspaceId, "alpha");
  assert.equal(postData.activation.userKey, "owner");
  assert.ok(
    ["ready", "degraded", "not_configured"].includes(postData.activation.controlPlaneSync.status)
  );

  const getRes = await GET(makeRequest("GET"));
  const getData = await getRes.json();
  assert.equal(getData.activation.companyId, postData.activation.companyId);
  cleanupStateFiles();
});
