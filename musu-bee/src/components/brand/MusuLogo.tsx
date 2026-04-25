import Image from "next/image";

type LogoSize = "hero" | "display" | "header";
type LogoVariant = "onDark" | "onLight" | "onYellow";

interface MusuLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
}

const sizeMap: Record<LogoSize, { width: number; height: number; prefix: string }> = {
  hero:    { width: 828, height: 444, prefix: "hero" },
  display: { width: 582, height: 324, prefix: "display" },
  header:  { width: 447, height: 228, prefix: "header" },
};

const variantSuffix: Record<LogoVariant, string> = {
  onDark:   "dark",
  onLight:  "light",
  onYellow: "yellow",
};

const displayHeight: Record<LogoSize, number> = {
  hero:    120,
  display: 80,
  header:  48,
};

export function MusuLogo({ size = "header", variant = "onLight", className }: MusuLogoProps) {
  const s = sizeMap[size];
  const suffix = variantSuffix[variant];
  const src = `/images/logos/${s.prefix}-${suffix}.png`;
  const h = displayHeight[size];
  const w = Math.round(h * (s.width / s.height));

  return (
    <Image
      src={src}
      alt="MUSU"
      width={s.width}
      height={s.height}
      className={className}
      style={{ width: w, height: h }}
      sizes={`${w}px`}
      priority={size === "hero" || size === "header"}
      fetchPriority={size === "hero" ? "high" : undefined}
    />
  );
}
