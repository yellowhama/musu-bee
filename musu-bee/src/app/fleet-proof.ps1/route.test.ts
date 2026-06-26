import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_RELEASE_VERSION } from "@/lib/publicRelease";
import { GET } from "./route";

const PACKAGE_VERSION = PUBLIC_RELEASE_VERSION.replace("-rc.", ".");

test("/fleet-proof.ps1 serves the remote node proof collector", async () => {
  const res = await GET();
  const body = await res.text();

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.match(body, /musu\.fleet_node_proof\.v1/);
  assert.match(body, /musu\.fleet_node_public_url_repair\.v1/);
  assert.match(body, /ExpectedNodeName/);
  assert.match(body, /ExpectedDirectPeerName/);
  assert.match(body, /RequireBrainToken/);
  assert.match(body, /https:\/\/musu\.pro\/install\.ps1/);
  assert.match(body, /https:\/\/musu\.pro\/repair-fleet\.ps1/);
  assert.match(
    body,
    new RegExp(`ExpectedPackageVersion\\s*=\\s*"${PACKAGE_VERSION}"`),
  );
});
