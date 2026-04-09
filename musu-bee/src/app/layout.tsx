import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUSU",
  description: "Multi-machine AI control plane for builders and operators.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
