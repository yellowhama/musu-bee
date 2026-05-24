"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, BookOpen, BarChart3, Settings, ScreenShare } from "lucide-react";

const TABS = [
  { href: "/home", icon: Inbox, label: "Home" },
  { href: "/wiki", icon: BookOpen, label: "Wiki" },
  { href: "/fleet", icon: BarChart3, label: "Dashboard" },
  { href: "/screen", icon: ScreenShare, label: "Screen" },
  { href: "/account", icon: Settings, label: "Account" },
];

export function ConsoleMobileTabBar() {
  const pathname = usePathname();

  return (
    <>
      <style>{`
        @media (min-width: 768px) {
          .musu-mobile-tabbar { display: none !important; }
        }
      `}</style>
      <nav
        className="musu-mobile-tabbar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "calc(56px + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "#261813",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "stretch",
          zIndex: 100,
        }}
      >
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (pathname ?? "").startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                textDecoration: "none",
                color: active ? "var(--accent)" : "rgba(253,251,247,0.4)",
                transition: "color 150ms",
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: "10px", fontWeight: 600 }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
