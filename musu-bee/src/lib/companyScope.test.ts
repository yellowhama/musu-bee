import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUserKeyFromClientContext,
  deriveWorkspaceIdFromClientContext,
  resolveCompanyScopeFromClientContext,
} from "./companyScope";

test("deriveWorkspaceIdFromClientContext prefers explicit workspace hint", () => {
  assert.equal(
    deriveWorkspaceIdFromClientContext({
      workspaceHint: "Team Alpha",
      pathname: "/app/workspaces/ignored",
      userEmail: "owner@example.com",
    }),
    "team-alpha"
  );
});

test("deriveWorkspaceIdFromClientContext falls back to route then email", () => {
  assert.equal(
    deriveWorkspaceIdFromClientContext({
      pathname: "/app/workspaces/MUSU-Core",
    }),
    "musu-core"
  );

  assert.equal(
    deriveWorkspaceIdFromClientContext({
      pathname: "/app",
      userEmail: "owner@example.com",
    }),
    "owner-example-com"
  );
});

test("resolveCompanyScopeFromClientContext derives both workspace and user keys", () => {
  const scope = resolveCompanyScopeFromClientContext({
    workspaceHint: "Studio Ops",
    userEmail: "founder@musu.pro",
    userId: "user-123",
  });

  assert.equal(scope.workspaceId, "studio-ops");
  assert.equal(scope.userKey, "user-123");
  assert.equal(scope.scopeKey, "studio-ops__user-123");
  assert.equal(
    deriveUserKeyFromClientContext({ userEmail: "founder@musu.pro" }),
    "founder-musu.pro"
  );
});
