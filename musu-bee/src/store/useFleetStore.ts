import { create } from 'zustand';
import { WidgetPayload } from '../components/workstation/town/widgets/WidgetRegistry';

let fleetEvents: EventSource | null = null;
let fleetReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let fleetReconnectDelayMs = 1_000;
let fleetReconnectAttempts = 0;
let fleetReconnectGeneration = 0;
const seenFinalTaskIds = new Set<string>();

const FLEET_SSE_RECONNECT_INITIAL_MS = 1_000;
const FLEET_SSE_RECONNECT_MAX_MS = 10_000;
const FLEET_SSE_RECONNECT_MULTIPLIER = 2;
const FLEET_SSE_MAX_RETRIES = 5;

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  widget?: WidgetPayload;
}

interface FleetStore {
  // Global Chat State
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;

  // View Modes
  activeViewMode: "dev" | "town" | "butler";
  setActiveViewMode: (mode: "dev" | "town" | "butler") => void;

  // Machine Selection
  selectedMachines: string[];
  toggleMachine: (name: string) => void;
  setSelectedMachines: (machines: string[]) => void;

  // Per-Machine View Modes (dev mode)
  machineViewModes: Record<string, "terminal" | "explorer" | "split">;
  setNodeViewMode: (name: string, mode: "terminal" | "explorer" | "split") => void;
  setInitialMachineViewModes: (modes: Record<string, "terminal" | "explorer" | "split">) => void;

  // Widget Stack (Holograms)
  overlayWidgets: { id: string; payload: WidgetPayload }[];
  pushWidget: (payload: WidgetPayload) => void;
  removeWidget: (id: string) => void;

  // AI Interaction State
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  agentState: 'idle' | 'thinking' | 'speaking' | 'error';
  setAgentState: (state: 'idle' | 'thinking' | 'speaking' | 'error') => void;
  initSSE: () => void;
  closeSSE: () => void;
}

interface TaskUpdateEvent {
  type?: string;
  task_id?: string;
  status?: string;
  channel?: string;
  sender_id?: string;
  output?: string | null;
  error?: string | null;
  assigned_pc?: string | null;
  exit_code?: number | null;
  duration_sec?: number | null;
}

function summarizeTaskEvent(event: TaskUpdateEvent): string {
  const shortId = event.task_id ? event.task_id.slice(0, 8) : "unknown";
  const target = event.assigned_pc ? ` on ${event.assigned_pc}` : "";
  if (event.output?.trim()) return event.output.trim();
  if (event.error?.trim()) return event.error.trim();
  return `Task ${shortId} ${event.status ?? "updated"}${target}.`;
}

function widgetFromTaskEvent(event: TaskUpdateEvent): WidgetPayload {
  const isError = event.status === "failed" || Boolean(event.error?.trim());
  const shortId = event.task_id ? event.task_id.slice(0, 8) : "unknown";
  const header = [
    `task: ${shortId}`,
    event.status ? `status: ${event.status}` : null,
    event.assigned_pc ? `node: ${event.assigned_pc}` : null,
    typeof event.duration_sec === "number" ? `duration: ${event.duration_sec.toFixed(1)}s` : null,
  ].filter(Boolean).join("\n");
  return {
    type: "TerminalLog",
    props: {
      level: isError ? "error" : "info",
      log: `${header}\n\n${summarizeTaskEvent(event)}`,
    },
  };
}

function clearFleetReconnectTimer() {
  if (fleetReconnectTimer) {
    clearTimeout(fleetReconnectTimer);
    fleetReconnectTimer = null;
  }
}

function resetFleetReconnectState() {
  fleetReconnectDelayMs = FLEET_SSE_RECONNECT_INITIAL_MS;
  fleetReconnectAttempts = 0;
}

function closeFleetEventSource() {
  if (fleetEvents) {
    fleetEvents.close();
    fleetEvents = null;
  }
}

function scheduleFleetReconnect(reconnectGeneration: number) {
  if (fleetReconnectAttempts >= FLEET_SSE_MAX_RETRIES) return;

  clearFleetReconnectTimer();
  const delayMs = fleetReconnectDelayMs;
  fleetReconnectAttempts += 1;
  fleetReconnectDelayMs = Math.min(
    FLEET_SSE_RECONNECT_MAX_MS,
    fleetReconnectDelayMs * FLEET_SSE_RECONNECT_MULTIPLIER,
  );

  fleetReconnectTimer = setTimeout(() => {
    fleetReconnectTimer = null;
    if (fleetReconnectGeneration !== reconnectGeneration) return;
    useFleetStore.getState().initSSE();
  }, delayMs);
}

