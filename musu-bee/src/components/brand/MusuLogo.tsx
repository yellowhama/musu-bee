import Image from "next/image";

type LogoSize = "hero" | "display" | "header";
type LogoVariant = "onDark" | "onLight" | "onYellow";

interface MusuLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
}

const displayHeight: Record<LogoSize, number> = {
  hero:    120,
  display: 80,
  header:  36,
};

const wordmarkColor: Record<LogoVariant, string> = {
  onDark:   "var(--musu-color-brand-canvas)",
  onLight:  "var(--musu-color-brand-ink)",
  onYellow: "var(--musu-color-brand-ink)",
};

export function MusuLogo({ size = "header", variant = "onLight", className }: MusuLogoProps) {
  const h = displayHeight[size];
  const markSize = Math.round(h * 0.78);
  const fontSize = Math.round(h * 0.58);
  const gap = Math.max(8, Math.round(h * 0.18));

  return (
    <span
      aria-label="MUSU"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        height: h,
        color: wordmarkColor[variant],
        fontFamily: "var(--font-heading)",
        fontSize,
        fontWeight: 900,
        letterSpacing: 0,
        lineHeight: 1,
      }}
    >
      <Image
        src="/images/favicon-header.png"
        alt=""
        width={512}
        height={512}
        style={{ width: markSize, height: markSize, objectFit: "contain" }}
        sizes={`${markSize}px`}
        priority={size === "hero" || size === "header"}
        fetchPriority={size === "hero" ? "high" : undefined}
      />
      <span aria-hidden="true">MUSU</span>
    </span>
  );
}
