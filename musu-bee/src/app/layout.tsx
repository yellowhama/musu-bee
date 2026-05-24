import type { Metadata } from "next";
import AuthBridgeListener from "@/components/auth/AuthBridgeListener";
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
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthBridgeListener />
        {children}
      </body>
    </html>
  );
}
