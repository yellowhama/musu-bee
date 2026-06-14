import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function callbackDependencyList(text: string, callbackName: string) {
  const declaration = new RegExp(`const\\s+${callbackName}\\s*=\\s*useCallback\\(`);
  const match = declaration.exec(text);
  assert.ok(match, `${callbackName} useCallback declaration must exist`);

  const closePattern = /\n\s*\[([^\]]*)\],\s*\n\s*\);/g;
  closePattern.lastIndex = match.index;
  const closeMatch = closePattern.exec(text);
  assert.ok(closeMatch, `${callbackName} useCallback dependency list must exist`);

  return closeMatch[1]
    .split(",")
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

test("chat agent route callback sends the current adapter selection", () => {
  const text = source("src/lib/useChat.ts");
  const callbackStart = text.indexOf("const sendViaAgentRoute = useCallback(");
  assert.notEqual(callbackStart, -1);

  const callbackBody = text.slice(callbackStart, text.indexOf("// ── Command handlers", callbackStart));
  assert.match(callbackBody, /adapter_override:\s*selectedAdapter/);

  const dependencies = callbackDependencyList(text, "sendViaAgentRoute");
  assert.ok(
    dependencies.includes("selectedAdapter"),
    "sendViaAgentRoute must depend on selectedAdapter or /model changes can send stale adapter_override",
  );
});

test("chat sendMessage delegates through the current agent-route callback", () => {
  const text = source("src/lib/useChat.ts");
  const callbackStart = text.indexOf("const sendMessage = useCallback(");
  assert.notEqual(callbackStart, -1);

  const callbackBody = text.slice(callbackStart, text.indexOf("// ── Plan gate", callbackStart));
  assert.match(callbackBody, /sendViaAgentRoute\(text,\s*node,\s*companyCtx\)/);

  const dependencies = callbackDependencyList(text, "sendMessage");
  assert.ok(
    dependencies.includes("sendViaAgentRoute"),
    "sendMessage must depend on sendViaAgentRoute so node/adapter routing changes are not stale",
  );
});

test("chat active-node SSE reconnect uses the current connect callback", () => {
  const text = source("src/lib/useChat.ts");
  const effectStart = text.indexOf("// Reconnect SSE when activeNode changes");
  assert.notEqual(effectStart, -1);

  const effectBody = text.slice(effectStart, text.indexOf("// ── musu-bridge agent route", effectStart));
  assert.doesNotMatch(effectBody, /eslint-disable-next-line react-hooks\/exhaustive-deps/);
  assert.match(effectBody, /connect\(\)/);
  assert.match(
    effectBody,
    /\[activeNode,\s*clearReconnectTimer,\s*closeEventSource,\s*connect,\s*isAgentChannel,\s*resetReconnectState\]/,
  );
});

test("chat task_update events are scoped to the current channel when channel is present", () => {
  const text = source("src/lib/useChat.ts");
  const listenerStart = text.indexOf('es.addEventListener("task_update"');
  assert.notEqual(listenerStart, -1);

  const listenerBody = text.slice(listenerStart, text.indexOf("});", listenerStart));
  assert.match(listenerBody, /channel\?:\s*string\s*\|\s*null/);
  assert.match(listenerBody, /const eventChannel = data\.channel\?\.trim\(\)/);
  assert.match(listenerBody, /if \(eventChannel && eventChannel !== channel\) return/);
  assert.ok(
    listenerBody.indexOf("if (eventChannel && eventChannel !== channel) return") <
      listenerBody.indexOf('if (data.status === "running" || data.status === "pending")'),
    "foreign-channel events must be ignored before typing state changes",
  );
});

test("remote callback SSE producer preserves source task channel context", () => {
  const text = source("../musu-rs/src/bridge/handlers/forward.rs");
  const callbackStart = text.indexOf("pub async fn receive_callback(");
  assert.notEqual(callbackStart, -1);

  const callbackBody = text.slice(callbackStart, text.indexOf("Ok(StatusCode::OK)", callbackStart));
  assert.match(text, /fn task_callback_status_is_terminal\(status: &str\) -> bool/);
  assert.match(text, /matches!\(status,\s*"done"\s*\|\s*"failed"\s*\|\s*"cancelled"\)/);
  assert.match(callbackBody, /if !task_callback_status_is_terminal\(&cb\.status\)/);
  assert.match(callbackBody, /MusuError::BadRequest\(\s*"callback status must be done, failed, or cancelled"\.into\(\),\s*\)/);
  assert.match(callbackBody, /let update_result = sqlx::query\(/);
  assert.match(callbackBody, /if update_result\.rows_affected\(\) == 0/);
  assert.match(callbackBody, /MusuError::NotFound\(format!\(\s*"source task \{\} not found"/);
  assert.match(callbackBody, /SELECT company_id, channel, sender_id FROM route_executions WHERE task_id = \?/);
  assert.match(callbackBody, /let callback_channel = callback_context/);
  assert.match(callbackBody, /TaskUpdate \{[\s\S]*channel: callback_channel\.as_deref\(\)/);
  assert.match(callbackBody, /\.with_context\(\s*callback_company_id\.as_deref\(\),\s*callback_channel\.as_deref\(\),\s*callback_sender_id\.as_deref\(\),\s*\)/);
});
