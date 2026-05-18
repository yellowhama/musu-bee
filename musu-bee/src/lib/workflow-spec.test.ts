// V23.4 Phase 4 T2-D-mini — workflow-spec encoder/decoder tests (wiki/435 v2 §7.1).
//
// node:test runner, run via `tsx --test src/lib/workflow-spec.test.ts`.
// Tests cover Critic C1 (agent_id identity), C3 (reorder + lossiness), C11
// (single-char agent_id), and §3.1.b (uniqueness decision).

import test from "node:test";
import assert from "node:assert/strict";

import {
  encodeWorkflow,
  decodeWorkflow,
  type FormStep,
  type WorkflowSpec,
} from "./workflow-spec";

function step(agent_id: string, prompt: string, depends_on: string[] = []): FormStep {
  return { reactKey: `rk-${agent_id}`, agent_id, prompt, depends_on };
}

test("encode 3-step linear chain → 3 agents + 2 edges (agent_id identity)", () => {
  const { spec } = encodeWorkflow("daily", [
    step("writer", "summarize"),
    step("reviewer", "review", ["writer"]),
    step("publisher", "post", ["reviewer"]),
  ]);
  assert.equal(spec.agents.length, 3);
  assert.deepEqual(
    spec.agents.map((a) => a.id),
    ["writer", "reviewer", "publisher"]
  );
  assert.equal(spec.edges.length, 2);
  assert.deepEqual(spec.edges[0], { from: "writer", to: "reviewer", condition: "succeeded" });
});

test("encode diamond fan-out/in → 4 agents + 4 edges", () => {
  const { spec } = encodeWorkflow("diamond", [
    step("a", "root"),
    step("b", "left", ["a"]),
    step("c", "right", ["a"]),
    step("d", "merge", ["b", "c"]),
  ]);
  assert.equal(spec.agents.length, 4);
  assert.equal(spec.edges.length, 4);
});

test("encode 1-step solo with single-char agent_id (Critic C11)", () => {
  const { spec } = encodeWorkflow("solo", [step("x", "do it")]);
  assert.equal(spec.agents.length, 1);
  assert.equal(spec.agents[0].id, "x");
  assert.equal(spec.edges.length, 0);
});

test("encode rejects empty name", () => {
  assert.throws(() => encodeWorkflow("", [step("a", "p")]), /name required/);
});

test("encode rejects empty steps", () => {
  assert.throws(() => encodeWorkflow("n", []), /at least one step/);
});

test("encode rejects duplicate agent_id (§3.1.b uniqueness)", () => {
  assert.throws(
    () => encodeWorkflow("dup", [step("writer", "a"), step("writer", "b")]),
    /duplicate agent: writer/
  );
});

test("encode rejects depends_on to non-existent agent_id", () => {
  assert.throws(
    () => encodeWorkflow("missing", [step("a", "p", ["ghost"])]),
    /unknown dependency: ghost/
  );
});

test("encode rejects invalid agent_id regex (uppercase, dots)", () => {
  assert.throws(() => encodeWorkflow("bad", [step("Writer", "p")]), /invalid agent_id/);
  assert.throws(() => encodeWorkflow("bad", [step("a.b", "p")]), /invalid agent_id/);
  assert.throws(() => encodeWorkflow("bad", [step("-leading", "p")]), /invalid agent_id/);
});

test("decode 3-step linear chain → FormStep[] preserves agent_id + depends_on", () => {
  const spec: WorkflowSpec = {
    agents: [
      { id: "writer", image: "default", command: ["summarize"], nodeSelector: {}, timeoutSeconds: 3600, retry: { maxAttempts: 0, backoffSeconds: 30 }, resources: {}, inputs: [], outputs: [] },
      { id: "reviewer", image: "default", command: ["review"], nodeSelector: {}, timeoutSeconds: 3600, retry: { maxAttempts: 0, backoffSeconds: 30 }, resources: {}, inputs: [], outputs: [] },
    ],
    edges: [{ from: "writer", to: "reviewer", condition: "succeeded" }],
  };
  const form = decodeWorkflow(spec);
  assert.equal(form.length, 2);
  assert.equal(form[0].agent_id, "writer");
  assert.deepEqual(form[1].depends_on, ["writer"]);
});

test("round-trip linear: encode → decode preserves agent_id", () => {
  const original: FormStep[] = [
    step("writer", "summarize"),
    step("reviewer", "review", ["writer"]),
  ];
  const { spec } = encodeWorkflow("rt", original);
  const decoded = decodeWorkflow(spec);
  assert.equal(decoded.length, original.length);
  assert.deepEqual(
    decoded.map((s) => ({ agent_id: s.agent_id, prompt: s.prompt, depends_on: s.depends_on })),
    original.map((s) => ({ agent_id: s.agent_id, prompt: s.prompt, depends_on: s.depends_on }))
  );
});

test("round-trip diamond preserves edge structure", () => {
  const original: FormStep[] = [
    step("a", "root"),
    step("b", "l", ["a"]),
    step("c", "r", ["a"]),
    step("d", "m", ["b", "c"]),
  ];
  const { spec } = encodeWorkflow("rt-d", original);
  const decoded = decodeWorkflow(spec);
  assert.equal(decoded.find((s) => s.agent_id === "d")?.depends_on.sort().join(","), "b,c");
});

test("Critic C3: reorder swap — agent_id stable, encode uses agent_id (not row idx)", () => {
  const steps: FormStep[] = [
    step("writer", "summarize"),
    step("reviewer", "review", ["writer"]),
    step("publisher", "post", ["reviewer"]),
  ];
  // Swap rows 0 and 2 (reorder UI sim).
  const reordered = [steps[2], steps[1], steps[0]];
  const { spec } = encodeWorkflow("reord", reordered);
  // Edges still reference by agent_id, not by row position.
  assert.ok(spec.edges.some((e) => e.from === "writer" && e.to === "reviewer"));
  assert.ok(spec.edges.some((e) => e.from === "reviewer" && e.to === "publisher"));
});

test("Critic C3: decode of condition='failed' edge — agent_id correct, condition silently dropped", () => {
  const spec: WorkflowSpec = {
    agents: [
      { id: "a", image: "default", command: ["x"], nodeSelector: {}, timeoutSeconds: 3600, retry: { maxAttempts: 0, backoffSeconds: 30 }, resources: {}, inputs: [], outputs: [] },
      { id: "b", image: "default", command: ["y"], nodeSelector: {}, timeoutSeconds: 3600, retry: { maxAttempts: 0, backoffSeconds: 30 }, resources: {}, inputs: [], outputs: [] },
    ],
    edges: [{ from: "a", to: "b", condition: "failed" }],
  };
  const form = decodeWorkflow(spec);
  // depends_on still populated; condition info is lossy (documented in §3.5).
  assert.deepEqual(form.find((s) => s.agent_id === "b")?.depends_on, ["a"]);
});
