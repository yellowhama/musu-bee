import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

const setupDir = path.join(process.cwd(), "data", "company-setups");

function cleanupStateFile() {
  try {
    fs.rmSync(setupDir, { recursive: true, force: true });
  } catch {}
}

function makeRequest(
  method: "GET" | "PUT",
  body?: Record<string, unknown>,
  search = "?workspaceId=alpha&userKey=owner"
): NextRequest {
  return new NextRequest(`http://example.test/api/company-setup${search}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function loadHandlers(cacheBust: string) {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as {
    GET: (req: NextRequest) => Promise<Response>;
    PUT: (req: NextRequest) => Promise<Response>;
  };
}

test("company setup route returns default setup state", async () => {
  cleanupStateFile();
  const { GET } = await loadHandlers(`get-${Date.now()}`);
  const res = await GET(makeRequest("GET", undefined));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.companyName, "MUSU Workspace");
  assert.equal(data.templateKey, "default-company-operating-system");
  assert.equal(data.workspaceId, "alpha");
  assert.equal(data.userKey, "owner");
  assert.ok(Array.isArray(data.selectedProjects));
});

test("company setup route validates payload", async () => {
  cleanupStateFile();
  const { PUT } = await loadHandlers(`invalid-${Date.now()}`);
  const res = await PUT(makeRequest("PUT", { companyName: "", selectedProjects: [] }));
  assert.equal(res.status, 400);
});

test("company setup route persists updated setup state", async () => {
  cleanupStateFile();
  const { PUT, GET } = await loadHandlers(`put-${Date.now()}`);

  const putRes = await PUT(
    makeRequest("PUT", {
      companyName: "Acme Ops",
      selectedProjects: ["musu.pro public surface", "core app shell"],
    })
  );
  assert.equal(putRes.status, 200);
  const putData = await putRes.json();
  assert.equal(putData.companyName, "Acme Ops");

  const getRes = await GET(makeRequest("GET", undefined));
  const getData = await getRes.json();
  assert.equal(getData.companyName, "Acme Ops");
  assert.deepEqual(getData.selectedProjects, [
    "musu.pro public surface",
    "core app shell",
  ]);
  cleanupStateFile();
});

test("company setup route isolates scopes", async () => {
  cleanupStateFile();
  const { PUT, GET } = await loadHandlers(`scope-${Date.now()}`);

  await PUT(
    makeRequest(
      "PUT",
      {
        companyName: "Alpha Ops",
        selectedProjects: ["musu.pro public surface"],
      },
      "?workspaceId=alpha&userKey=owner"
    )
  );

  const alphaRes = await GET(makeRequest("GET", undefined, "?workspaceId=alpha&userKey=owner"));
  const alphaData = await alphaRes.json();
  assert.equal(alphaData.companyName, "Alpha Ops");

  const betaRes = await GET(makeRequest("GET", undefined, "?workspaceId=beta&userKey=owner"));
  const betaData = await betaRes.json();
  assert.equal(betaData.companyName, "MUSU Workspace");
  assert.equal(betaData.workspaceId, "beta");
  cleanupStateFile();
});
