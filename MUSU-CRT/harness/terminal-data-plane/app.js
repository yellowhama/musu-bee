const fixturePath = "../../mock/terminal_data_plane_fixture.json";

init().catch((error) => console.error(error));

async function init() {
  const data = await loadJson(fixturePath);
  document.getElementById("mapping-view").textContent = JSON.stringify({
    webrtc_session_id: data.webrtc_session_id,
    terminal_session_id: data.terminal_session_id,
    mapping: data.mapping
  }, null, 2);
  document.getElementById("incoming-list").innerHTML = data.incoming_events.map((item) => `
    <li><strong>${item.kind}</strong> → ${item.bridge_step}<br />${item.payload_preview} <em>(${item.status})</em></li>
  `).join("");
  document.getElementById("outgoing-list").innerHTML = data.outgoing_events.map((item) => `
    <li><strong>${item.kind}</strong><br />${item.payload_preview} <em>(${item.status})</em></li>
  `).join("");
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}
