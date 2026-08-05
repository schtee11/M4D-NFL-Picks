"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { APP_BADGE } from "@/lib/config";
import {
  HomeIcon,
  GridIcon,
  TrophyIcon,
  PeopleIcon,
  CalendarIcon,
} from "@/components/icons";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/picks", label: "Picks", Icon: GridIcon, match: (p: string) => p.startsWith("/picks") },
  { href: "/bracket", label: "Bracket", Icon: TrophyIcon, match: (p: string) => p.startsWith("/bracket") },
  { href: "/weekly", label: "Weekly", Icon: CalendarIcon, match: (p: string) => p.startsWith("/weekly") },
  { href: "/league", label: "League", Icon: PeopleIcon, match: (p: string) => p.startsWith("/league") },
];

export default function AppChrome({
  displayName,
  locked,
  deadlinePassed,
  children,
}: {
  displayName: string;
  locked: boolean;
  deadlinePassed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        {/* Header */}
        <header className="app-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background: "var(--color-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-bg)",
                flex: "none",
              }}
            >
              {APP_BADGE}
            </span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Gridiron Picks</span>
          </div>

          {/* Desktop top nav (hidden on mobile) */}
          <nav className="desktop-nav">
            {TABS.map(({ href, label, Icon, match }) => (
              <Link key={href} href={href} data-active={match(pathname)}>
                <Icon size={17} />
                {label}
              </Link>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {deadlinePassed ? (
              <span className="tag tag-neutral">Deadline passed</span>
            ) : locked ? (
              <span className="tag tag-accent">Locked</span>
            ) : (
              <span className="tag tag-outline">Open</span>
            )}
            <button
              type="button"
              onClick={logout}
              title={`Sign out ${displayName}`}
              className="btn btn-ghost"
              style={{ fontSize: 12, opacity: 0.7 }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="app-content">{children}</div>

        {/* Bottom nav (mobile only) */}
        <nav className="bottom-nav">
          {TABS.map(({ href, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1,
                  padding: "9px 4px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  textDecoration: "none",
                  color: active ? "var(--color-accent)" : "var(--color-neutral-500)",
                }}
              >
                <Icon size={20} />
                <div style={{ fontSize: 10, marginTop: 2 }}>{label}</div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
