"use client";
export function UserAvatar({ email, displayName, avatarUrl, size = 28 }: { email?: string | null; displayName?: string | null; avatarUrl?: string | null; size?: number }) {
  const initial = (displayName || email || "U")[0].toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,209,102,0.15)",
        color: "#FFD166",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
      }}
      title={email || "User"}
    >
      {initial}
    </div>
  );
}
