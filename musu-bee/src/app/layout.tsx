import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUSU 🐝",
  description: "AI 팀 업무 메신저",
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
