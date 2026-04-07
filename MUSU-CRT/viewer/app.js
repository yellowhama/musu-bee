const fixturePath = "../mock/screen_tab_fixture.json";

const state = {
  groupBy: "device",
  data: null,
  focusedId: null,
};

init().catch((error) => {
  document.getElementById("title").textContent = "MUSU-CRT failed";
  console.error(error);
});

async function init() {
  state.data = await loadJson(fixturePath);
  state.focusedId = state.data.focused.window_id;
  document.getElementById("title").textContent = state.data.title;
  bindControls();
  render();
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}

function bindControls() {
  const switchHost = document.getElementById("group-switch");
  ["device", "project", "company"].forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `switch-button${state.groupBy === mode ? " active" : ""}`;
    button.textContent = mode;
    button.addEventListener("click", () => {
      state.groupBy = mode;
      render();
    });
    switchHost.appendChild(button);
  });

  document.getElementById("refresh-button").addEventListener("click", render);
}

function render() {
  renderGroupSwitch();
  renderSections();
  renderFocus();
}

function renderGroupSwitch() {
  const buttons = document.querySelectorAll(".switch-button");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.textContent === state.groupBy);
  });
}

function renderSections() {
  const host = document.getElementById("group-sections");
  host.innerHTML = "";
  const groups = state.data.groups[state.groupBy] ?? [];
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "section-card";
    const windows = group.windows.map((windowInfo) => {
      const isActive = windowInfo.window_id === state.focusedId;
      return `
        <button class="thumb-card${isActive ? " active" : ""}" data-window-id="${windowInfo.window_id}">
          <div class="thumb-preview preview-${windowInfo.preview}"></div>
          <div class="thumb-meta">
            <div>
              <div class="thumb-title">${windowInfo.title}</div>
              <div class="thumb-subtitle">${windowInfo.subtitle}</div>
            </div>
            <span class="quality ${windowInfo.quality}">${windowInfo.quality}</span>
          </div>
        </button>
      `;
    }).join("");

    section.innerHTML = `
      <div class="section-header">
        <div>
          <h3>${group.label}</h3>
          <p class="muted">${group.meta}</p>
        </div>
        <span class="quality">${group.kind}</span>
      </div>
      <div class="window-row">${windows}</div>
    `;
    host.appendChild(section);
  });

  host.querySelectorAll("[data-window-id]").forEach((node) => {
    node.addEventListener("click", () => {
      state.focusedId = Number(node.getAttribute("data-window-id"));
      render();
    });
  });
}

function renderFocus() {
  const focus = findFocused();
  document.getElementById("focus-subtitle").textContent = `${focus.device || focus.subtitle || ""} · ${focus.project || state.groupBy}`;
  document.getElementById("focus-preview").className = `stage-preview preview-${focus.preview}`;
  document.getElementById("metric-fps").textContent = `FPS ${state.data.focused.metrics.fps}`;
  document.getElementById("metric-frame").textContent = `Frame ${state.data.focused.metrics.frame_kb} KB`;
  document.getElementById("metric-total").textContent = `Total ${state.data.focused.metrics.total_mb} MB`;
  setStatusPill("offer-pill", "offer", state.data.focused.webrtc.offer);
  setStatusPill("ice-pill", "add_ice", state.data.focused.webrtc.add_ice);
  setStatusPill("close-pill", "close", state.data.focused.webrtc.close);

  document.getElementById("focus-meta").innerHTML = `
    <article class="focus-card">
      <p class="eyebrow">Window</p>
      <h3>${focus.title}</h3>
      <p class="muted">${focus.subtitle ?? ""}</p>
    </article>
    <article class="focus-card">
      <p class="eyebrow">Screen Tab Repro Notes</p>
      <p class="muted">This is a read-only reproduction of the original screen tab shell: grouping, thumbnail gallery, and focused stream panel. Actual WebRTC/session wiring is intentionally excluded from this slice.</p>
    </article>
  `;
}

function findFocused() {
  for (const key of Object.keys(state.data.groups)) {
    for (const group of state.data.groups[key]) {
      const found = group.windows.find((windowInfo) => windowInfo.window_id === state.focusedId);
      if (found) {
        return {
          ...found,
          device: state.data.focused.device,
          project: state.data.focused.project,
        };
      }
    }
  }
  return state.data.groups.device[0].windows[0];
}

function setStatusPill(id, label, status) {
  const node = document.getElementById(id);
  node.className = `pill ${status}`;
  node.textContent = `${label} ${status}`;
}
