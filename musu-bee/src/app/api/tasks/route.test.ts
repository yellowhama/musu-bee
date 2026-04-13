import assert from "node:assert/strict";
import { before, test } from "node:test";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
  PATCH: (req: NextRequest) => Promise<Response>;
  DELETE: (req: NextRequest) => Promise<Response>;
};
let GET: Module["GET"];
let POST: Module["POST"];
let PATCH: Module["PATCH"];
let DELETE: Module["DELETE"];

before(async () => {
  process.env.MUSU_TASKS_DB = ":memory:";
  ({ GET, POST, PATCH, DELETE } = (await import("./route")) as Module);
});

function getReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/tasks");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/tasks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function patchReq(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/tasks?id=${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function deleteReq(id?: string) {
  const url = "http://localhost/api/tasks" + (id ? `?id=${id}` : "");
  return new NextRequest(url, { method: "DELETE" });
}

// ── GET ──────────────────────────────────────────────────────────────────────

test("GET 빈 DB → { tasks: [] }", async () => {
  const res = await GET(getReq());
  assert.equal(res.status, 200);
  const body = await res.json() as { tasks: unknown[] };
  assert.ok(Array.isArray(body.tasks));
  assert.equal(body.tasks.length, 0);
});

// ── POST ─────────────────────────────────────────────────────────────────────

test("POST title 없음 → 400", async () => {
  const res = await POST(postReq({}));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "title required");
});

test("POST 빈 title → 400", async () => {
  const res = await POST(postReq({ title: "  " }));
  assert.equal(res.status, 400);
});

test("POST 정상 → 201 + task", async () => {
  const res = await POST(postReq({ title: "첫 번째 태스크" }));
  assert.equal(res.status, 201);
  const body = await res.json() as { task: { id: string; title: string; status: string } };
  assert.ok(body.task.id);
  assert.equal(body.task.title, "첫 번째 태스크");
  assert.equal(body.task.status, "todo");
});

test("POST assigned_device 반영", async () => {
  const res = await POST(postReq({ title: "디바이스 태스크", assigned_device: "rtx-4090" }));
  assert.equal(res.status, 201);
  const body = await res.json() as { task: { assigned_device: string } };
  assert.equal(body.task.assigned_device, "rtx-4090");
});

// ── GET with filter (tasks already exist from POST tests above) ───────────────

test("GET scope 필터 → scope 일치하는 것만", async () => {
  await POST(postReq({ title: "스코프 태스크", scope: "test-scope" }));
  const res = await GET(getReq({ scope: "test-scope" }));
  const body = await res.json() as { tasks: { scope: string }[] };
  assert.ok(body.tasks.every((t) => t.scope === "test-scope"));
});

test("GET status 필터 → done만", async () => {
  const res = await GET(getReq({ status: "done" }));
  const body = await res.json() as { tasks: { status: string }[] };
  assert.ok(body.tasks.every((t) => t.status === "done"));
});

// ── PATCH ────────────────────────────────────────────────────────────────────

test("PATCH id 없음 → 400", async () => {
  const res = await PATCH(new NextRequest("http://localhost/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
    headers: { "Content-Type": "application/json" },
  }));
  assert.equal(res.status, 400);
});

test("PATCH 없는 id → 404", async () => {
  const res = await PATCH(patchReq("task-nonexistent-0000", { status: "done" }));
  assert.equal(res.status, 404);
});

test("PATCH status:done 업데이트 → 200", async () => {
  const createRes = await POST(postReq({ title: "완료 예정 태스크" }));
  const { task } = await createRes.json() as { task: { id: string } };

  const res = await PATCH(patchReq(task.id, { status: "done" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { task: { status: string } };
  assert.equal(body.task.status, "done");
});

// ── DELETE ───────────────────────────────────────────────────────────────────

test("DELETE id 없음 → 400", async () => {
  const res = await DELETE(deleteReq());
  assert.equal(res.status, 400);
});

test("DELETE 없는 id → 404", async () => {
  const res = await DELETE(deleteReq("task-nonexistent-0000"));
  assert.equal(res.status, 404);
});

test("DELETE 정상 → { ok: true }", async () => {
  const createRes = await POST(postReq({ title: "삭제 예정 태스크" }));
  const { task } = await createRes.json() as { task: { id: string } };

  const res = await DELETE(deleteReq(task.id));
  assert.equal(res.status, 200);
  const body = await res.json() as { ok: boolean };
  assert.equal(body.ok, true);
});
