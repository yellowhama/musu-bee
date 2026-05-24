const STATUS_CONFIG = {
  queued: { color: "rgba(253,251,247,0.3)", pulse: false },
  running: { color: "#22c55e", pulse: true },
  waiting: { color: "#FFA602", pulse: false },
  done: { color: "#6fcf97", pulse: false },
  failed: { color: "#ff6b6b", pulse: false },
  cancelled: { color: "rgba(253,251,247,0.2)", pulse: false },
} as const;

export type TaskStatus = keyof typeof STATUS_CONFIG;

interface StatusDotProps {
  status: TaskStatus;
  size?: number;
  label?: string;
}

export function StatusDot({ status, size = 8, label }: StatusDotProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: config.color,
          flexShrink: 0,
          animation: config.pulse ? "musu-status-pulse 1.5s ease-in-out infinite" : undefined,
        }}
      />
      {label && (
        <span style={{ color: "rgba(253,251,247,0.6)", fontSize: "12px" }}>{label}</span>
      )}
    </span>
  );
}
