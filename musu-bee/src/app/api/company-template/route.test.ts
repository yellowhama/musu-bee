import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("company template route returns the default operating template", async () => {
  const res = await GET();
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.templateKey, "default-company-operating-system");
  assert.ok(Array.isArray(data.goals));
  assert.ok(Array.isArray(data.defaultAgents));
  assert.ok(Array.isArray(data.bootstrapChecklist));
});
