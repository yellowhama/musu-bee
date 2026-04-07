/**
 * MUSU Channel Adapter Type Definitions
 *
 * Based on nanoclaw's channel abstraction (src/channels/registry.ts, src/types.ts).
 * Adapted for MUSU's 4-channel internal messaging model:
 *   #general  – operational broadcast
 *   #tasks    – issue/task lifecycle events
 *   #dev      – build/test/deploy pipeline events
 *   #alerts   – critical system alerts
 *
 * Design owner: CTO (MUS-799)
 * Implementing engineer: Founding Engineer (Wave G-2+)
 */

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

export type MusuChannelId = 'general' | 'tasks' | 'dev' | 'alerts';

export type MusuMessagePriority = 'critical' | 'high' | 'medium' | 'low';

export interface MusuMessageSource {
  kind: 'agent' | 'system' | 'user';
  /** agentId, userId, or system component name */
  id: string;
  name: string;
}

/** Base message envelope — analogous to nanoclaw's NewMessage. */
export interface MusuMessage {
  id: string;
  channelId: MusuChannelId;
  source: MusuMessageSource;
  /** ISO-8601 */
  timestamp: string;
  /** For linking related messages across a request/response chain. */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Channel-specific payloads
// ---------------------------------------------------------------------------

// --- #general ---

export type GeneralMessageKind = 'announcement' | 'status' | 'info';

export interface GeneralMessage extends MusuMessage {
  channelId: 'general';
  kind: GeneralMessageKind;
  text: string;
  metadata?: Record<string, string>;
}

// --- #tasks ---

export type TaskEventKind =
  | 'created'
  | 'assigned'
  | 'checkout'
  | 'status_changed'
  | 'commented'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export interface TaskMessage extends MusuMessage {
  channelId: 'tasks';
  eventKind: TaskEventKind;
  issueId: string;
  /** Human-readable identifier, e.g. "MUS-799" */
  issueIdentifier: string;
  issueTitle: string;
  previousStatus?: string;
  nextStatus?: string;
  assigneeAgentId?: string;
  priority?: MusuMessagePriority;
  /** Optional short summary / comment excerpt */
  summary?: string;
}

// --- #dev ---

export type DevEventKind =
  | 'build_started'
  | 'build_passed'
  | 'build_failed'
  | 'test_passed'
  | 'test_failed'
  | 'deploy_started'
  | 'deploy_completed'
  | 'deploy_failed'
  | 'pr_opened'
  | 'pr_merged';

export interface DevMessage extends MusuMessage {
  channelId: 'dev';
  eventKind: DevEventKind;
  /** e.g. "musu-connects", "musu-port", "MUSU-CRT" */
  component: string;
  /** git branch, tag, or commit SHA */
  ref?: string;
  durationMs?: number;
  errorSummary?: string;
  artifactUrl?: string;
}

// --- #alerts ---

export type AlertSeverity = 'critical' | 'high' | 'medium';

export type AlertKind =
  | 'health_degraded'
  | 'threshold_breach'
  | 'error_rate_spike'
  | 'agent_budget_limit'
  | 'connection_lost'
  | 'execution_timeout'
  | 'security_event';

export interface AlertMessage extends MusuMessage {
  channelId: 'alerts';
  severity: AlertSeverity;
  alertKind: AlertKind;
  component: string;
  title: string;
  detail: string;
  resolved?: boolean;
  resolvedAt?: string;
}

/** Discriminated union — use `channelId` as the discriminant. */
export type AnyMusuMessage =
  | GeneralMessage
  | TaskMessage
  | DevMessage
  | AlertMessage;

// ---------------------------------------------------------------------------
// Channel adapter interface (adapted from nanoclaw's Channel)
// ---------------------------------------------------------------------------

/** Inbound message handler — analogous to nanoclaw's OnInboundMessage. */
export type OnMusuMessage<T extends AnyMusuMessage = AnyMusuMessage> = (
  message: T,
) => void | Promise<void>;

export interface MessageDeliveryReceipt {
  messageId: string;
  channelId: MusuChannelId;
  deliveredAt: string;
  subscriberCount: number;
}

/**
 * Core adapter interface.
 * Analogous to nanoclaw's Channel interface; stripped of JID/chat/group
 * semantics which do not apply to MUSU's internal message bus.
 */
export interface MusuChannelAdapter<T extends AnyMusuMessage = AnyMusuMessage> {
  readonly channelId: MusuChannelId;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Publish a message to this channel. */
  publish(message: T): Promise<MessageDeliveryReceipt>;

  /**
   * Subscribe to inbound messages.
   * Returns an unsubscribe function — call it to deregister.
   */
  subscribe(handler: OnMusuMessage<T>): () => void;

  isConnected(): boolean;
}

// ---------------------------------------------------------------------------
// Per-channel adapter interfaces (typed convenience layer)
// ---------------------------------------------------------------------------

export interface GeneralChannelAdapter extends MusuChannelAdapter<GeneralMessage> {
  readonly channelId: 'general';
  /** Shorthand: build and publish an announcement. */
  announce(
    text: string,
    source: MusuMessageSource,
    kind?: GeneralMessageKind,
  ): Promise<MessageDeliveryReceipt>;
}

export interface TaskChannelAdapter extends MusuChannelAdapter<TaskMessage> {
  readonly channelId: 'tasks';
  /** Shorthand: emit a status transition event. */
  emitStatusChange(
    issueId: string,
    identifier: string,
    title: string,
    from: string,
    to: string,
    source: MusuMessageSource,
  ): Promise<MessageDeliveryReceipt>;
}

export interface DevChannelAdapter extends MusuChannelAdapter<DevMessage> {
  readonly channelId: 'dev';
  /** Shorthand: emit a build result (pass or fail). */
  emitBuildResult(
    component: string,
    passed: boolean,
    durationMs: number,
    source: MusuMessageSource,
    errorSummary?: string,
  ): Promise<MessageDeliveryReceipt>;
}

export interface AlertChannelAdapter extends MusuChannelAdapter<AlertMessage> {
  readonly channelId: 'alerts';
  /** Shorthand: fire an alert. */
  fireAlert(
    severity: AlertSeverity,
    kind: AlertKind,
    component: string,
    title: string,
    detail: string,
    source: MusuMessageSource,
  ): Promise<MessageDeliveryReceipt>;
  /** Mark a previously fired alert as resolved. */
  resolveAlert(alertMessageId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Channel registry (adapted from nanoclaw's registry pattern)
// ---------------------------------------------------------------------------

export interface MusuChannelContext {
  agentId?: string;
  companyId?: string;
  runId?: string;
}

export interface MusuChannelOpts {
  onMessage: OnMusuMessage;
  getContext?: () => MusuChannelContext;
}

/** Factory signature — analogous to nanoclaw's ChannelFactory. */
export type MusuChannelFactory<T extends AnyMusuMessage = AnyMusuMessage> = (
  opts: MusuChannelOpts,
) => MusuChannelAdapter<T> | null;

/**
 * Typed registry for all four MUSU channels.
 * Implementors create one instance of each adapter and expose it here.
 */
export interface MusuChannelRegistry {
  general: GeneralChannelAdapter;
  tasks: TaskChannelAdapter;
  dev: DevChannelAdapter;
  alerts: AlertChannelAdapter;
}
