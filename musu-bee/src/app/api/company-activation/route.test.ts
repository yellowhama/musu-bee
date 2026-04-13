import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

const setupDir = path.join(process.cwd(), "data", "company-setups");
const registryDir = path.join(process.cwd(), "data", "company-registries");

function cleanupStateFiles() {
  try {
    fs.rmSync(setupDir, { recursive: true, force: true });
  } catch {}
  try {
    fs.rmSync(registryDir, { recursive: true, force: true });
  } catch {}
}

function makeRequest(method: "GET" | "POST" | "PUT", search = "?workspaceId=alpha&userKey=owner") {
  return new NextRequest(`http://example.test/api/company-activation${search}`, {
    method,
  });
}

function makePatchRequest(
  body: Record<string, unknown>,
  search = "?workspaceId=alpha&userKey=owner"
) {
  return new NextRequest(`http://example.test/api/company-activation${search}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(
  companyId: string,
  search = "?workspaceId=alpha&userKey=owner"
) {
  return new NextRequest(
    `http://example.test/api/company-activation${search}&companyId=${encodeURIComponent(companyId)}`,
    {
      method: "DELETE",
    }
  );
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
    PATCH: (req: NextRequest) => Promise<Response>;
    DELETE: (req: NextRequest) => Promise<Response>;
  };
}

test("company activation route creates and retrieves an activation record", { concurrency: false }, async () => {
  cleanupStateFiles();
  const { PUT } = await loadSetupHandlers(`setup-${Date.now()}`);
  const { GET, POST } = await loadActivationHandlers(`activation-${Date.now()}`);
  const scope = "?workspaceId=alpha-one&userKey=owner";

  await PUT(makeSetupRequest(scope));

  const postRes = await POST(makeRequest("POST", scope));
  assert.equal(postRes.status, 200);
  const postData = await postRes.json();
  assert.equal(postData.activation.companyName, "Acme Ops");
  assert.equal(postData.activation.workspaceId, "alpha-one");
  assert.equal(postData.activation.userKey, "owner");
  assert.equal(postData.registry.companies.length, 1);
  assert.ok(
    ["ready", "degraded", "not_configured"].includes(postData.activation.controlPlaneSync.status)
  );

  const getRes = await GET(makeRequest("GET", scope));
  const getData = await getRes.json();
  assert.equal(getData.activation.companyId, postData.activation.companyId);
  cleanupStateFiles();
});

test("company activation route supports multiple companies, active selection, sync, and delete", { concurrency: false }, async () => {
  cleanupStateFiles();
  const { PUT } = await loadSetupHandlers(`setup-many-${Date.now()}`);
  const { POST, PATCH, GET, DELETE } = await loadActivationHandlers(`activation-many-${Date.now()}`);
  const scope = "?workspaceId=beta&userKey=owner";

  await PUT(
    makeSetupRequest(scope, {
      companyName: "Alpha Ops",
      selectedProjects: ["musu.pro public surface"],
    })
  );
  const firstPost = await POST(makeRequest("POST", scope));
  const firstData = await firstPost.json();
  const firstId = firstData.activation.companyId as string;

  await PUT(
    makeSetupRequest(scope, {
      companyName: "Beta Ops",
      selectedProjects: ["core app shell"],
    })
  );
  const secondPost = await POST(makeRequest("POST", scope));
  const secondData = await secondPost.json();
  const secondId = secondData.activation.companyId as string;
  assert.equal(secondData.registry.companies.length, 2);
  assert.equal(secondData.registry.activeCompanyId, secondId);

  const activateRes = await PATCH(makePatchRequest({ action: "activate", companyId: firstId }, scope));
  assert.equal(activateRes.status, 200);
  const activateData = await activateRes.json();
  assert.equal(activateData.registry.activeCompanyId, firstId);

  delete process.env.PAPERCLIP_COMPANY_ID;
  delete process.env.PAPERCLIP_API_URL;
  const syncRes = await PATCH(makePatchRequest({ action: "sync", companyId: firstId }, scope));
  assert.equal(syncRes.status, 200);
  const syncData = await syncRes.json();
  assert.equal(syncData.activation.syncHistory[0].mode, "manual_sync");
  assert.equal(syncData.activation.controlPlaneSync.status, "not_configured");

  const deleteRes = await DELETE(makeDeleteRequest(secondId, scope));
  assert.equal(deleteRes.status, 200);
  const deleteData = await deleteRes.json();
  assert.equal(deleteData.registry.companies.length, 1);

  const getRes = await GET(makeRequest("GET", scope));
  const getData = await getRes.json();
  assert.equal(getData.registry.companies.length, 1);
  cleanupStateFiles();
});
