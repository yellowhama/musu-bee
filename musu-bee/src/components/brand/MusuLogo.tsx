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

export function MusuLogo({ size = "header", className }: MusuLogoProps) {
  const h = displayHeight[size];

  return (
    <span
      aria-label="MUSU"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: h,
        height: h,
        lineHeight: 1,
      }}
    >
      <Image
        src="/images/favicon-header.png"
        alt=""
        width={512}
        height={512}
        style={{ width: h, height: h, objectFit: "contain" }}
        sizes={`${h}px`}
        priority={size === "hero" || size === "header"}
        fetchPriority={size === "hero" ? "high" : undefined}
      />
    </span>
  );
}
