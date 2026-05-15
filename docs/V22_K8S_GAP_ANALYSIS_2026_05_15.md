# v22 — K8s-shape Gap Analysis & Remediation Plan

**Status**: DRAFT (in progress via /loop iterations)
**Date**: 2026-05-15
**Trigger**: independent critique by system-architect subagent against v21 "K8s-shaped on SQLite" claim
**Verdict**: weighted avg 3.5/10 across 8 categories — calls v21 "controller-runtime의 single-process subset을 SQLite로 재구현한 것"

This document is the honest follow-up. v21 shipped a **single-host
reconcile pattern study**, not a distributed K8s. v22's purpose is to
either (a) close the gap to real multi-node operation or (b) commit
to the single-host scope explicitly and rename the abstraction.

---

## 1. Critique snapshot (scores out of 10)

| Area | Score | Strongest evidence of gap |
|---|---|---|
| A. Reconciliation fidelity | 5 | No spec vs status separation; CEOReconciler is a conditional creator |
| B. Watch model | 3 | `KindSource._fetch_changed` uses `WHERE updated_at > ?` strict-greater; equal timestamps drop. Restart cursor = `MAX(updated_at)` → downtime events lost |
| C. API server / consensus | 2 | Raw SQLite file shared across nodes; no kine; no admission control |
| D. Scheduler | 6 | filter/score/binder good; no preemption, no topology spread, score is hand-tuned constants |
| E. CEO/Machine reconciler | 4 | CEO is SELECT-then-INSERT (TOCTOU); MachineReconciler is switch-style not converge-style |
| F. Multi-node integration | 2 | Every bridge runs its own ControllerManager — zero leader election |
| G. Missing K8s primitives | 2 | No finalizers, owner refs, generation, status sub-resource, RBAC, namespaces, admission |
| H. Test reliability | 4 | 4-company-1-GPU is single-process best-case; no fault injection; no multi-process race |

**Two biggest weaknesses (per critique)**:

1. **"K8s-shaped" label breaks at the distributed layer.** Leader election 0, multi-writer SQLite, in-process-only watch.
2. **No spec/status separation → not actually a reconciler.** Invariants live in code branches, not schema. Concurrent operators can violate them undetected.

**Cannot ship to production today**:
- Multi-node deploy (shared SQLite over NFS = lock corruption + stale reads)
- Restart consistency (`MAX(updated_at)` initial cursor permanently loses downtime events)
- Concurrent CEO (TOCTOU → multiple in-flight requests per agent)
- Failure containment (no finalizer → reconciler crash leaves dangling rows)
- Priority workloads (no preemption)
- Audit/compliance (no RBAC, no admission)

---

## 2. Remediation strategy (three roads)

The honest fork: pick one before writing migration code.

### Road A — Stay single-host, rename the abstraction

v21 as-is is honest for single-machine deployments (1 musu-bridge per
user device). Rename "K8s-shaped" → **"controller-runtime style for
SQLite"**. Update wiki/346 frame v9 docs to match. Drop multi-node
claims from marketing/README. Cost: 1-2 days docs, 0 code change.

### Road B — Single-writer + read-replicas

Pick **one** node as the writer (Litestream / rqlite pattern). Other
bridges read replicas + forward writes to the leader via HTTP. Watch
becomes "subscribe to leader's WAL stream". Leader election handled
by the writer-node selection layer (or single-static-leader for home
deployments).

Cost: ~2 weeks. Need WAL streaming (Litestream-style) + write-forward
RPC + bookkeeping.

### Road C — Real distributed control plane (etcd or kine on real cluster)

Replace SQLite-as-source-of-truth with kine-over-Postgres or embedded
etcd. Watch becomes real etcd watch with resourceVersion. Multi-node
leader election via `coordination.k8s.io/Lease` semantics.

Cost: ~6-8 weeks. Operational complexity goes up substantially —
backup/restore, leader fail-over, etcd compaction, network partition
handling. May not be appropriate for "user runs musu-bridge on her
laptop" deployment model.

**Recommendation pending**: Road B for v22 if multi-node is a real
roadmap requirement; otherwise Road A. **Not Road C** unless musu
moves to cluster-mode-only.

---

## 3. Per-area fix plan (Road A + B baseline)

The rest of this document covers concrete fixes assuming Road B
direction (single-writer + read-replicas). Each subsection ships a
schema migration sketch + code change + test plan.

### 3.1 Watch model — monotonic revision (kine-shaped)

**Current state (the bug)**
`KindSource._fetch_changed` at `controllers/sources.py:138`:
```python
SELECT * FROM <table> WHERE updated_at > ? ORDER BY updated_at ASC
```
Two structural flaws:
1. `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` resolution is **milliseconds**. Two
   rows written in the same millisecond share `updated_at`. The `>` filter
   skips the second one on the next poll. At 4-company × N-agent load this
   collision is normal, not rare.
2. Restart cursor = `MAX(updated_at)` at `_initial_cursor` (line 125-131). Any
   row mutated during downtime is **permanently invisible** to the new poll.

**Design (kine-shaped append-only events table)**
Borrowing kine's proven model (`k3s-io/kine/pkg/server/watch.go` + `pkg/drivers/generic/generic.go`):

```sql
-- v37 schema migration
CREATE TABLE events (
    revision    INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic, never reused
    resource    TEXT NOT NULL,           -- "companies", "resource_requests", ...
    name        TEXT NOT NULL,           -- target row PK
    op          TEXT NOT NULL CHECK(op IN ('PUT','DELETE')),
    prev_rev    INTEGER,                 -- prior revision for same (resource, name)
    value_json  TEXT,                    -- post-change snapshot
    old_json    TEXT,                    -- pre-change snapshot (for DELETE)
    created_at  INTEGER NOT NULL         -- unix_ms, diagnostics only
);
CREATE INDEX idx_events_resource_rev ON events(resource, revision);
CREATE UNIQUE INDEX idx_events_name_prev ON events(resource, name, prev_rev);
```

Three things make this work where polling-on-updated_at fails:

