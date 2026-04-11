import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

const stateFile = path.join(process.cwd(), "data", "company-setup.json");

function cleanupStateFile() {
  try {
    fs.rmSync(stateFile, { force: true });
  } catch {}
}

function makePutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://example.test/api/company-setup", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadHandlers(cacheBust: string) {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as {
    GET: () => Promise<Response>;
    PUT: (req: NextRequest) => Promise<Response>;
  };
}

test("company setup route returns default setup state", async () => {
  cleanupStateFile();
  const { GET } = await loadHandlers(`get-${Date.now()}`);
  const res = await GET();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.companyName, "MUSU Workspace");
  assert.equal(data.templateKey, "default-company-operating-system");
  assert.ok(Array.isArray(data.selectedProjects));
});

test("company setup route validates payload", async () => {
  cleanupStateFile();
  const { PUT } = await loadHandlers(`invalid-${Date.now()}`);
  const res = await PUT(makePutRequest({ companyName: "", selectedProjects: [] }));
  assert.equal(res.status, 400);
});

test("company setup route persists updated setup state", async () => {
  cleanupStateFile();
  const { PUT, GET } = await loadHandlers(`put-${Date.now()}`);

  const putRes = await PUT(
    makePutRequest({
      companyName: "Acme Ops",
      selectedProjects: ["musu.pro public surface", "core app shell"],
    })
  );
  assert.equal(putRes.status, 200);
  const putData = await putRes.json();
  assert.equal(putData.companyName, "Acme Ops");

  const getRes = await GET();
  const getData = await getRes.json();
  assert.equal(getData.companyName, "Acme Ops");
  assert.deepEqual(getData.selectedProjects, [
    "musu.pro public surface",
    "core app shell",
  ]);
  cleanupStateFile();
});
