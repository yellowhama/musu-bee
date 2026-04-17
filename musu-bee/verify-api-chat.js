
const MUSU_PORT_URL = "http://localhost:1355";
const MUSU_LLM_URL = "http://127.0.0.1:18081";

async function fetchWithTimeout(input, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function tryMusuPort(message) {
  console.log(`Trying musu-port at ${MUSU_PORT_URL}...`);
  try {
    const res = await fetchWithTimeout(`${MUSU_PORT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }, 5000); 
    console.log(`musu-port ok: ${res.ok}, status: ${res.status}`);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.log(`musu-port failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function tryLlmFallback(message) {
  console.log(`Trying LLM fallback at ${MUSU_LLM_URL}...`);
  try {
    const res = await fetchWithTimeout(`${MUSU_LLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen",
        messages: [{ role: "user", content: message }],
      }),
    }, 10000);
    const data = await res.json();
    console.log(`LLM fallback ok: ${res.ok}, data received.`);
    return { ok: res.ok, data };
  } catch (err) {
    console.log(`LLM fallback failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function main() {
  const msg = "ping";
  const portRes = await tryMusuPort(msg);
  if (!portRes.ok) {
    const llmRes = await tryLlmFallback(msg);
    if (llmRes.ok) {
      console.log("VERIFICATION SUCCESS: Fallback worked.");
    } else {
      console.log("VERIFICATION FAILED: Both backends failed.");
    }
  } else {
    console.log("VERIFICATION: Primary worked.");
  }
}

main();
