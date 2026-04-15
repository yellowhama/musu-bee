import assert from "node:assert/strict";
import test from "node:test";

import type { CompanyActivationState } from "./companyActivation";
import { writeCompanyActivationToPaperclip } from "./controlPlaneSync";

function buildCompany(): CompanyActivationState {
  return {
    companyId: "company-123",
    companyName: "Acme Ops",
    templateKey: "default-company-operating-system",
    selectedProjects: ["musu.pro public surface", "core app shell"],
    workspaceId: "studio-alpha",
    userKey: "owner-example.com",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    paperclipIssueId: null,
    controlPlaneSync: {
      provider: "paperclip",
      status: "not_configured",
      message: "not configured",
      endpoint: null,
      checkedAt: "2026-04-12T00:00:00.000Z",
    },
    syncHistory: [],
  };
}

test("writeCompanyActivationToPaperclip creates MUSU-specific issue and comment payloads", async (t) => {
  const previousCompanyId = process.env.PAPERCLIP_COMPANY_ID;
  const previousApiUrl = process.env.PAPERCLIP_API_URL;
  process.env.PAPERCLIP_COMPANY_ID = "paperclip-company";
  process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3100";
  t.after(() => {
    if (previousCompanyId === undefined) {
      delete process.env.PAPERCLIP_COMPANY_ID;
    } else {
      process.env.PAPERCLIP_COMPANY_ID = previousCompanyId;
    }
    if (previousApiUrl === undefined) {
      delete process.env.PAPERCLIP_API_URL;
    } else {
      process.env.PAPERCLIP_API_URL = previousApiUrl;
    }
  });

  const calls: Array<{ url: string; body: string | null }> = [];
  const fakeFetch: typeof fetch = (async (input, init) => {
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      body: typeof init?.body === "string" ? init.body : null,
    });

    if (calls.length === 1) {
      return new Response(JSON.stringify({ id: "issue-1" }), { status: 200 });
    }

    return new Response(JSON.stringify({ id: "comment-1" }), { status: 200 });
  }) as typeof fetch;

  const result = await writeCompanyActivationToPaperclip(buildCompany(), fakeFetch);
  assert.equal(result.status, "ready");
  assert.equal(result.paperclipIssueId, "issue-1");
  assert.equal(result.paperclipCommentId, "comment-1");
  assert.equal(calls.length, 2);

  const createPayload = JSON.parse(calls[0]?.body ?? "{}") as { title?: string; description?: string };
  assert.match(createPayload.title ?? "", /^MUSU PRODUCT SYNC:/);
  assert.match(createPayload.description ?? "", /sync_contract=company_registry_activation/);
  assert.match(createPayload.description ?? "", /surface=\/app/);

  const commentPayload = JSON.parse(calls[1]?.body ?? "{}") as { body?: string };
  assert.match(commentPayload.body ?? "", /Role: Product Sync/);
  assert.match(commentPayload.body ?? "", /Command: musu company registry sync/);
  assert.match(commentPayload.body ?? "", /Sync Contract: company_registry_activation/);
  assert.match(commentPayload.body ?? "", /Product Surface: \/app/);
});