export const useFleetStore = create<FleetStore>((set) => ({
  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  activeViewMode: "dev",
  setActiveViewMode: (mode) => set({ activeViewMode: mode }),

  selectedMachines: [],
  toggleMachine: (name) => set((state) => {
    if (state.selectedMachines.includes(name)) {
      return { selectedMachines: state.selectedMachines.filter(m => m !== name) };
    } else {
      return { 
        selectedMachines: [...state.selectedMachines, name],
        machineViewModes: { ...state.machineViewModes, [name]: "split" }
      };
    }
  }),
  setSelectedMachines: (machines) => set({ selectedMachines: machines }),

  machineViewModes: {},
  setNodeViewMode: (name, mode) => set((state) => ({
    machineViewModes: { ...state.machineViewModes, [name]: mode }
  })),
  setInitialMachineViewModes: (modes) => set({ machineViewModes: modes }),

  overlayWidgets: [],
  pushWidget: (payload) => set((state) => ({
    overlayWidgets: [...state.overlayWidgets, { id: `w-${Date.now()}-${Math.random()}`, payload }]
  })),
  removeWidget: (id) => set((state) => ({
    overlayWidgets: state.overlayWidgets.filter(w => w.id !== id)
  })),

  isTyping: false,
  setIsTyping: (typing) => set({ isTyping: typing, agentState: typing ? 'thinking' : 'idle' }),
  
  agentState: 'idle',
  setAgentState: (s) => set({ agentState: s }),

  initSSE: () => {
    if (typeof window === "undefined") return;
    if (
      fleetEvents &&
      (fleetEvents.readyState === EventSource.CONNECTING ||
        fleetEvents.readyState === EventSource.OPEN)
    ) {
      clearFleetReconnectTimer();
      return;
    }

    clearFleetReconnectTimer();
    fleetReconnectGeneration += 1;
    const connectionGeneration = fleetReconnectGeneration;
    const es = new EventSource("/api/bridge-tasks/events");
    fleetEvents = es;
    es.onopen = resetFleetReconnectState;

    const handleTaskUpdate = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as TaskUpdateEvent;
        if (event.type !== "task_update" || !event.task_id) return;

        if (event.status === "running" || event.status === "pending") {
          set({ isTyping: true, agentState: "thinking" });
          return;
        }

        if (!["done", "failed", "cancelled"].includes(event.status ?? "")) return;
        if (seenFinalTaskIds.has(event.task_id)) return;
        seenFinalTaskIds.add(event.task_id);

        const widget = widgetFromTaskEvent(event);
        const aiMsg: ChatMessage = {
          id: `task-${event.task_id}-${Date.now()}`,
          sender: "ai",
          text: summarizeTaskEvent(event),
          widget,
        };

        set((state) => ({
          messages: [...state.messages, aiMsg],
          overlayWidgets: [...state.overlayWidgets, { id: `w-${Date.now()}-${Math.random()}`, payload: widget }],
          isTyping: false,
          agentState: event.status === "failed" ? "error" : "speaking",
        }));

        setTimeout(() => {
          set((state) => state.agentState === "speaking" ? { agentState: "idle" } : state);
        }, 2000);
      } catch (err) {
        console.error("Failed to parse task_update event:", err);
      }
    };

    es.addEventListener("task_update", handleTaskUpdate);
    es.onmessage = handleTaskUpdate;
    es.onerror = () => {
      es.close();
      if (fleetEvents === es) fleetEvents = null;
      if (fleetReconnectGeneration === connectionGeneration) {
        scheduleFleetReconnect(connectionGeneration);
      }
    };

    es.addEventListener("ai_message", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const statusObj = JSON.parse(payload.status);
        
        const aiMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random()}`,
          sender: "ai",
          text: statusObj.text,
          widget: statusObj.widget
        };
        
        set((state) => ({ 
          messages: [...state.messages, aiMsg],
          agentState: 'speaking' // Set to speaking when message arrives
        }));

        // Revert back to idle after a few seconds of speaking
        setTimeout(() => {
          set((state) => {
             // Only revert if we haven't started another thought
             return state.agentState === 'speaking' ? { agentState: 'idle' } : state;
          });
        }, 2000);

        if (statusObj.widget) {
          useFleetStore.getState().pushWidget(statusObj.widget);
          set({ isTyping: false });
        }
      } catch (err) {
        console.error("Failed to parse ai_message event:", err);
      }
    });

    // Phase 3: Agent-to-Agent Protocol Events
    es.addEventListener("a2a_message", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const a2aMsg = payload.message; // e.g. { type: 'TaskDelegation', payload: {...} }
        
        if (a2aMsg.type === 'TaskApproval') {
           useFleetStore.getState().pushWidget({
              type: 'Approval',
              props: {
                 taskId: a2aMsg.payload.task_id,
                 targetAgent: a2aMsg.payload.target_agent,
                 decision: a2aMsg.payload.decision,
                 feedback: a2aMsg.payload.feedback
              }
           });
        }
        
        // Log in chat as a system/agent notice
        set((state) => ({
           messages: [...state.messages, {
              id: `a2a-${Date.now()}-${Math.random()}`,
              sender: "ai",
              text: `[A2A ${a2aMsg.type}]: ${a2aMsg.payload.target_agent} -> ${a2aMsg.payload.task_id}`,
           }]
        }));
      } catch(err) {
        console.error("Failed to parse a2a_message event:", err);
      }
    });
  },

  closeSSE: () => {
    fleetReconnectGeneration += 1;
    clearFleetReconnectTimer();
    closeFleetEventSource();
    resetFleetReconnectState();
  }
}));
