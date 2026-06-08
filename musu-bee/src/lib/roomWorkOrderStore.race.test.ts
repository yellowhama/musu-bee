import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  __setRoomWorkOrderKvClientForTest,
  claimRoomWorkOrders,
  createRoomWorkOrder,
  upsertRoomWorkOrder,
} from "@/lib/roomWorkOrderStore";

/**
 * Faithful in-memory simulation of the Vercel KV / Redis backend for the room
 * work-order store. The store persists a single JSON-encoded array string under
 * roomKey() and mutates it via atomic Lua EVAL scripts. Redis runs each EVAL
 * single-threaded and atomically, so this fake executes each `eval` call
 * synchronously start-to-finish against shared state — concurrent evals
 * serialize, which is the property the atomicity fix relies on.
 */
function fakeRoomWorkOrderKv() {
  const store = new Map<string, string>();
  const state = { evalCommands: [] as string[] };

  function readArray(key: string): Array<Record<string, unknown>> {
    const raw = store.get(key);
    if (!raw) {
      return [];
    }
    try {
      const decoded = JSON.parse(raw) as unknown;
      return Array.isArray(decoded) ? (decoded as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }

  return {
    store,
    state,
    client: {
      async eval<T = unknown>(script: string, keys: string[], args: string[]): Promise<T> {
        const key = keys[0]!;

        if (script.includes("musu_room_work_order_upsert_v1")) {
          state.evalCommands.push("upsert");
          const now = args[0]!;
          const maxRecords = Number.parseInt(args[1]!, 10);
          const order = JSON.parse(args[3]!) as Record<string, unknown>;
          const current = readArray(key);
          const next: Array<Record<string, unknown>> = [order];
          for (const item of current) {
            if (
              typeof item.expires_at === "string" &&
              now <= item.expires_at &&
              item.work_order_id !== order.work_order_id &&
              next.length < maxRecords
            ) {
              next.push(item);
            }
          }
          store.set(key, JSON.stringify(next));
          return JSON.stringify({ ok: true }) as T;
        }

        if (script.includes("musu_room_work_order_claim_v1")) {
          state.evalCommands.push("claim");
          const now = args[0]!;
          const maxRecords = Number.parseInt(args[1]!, 10);
          const claimLimit = Number.parseInt(args[3]!, 10);
          const ownerKey = args[4]!;
          const targetNode = args[5]!;
          const claimant = args[6]!;
          const companyId = args[7]!;
          const projectId = args[8]!;
          const sourceAgentId = args[9]!;
          const workOrderId = args[10]!;

          const hasValue = (v: string) => v !== "";
          const matchesQueued = (order: Record<string, unknown>): boolean => {
            if (order.status !== "queued") return false;
            if (order.owner_key !== ownerKey) return false;
            if (hasValue(companyId) && order.company_id !== companyId) return false;
            if (hasValue(projectId) && order.project_id !== projectId) return false;
            if (order.target_node !== targetNode) return false;
            if (hasValue(sourceAgentId) && order.source_agent_id !== sourceAgentId) return false;
            if (hasValue(workOrderId) && order.work_order_id !== workOrderId) return false;
            return true;
          };

          const current = readArray(key);
          const claimed: Array<Record<string, unknown>> = [];
          const next: Array<Record<string, unknown>> = [];
          for (const order of current) {
            if (
              typeof order.expires_at === "string" &&
              now <= order.expires_at &&
              next.length < maxRecords
            ) {
              if (claimed.length < claimLimit && matchesQueued(order)) {
                order.status = "claimed";
                order.claimed_by = claimant;
                order.claimed_at = now;
                claimed.push(order);
              }
              next.push(order);
            }
          }
          store.set(key, JSON.stringify(next));
          return JSON.stringify(claimed) as T;
        }

        throw new Error(`unexpected_room_work_order_kv_eval_script`);
      },
    },
  };
}

beforeEach(() => {
  process.env.KV_REST_API_URL = "https://example-kv.invalid";
  process.env.KV_REST_API_TOKEN = "test-kv-token";
  delete process.env.MUSU_ROOM_WORK_ORDER_STORE_PATH;
});

afterEach(() => {
  __setRoomWorkOrderKvClientForTest(null);
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

test("KV claim is atomic: two concurrent limit=1 claims yield exactly one winner", async () => {
  const fake = fakeRoomWorkOrderKv();
  __setRoomWorkOrderKvClientForTest(fake.client);

  const order = createRoomWorkOrder({
    owner_key: "owner-1",
    room_id: "race-room",
    instruction: "do the thing exactly once",
    work_order_id: "wo-race-1",
    target_node: "NODE_A",
    delivery_mode: "desktop_outbound_pickup",
    status: "queued",
  });
  await upsertRoomWorkOrder(order);

  // Fire two claims concurrently. The old get->mutate->set code let BOTH read
  // the queued order and both write a "claimed" copy (double-claim). The atomic
  // Lua claim serializes, so the second sees the first's mutation.
  const [first, second] = await Promise.all([
    claimRoomWorkOrders({
      owner_key: "owner-1",
      room_id: "race-room",
      target_node: "NODE_A",
      claimant_node_id: "node-a-claimant-1",
      work_order_id: "wo-race-1",
      limit: 1,
    }),
    claimRoomWorkOrders({
      owner_key: "owner-1",
      room_id: "race-room",
      target_node: "NODE_A",
      claimant_node_id: "node-a-claimant-2",
      work_order_id: "wo-race-1",
      limit: 1,
    }),
  ]);

  const totalClaimed = first.length + second.length;
  assert.equal(totalClaimed, 1, "exactly one concurrent claim must succeed");

  const winner = first.length === 1 ? first[0] : second[0];
  assert.equal(winner?.work_order_id, "wo-race-1");
  assert.equal(winner?.status, "claimed");
  assert.ok(
    winner?.claimed_by === "node-a-claimant-1" || winner?.claimed_by === "node-a-claimant-2"
  );

  // A second claim attempt after the race must find nothing left to claim.
  const after = await claimRoomWorkOrders({
    owner_key: "owner-1",
    room_id: "race-room",
    target_node: "NODE_A",
    claimant_node_id: "node-a-claimant-3",
    work_order_id: "wo-race-1",
    limit: 1,
  });
  assert.equal(after.length, 0, "an already-claimed order cannot be re-claimed");

  // Sanity: the store really did route through the atomic eval path.
  assert.ok(fake.state.evalCommands.includes("upsert"));
  assert.equal(fake.state.evalCommands.filter((c) => c === "claim").length, 3);
});
