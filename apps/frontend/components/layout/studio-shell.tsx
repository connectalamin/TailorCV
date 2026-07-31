"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { USE_MOCK_API } from "@/lib/api";

const SIDEBAR_KEY = "tailorcv_sidebar_collapsed";

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    match: ["/dashboard", "/resumes", "/tailor", "/builder"],
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/tracker",
    label: "Applications",
    match: ["/tracker"],
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <rect x="4" y="7" width="16" height="13" rx="2" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    match: ["/settings"],
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
      </svg>
    ),
  },
] as const;

function pageMeta(pathname: string): { eyebrow: string; title: string } {
  if (pathname.startsWith("/settings")) {
    return { eyebrow: "Workspace", title: "Settings" };
  }
  if (pathname.startsWith("/tracker")) {
    return { eyebrow: "Pipeline", title: "Applications" };
  }
  if (pathname.startsWith("/tailor")) {
    return { eyebrow: "Workflow", title: "Tailor resume" };
  }
  if (pathname.startsWith("/builder")) {
    return { eyebrow: "Workflow", title: "Resume builder" };
  }
  if (pathname.startsWith("/resumes")) {
    return { eyebrow: "Resume", title: "Resume" };
  }
  return { eyebrow: "Overview", title: "Dashboard" };
}

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const meta = useMemo(() => pageMeta(pathname), [pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const hideTopbar = pathname.startsWith("/builder");

  return (
    <div className="app-frame">
      <aside className={["app-sidebar", collapsed ? "collapsed" : ""].join(" ")}>
        <Link href="/dashboard" className="brand flex items-center gap-2.5 px-4 pt-5 pb-5 no-underline">
          <span
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)]"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V8h3.5" />
            </svg>
          </span>
          <span className="brand-text t-h3 text-[var(--text-primary)]">TailorCV</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const on = item.match.some(
              (m) => pathname === m || pathname.startsWith(`${m}/`),
            );
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={["nav-link", on ? "active" : ""].join(" ")}
              >
                {item.icon}
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-3">
          {USE_MOCK_API ? (
            <div className="sidebar-foot-chip flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--warning)" }}
              />
              <span className="sidebar-foot-text t-body-sm text-[var(--text-muted)]">
                Local mock data
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d="m14 9 3 3-3 3" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d="m15 15-3-3 3-3" />
              </svg>
            )}
            <span className="sidebar-foot-text">
              {collapsed ? "Expand" : "Collapse"}
            </span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        {!hideTopbar ? (
          <header className="app-topbar">
            <div className="min-w-0">
              <p className="t-caption text-[var(--accent)]">{meta.eyebrow}</p>
              <h1 className="t-h1 truncate text-[var(--text-primary)]">{meta.title}</h1>
            </div>
          </header>
        ) : null}
        <main className={["app-content", hideTopbar ? "app-content-flush" : ""].join(" ")}>
          {children}
        </main>
      </div>
    </div>
  );
}