- **`AUTOINCREMENT` is monotonically increasing per the SQLite contract**
  ([sqlite.org/autoinc.html](https://sqlite.org/autoinc.html)). Gaps are
  allowed (constraint-failure rollbacks, explicit ROWID writes) but
  irrelevant — clients track the actual revision they saw, not
  `prev_revision + 1`. `revision` is the resourceVersion analog.
  Equal-timestamp collisions become impossible. (Corrected from "gap-free"
  per §6.3 E1.)
- **Append-only.** A row is never mutated in place. CEOReconciler etc. issue
  `INSERT INTO events` *after* the corresponding domain INSERT/UPDATE inside
  the same transaction.
- **Resume tokens are durable.** A client (subscriber) holds `(last_revision,
  compact_revision)`. After disconnect, reconnect with `WHERE revision >
  last_revision` returns every missed event so long as `last_revision >
  compact_revision`. If it falls behind compaction, the server returns
  `etcd-style ErrCompacted` and the client does a full LIST.

**Watch fan-out** — one polling goroutine per process at ~200ms tick:
```sql
SELECT revision, resource, name, op, value_json
  FROM events
 WHERE revision > :cursor
 ORDER BY revision
 LIMIT 500;
```
The result drives an in-process broadcaster (our existing `WatchDispatcher`,
reshaped). For sub-second wake within the same process, writers also call
`WatchDispatcher.notify_revision(new_rev)` after commit — same hybrid pattern
as v21.B, but keyed on revision instead of `(table, key)`.

**Compaction** — periodic background task (every 5 min):
```sql
DELETE FROM events
 WHERE revision < :compact_rev
   AND EXISTS (
     SELECT 1 FROM events e2
      WHERE e2.resource = events.resource
        AND e2.name = events.name
        AND e2.revision > events.revision
   );
```
Keep at least one revision per live key so subscribers can always rebuild
state. Retention window: 1 hour by default (configurable). kine's compaction
loop has a documented brittleness ([kine#357](https://github.com/k3s-io/kine/issues/357));
we mitigate by (a) running compaction as a separate cron leader, (b)
exposing `compact_revision` via metrics so falling-behind subscribers are
visible.

**Write path migration** — every controller / API that mutates state writes
twice in one transaction:
```sql
BEGIN;
UPDATE resource_requests SET status='bound', bound_machine_id=:m WHERE id=:r AND ...;
INSERT INTO events(resource, name, op, prev_rev, value_json)
  VALUES('resource_requests', :r, 'PUT',
         (SELECT MAX(revision) FROM events WHERE resource='resource_requests' AND name=:r),
         :json_snapshot);
COMMIT;
```
This is the **honest equivalent** of K8s etcd write-with-resourceVersion. It
also enables MVCC reads (`SELECT value_json FROM events WHERE … revision <=
:read_at`) which we don't need yet but is the foundation for transactional
LIST/WATCH.

**Cost estimate**: ~2-3 weeks. The biggest work is auditing every existing
write site (`controllers/*`, `scheduler/binder.py`, `adapters/scheduled_process.py`,
musu-bridge handlers) and wrapping them in transactional event INSERTs. A
helper `db.mutate(table, key, op, payload)` reduces this to a one-line
change per call site.

**Rejected alternatives**:
- **`update_hook` (SQLite C API via APSW)** — only fires for mutations on the
  *same connection*. Cross-process invisible
  ([sqlite.org/c3ref/update_hook.html](https://sqlite.org/c3ref/update_hook.html)).
- **WAL frame tailing (Litestream-style)** — fragile on NFS/SMB shared
  storage; WAL semantics assume same-host mmap.
- **Marmot / rqlite full CDC** — both pull in NATS or Raft, breaking the
  single-binary deployment story.

---

### 3.2 Leader election — DB-backed lease + static partition (hybrid)

**Current state (the bug)**
`musu-bridge/server.py:877-916`: every bridge instance starts its own
`ControllerManager` containing `CEOReconciler`, `MachineReconciler`,
`SchedulerReconciler`. Zero leader election. On a 2-node deployment:
- Two SchedulerReconcilers double-spend CPU on filter/score; binding is
  safe (binder's atomic UPDATE) but observability and rate-limits drift.
- Two **CEOReconcilers** can both `SELECT COUNT > 0` then both `INSERT`
  for the same agent → multiple in-flight `resource_requests` per agent.
  This is the TOCTOU violation the critique flagged.

**Design (hybrid: lease for sensitive, partition for parallel)**

```sql
-- v38 schema migration
CREATE TABLE leases (
    name           TEXT PRIMARY KEY,    -- 'ceo','scheduler','compactor'
    holder         TEXT NOT NULL,       -- node_id (uuid)
    acquired_at    INTEGER NOT NULL,    -- unix_ms
    renewed_at     INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    fencing_token  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE node_heartbeats (
    node_id        TEXT PRIMARY KEY,
    started_at     INTEGER NOT NULL,
    renewed_at     INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    capabilities_json TEXT NOT NULL DEFAULT '{}'
);
```

**Atomic acquire** (matching `coordination.k8s.io/Lease` semantics):
```sql
UPDATE leases
   SET holder = :me,
       acquired_at = :now,
       renewed_at = :now,
       expires_at = :now + :ttl_ms,
       fencing_token = fencing_token + 1
 WHERE name = :name AND expires_at < :now;
```
`cursor.rowcount == 1` → won election. We already use this exact pattern
in `scheduler/binder.try_bind` (v21.C audit fix). Apply it for leases.

**Renew loop** (every TTL/3):
```sql
UPDATE leases
   SET renewed_at = :now, expires_at = :now + :ttl_ms
 WHERE name = :name AND holder = :me;
```
`rowcount == 0` → preempted; controller calls its `shutdown()` immediately
and re-enters election.

**Recommended TTL params** (mirrors K8s defaults):
- LeaseDuration = 15s
- RenewDeadline = 10s
- RetryPeriod = 2s
- Fail-over latency ≈ LeaseDuration (≈15s). For latency-sensitive
  schedulers, tighten to 5s/3s/1s.

**Fencing tokens** — every reconciler write that affects external systems
(adapter dispatch, supervisor spawn) carries the current `fencing_token`.
Receivers reject writes with a token older than the highest they've seen.
Defends against the classic Kleppmann scenario (DDIA §8.4.3): GC-paused
leader wakes up and tries to write stale state after the lease has rotated.

**Static partition for parallel controllers** (e.g. log shipper, metrics
roll-up). Two valid implementations:

(a) **`hash(target.id) MOD ring_size`** — each node reads
    `node_heartbeats` to form a stable ring; filters via the modulo on
    its own index. Ring change triggers quiesce + restart of all
    nodes. Simplest to implement; full re-shuffle on membership change.

(b) **Lease-per-shard + label routing** — every shard owns its own
    SQLite-lease row; rows are tagged with a `shard` field at write
    time; controllers filter `WHERE shard = :my_shard`. Ring change
    only re-shuffles the dropped shard's keys, not all keys. This is
    `timebertt/kubernetes-controller-sharding`'s actual mechanism
    (per §6.3 E2). More moving parts but smoother rebalancing.

Pick **(a)** for v22.1 simplicity; reconsider **(b)** if rebalance
churn becomes operational pain.

**Mapping to musu controllers**:

| Controller | Election strategy | Why |
|---|---|---|
| CEOReconciler | **lease** (`ceo`) | TOCTOU-sensitive — must be single-active |
| SchedulerReconciler | **lease** (`scheduler`) | Avoid duplicate filter/score CPU; binder already safe but logs/metrics |
| MachineReconciler | **static partition** by `machines.id` hash | Per-machine work is naturally shardable; no cross-row invariant |
| QALoopReconciler | **static partition** by `tasks.id` hash | Same |
| OrphanApprovalReconciler | **lease** (`orphan-recovery`) | Reclaim writes are dangerous if duplicated |
| Compactor (new, §3.1) | **lease** (`compactor`) | Only one compactor at a time per kine docs |

**Cost estimate**: ~1 week. Add `LeaseManager` class (~150 lines) with
acquire/renew/release + heartbeat. Wire into `ControllerManager.add()`:
each controller declares `election_strategy = Lease("ceo") | StaticPartition`.
The framework wraps `Controller.run()` to gate on the strategy.

**Known traps**:
- **Clock skew across nodes** — if any node's clock drifts more than
  `(LeaseDuration - RenewDeadline)`, split-brain becomes possible. Mitigation:
  rewrite renew as `expires_at = (SELECT expires_at FROM leases WHERE name=:n) + :ttl`
  so the SQLite host clock is the only authority (fly.io's pattern).
- **WAL contention at scale** — 5 nodes × 10 leases × 1/3s renew = 50 writes/s.
  Fine on local SQLite, breaks on NFS shared storage. This is the same
  diagnosis as §3.1: NFS-shared SQLite is a no-go; pick single-writer
  (Road B) or kine-on-PG (Road C).
- **Static partition has no work stealing** — a hot partition stays hot.
  If load is balanced (typical for musu's per-machine and per-task work),
  fine. If skewed, upgrade to consistent-hash with bounded loads (Google
  2017 paper) or full dynamic distribution (Argo CD pattern).
- **Stop-the-world GC** — Python's GIL pauses are short, but if the
  process suspends (laptop sleep, swap thrash) the leader can sleep past
  its lease. Fencing tokens are mandatory, not optional.

**Rejected alternatives**:
- **Embedded Raft (hashicorp/raft, etcd embed)** — debugging complexity
  jumps an order of magnitude (snapshot, log truncation, membership
  changes). Inappropriate for "user runs musu-bridge on her laptop".
- **NATS JetStream / Redis Redlock** — adds a separate process to deploy,
  breaks single-binary story.
- **Single static leader (config file)** — works for 1-2 node home setups
  but defeats fail-over. Acceptable as a "lite mode" but should not be
  the default.

### 3.3 API server / consensus — pick a road and enforce it

The critique scored this 2/10 because the question of "who owns the
SQLite file" has never been answered honestly. Three deployment
topologies are possible; v21 silently allowed all three but none of
them works reliably:

| Topology | Reality today | Verdict |
|---|---|---|
| Single host, single bridge | OK | This is what 4-company-1-GPU test covers |
| Single host, multiple bridges (HA) | All bridges write the same file via WAL | Race-free for `binder`, broken for CEO TOCTOU |
| Multiple hosts, shared file (NFS/SMB) | POSIX advisory locks unreliable on net FS | **Will corrupt** |
| Multiple hosts, each with own SQLite | Each bridge sees only its rows | Not actually a cluster |

**v22 decision** — pick exactly one and code-enforce it.

**Recommended: Road B (single-writer + read-replicas)** if multi-host
is a roadmap requirement.

```
            ┌──────────────────────────┐
            │  Writer bridge (leader)  │ ← only this process owns the SQLite file
            │  ControllerManager       │
            │  events table append     │
            └────────────┬─────────────┘
                         │  WAL frames + revision stream
                         ▼
            ┌──────────────────────────┐
            │  Litestream-style WAL    │
            │  replicator → S3/disk    │
            └────────────┬─────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Reader bridge    Reader bridge    Reader bridge
   (read-only DB)   (read-only DB)   (read-only DB)
        │                │                │
        └────── writes forwarded to writer via HTTP ─────┘
```

**Implementation requirements**:
1. **Writer election** — reuse the `coordination` lease from §3.2 with
   `name='db-writer'`. Only the lease holder opens the SQLite file
   read-write. Everyone else opens with `?mode=ro`.
2. **Write forwarding** — readers expose the same HTTP API surface but
   for any mutating endpoint they 307-redirect to the writer's URL (held
   in `leases.holder` + `node_heartbeats.public_url`).
3. **Read-after-write consistency** — readers stream the writer's
   `events` table via §3.1's revision protocol. Read-your-write =
   "block until my last submitted revision is visible locally".

**Code change scope** (~3-4 weeks):
- New `db.py` open mode flag (`writable` based on lease ownership).
- All `db.execute()` mutation calls audit-routed through a new
  `db.mutate()` helper that, if not the writer, calls the writer
  bridge's HTTP equivalent.
- `axis_routes.py` and friends grow a `@write_redirect` decorator.
- Litestream-style WAL shipping is optional for v22; in-cluster reader
  sync via `events` is sufficient for the consistency story.

**Lite mode (acceptable interim)**: bind `db-writer` lease to a single
static node (`config.musu_writer_node_id`). Readers still forward.
Skips election cost but loses fail-over — fine for "user runs both
bridges on her laptop" + "one cloud bridge for friends".

**Alternative: Road A (single-host only)** — drop multi-bridge claim from
docs. Update `frame v9` to specify "1 bridge per device, devices coordinate
via webhook + cross-machine watch". Cost: 1 day of doc rewrites + a
`config.allow_multi_writer` opt-in flag that defaults false.

---

### 3.4 Spec / status separation

The critique flagged this as one of the two **most foundational**
weaknesses: musu has no spec-vs-status data model. Every domain row is
flat — `resource_requests.status` mixes desired and observed, `agents`
has `adapter_config` (which is part spec, part config), and there's no
generation counter to detect spec-change vs status-change.

**What K8s does**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  generation: 7         # increments on spec change
spec:                   # immutable until user POSTs a PUT
  containers: [...]
status:                 # owned by controller, never user-edited
  phase: Running
  observedGeneration: 7 # reconciler echoes this when it has handled spec=7
```

The invariant `status.observedGeneration == metadata.generation` is the
loop's signal that reality matches intent. Without it, reconcilers cannot
detect "user changed spec while I was reconciling — discard my result and
redo".

**Migration plan (v39 schema)**:

```sql
-- One pattern per kind. Example: agents.

-- Before (today):
-- agents(id, name, role, adapter_type, adapter_config TEXT, status, ...)

-- After:
-- 1. Move 'adapter_config' fields into 'spec_json' (immutable surface)
-- 2. Move 'status' enum + machine_id + budget_spent into 'status_json'
ALTER TABLE agents ADD COLUMN spec_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN status_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN observed_generation INTEGER NOT NULL DEFAULT 0;

-- Backfill (idempotent):
UPDATE agents
   SET spec_json = json_object(
         'adapter_type', adapter_type,
         'adapter_config', json(adapter_config),
         'allowed_tools', allowed_tools,
         'budget_usd_monthly', budget_usd_monthly,
         'isolation_profile', isolation_profile
       ),
       status_json = json_object(
         'phase', status,
         'machine_id', machine_id,
         'budget_usd_spent', budget_usd_spent,
         'budget_reset_at', budget_reset_at
       ),
       generation = 1
 WHERE spec_json = '{}';
```

**Write-path invariants** (enforced by triggers OR by `db.mutate()`
wrapper):

- **Spec change → generation increment + event emission**
  ```sql
  CREATE TRIGGER agents_spec_change AFTER UPDATE OF spec_json ON agents
  WHEN NEW.spec_json != OLD.spec_json
  BEGIN
      UPDATE agents SET generation = OLD.generation + 1 WHERE id = NEW.id;
      INSERT INTO events(resource, name, op, prev_rev, value_json, old_json)
          VALUES('agents', NEW.id, 'PUT', ...);
  END;
  ```

- **Status change is reconciler-only**. Enforce by convention + a
  separate `db.write_status(kind, id, patch)` API that takes a fencing
  token and includes `WHERE generation = :observed_generation` (CAS).
  If the generation moved under the reconciler, the write fails and
  the reconciler re-enters with the new spec.

**Reconcile-loop change** in every `Reconciler.reconcile()`:
```python
async def reconcile(self, req):
    row = await load(req.key)
    gen = row.generation
    desired = row.spec
    actual = row.status

    new_status = self._converge(desired, actual)  # pure function
    await self._db.write_status(
        "agents", req.key, new_status,
        expected_generation=gen,
        fencing_token=self.lease.fencing_token,
    )
    # If CAS failed -> requeue immediately, spec moved.
```

**Why this matters beyond pedantry**:
- **Detects stale reconciles** — old controller worker that paused on
  spec=7 can't overwrite status set by a fresh worker on spec=8.
- **Enables idempotent retries** — same spec, same fencing token →
  same result, safe to replay.
- **Makes audit trail honest** — `events` table per §3.1 records spec
  changes (intent) separately from status changes (observation).
  Today's audit log conflates both.

**Cost estimate**: ~3 weeks (touches every controller + every API
handler that mutates state). Most code is mechanical (spec_json / status_json
column wiring), but two non-trivial pieces:
1. The CAS write_status helper + every reconciler updated to handle CAS
   failure (~10 call sites).
2. Backfill testing — every existing row must survive the migration.
   Snapshot of pre-migration DB + post-migration DB diff in test fixture.

**Reduced-scope variant** (v22.0, the honest first step):
- Add `generation` + `observed_generation` columns to the 3 hottest tables
  (`agents`, `resource_requests`, `machines`).
- Skip spec_json / status_json splits.
- Reconcilers still use generation CAS.

This buys 80% of the bug-prevention value at 30% of the cost. Full
spec/status split deferred to v23.

### 3.5 Generation + observedGeneration — closing the CEO TOCTOU gap

§3.4 introduced `generation` / `observed_generation` columns as part of
the spec/status split. This section narrows in on the **concrete race
the critique called out by name**: the CEOReconciler TOCTOU when a
single agent has two competing resource_requests in flight, and the
parallel race in `scheduled_process` cancel-on-timeout.

#### The CEO TOCTOU as written today

`musu_supervisor.reconcilers.ceo.CEOReconciler` decides "does this
agent need a resource_request right now?" The current shape is roughly:

```python
async def reconcile(self, req: ReconcileRequest):
    agent = await load_agent(req.key)
    existing = await load_open_request_for_agent(agent.id)
    if existing is not None:
        return  # already has one in flight
    if not agent_wants_resources(agent):
        return
    await insert_resource_request(agent_id=agent.id, ...)
```

Two CEOs (same company, two processes — recovery worker + main loop —
or one process restart mid-reconcile) can both observe `existing is
None` and both `INSERT`. Now the scheduler has two requests for the
same agent and will bind two machines.

The audit caught one symptom of this in v21.C T8 (binder using
`total_changes` delta instead of `cur.rowcount`). The deeper fix is
**database-level**, not application-level.

#### Fix 1: schema-level uniqueness

```sql
-- v37 migration:
CREATE UNIQUE INDEX rr_one_open_per_agent
    ON resource_requests(agent_id)
    WHERE status IN ('pending', 'bound', 'running');
```

This is a **partial unique index** — SQLite has supported these since
3.8.0 (2014). Once it's in place, the second INSERT fails with
`UNIQUE constraint failed: resource_requests.agent_id` and the CEO
catches the IntegrityError as "lost the race — another reconcile got
there first, requeue and re-read".

The cost is one extra index entry per open request (≤ #agents — tiny)
and one extra constraint check per insert (microseconds). The benefit
is that **no application bug can produce double-binding** — the
database refuses.

#### Fix 2: generation-gated status writes (every reconciler)

The CEO is one example; every reconciler that writes `status` has the
same shape. Standard pattern from §3.4, restated as a hard rule:

```python
# musu_supervisor/db/mutate.py
async def write_status(
    self,
    kind: str,
    key: str,
    patch: dict,
    *,
    expected_generation: int,
    fencing_token: int,
) -> bool:
    """Returns True iff the CAS succeeded."""
    cur = await self._conn.execute(
        f"""
        UPDATE {kind}
           SET status_json = json_patch(status_json, :patch),
               observed_generation = :gen,
               last_writer_token = :tok
         WHERE id = :key
           AND generation = :gen
           AND (last_writer_token IS NULL OR last_writer_token <= :tok)
        """,
        {"patch": json.dumps(patch), "gen": expected_generation,
         "tok": fencing_token, "key": key},
    )
    return cur.rowcount == 1
```

Two invariants enforced atomically:
1. **Generation CAS**: write only commits if spec hasn't moved.
2. **Fencing token monotonicity**: an older leader (per §3.2) cannot
   overwrite a newer leader's status, even if its connection wakes up
   late. `last_writer_token` is the highest fencing token to have
   written this row.

Every reconciler returns `RequeueIfStale` when CAS fails:

```python
ok = await db.write_status(
    "agents", req.key, new_status,
    expected_generation=agent.generation,
    fencing_token=self._lease.fencing_token,
)
if not ok:
    return ReconcileResult.requeue_immediate(
        reason="stale generation or fenced out"
    )
```

#### Fix 3: cancel-on-timeout race via the same mechanism

The v21.C T8 race in `scheduled_process` was: scheduler binds at t=0,
agent dies before status flip → orphan watcher cancels the request at
t=30s → binder simultaneously transitions `bound → running` based on
its earlier read at t=29s. Result: a row marked `running` for a process
that is being canceled.

Today's fix re-reads after cancel. The proper fix:

```sql
-- Cancel path:
UPDATE resource_requests
   SET status = 'canceled',
       generation = generation + 1
 WHERE id = :rid AND status = 'bound';

-- Binder's bound→running attempt:
UPDATE resource_requests
   SET status = 'running'
 WHERE id = :rid AND status = 'bound'
   AND generation = :observed_generation;
```

The binder carries the generation it read at decision time. If the
canceler bumps generation first, the binder's UPDATE matches zero rows
— `cur.rowcount == 0` is the signal to abort the launch instead of
believing it transitioned.

#### Fix 4: spec mutations always bump generation

Application code must never write `spec_json` without bumping
generation. Don't trust this convention — enforce it with a trigger:

```sql
CREATE TRIGGER resource_requests_spec_bump
    AFTER UPDATE OF spec_json ON resource_requests
    WHEN NEW.spec_json != OLD.spec_json
       AND NEW.generation = OLD.generation  -- caller forgot to bump
BEGIN
    UPDATE resource_requests
       SET generation = OLD.generation + 1
     WHERE id = NEW.id;
END;
```

Result: even buggy / hand-written admin SQL maintains the invariant.

#### What this buys

| Race today | Mechanism that prevents it tomorrow |
|------------|-------------------------------------|
| Double CEO bind | Partial unique index on `(agent_id) WHERE status IN open` |
| Stale reconciler overwrites fresh status | Generation CAS in `write_status` |
| Old leader writes after lease lost | Fencing token monotonicity in `write_status` |
| Cancel/bind race in scheduler | Generation-gated `bound → running` UPDATE |
| Buggy code forgets to bump generation | AFTER UPDATE OF spec trigger |

The composite effect: **every status write becomes idempotent and
re-orderable**. Two reconcilers seeing the same generation will produce
the same status; a reconciler seeing an old generation cannot corrupt
the row. This is the K8s reconciler contract finally honored at the
storage layer.

**Cost estimate**: 1 week if combined with §3.4 (most code shared).
Standalone: 4–5 days. Mostly mechanical — every `UPDATE ... SET status =
...` call site (~14 in current codebase) becomes a `db.write_status(...)`
call with generation + fencing token.

### 3.6 Finalizers + owner references — preventing orphan rows

The critique's second blocker: musu has **no concept of ownership or
graceful deletion**. When a company is removed, what happens to its
agents? When an agent is removed, what happens to its open
`resource_requests`? When a machine is removed mid-run, what happens
to the bound process there?

Today the answer is "leave it floating, hope the orphan recovery cron
finds it." That's the same brittle pattern K8s rejected in 2016 when
it shipped owner references + GC controller + finalizers.

#### What K8s does

Two complementary primitives:

- **Owner references** — every resource carries `metadata.ownerReferences`
  pointing at its parent. The GC controller (`kube-controller-manager
  --controllers=garbage-collector`) walks these references and, when a
  parent is deleted, hard-deletes orphaned children (cascade) or sets
  them adrift (orphan policy) per the `propagationPolicy`.

- **Finalizers** — a resource cannot be hard-deleted while
  `metadata.finalizers` is non-empty. A `DELETE` request flips
  `metadata.deletionTimestamp` to `now` and waits. Each finalizer
  represents a cleanup obligation; the controller responsible for that
  obligation removes its name from the list when done. Last finalizer
  removed → the record is actually deleted.

Combined: ownership models the dependency graph; finalizers model the
cleanup pipeline. A deletion is a **soft-delete with a workflow**, not
a `DELETE FROM ...`.

#### Migration plan (v38 schema)

```sql
-- 1. Owner references (one-to-many; most musu relationships are 1:N).
ALTER TABLE agents             ADD COLUMN owner_company_id TEXT
                                   REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE resource_requests  ADD COLUMN owner_agent_id TEXT
                                   REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE scheduled_process  ADD COLUMN owner_request_id TEXT
                                   REFERENCES resource_requests(id) ON DELETE CASCADE;
ALTER TABLE heartbeat_runs     ADD COLUMN owner_machine_id TEXT
                                   REFERENCES machines(id) ON DELETE CASCADE;

CREATE INDEX agents_by_owner            ON agents(owner_company_id);
CREATE INDEX rr_by_owner                ON resource_requests(owner_agent_id);
CREATE INDEX scheduled_proc_by_owner    ON scheduled_process(owner_request_id);

-- 2. Soft-delete + finalizers.
ALTER TABLE agents             ADD COLUMN deletion_timestamp INTEGER;  -- NULL = alive
ALTER TABLE agents             ADD COLUMN finalizers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE resource_requests  ADD COLUMN deletion_timestamp INTEGER;
ALTER TABLE resource_requests  ADD COLUMN finalizers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE companies          ADD COLUMN deletion_timestamp INTEGER;
ALTER TABLE companies          ADD COLUMN finalizers TEXT NOT NULL DEFAULT '[]';

-- 3. Active view (callers query this instead of the raw table).
CREATE VIEW agents_active AS
    SELECT * FROM agents WHERE deletion_timestamp IS NULL;
CREATE VIEW resource_requests_active AS
    SELECT * FROM resource_requests WHERE deletion_timestamp IS NULL;
CREATE VIEW companies_active AS
    SELECT * FROM companies WHERE deletion_timestamp IS NULL;
```

**Why `ON DELETE CASCADE` AND finalizers**: cascade is the "hard
backstop" for when the row finally gets hard-deleted. Finalizers are
the "soft front door" — the normal path, where each controller cleans
its own side effects before the row disappears.

#### The deletion lifecycle

```
1. User/operator calls: DELETE /agents/abc
2. API server runs:
       UPDATE agents
          SET deletion_timestamp = :now,
              generation = generation + 1
        WHERE id = 'abc';
3. Each registered controller observes the watch event and inspects
   `finalizers`:
       - "supervisor.kill-running-process"
       - "scheduler.release-bound-machine"
       - "billing.flush-spend"
4. Each controller does its work, then removes its own finalizer:
       UPDATE agents
          SET finalizers = json_remove(finalizers, '$[i]')
        WHERE id = 'abc' AND finalizers LIKE '%kill-running-process%';
5. When finalizers becomes '[]' AND deletion_timestamp IS NOT NULL,
   the GC controller hard-deletes:
       DELETE FROM agents WHERE id = 'abc' AND finalizers = '[]';
   The ON DELETE CASCADE then propagates to children that didn't
   get cleaned via their own finalizers (defense in depth).
```

#### GC controller — one new reconciler

```python
class GCReconciler(Reconciler):
    """K8s garbage-collector analogue. Runs in the same WatchDispatcher
    pipeline as every other reconciler; one instance per kind."""

    def __init__(self, kind: str):
        self._kind = kind  # 'agents' | 'resource_requests' | 'companies' | ...

    async def reconcile(self, req: ReconcileRequest):
        row = await load(self._kind, req.key)
        if row is None:
            return ReconcileResult.done()

        # Phase 1: terminating but finalizers remain → wait for owners.
        if row.deletion_timestamp is not None and row.finalizers != []:
            return ReconcileResult.done()  # other controllers will trigger us

        # Phase 2: terminating + no finalizers → hard delete.
        if row.deletion_timestamp is not None and row.finalizers == []:
            cur = await db.execute(
                f"DELETE FROM {self._kind} WHERE id = :id "
                f"AND finalizers = '[]' AND deletion_timestamp IS NOT NULL",
                {"id": req.key},
            )
            if cur.rowcount == 1:
                await emit_event(self._kind, req.key, "DELETE")
            return ReconcileResult.done()

        # Phase 3: alive + parent dead → propagate deletion.
        if self._owner_field(self._kind):
            owner = await load_owner(self._kind, row)
            if owner and owner.deletion_timestamp is not None:
                await db.execute(
                    f"UPDATE {self._kind} "
                    f"   SET deletion_timestamp = :now "
                    f" WHERE id = :id AND deletion_timestamp IS NULL",
                    {"now": now_ms(), "id": req.key},
                )
        return ReconcileResult.done()
```

The GC reconciler is **simple**: no state, no caches, no business
logic — it just propagates `deletion_timestamp` down the owner graph
and hard-deletes rows whose finalizer list has drained. Total ~120
lines.

#### Why this is better than the current orphan watcher

| Aspect | Today's orphan recovery | Owner refs + finalizers |
|--------|-------------------------|-------------------------|
| When does cleanup run? | Cron every N minutes | Immediately on parent-delete watch event |
| Window of orphaned state | up to N minutes | bounded by reconciler latency (<1s typical) |
| Cleanup order | Best-effort, racy | Topological — children before parent disappears |
| Verifiability | "It mostly works" | Invariant: a row with `deletion_timestamp IS NOT NULL AND finalizers = '[]'` is gone within one reconcile tick |
| Pre-deletion side effects | None — row already gone | Each controller runs its `pre_delete` while row is still readable |

That last row is the killer feature. The supervisor needs to **kill
the running process before the row disappears** (otherwise the
running PID becomes unowned). Today the orphan watcher cleans up
*after* the row vanishes and has to reconstruct enough state from
logs. With finalizers, the supervisor's finalizer removal step runs
while the agent row is still in the database, so the supervisor can
do `SELECT machine_id, process_id FROM agents WHERE id = ?` and kill
the process cleanly before unfinalizing.

#### Backfill

Migrating existing data is trivial because finalizers default to `'[]'`
and `deletion_timestamp` defaults to NULL. New rows opt in by setting
finalizers at INSERT time; old rows act exactly as before until
something tries to delete them. **Zero behavior change for live data
on migration day.**

Owner references need a one-shot backfill:

```sql
UPDATE agents
   SET owner_company_id = company_id  -- rename of existing column
 WHERE owner_company_id IS NULL;

UPDATE resource_requests
   SET owner_agent_id = agent_id
 WHERE owner_agent_id IS NULL;
```

Both are pure renames of existing FK columns to the new conventional
name. No rows move.

#### Cost estimate

- Schema migration v38 + backfill tests: 2 days
- GCReconciler + tests: 2 days
- Finalizer wiring per controller (CEO, Scheduler, Supervisor,
  Machine, OrphanApproval): 1 day per controller × 5 = 5 days
- Switch read paths to `*_active` views: 1 day
- Deletion-cascade scenario tests (the multi-process race fixtures
  per §3.8): 2 days

Total: **~2.5 weeks**.

#### Risk

The non-trivial risk is **finalizer deadlock**: a controller's
finalizer never gets removed (bug or operator removes the controller),
the row stays in deletion-in-progress forever, downstream consumers
never see the delete. K8s mitigates this with `kubectl patch
--remove-finalizer`; we'd need an admin endpoint
`POST /admin/agents/:id/force-finalize` that strips finalizers with an
audit log entry. Document this as escape valve in the v22 runbook.

### 3.7 Scheduler — preemption + expression affinity + topology spread

§3.1–3.6 fixed the **data model**. This section fixes the **scheduler
itself**, which the critique scored 6/10 — already the strongest area
but missing three K8s primitives that real workloads need.

The current scheduler (`musu_supervisor.scheduler.{filter,score,binder}`)
implements filter-score-bind correctly. The gaps:

| Gap | What today does | What K8s does |
|-----|-----------------|---------------|
| Preemption | None — low priority blocks high priority indefinitely | High-priority pod evicts lower-priority pods on the chosen node |
| Affinity expression | `requirements: {"gpu": True}` string-equality match | `nodeAffinity: matchExpressions: [{key, operator, values}]` (In/NotIn/Exists/Gt/Lt) |
| Topology spread | None — all 4 agents can pile on one machine | `topologySpreadConstraints` with `maxSkew` across zones/hostnames |
| Score tunability | Hand-tuned weights in `score.py` | Pluggable scoring profile with named plugins + weights |

#### Fix 1: priority + preemption

```sql
-- v40 migration:
ALTER TABLE resource_requests
    ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE resource_requests
    ADD COLUMN preemption_policy TEXT NOT NULL DEFAULT 'PreemptLowerPriority';
        -- 'PreemptLowerPriority' | 'Never'

CREATE INDEX rr_pending_by_priority
    ON resource_requests(priority DESC, created_at ASC)
    WHERE status = 'pending';
```

**Scheduler loop change**:

```python
# scheduler/loop.py
async def _pop_next(self) -> ResourceRequest | None:
    # Highest priority first, then FIFO within priority band.
    row = await db.fetchone("""
        SELECT * FROM resource_requests
         WHERE status = 'pending'
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
    """)
    return ResourceRequest.from_row(row) if row else None
```

**Preemption pass — runs when filter() returns no fit**:

```python
# scheduler/preempt.py — new module
async def find_preemption_victims(
    req: ResourceRequest,
    candidate_machines: list[Machine],
) -> tuple[Machine, list[ResourceRequest]] | None:
    """For each candidate machine, find the cheapest set of lower-priority
    bound requests whose eviction would make this request fit. Returns
    (machine, victims) for the lowest-cost option, or None."""

    best: tuple[Machine, list[ResourceRequest], int] | None = None
    for m in candidate_machines:
        bound_here = await load_bound_on(m.id)
        # Sort victims by (priority asc, cost desc) — kill cheapest losses first.
        candidates = sorted(
            (r for r in bound_here if r.priority < req.priority
                                   and r.preemption_policy == 'PreemptLowerPriority'),
            key=lambda r: (r.priority, -_eviction_cost(r)),
        )
        accumulated_capacity = m.free_capacity
        victims = []
        for v in candidates:
            if _fits(req, accumulated_capacity):
                break
            victims.append(v)
            accumulated_capacity = _add(accumulated_capacity, v.allocated)
        if _fits(req, accumulated_capacity):
            cost = sum(_eviction_cost(v) for v in victims)
            if best is None or cost < best[2]:
                best = (m, victims, cost)
    return (best[0], best[1]) if best else None


def _eviction_cost(victim: ResourceRequest) -> int:
    """Higher = more painful to evict. K8s uses runtime + restartCount
    proxies; we use elapsed_seconds + has_artifacts_to_lose."""
    elapsed = now_ms() - victim.bound_at
    return elapsed + (60_000 if victim.has_pending_writes else 0)
```

**Eviction is a status transition + finalizer trigger** (per §3.6):

```python
async def evict(victim: ResourceRequest, reason: str):
    ok = await db.write_status(
        "resource_requests", victim.id,
        {"phase": "evicted", "evict_reason": reason},
        expected_generation=victim.generation,
        fencing_token=self._lease.fencing_token,
    )
    if not ok:
        # Generation moved — victim changed under us, retry next tick.
        return False
    # Soft-delete sets deletion_timestamp; supervisor's finalizer kills
    # the process; GC reconciler hard-deletes once finalizers drain.
    await db.execute("""
        UPDATE resource_requests
           SET deletion_timestamp = :now
         WHERE id = :id AND deletion_timestamp IS NULL
    """, {"now": now_ms(), "id": victim.id})
    return True
```

The supervisor finalizer (per §3.6) is what actually SIGTERMs the
running agent — the scheduler just marks the row for deletion.
Clean separation: scheduler decides who dies; supervisor performs the
kill; GC reaps the corpse.

#### Fix 2: expression-based affinity

Today's `agents.requirements_json` is a flat dict, matched against
`machines.labels_json` by equality. K8s `matchExpressions` is far more
expressive:

```sql
-- v41 migration:
ALTER TABLE agents
    ADD COLUMN affinity_json TEXT NOT NULL DEFAULT '{}';
-- Old `requirements_json` kept; affinity supersedes it on the read path.

-- Example affinity_json:
{
  "required": [
    {"key": "gpu",        "op": "Exists"},
    {"key": "gpu.memory", "op": "Gt",      "values": ["8000"]},
    {"key": "zone",       "op": "In",      "values": ["seoul-a", "seoul-b"]},
    {"key": "preempt",    "op": "NotIn",   "values": ["forbidden"]}
  ],
  "preferred": [
    {"weight": 10, "expr": {"key": "gpu.brand", "op": "In", "values": ["nvidia"]}},
    {"weight":  5, "expr": {"key": "ssd",       "op": "Exists"}}
  ]
}
```

**Filter evaluator**:

```python
# scheduler/affinity.py — new module
def matches(expr: dict, labels: dict[str, str]) -> bool:
    key = expr["key"]
    op = expr["op"]
    vals = expr.get("values", [])
    has = key in labels

    if op == "Exists":     return has
    if op == "DoesNotExist": return not has
    if not has:            return op == "NotIn"  # missing key counts as "not in any value"
    cur = labels[key]
    if op == "In":         return cur in vals
    if op == "NotIn":      return cur not in vals
    if op == "Gt":         return _num(cur) > _num(vals[0])
    if op == "Lt":         return _num(cur) < _num(vals[0])
    raise ValueError(f"unknown op: {op}")


def filter_machines(
    agents: Agent,
    machines: list[Machine],
) -> list[Machine]:
    affinity = json.loads(agents.affinity_json or "{}")
    required = affinity.get("required", [])
    return [m for m in machines
            if all(matches(e, m.labels) for e in required)]
```

**Score contribution from preferred expressions**:

```python
def affinity_score(agent: Agent, machine: Machine) -> int:
    affinity = json.loads(agent.affinity_json or "{}")
    return sum(
        p["weight"] for p in affinity.get("preferred", [])
        if matches(p["expr"], machine.labels)
    )
```

**Backwards compat**: the existing `requirements_json` translates 1:1
into `required: [{key, op:'In', values:[v]}]` on read. Old rows work
without migration; new rows opt into the richer form.

#### Fix 3: topology spread constraints

The 4-company-1-GPU scenario test in v21.C passes because there's only
1 GPU machine. The moment a company has multiple agents and there are
multiple machines, today's scheduler will pile them onto the
cheapest-scoring single machine — losing fault isolation.

```sql
-- v42 migration:
ALTER TABLE agents
    ADD COLUMN topology_spread_json TEXT NOT NULL DEFAULT '[]';

-- Example: spread this company's agents across hostnames with maxSkew=1.
-- topology_spread_json:
[
  {
    "max_skew": 1,
    "topology_key": "hostname",
    "label_selector": {"company_id": "acme"},
    "when_unsatisfiable": "DoNotSchedule"
        -- or "ScheduleAnyway" (becomes preferred score penalty)
  }
]
```

**Spread evaluator** runs during filter (for `DoNotSchedule`) and
score (for `ScheduleAnyway`):

```python
# scheduler/topology.py — new module
async def spread_violation(
    constraint: dict,
    candidate_machine: Machine,
    selector: dict,
) -> int:
    """Returns the skew that would result if we placed an agent matching
    `selector` on `candidate_machine`. 0 = perfectly balanced."""

    key = constraint["topology_key"]  # e.g. "hostname" or "zone"
    rows = await db.fetchall("""
        SELECT m.labels_json, COUNT(*) AS n
          FROM resource_requests rr
          JOIN machines m ON rr.machine_id = m.id
          JOIN agents a ON rr.agent_id = a.id
         WHERE rr.status IN ('bound', 'running')
           AND _matches_selector(a, :selector)
         GROUP BY json_extract(m.labels_json, :key_path)
    """, {"selector": json.dumps(selector), "key_path": f"$.{key}"})

    counts = {r.topology_value: r.n for r in rows}
    candidate_value = candidate_machine.labels.get(key)
    counts[candidate_value] = counts.get(candidate_value, 0) + 1

    min_c, max_c = min(counts.values()), max(counts.values())
    return max_c - min_c


async def passes_spread(req: ResourceRequest, machine: Machine) -> bool:
    constraints = json.loads(req.topology_spread_json or "[]")
    for c in constraints:
        skew = await spread_violation(c, machine, c["label_selector"])
        if skew > c["max_skew"]:
            if c["when_unsatisfiable"] == "DoNotSchedule":
                return False
            # ScheduleAnyway: still passes filter; score will penalize.
    return True
```

#### Fix 4: pluggable score profile

Today's `score.py` has hand-tuned constants:
```python
score = (free_gpu_ratio * 50) + (free_cpu_ratio * 30) + (free_mem_ratio * 20)
```

K8s replaced this with named scoring plugins each contributing a
weighted 0-100 score. We can do the same with ~50 lines:

```python
# scheduler/score.py — refactored
@dataclass
class ScorePlugin:
    name: str
    weight: int
    score_fn: Callable[[ResourceRequest, Machine], int]  # returns 0..100

class ScoreProfile:
    plugins: list[ScorePlugin]

    def score(self, req: ResourceRequest, m: Machine) -> int:
        return sum(p.weight * p.score_fn(req, m) for p in self.plugins)


DEFAULT_PROFILE = ScoreProfile(plugins=[
    ScorePlugin("LeastAllocated",   weight=50, score_fn=least_allocated_score),
    ScorePlugin("AffinityPreferred", weight=30, score_fn=affinity_score),
    ScorePlugin("TopologySpread",   weight=20, score_fn=spread_score_penalty),
    ScorePlugin("ImageLocality",    weight=10, score_fn=image_locality_score),
])
```

The profile is loaded from `scheduler_config.json` on startup so
operators can tune weights without code changes. Hot-reload via
SIGHUP is a v23 nicety.

#### What this buys

| Scenario today | After §3.7 |
|----------------|------------|
| User submits priority-100 job; cluster full of priority-10 jobs | Job sits in `pending` forever | Lower-priority jobs evict cleanly, high-priority job binds |
| Agent needs `gpu.memory > 8000` | Only string-equality match → can't express | `Gt` operator handles it |
| 4 agents from same company | All pile on cheapest machine | Spread across machines with `max_skew=1` |
| Want to reweight scoring | Edit code, redeploy | Edit `scheduler_config.json`, restart |

#### Cost estimate

- Schema v40+v41+v42 + migrations: 2 days
- Preemption module + tests (incl. eviction-cost heuristics): 4 days
- Affinity expression evaluator + tests: 2 days
- Topology spread evaluator + tests: 3 days
- Score plugin refactor: 2 days
- 4-company × 2-GPU × 2-zone scenario test fixture: 2 days

Total: **~3 weeks**.

#### Risk

The non-trivial risk is **preemption thrashing**: high-priority job
arrives → evicts low-priority → low-priority gets requeued at its
original priority → cycle. K8s prevents this with `Pod.spec.priority`
being immutable post-creation and adding a backoff window after
eviction. Our equivalent: `resource_requests.priority` is bumped from
the schedulingPolicy on first-bind so re-bind happens at the same
priority, and after an eviction the request enters a 60s backoff
during which it can't preempt anyone else. Cheap and effective.

### 3.8 Test fortification — multi-process race + fault injection

The critique scored test reliability 4/10 with one sentence that
stings: *"4-company × 1-GPU is a single-process best-case; nothing in
the suite proves the system survives concurrent operators or partial
failures."* The fixes in §3.1–3.7 close the **design** gap; this
section closes the **verification** gap. A reconciler is only as good
as the failures its tests reproduce.

#### Test taxonomy (what's missing)

| Category | Today | After §3.8 |
|----------|-------|------------|
| Single-process functional | ~340 tests, good coverage | Unchanged |
| Multi-process race | **0 tests** | 12 scenarios, OS-level subprocess |
| Fault injection | **0 tests** | 9 fault classes × N reconcilers |
| Property-based | **0 tests** | 4 invariants, hypothesis-driven |
| Long-running soak | **0 tests** | 1-hour nightly + 24-hour weekly |
| Migration round-trip | partial | Every v37→v42 migration with pre/post diff |

The next three subsections specify the missing four — multi-process,
fault injection, property-based, and soak. Migration round-trip is
already a v22 schema migration requirement (§3.4 onward).

#### Fix 1: multi-process race test harness

Single-process `pytest` cannot reproduce the CEO TOCTOU because the
asyncio event loop serializes everything. The races only surface when
two OS processes hit the same SQLite file. The harness:

```python
# tests/multi_proc/harness.py
import multiprocessing as mp
import signal
import sqlite3
from contextlib import contextmanager
from pathlib import Path

@contextmanager
def shared_db(tmp_path: Path):
    """Yields a path to an empty WAL-mode SQLite suitable for cross-
    process access. Sets busy_timeout=5000ms on every connection."""
    db = tmp_path / "shared.db"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    apply_all_migrations(conn)
    conn.commit()
    conn.close()
    yield db


def run_role(role_fn, db_path, barrier, results, **kwargs):
    """Worker entrypoint. Waits on barrier so all workers start
    simultaneously, then invokes role_fn and records its result."""
    try:
        barrier.wait(timeout=10)
        result = role_fn(db_path, **kwargs)
        results.put(("ok", result))
    except BaseException as e:
        results.put(("err", repr(e)))


@contextmanager
def race(db_path, *roles, barrier_count=None):
    """Spin up N processes; barrier-sync their start; collect results."""
    barrier = mp.Barrier(barrier_count or len(roles))
    results = mp.Queue()
    procs = [
        mp.Process(target=run_role, args=(r.fn, db_path, barrier, results),
                   kwargs=r.kwargs)
        for r in roles
    ]
    for p in procs: p.start()
    try:
        outcomes = [results.get(timeout=30) for _ in roles]
        yield outcomes
    finally:
        for p in procs:
            if p.is_alive(): p.terminate()
            p.join(timeout=2)
```

#### The 12 multi-process scenarios

Each scenario asserts a **post-condition over the database** that
holds regardless of OS scheduling.

1. **CEO double-bind**: 2 CEO processes both observe `existing IS
   NULL` and try to INSERT `resource_request(agent_id='abc')`. Assert
   exactly 1 row in `resource_requests WHERE agent_id='abc' AND status
   IN ('pending','bound','running')`. (Validates §3.5 partial unique
   index.)

2. **Scheduler-vs-canceller**: scheduler binds at t=0, canceler hits
   at t=100ms; binder transitions bound→running at t=110ms. Assert
   `status = 'canceled'` AND `process did not actually start`.
   (Validates §3.5 generation-gated bound→running.)

3. **Two schedulers racing for the same machine**: 2 scheduler
   leaders (deliberately misconfigured) both attempt to bind 2 pending
   requests to the same GPU slot. Assert capacity reservation atomic:
   exactly 1 binds, the other returns `Filter no longer fits`.
   (Validates §3.2 leader lease — only one should be a leader, but
   even if both are, the binder must hold.)

4. **Lease handoff under load**: scheduler-A holds lease, processing
   request X. Lease expires (clock skew); scheduler-B acquires; A
   tries to write status after losing lease. Assert A's write fails,
   B's succeeds. (Validates §3.5 fencing token monotonicity.)

5. **Watch event ordering**: 3 writers, 1 watcher. Writers each insert
   N events. Watcher subscribes mid-stream. Assert watcher sees
   events in monotonically increasing `rev` order and no `rev` is
   skipped. (Validates §3.1 kine-shaped events table.)

6. **Compaction during active watch**: compactor deletes events up
   to rev=100 while watcher's cursor is at rev=80. Assert watcher gets
   `ErrCompacted` (not silent skip), re-lists, and resumes from
   current state without dropping new events. (Validates §3.1
   compaction semantics.)

7. **Finalizer deadlock recovery**: supervisor process dies while
   holding `supervisor.kill-process` finalizer on an agent in
   deletion. Assert admin force-finalize endpoint strips finalizer and
   row hard-deletes. (Validates §3.6 escape valve.)

8. **Cascade delete under churn**: delete a company while 5 agents
   are mid-reconcile. Assert no orphaned `resource_requests` rows;
   every child reaches `deletion_timestamp IS NOT NULL` before parent
   hard-deletes. (Validates §3.6 GCReconciler.)

9. **Preemption race**: high-priority request arrives while
   low-priority bind is mid-flight (UPDATE not yet committed). Assert
   either low-priority finishes binding then gets evicted, OR
   low-priority's bind fails because high-priority preempted first
   — never both bound on the same slot. (Validates §3.7 preemption +
   capacity atomicity.)

10. **Write-forward to leader under partition**: writer node loses
    network mid-write; replica receives forwarded write; partition
    heals; assert no duplicate write committed. (Validates §3.3
    Road-B write forwarding with idempotency keys.)

11. **Migration mid-flight**: scheduler running on v36 schema;
    operator runs `apply_migration_v37` which adds the partial unique
    index. Assert: existing duplicate rows are detected (or migration
    rejected with explicit error), no schema corruption. (Validates
    §3.5 + general migration safety.)

12. **WAL replication lag**: leader writes 100 events; replica is 30
    behind; client reads from replica then writes to leader; leader
    rejects because client's read was stale. Assert client retries
    against fresh read. (Validates §3.3 read-after-write hazards.)

#### Fix 2: fault injection — what to break

Reconcilers must converge even when subsystems behave badly. The 9
fault classes:

| # | Fault | How to inject | Invariant tested |
|---|-------|---------------|------------------|
| F1 | Disk full | mount tmpfs with `size=1M`, fill it | Reconciler returns error result, no partial write, requeues |
| F2 | SQLite busy | hold write lock in another process for 6s (> busy_timeout) | Reconciler logs + requeues, does not throw uncaught |
| F3 | Process kill mid-reconcile | SIGKILL the worker mid-UPDATE | DB has either pre-state or post-state, never partial; next reconcile converges |
| F4 | Clock jump forward | freeze-time fixture jumps `now()` +1h | Leases expire correctly; no stale lease prevents new acquire |
| F5 | Clock jump backward | freeze-time fixture rewinds `now()` -10m | Fencing tokens prevent old leader's writes; events table monotonic rev unaffected |
| F6 | Network partition (writer ↔ replica) | iptables drop in CI containers; in tests, fault-injecting RPC client | Writer keeps working; replica eventually catches up; no split-brain |
| F7 | Bridge endpoint 500s | mock httpx returns 500 for `/watch/notify` | Watch falls back to poll mode; events still delivered |
| F8 | Bridge endpoint hangs | mock httpx never responds | Notify times out; falls back to poll mode within 5s |
| F9 | Process spawn fails | supervisor.spawn() raises | resource_request marked failed; lease held capacity released |

Each fault is parametrized across **every reconciler** that touches
the affected subsystem. Example:

```python
@pytest.mark.parametrize("reconciler", [
    CEOReconciler, SchedulerReconciler, MachineReconciler,
    OrphanApprovalReconciler, GCReconciler,
])
@pytest.mark.parametrize("fault", [F1_DISK_FULL, F2_SQLITE_BUSY, F3_SIGKILL])
async def test_reconciler_survives_fault(reconciler, fault, harness):
    seeded = harness.seed_state()
    with fault.inject(harness):
        await harness.run(reconciler, ticks=10)
    # Invariant 1: DB still readable.
    assert harness.db.integrity_check() == "ok"
    # Invariant 2: no row left in a transient state past its TTL.
    assert harness.no_stale_transient_states(after_ms=10_000)
    # Invariant 3: state is one of {pre-fault, post-fault}, not "partial".
    assert harness.state_is_valid_terminal(seeded)
```

5 reconcilers × 9 faults = 45 generated tests, of which ~30 actually
apply (some fault/reconciler pairs are nonsensical — e.g., F9 doesn't
apply to CEO). The matrix is generated; the fixtures are reused.

#### Fix 3: property-based tests (hypothesis)

Four invariants are testable as universally quantified properties.
`hypothesis` generates inputs; each invariant holds for **all**
generated states.

```python
from hypothesis import given, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, rule, invariant

class ReconcilerStateMachine(RuleBasedStateMachine):
    """Property: regardless of operation order, the database satisfies
    the four global invariants after every reconcile tick."""

    @rule(agent_id=st.text(min_size=1, max_size=8))
    def add_agent(self, agent_id): ...

    @rule(agent_id=st.text(min_size=1, max_size=8),
          priority=st.integers(min_value=0, max_value=100))
    def submit_request(self, agent_id, priority): ...

    @rule()
    def tick_scheduler(self): self.harness.run_one(SchedulerReconciler)

    @rule()
    def tick_ceo(self): self.harness.run_one(CEOReconciler)

    @rule()
    def trigger_eviction(self): ...

    @invariant()
    def at_most_one_open_request_per_agent(self):
        rows = self.db.fetchall("""
            SELECT agent_id, COUNT(*) FROM resource_requests
             WHERE status IN ('pending','bound','running')
             GROUP BY agent_id HAVING COUNT(*) > 1
        """)
        assert rows == []

    @invariant()
    def bound_capacity_never_exceeds_machine_capacity(self):
        ...

    @invariant()
    def every_running_request_has_live_machine(self):
        ...

    @invariant()
    def deletion_timestamp_implies_terminal_within_60s(self):
        ...
```

`hypothesis` will explore tens of thousands of operation orderings.
Each shrunk failure case becomes a deterministic regression test.

#### Fix 4: long-running soak

```python
# tests/soak/test_one_hour_soak.py
@pytest.mark.soak  # opt-in, not in default pytest run
async def test_one_hour_soak():
    """Run all reconcilers for 1 hour with realistic event mix.
    Asserts:
      - memory growth < 50MB
      - DB size growth bounded by compaction (events < 100k rows)
      - 95th-percentile reconcile latency < 100ms
      - no reconciler permanently stuck (last_tick within 30s for all)
    """
    harness = soak_harness(duration=timedelta(hours=1))
    await harness.run()
    metrics = harness.collect_metrics()
    assert metrics.rss_growth_mb < 50
    assert metrics.events_table_size < 100_000
    assert metrics.p95_reconcile_ms < 100
    assert all(r.staleness_s < 30 for r in metrics.reconcilers)
```

Runs nightly in CI. The 24-hour variant runs weekly on a dedicated
runner. Both produce a Grafana-shaped time-series JSON for trend
analysis — regression detection is "compare today's p95 to last 7
nights' median".

#### CI integration

```yaml
# .github/workflows/v22-test-fortification.yml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps: [pytest tests/unit]

  multi_proc:
    runs-on: ubuntu-latest
    steps:
      - run: pytest tests/multi_proc --maxfail=1 -x
      # multi-process races are flaky-prone; -x stops on first failure
      # so we don't get a cascade of timeouts polluting logs

  fault_injection:
    runs-on: ubuntu-latest
    steps: [pytest tests/fault_injection --timeout=60]

  property:
    runs-on: ubuntu-latest
    steps:
      - run: pytest tests/property --hypothesis-profile=ci
      # ci profile = 200 examples per state machine, ~5 min total

  soak_1h:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 3 * * *'  # nightly 3 AM UTC
    timeout-minutes: 90
    steps: [pytest tests/soak -m soak --soak-duration=3600]

  soak_24h:
    runs-on: self-hosted-bare-metal
    if: github.event.schedule == '0 0 * * 0'  # weekly Sunday
    timeout-minutes: 1500
    steps: [pytest tests/soak -m soak --soak-duration=86400]
```

#### Cost estimate

- Multi-process harness + 12 scenarios: 1.5 weeks
- Fault injection fixtures (9 fault classes) + parametrized tests: 1 week
- Property-based state machines (4 invariants): 4 days
- Soak harness + nightly CI wiring: 3 days
- CI infra (self-hosted runner for 24h soak): 2 days

Total: **~4 weeks** (largest §3.x section). This is the price of
proving the design works, not just claiming it does.

#### Why this is the most important section

§3.1–3.7 are **design proposals**. Without §3.8 they are pattern
applications, indistinguishable from past designs that looked good on
whiteboards and broke in production. The K8s project itself learned
this — the e2e suite (`test/e2e/`) and the scalability tests
(`test/e2e/scalability/`) are larger by line count than the core
controllers. **Reliability is observed, not designed.**

The unstated benefit: most §3.x fixes have ambiguous trade-offs. Is
the partial unique index worth a 0.5% INSERT slowdown? Is generation
CAS worth one extra round-trip per status write? §3.8's soak metrics
turn those debates into numbers. **The tests are the strongest
documentation of the design.**

### 3.9 Migration plan (v37+ schema) + cost rollup

Sections 3.1–3.8 propose 6 schema migrations and ~4 months of work.
This section sequences them into a shippable program: which migration
unlocks which fix, what ships per release, and what the user needs to
sign off on per Constitution III/VII.

#### Schema migration sequence

| v# | What it adds | Required by | Backwards-compat? | Const III gate? |
|----|--------------|-------------|-------------------|-----------------|
| v37 | `events` table (kine-shaped) | §3.1 watch | Yes — old polling sources still work | YES |
| v38 | `leases` table + fencing | §3.2 leader | Yes — old single-process mode is still default | YES |
| v39 | `spec_json`, `status_json`, `generation`, `observed_generation` per kind | §3.4 spec/status | Yes — old flat columns kept as views | YES |
| v40 | Partial unique index `resource_requests(agent_id) WHERE status open` | §3.5 CEO TOCTOU | Soft — fails on EXISTING duplicates → migration must rejct or dedupe first | YES (high risk) |
| v41 | `owner_*`, `deletion_timestamp`, `finalizers` columns + `_active` views | §3.6 finalizers | Yes — old direct reads still work, new code uses views | YES |
| v42 | `priority`, `preemption_policy`, `affinity_json`, `topology_spread_json` | §3.7 scheduler | Yes — DEFAULT 0 / `'{}'` → no behavior change for old rows | NO (additive only) |

**v40 is the only sharp edge.** Existing data may already contain
`resource_requests` with the same `agent_id` in `pending+bound+running`
overlap (it's the TOCTOU bug). Migration must:

```sql
-- v40 pre-flight (run before applying unique index):
CREATE TEMPORARY TABLE rr_duplicates AS
SELECT agent_id, COUNT(*) AS n
  FROM resource_requests
 WHERE status IN ('pending','bound','running')
 GROUP BY agent_id
HAVING n > 1;

-- If any rows: fail loud with the agent_id list. Operator must
-- resolve manually (cancel duplicates, pick one) before retry.
-- Only after rr_duplicates is empty do we run:
CREATE UNIQUE INDEX rr_one_open_per_agent
    ON resource_requests(agent_id)
    WHERE status IN ('pending','bound','running');
```

The dedupe step is **never automatic** — silently canceling a duplicate
could kill a running production agent. Manual is the right default.

#### Release sequence (4 minor versions)

```
v22.0 — "Honest data model" (4 weeks)
   ├─ v37 events table + watch refactor (§3.1)
   ├─ v38 leases + fencing tokens (§3.2)
   ├─ Reduced-scope spec/status: generation+observed_generation columns
   │   on 3 hottest tables (§3.4 reduced variant)
   └─ Multi-process race harness skeleton + 4 of 12 scenarios (§3.8 fix 1)
   GATE: user "진행해" before v37/v38 land on main (Const III)

v22.1 — "TOCTOU & ownership" (3 weeks)
   ├─ v40 partial unique index (§3.5)
   ├─ Generation CAS + fencing on every write_status (§3.5)
   ├─ v41 owner refs + finalizers + GCReconciler (§3.6)
   └─ Multi-process scenarios 5–10 + fault injection F1/F2/F3 (§3.8)
   GATE: independent audit subagent confirms TOCTOU closed before push

v22.2 — "Scheduler upgrade" (3 weeks)
   ├─ v42 priority/affinity/topology columns (§3.7)
   ├─ Preemption module (§3.7 fix 1)
   ├─ Expression affinity + topology spread (§3.7 fix 2+3)
   ├─ Score plugin refactor (§3.7 fix 4)
   └─ Multi-process scenarios 11–12 + fault injection F4–F9 (§3.8)
   GATE: 4-company × 2-GPU × 2-zone scenario test green

v22.3 — "Reliability proof" (4 weeks)
   ├─ Property-based state machines × 4 invariants (§3.8 fix 3)
   ├─ 1h soak + 24h soak harness + CI wiring (§3.8 fix 4)
   ├─ Full v39 spec/status JSON split (deferred from v22.0 reduced variant)
   ├─ Road decision concrete: stay-single-host OR Road B WAL replication
   │   (§3.3 — defer until soak data is in hand)
   └─ wiki/35X v22 closure doc + frame v10
   GATE: 24h soak passes 3 consecutive runs before main merge
```

Total: **~14 weeks** of work spread across 4 ship gates.

#### Effort rollup by category

| Category | §  | Effort | What ships |
|----------|----|--------|------------|
| Watch monotonic revision | 3.1 | 1.5 wk | v37 events table + KindSource refactor |
| Leader lease + fencing | 3.2 | 1 wk | v38 leases table + lease manager |
| API server consensus | 3.3 | deferred | Road B decision pending soak data |
| Spec/status split (reduced) | 3.4 | 1 wk | generation columns on 3 hot tables |
| Spec/status split (full) | 3.4 | 2 wk | spec_json/status_json column wiring |
| CEO TOCTOU + generation CAS | 3.5 | 1 wk | v40 unique index + write_status helper |
| Finalizers + owner refs + GC | 3.6 | 2.5 wk | v41 schema + GCReconciler + 5 finalizers |
| Preemption + affinity + spread | 3.7 | 3 wk | v42 schema + preempt/affinity/topology modules |
| Multi-proc + fault + property + soak | 3.8 | 4 wk | tests/multi_proc + tests/fault_injection + tests/property + tests/soak |
| Docs + audits + closure | — | 1 wk | per-release closure docs + frame v10 |

Sum: **17 person-weeks** if done strictly serially. With parallel
work on independent migrations (e.g., v41 and v42 share no tables),
calendar time compresses to ~14 weeks. **One engineer is the bottleneck**
for the test fortification — it can't parallelize cleanly across
disciplines.

#### Risk register

| Risk | Probability | Mitigation |
|------|-------------|------------|
| v40 unique index migration finds existing duplicate rows in production | Medium | Pre-flight check; manual dedupe; rollback plan documented |
| Finalizer deadlock if controller crashes mid-cleanup | Medium | `POST /admin/.../force-finalize` escape valve (§3.6) |
| Lease + fencing breaks single-process unit tests that bypass lease | Low | Lease module exports `with_static_lease(fencing_token=0)` for tests |
| Soak test reveals memory leak we can't reproduce in unit tests | High | This is the *point* of soak; budget 1 week for whichever leak shows |
| Road decision (§3.3) gets postponed forever | High | Force a v22.3 decision deadline; "stay single-host" is a valid answer |
| 14-week timeline slips into Q3 | Medium-high | Each v22.x is independently shippable; v22.0 + v22.1 alone close 80% of the critique |

#### What this is NOT

This plan does **not** turn musu into K8s. After 14 weeks musu is
still:

- single-binary, single-SQLite, single-host (unless Road B is taken)
- no namespaces, no RBAC, no admission webhooks
- no kubectl-equivalent CLI
- no etcd, no kine, no real distributed consensus

What it **does** do: bring the parts musu does have — reconcilers,
watch, scheduler, controllers — to actual K8s-level correctness on
the single-host substrate. The honest tagline becomes
**"K8s-correct controller pattern on a single-host SQLite substrate,"**
not "K8s on SQLite". §3.3 + the Road A/B/C fork in §2 is where the
larger architectural question gets answered, deliberately not in this
phase.

#### Constitution alignment

- **Const III** (schema migration gate): every v37–v42 migration
  requires explicit user "진행해" before landing on main. Pre-flight
  checks documented per migration above.
- **Const VI** (investigate-first): the property-based and soak
  tests in §3.8 *are* the investigation. Plan finalization for §3.3
  waits on real data from v22.3 soak.
- **Const VII** (push gate): every v22.x cuts a feature branch
  (`v22/0-honest-data-model` etc.), commits there, requires
  independent audit subagent pass, then explicit user "진행해" before
  push to main.
- **P2P / thin relay invariant**: nothing in §3.1–3.8 touches the
  musu.pro relay model. All changes are inside musu-bridge/supervisor.
  No user data centralization implied.

#### Single-page summary (for the user)

If only one slide is read:

> **v21 ships a single-host controller-runtime study. v22 closes the
> 6 most-cited correctness gaps in ~14 weeks across 4 releases.
> v22.0+v22.1 alone (7 weeks) eliminate the TOCTOU and watch-loss
> bugs that block production. v22.3 (the soak phase) decides whether
> we ever go multi-node — the data tells us, not the design.**

---

## 5. Per-iteration summary (what /loop produced)

| Iter | Sections | Output |
|------|----------|--------|
| 1 | 3.1, 3.2 | kine events table + DB-backed lease/fencing design |
| 2 | 3.3, 3.4 | Road B single-writer rec + spec/status v39 migration |
| 3 | 3.5, 3.6 | CEO TOCTOU 4-fix playbook + owner-ref/finalizer/GC |
| 4 | 3.7 | preemption + affinity expressions + topology spread + pluggable score |
| 5 | 3.8 | 12 multi-proc scenarios + 9 fault classes + property + soak |
| 6 | 3.9, this section | 6-migration sequence + 4-release plan + 17-wk rollup |

Total document: 9 design subsections, 6 schema migrations, 17 person-weeks
of work scoped, 4 ship gates, 1 honest verdict on the K8s-shape claim.

---

## 6. Fact-check addendum (iter 7, 2026-05-15)

The user pushed back that §3.1 and §3.2 were built on subagent
summaries, not primary sources. This section is the result of reading
canonical sources directly (kine source on GitHub, SQLite docs,
client-go/tools/leaderelection, Kleppmann 2016, controller-sharding
README). Findings are split into **verified**, **qualified**, and
**wrong** — the last two require updates to the design proper.

### 6.1 Verified claims (no change needed)

| # | Claim | Primary source | Evidence |
|---|-------|---------------|----------|
| V1 | kine uses a single table (`kine`) with a monotonic `id` column | `k3s-io/kine/pkg/drivers/generic/generic.go` | `INSERT INTO kine(...) RETURNING id`; `MAX(rkv.id)` |
| V2 | The kine row has `prev_revision`, `value`, `old_value` columns plus `name`, `created`, `deleted`, `create_revision`, `lease` | same | Quoted column lists in generic.go |
| V3 | kine watch returns `ErrCompacted` when client cursor is below the compaction floor | `k3s-io/kine/pkg/server/watch.go` | `w.Cancel(id, wr.CurrentRevision, wr.CompactRevision, ErrCompacted)` |
| V4 | kine has a documented compaction brittleness | kine issue #357, title: *"Kine skips compact intervals if compaction fails to complete"* | Quote: "if the compaction loop fails for any reason, the rows will be compacted and the compact-rev key will be updated, but the expected compact-rev key stored in memory won't be updated" |
| V5 | SQLite `INTEGER PRIMARY KEY AUTOINCREMENT` is monotonically increasing | sqlite.org/autoinc.html | Verbatim: "the automatically generated ROWIDs are guaranteed to be monotonically increasing" |
| V6 | K8s leader-election defaults: LeaseDuration=15s, RenewDeadline=10s, RetryPeriod=2s | client-go/tools/leaderelection/leaderelection.go doc-comments | All three explicitly named with "Core clients default this value to N seconds" |
| V7 | Constraint `LeaseDuration > RenewDeadline > RetryPeriod * JitterFactor` (JitterFactor=1.2) | same | Direct validation code in leaderelection.go |

Bottom line for §3.1/§3.2: **the kine pattern is real and the lease
TTL parameters are correct.** The architectural skeleton holds.

### 6.2 Qualified claims (clarification needed in-line)

#### Q1 — "kine watch is poll-based"

§3.1 says "one polling goroutine per process at ~200ms tick." This
**conflates two layers**:
- kine's **client-facing** `Watch()` API is an event channel
  (`wr.Events <- chan`). Push, not poll.
- kine's **SQL driver** internally polls the kine table on a tick to
  generate those events (typical interval is configurable; default
  poll-interval in kine is ~1s, not 200ms).

The proposed musu adaptation (200ms polling in `WatchDispatcher`) is
*similar in spirit* to kine's internal layer, but the framing in §3.1
should not claim it is "exactly how kine works." It is **how we'd port
kine's SQL polling to SQLite**, which is a different statement.

**Doc fix needed**: §3.1 watch fan-out paragraph should say "our
adaptation collapses kine's two-layer architecture into a single
polling loop because we don't expose an external watch RPC."

#### Q2 — "Fencing tokens are Kleppmann DDIA §8.4.3"

The 2016 Kleppmann blog post *"How to do distributed locking"*
popularized the term "fencing token" and is the most-cited modern
reference. But Kleppmann himself attributes the underlying technique
to **Gray & Cheriton 1989** ("Leases: An Efficient Fault-Tolerant
Mechanism for Distributed File Cache Consistency"), and ZooKeeper's
`zxid` is a concrete pre-2016 implementation.

**Doc fix needed**: §3.2 should cite "Kleppmann 2016 (popularizing
Gray & Cheriton 1989)" not just "Kleppmann DDIA §8.4.3." The
distinction matters only if anyone tries to argue against the
technique; the design itself is correct.

#### Q3 — "SQLite `update_hook` is cross-process invisible"

§3.1 rejected `update_hook` on the grounds that it "only fires for
mutations on the *same connection*." This is the **widely-held
operational understanding** and is true in practice (the C API
registers a function pointer on a `sqlite3*` connection struct;
process boundaries don't share it). However, the canonical
sqlite.org/c3ref/update_hook.html docs are **silent** on
cross-connection semantics — they only say the hook is registered
*with* a connection, not whether it fires *for* other connections.

**Doc fix needed**: §3.1 "rejected alternatives" should cite the
C-API mechanism ("registered as a function pointer on `sqlite3*`,
not in any shared structure") rather than the spec language, since
the spec itself doesn't say it.

### 6.3 Outright errors (design or doc correction required)

#### E1 — SQLite AUTOINCREMENT is **NOT gap-free**

§3.1 claims (line 124):
> **`AUTOINCREMENT` is monotonic and gap-free per the SQLite contract**

This is **wrong**. The SQLite docs explicitly state:
> *"'monotonically increasing' does not imply that the ROWID always
> increases by exactly one"*

Gaps occur in two documented cases:
1. **Constraint-violation rollback**: an INSERT that fails after the
   ROWID was assigned does not reuse that ROWID. The next successful
   INSERT skips ahead.
2. **Explicit ROWID assignment**: if an INSERT specifies a ROWID
   higher than the current MAX, future auto-assignments start above
   that.

**Impact on §3.1 design**:
- The `prev_rev` foreign-key chain (`UNIQUE INDEX idx_events_name_prev
  ON events(resource, name, prev_rev)`) **still works** because it
  references the actual revision of the prior event, not (prev_rev + 1).
  Gaps in the global revision sequence are fine.
- The **resumability claim** still holds — clients hold their
  `last_revision` and ask for `revision > last_revision`. Gaps don't
  break this; they just mean the next revision a client sees may be
  N+7 instead of N+1.
- The **monotonicity claim** still holds — revisions are strictly
  increasing.

**Doc fix needed**: §3.1 line 124 should read:
> **`AUTOINCREMENT` is monotonically increasing per the SQLite
> contract.** Gaps are allowed (constraint failures, explicit ROWID
> writes) but irrelevant because clients track the actual revision
> they saw, not (prev_revision + 1).

No code in the proposed design changes. Only the docstring is wrong.

#### E2 — `timebertt/kubernetes-controller-sharding` is **NOT a hash-ring static partition**

§3.2 claims (line 273):
> Static partition for parallel controllers ... This pattern is
> exactly what `timebertt/kubernetes-controller-sharding` describes.

This is **wrong on the mechanism**. timebertt's project uses:
> *"announce ring membership and shard health: maintain individual
> shard `Leases` instead of performing leader election on a single
> `Lease`"*

Each shard is its own K8s `Lease` object, and objects are dispatched
to a shard via a **label selector** (the sharder injects a
`shard=N` label on the object; each shard's controller watches
`labelSelector=shard=N`). This is **lease-per-shard + label
routing**, not hash(target_id) mod ring_size.

**Impact on §3.2 design**:
- The hash-ring approach proposed in §3.2 (`hash(target.id) MOD
  ring_size == my_index`) is **a different design** and still
  technically valid — but I cannot claim timebertt's project as its
  precedent. The actual precedent is older / more academic
  (Karger's consistent-hashing 1997, or simple modulo sharding which
  doesn't need a precedent at all).
- The benefit of lease-per-shard (timebertt's actual approach) over
  hash-modulo is **smoother rebalancing**: when a shard drops, only
  that shard's objects re-dispatch, not the entire ring. Worth
  considering as a v22.x sub-option.

**Doc fix needed**: §3.2 line 270-273 should read:
> Static partition for parallel controllers ... Two valid
> implementations:
> (a) **hash(target.id) MOD ring_size** — simple, ring change
>     re-shuffles all keys
> (b) **lease-per-shard + label routing** — timebertt's pattern;
>     ring change only re-shuffles dropped shard's keys
> Pick (a) for simplicity in v22.1; consider (b) if rebalance churn
> becomes operational pain.

This is a **design correction**, not just a citation fix — the
options table for MachineReconciler/QALoopReconciler may want
updating once (a) vs (b) is decided.

### 6.4 Confidence delta

Before fact-check: §3.1 + §3.2 were rated "designed from subagent
summary, not first-party reading; sound-shaped but unverified."

After fact-check: §3.1 + §3.2 are **80% verified, 15% qualified, 5%
materially wrong**. The 5% wrong (gap-freeness; controller-sharding
precedent) doesn't break the design — both fixes are docstring or
sub-option changes, not structural rewrites.

**Net**: the proposed schema migrations v37 (events table) and v38
(leases table) are safe to implement as drafted. The doc claims
around them need three small edits. No section requires being
rewritten.

### 6.5 What this exercise revealed about the methodology

The two errors (E1 + E2) share a common shape: **I cited a primary
source from memory or summary, and the actual primary source
disagrees on a specific detail.**

- E1: the *general spirit* of AUTOINCREMENT (monotonic, useful for
  ordering) is right; the *specific clause* (gap-free) is wrong.
- E2: the *general spirit* of timebertt's project (shard work across
  controllers) is right; the *specific mechanism* (hash-ring) is
  wrong.

This is exactly the failure mode that a fact-check pass catches and
that subagent-summary-only work does not. **Iter 7 is now part of the
v22 process template**: every design subsection (§3.1–§3.8) that
cites a primary source must have a fact-check addendum entry before
the code work begins.

Three §3.x sections still need this pass (since iter 7 only covered
§3.1 + §3.2 per the user's specific concern):

- §3.3 (write-forwarding via 307 redirect) — claimed pattern; need
  to verify against kine/etcd proxy or Postgres write-forwarder
  precedent.
- §3.6 (finalizer + GC controller) — claimed K8s behavior; need to
  verify against `kube-controller-manager/garbagecollector` source.
- §3.7 (preemption + topology spread) — claimed K8s scheduler
  behavior; need to verify against `kube-scheduler/framework/plugins`.

These three are queued for a follow-up fact-check pass (iter 8) but
are **not blocking v22.0** because v22.0 only touches §3.1 + §3.2
(which are now verified).

---

## 4. Independent critique full text

The system-architect subagent's critique (verbatim, for the record):

(appended at end on final iteration)

---

## 7. Qualitative self-assessment of this document (2026-05-15)

The user asked: "정성 평가 보고해봐" — what is my own honest grade
of the v21.D Windows isolation work and this v22 gap analysis? The
answer is recorded here so future contributors don't read the
sections above as if they were graded A+.

### 7.1 v21.D Windows isolation — grade B+

**What worked**:
- End-to-end actually runs. The cmd.exe smoke test exits 0 inside an
  AppContainer + Job Object sandbox. Not "compiles", not "type-checks":
  real Win32 calls completing. 27/27 tests pass against real OS APIs
  (no mocks).
- RAII drop order is intentional and documented. handles → job
  (KILL_ON_JOB_CLOSE) → ACLs → profile. Profile is last because the
  SID embedded in ACL revocations must still be valid during step 4.
- Trait/API mismatch was handled honestly. `std::process::Child::from_raw_handle`
  is unstable on stable Rust, so the `Isolation::spawn` trait returns
  `Unsupported`; supervisors call `spawn_sandboxed` directly for the
  richer `SandboxedProcess`. Documented in lib.rs and in
  `V21D_WINDOWS_IMPL_2026_05_15.md` instead of hidden.

**What's missing**:
- **Network broker is unimplemented**. `IsolationProfile.allow_net`
  has a design (Named Pipe broker) but no code. Current state: outbound
  TCP is denied entirely (no `internetClient` capability). Adequate for
  the most paranoid agents but blocks agents that need network at all.
- **stdin/stdout/stderr capture not wired**. `STARTF_USESTDHANDLES`
  flag isn't set. cmd.exe smoke test passes because cmd.exe inherits
  the parent's console — production agents that need their output
  redirected won't work yet.
- **Linux/macOS crates remain scaffold**. Tasks #296 and #298 are
  still `in_progress`. Cross-platform isolation is half-done.

Honest summary: **"Working sandbox on Windows: 1, isolation problem
solved: 0."**

### 7.2 v22 K8s gap analysis — grade oscillates between A- and D

The grade depends entirely on which rubric is applied.

#### Rubric A — "Is the document honest?" → A-

- The 3.5/10 score from the system-architect subagent is in §1 of this
  document, not buried. v21 closure docs called it "shipped
  successfully" without flagging that an independent reviewer scored
  the work 3.5/10. v22 corrects this by putting the score first.
- The Three Roads (A: rename / B: single-writer + replicas / C: real
  distributed) gives a concrete recommendation (Road B) and a concrete
  rejection (Road C inappropriate for "user runs musu on her laptop").
  Not "you decide."
- The honest tagline is baked into the document: **"K8s-correct
  controller pattern on single-host SQLite," not "K8s on SQLite."**
  This is the type of sentence a marketing document cannot write.
- Cost estimates are decomposed (e.g. "Schema migration v38 + backfill
  tests: 2 days, GCReconciler + tests: 2 days, finalizer wiring per
  controller × 5 = 5 days") not handwaved as "~2 weeks."

#### Rubric B — "Is this a verified design?" → D

- **Not one line of the design has compiled or been unit-tested** in
  the musu codebase. 1747 lines of SQL/Python snippets, all paper.
- **§3.3 defers the central decision**. The doc recommends Road B but
  §3.9 then says "Road B decision waits on v22.3 soak data." This
  honors Constitution VI (investigate-first) but leaves the
  architectural fork open through the entire 14-week plan.
- **17 person-weeks estimate has weak provenance**. Not calibrated
  against how many days v21.A→F actually took. Intuitive guess.
- **§3.8 is the largest section and possibly the least verifiable**.
  12 multi-process scenarios, 9 fault classes, 4 hypothesis state
  machines, soak harness — all proposed, none run against musu.
  Assumed-to-translate from K8s without evidence.
- **Iter 1's kine + lease design came from a deep-research-agent
  summary**, not primary-source reading. The user caught this; §6
  (fact-check addendum) is the corrective. Even after §6, two outright
  errors and three qualifications were found in §3.1 + §3.2 alone.
  §3.3 / §3.6 / §3.7 have not had this pass yet.

### 7.3 /loop process — grade B

- ✅ Six iterations each shipped one or two clean deliverables.
- ✅ ScheduleWakeup stayed inside the 5-minute prompt-cache window
  (240–270s) so context was preserved across iterations.
- ✅ Iter 7 (this fact-check) was added in response to user pushback,
  not auto-fired. The loop terminated correctly after iter 6 by
  omitting ScheduleWakeup.

- ❌ **The /loop input ("Windows isolation") didn't match the
  actual work (v22 gap analysis)**. The verbatim-reentry semantic of
  /loop weakened — context was preserved through the user's
  out-of-band redirect, not through the input itself.
- ❌ **Each iteration was *writing*, not *verifying***. Writing
  markdown does not need a /loop the way running tests across a
  build matrix does. The automation gain was small.

### 7.4 Comparison: v21 closure docs vs this document

The v21 closure docs are written in **self-congratulatory mode**:
"shipped, tests pass, ready for production." They do not list what
the work failed to deliver.

This v22 gap analysis is the **same person grading the same work
externally** and finding 3.5/10. The v22 voice is more honest.

The implication: **v21 closure docs may have called the work
"shipped" too early**. If the v21 grade is really 3.5/10, the v21.A-F
closure docs are candidates for retrospective revision — at minimum
adding a "what this work does NOT do" section to each.

### 7.5 One-line summary

> Windows isolation = a small working thing.
> v22 gap analysis = an honest large unverified thing.
> Together: **1 thing shippable today, 14 weeks of work needed
> before the gap analysis's claims become true.**

### 7.6 What the user should not believe

Do not read §3.1–§3.8 as if they were verified designs. They are
plausible designs in the style of K8s. §6 (fact-check addendum)
caught two outright errors in §3.1+§3.2 alone — and §3.3, §3.6, §3.7
have not been fact-checked at this level.

The simple structural fixes (§3.5 partial unique index, §3.4
generation columns) are very likely correct because they are
mechanical and easy to verify. The larger fixes (§3.7 preemption,
§3.6 finalizer lifecycle, §3.8 soak harness) are "looks plausible"
until tried against musu's actual workload. The 17 person-weeks
estimate has a real chance of being off by 50% in either direction —
calibration data does not exist until v22.0 (7 weeks) is actually
implemented.

### 7.7 Recommended next step (not a /loop, a human decision)

Implement v22.0 + v22.1 (§3.1 + §3.2 + §3.5 + §3.6 + a minimal slice
of §3.8) on a feature branch. That covers 7 of the projected 14
weeks. Use the actual elapsed time as calibration data. **Decide
§3.3 (Road A vs Road B vs Road C) only after** that data exists, not
before. §3.7 + §3.8 (the heaviest sections) come after the §3.3
decision is grounded in measurement.

This puts Constitution VI (investigate-first) where it belongs: at
the architectural fork, with data, not at design time with
speculation.
