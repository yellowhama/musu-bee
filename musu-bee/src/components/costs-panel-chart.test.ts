import assert from "node:assert/strict";
import test from "node:test";
import { toPolylinePoints } from "./costs-panel-chart.js";

test("toPolylinePoints: empty array returns empty string", () => {
  assert.equal(toPolylinePoints([], 300, 80, 4), "");
});

test("toPolylinePoints: single value returns empty string (needs 2+ points)", () => {
  assert.equal(toPolylinePoints([5], 300, 80, 4), "");
});

test("toPolylinePoints: two values returns two coordinate pairs", () => {
  const result = toPolylinePoints([0, 10], 300, 80, 4);
  const parts = result.trim().split(" ");
  assert.equal(parts.length, 2);
  const [x0, y0] = parts[0].split(",").map(Number);
  const [x1, y1] = parts[1].split(",").map(Number);
  // first point at left padding
  assert.equal(x0, 4);
  // last point at right edge (300 - padding)
  assert.equal(x1, 296);
  // min value (0) should be at bottom (y = padding + h = 80 - 4 = 76)
  assert.equal(y0, 76);
  // max value (10) should be at top (y = padding = 4)
  assert.equal(y1, 4);
});

test("toPolylinePoints: all same values (range=0) does not crash", () => {
  const result = toPolylinePoints([5, 5, 5], 300, 80, 4);
  assert.ok(result.length > 0);
  assert.doesNotThrow(() => toPolylinePoints([5, 5, 5], 300, 80, 4));
});

test("toPolylinePoints: multiple values all within bounds", () => {
  const values = [1, 3, 2, 5, 4];
  const result = toPolylinePoints(values, 300, 80, 4);
  const pairs = result.trim().split(" ").map((p) => p.split(",").map(Number));
  assert.equal(pairs.length, 5);
  for (const [x, y] of pairs) {
    assert.ok(x >= 4 && x <= 296, `x=${x} out of bounds`);
    assert.ok(y >= 4 && y <= 76, `y=${y} out of bounds`);
  }
});
