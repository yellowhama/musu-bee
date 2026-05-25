import { create } from 'zustand';
import { WidgetPayload } from '../components/workstation/town/widgets/WidgetRegistry';

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
    // Only initialize once (in a real app, use a ref or check if connected)
    if (typeof window === "undefined") return;
    const es = new EventSource("/api/tasks/events");

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
  }
}));
