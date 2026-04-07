function normalizeRoute(route) {
  if (!route || typeof route !== "object") {
    return {
      alias: "unknown",
      collision_state: "missing-route",
      import_state: "unknown",
      available: false,
    };
  }
  return {
    alias: typeof route.alias === "string" ? route.alias : "unknown",
    collision_state:
      typeof route.collision_state === "string"
        ? route.collision_state
        : "missing-collision-state",
    import_state:
      typeof route.import_state === "string"
        ? route.import_state
        : "unknown",
    available: route.available === true,
  };
}

function deriveTrustState(route) {
  const collision = route.collision_state;
  if (collision === "peer-blocked" || collision === "peer-not-verified") {
    return "untrusted";
  }
  if (collision.includes("conflict")) {
    return "conflicted";
  }
  if (collision === "clean" && route.available) {
    return "trusted";
  }
  return "unknown";
}

function deriveTrustStateFromGate(trustGateReason) {
  if (trustGateReason === "peer-blocked" || trustGateReason === "peer-not-verified") {
    return "untrusted";
  }
  return "unknown";
}

function deriveFreshnessState(route) {
  const collision = route.collision_state;
  if (
    collision === "stale-timeout" ||
    collision.includes("withdrawn") ||
    route.import_state === "withdrawn"
  ) {
    return "stale";
  }
  if (route.available) {
    return "fresh";
  }
  return "degraded";
}

function deriveRemoteSessionHealth(
  trustGateReason,
  trustState,
  freshnessState,
  pairingSession,
  quicSession,
  projectedRoutes,
) {
  if (trustGateReason !== "peer-allowed") {
    return "blocked";
  }
  if (projectedRoutes === 0) {
    return "blocked";
  }
  if (freshnessState === "stale") {
    return "stale";
  }

  if (
    trustState === "trusted" &&
    freshnessState === "fresh" &&
    typeof pairingSession === "string" &&
    pairingSession.length > 0 &&
    typeof quicSession === "string" &&
    quicSession.length > 0 &&
    pairingSession === quicSession &&
    projectedRoutes > 0
  ) {
    return "healthy";
  }
  return "degraded";
}

function deriveAttachState(
  trustGateReason,
  projectedRoutes,
  remoteSessionHealth,
  transportEvidenceKind,
  sessionEvidenceMode,
  sessionRemoteAddrSource,
) {
  if (trustGateReason !== "peer-allowed" || projectedRoutes === 0 || remoteSessionHealth === "blocked") {
    return "blocked";
  }
  if (
    remoteSessionHealth === "healthy" &&
    transportEvidenceKind === "runtime-musu-port-http-route-plane-v1" &&
    sessionEvidenceMode === "runtime-peer-authenticated" &&
    sessionRemoteAddrSource === "quic-session-event.remote_addr"
  ) {
    return "attach-ready";
  }
  return "projection-only";
}

export function buildRemoteOperatorView(lane2Proof) {
  const selectedService =
    typeof lane2Proof?.selected_service === "string"
      ? lane2Proof.selected_service
      : "unknown";
  const projected = Array.isArray(lane2Proof?.snapshot?.projected_routes)
    ? lane2Proof.snapshot.projected_routes
    : [];
  const firstProjected = normalizeRoute(projected[0]);
  const projectedRoutes = projected.length;
  const trustGateReason =
    typeof lane2Proof?.trustGateReason === "string"
      ? lane2Proof.trustGateReason
      : typeof lane2Proof?.snapshot?.trust_gate_reason === "string"
        ? lane2Proof.snapshot.trust_gate_reason
        : "unknown";
  const importDecisionReason =
    typeof lane2Proof?.importDecisionReason === "string"
      ? lane2Proof.importDecisionReason
      : typeof lane2Proof?.snapshot?.import_decision_reason === "string"
        ? lane2Proof.snapshot.import_decision_reason
        : "unknown";
  const transportEvidenceKind =
    typeof lane2Proof?.transportEvidenceKind === "string"
      ? lane2Proof.transportEvidenceKind
      : typeof lane2Proof?.snapshot?.transport_evidence_kind === "string"
        ? lane2Proof.snapshot.transport_evidence_kind
        : "unknown";
  const sessionEvidenceMode =
    typeof lane2Proof?.sessionEvidenceMode === "string"
      ? lane2Proof.sessionEvidenceMode
      : typeof lane2Proof?.snapshot?.session_evidence_mode === "string"
        ? lane2Proof.snapshot.session_evidence_mode
        : "unknown";
  const sessionRemoteAddrSource =
    typeof lane2Proof?.sessionRemoteAddrSource === "string"
      ? lane2Proof.sessionRemoteAddrSource
      : typeof lane2Proof?.snapshot?.session_remote_addr_source === "string"
        ? lane2Proof.snapshot.session_remote_addr_source
        : "unknown";
  const pairingSession =
    typeof lane2Proof?.snapshot?.pairing_session_id === "string"
      ? lane2Proof.snapshot.pairing_session_id
      : "unknown";
  const quicSession =
    typeof lane2Proof?.snapshot?.quic_session?.session_id === "string"
      ? lane2Proof.snapshot.quic_session.session_id
      : "";
  const trustStateFromGate = deriveTrustStateFromGate(trustGateReason);
  const trustState =
    trustStateFromGate !== "unknown"
      ? trustStateFromGate
      : deriveTrustState(firstProjected);
  const freshnessState = deriveFreshnessState(firstProjected);
  const remoteSessionHealth = deriveRemoteSessionHealth(
    trustGateReason,
    trustState,
    freshnessState,
    pairingSession,
    quicSession,
    projectedRoutes,
  );
  const attachState = deriveAttachState(
    trustGateReason,
    projectedRoutes,
    remoteSessionHealth,
    transportEvidenceKind,
    sessionEvidenceMode,
    sessionRemoteAddrSource,
  );

  return {
    selectedService,
    importedServiceAlias: firstProjected.alias,
    projectedRoutes,
    pairingSession,
    trustGateReason,
    importDecisionReason,
    transportEvidenceKind,
    sessionEvidenceMode,
    sessionRemoteAddrSource,
    trustState,
    freshnessState,
    remoteSessionHealth,
    attachState,
    collisionState: firstProjected.collision_state,
    sourceRoutesPath:
      typeof lane2Proof?.source_routes_path === "string"
        ? lane2Proof.source_routes_path
        : "unknown",
  };
}
