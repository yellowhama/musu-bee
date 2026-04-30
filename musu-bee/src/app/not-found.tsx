export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
        color: "var(--fg3)",
        fontFamily: "sans-serif",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <img src="/images/favicon-header.png" alt="MUSU" style={{ height: 40, width: "auto" }} />
      <p style={{ fontSize: 16 }}>Page not found.</p>
    </div>
  );
}
