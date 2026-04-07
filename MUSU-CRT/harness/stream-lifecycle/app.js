const fixturePath = "../../mock/stream_lifecycle_fixture.json";

init().catch((error) => console.error(error));

async function init() {
  const data = await loadJson(fixturePath);
  document.getElementById("timeline").innerHTML = data.timeline.map((item) => `
    <div class="event">
      <div><strong>${item.label}</strong><div>${item.step}</div></div>
      <span class="badge ${item.status}">${item.status}</span>
    </div>
  `).join("");
  document.getElementById("metrics").innerHTML = `
    <div class="card"><strong>FPS</strong><div>${data.metrics.fps}</div></div>
    <div class="card"><strong>Frame KB</strong><div>${data.metrics.frame_kb}</div></div>
    <div class="card"><strong>Total MB</strong><div>${data.metrics.total_mb}</div></div>
    <div class="card"><strong>Reconnects</strong><div>${data.metrics.reconnects}</div></div>
  `;
  document.getElementById("frame-view").textContent = JSON.stringify(data.last_frame, null, 2);
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}
