const fixturePath = "../../mock/signaling_fixture.json";

init().catch((error) => console.error(error));

async function init() {
  const data = await loadJson(fixturePath);
  document.getElementById("session-card").innerHTML = `
    <div class="meta">
      <div><strong>session</strong> ${data.session_id}</div>
      <div><strong>window</strong> ${data.window_id}</div>
      <div><span class="chip">webrtc_offer</span> <span class="chip">webrtc_add_ice</span> <span class="chip">webrtc_close</span></div>
    </div>
  `;
  document.getElementById("offer-view").textContent = JSON.stringify(data.offer, null, 2);
  document.getElementById("answer-view").textContent = JSON.stringify(data.answer, null, 2);
  document.getElementById("ice-list").innerHTML = [
    ...data.offer.client_ice_candidates.map((x) => `<li><strong>client</strong> ${x}</li>`),
    ...data.answer.host_ice_candidates.map((x) => `<li><strong>host</strong> ${x}</li>`),
    `<li><strong>close</strong> ${data.close_reason}</li>`,
  ].join("");
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}
