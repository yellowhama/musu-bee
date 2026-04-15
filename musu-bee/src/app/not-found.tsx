export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d0d0d",
        color: "#6b7280",
        fontFamily: "sans-serif",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 40 }}>🐝</span>
      <p style={{ fontSize: 16 }}>Page not found.</p>
    </div>
  );
}
