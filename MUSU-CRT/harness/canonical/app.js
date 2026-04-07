import {
  FixtureRemoteSessionAdapter,
  RemoteSessionController,
} from "./remote_session_runtime.js";
import { buildRemoteOperatorView } from "./lane2_remote_read_runtime.mjs";

const signalingFixturePath = "../../mock/signaling_fixture.json";
const streamFixturePath = "../../mock/stream_lifecycle_fixture.json";
const remoteFixturePath = "../../mock/remote_session_fixture.json";
const lane2ProofFixturePath = "../../mock/lane2_live_proof_fixture.json";

init().catch((error) => console.error(error));

async function init() {
  const [signalingFixture, streamFixture, remoteFixture, lane2ProofFixture] = await Promise.all([
    loadJson(signalingFixturePath),
    loadJson(streamFixturePath),
    loadJson(remoteFixturePath),
    loadJson(lane2ProofFixturePath),
  ]);

  const signalingCoordinator = new SignalingSessionCoordinator(
    new FixtureSignalingAdapter(signalingFixture),
  );
  const localController = new FixtureLocalStreamController(streamFixture);
  const remoteController = new RemoteSessionController(
    new FixtureRemoteSessionAdapter(remoteFixture),
  );

  const signalingState = await signalingCoordinator.startOffer({
    webrtcSessionId: signalingFixture.session_id,
    windowId: signalingFixture.window_id,
    offerSdp: signalingFixture.offer.sdp_preview,
    clientIceCandidates: signalingFixture.offer.client_ice_candidates,
  });

  await localController.start(streamFixture.settings);
  const streamState = await localController.pullFrame(streamFixture.window_id, performance.now());
  const remoteAttachState = await remoteController.attach(remoteFixture.webrtc_session_id);
  const remoteCloseState = await remoteController.close(remoteFixture.webrtc_session_id);
  const lane2RemoteState = buildRemoteOperatorView(lane2ProofFixture);

  const summary = {
    harnessStatus: signalingState.status === "connected" ? "ready" : "degraded",
    sessionId: signalingState.sessionId,
    offerStep: signalingState.status,
    frameStatus: streamState.frame.status,
    frameSize: `${streamState.frame.width}x${streamState.frame.height}`,
    remoteStatus: remoteAttachState.status,
    reconnects: streamState.metrics.reconnects,
    selectedService: lane2RemoteState.selectedService,
    projectedRoutes: lane2RemoteState.projectedRoutes,
    trustState: lane2RemoteState.trustState,
    freshnessState: lane2RemoteState.freshnessState,
    remoteSessionHealth: lane2RemoteState.remoteSessionHealth,
    attachState: lane2RemoteState.attachState,
  };

  document.getElementById("summary").innerHTML = renderSummary(summary);
  document.getElementById("signaling-state").textContent = JSON.stringify(signalingState, null, 2);
  document.getElementById("stream-state").textContent = JSON.stringify(streamState.frame, null, 2);
  document.getElementById("remote-state").textContent = JSON.stringify(
    {
      peer: remoteFixture.remote_peer,
      attach: remoteAttachState,
      close: remoteCloseState,
    },
    null,
    2,
  );
  document.getElementById("lane2-remote-state").textContent = JSON.stringify(
    lane2RemoteState,
    null,
    2,
  );
  document.getElementById("metrics").innerHTML = renderMetrics(streamState.metrics);
  document.getElementById("timeline").innerHTML = streamFixture.timeline.map((item) => `
    <div class="event">
      <div><strong>${item.label}</strong><div>${item.step}</div></div>
      <span class="badge ${item.status}">${item.status}</span>
    </div>
  `).join("");

  const readyMarker = document.querySelector("[data-testid='crt-canonical-ready']");
  readyMarker.textContent = summary.harnessStatus;
  readyMarker.dataset.status = summary.harnessStatus;

  window.__MUSU_CRT_CANONICAL_SMOKE__ = {
    summary,
    signalingState,
    streamState,
    remoteAttachState,
    remoteCloseState,
    lane2RemoteState,
  };
}

class FixtureSignalingAdapter {
  constructor(fixture) {
    this.fixture = fixture;
  }

  async offer(input) {
    return {
      sessionId: input.webrtcSessionId,
      answer: {
        answerSdp: this.fixture.answer.answer_sdp,
        hostIceCandidates: this.fixture.answer.host_ice_candidates,
      }
    };
  }
}

class SignalingSessionCoordinator {
  constructor(adapter) {
    this.adapter = adapter;
  }

  async startOffer(input) {
    try {
      const result = await this.adapter.offer(input);
      return {
        sessionId: result.sessionId,
        status: "connected",
        answer: result.answer,
      };
    } catch (error) {
      return {
        sessionId: input.webrtcSessionId,
        status: "error",
        error: String(error),
      };
    }
  }
}

class FixtureLocalStreamController {
  constructor(fixture) {
    this.fixture = fixture;
  }

  async start(_settings) {
    return;
  }

  async pullFrame(_windowId, _nowMs) {
    return {
      frame: this.fixture.last_frame,
      metrics: {
        fps: this.fixture.metrics.fps,
        frameSizeKB: this.fixture.metrics.frame_kb,
        totalMB: this.fixture.metrics.total_mb,
        reconnects: this.fixture.metrics.reconnects,
      },
    };
  }
}

function renderMetrics(metrics) {
  const rows = [
    ["FPS", metrics.fps],
    ["Frame KB", metrics.frameSizeKB],
    ["Total MB", metrics.totalMB],
    ["Reconnects", metrics.reconnects],
  ];
  return rows.map(([label, value]) => `
    <div class="metric">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>
  `).join("");
}

function renderSummary(summary) {
  const rows = [
    ["Harness", summary.harnessStatus],
    ["Session", summary.sessionId],
    ["Offer", summary.offerStep],
    ["Frame", summary.frameStatus],
    ["Size", summary.frameSize],
    ["Remote", summary.remoteStatus],
    ["Service", summary.selectedService],
    ["Projected", summary.projectedRoutes],
    ["Trust", summary.trustState],
    ["Freshness", summary.freshnessState],
    ["Health", summary.remoteSessionHealth],
    ["Attach", summary.attachState],
    ["Reconnects", summary.reconnects],
  ];
  return rows.map(([label, value]) => `
    <div class="summary-item">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>
  `).join("");
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}
