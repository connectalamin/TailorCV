"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { USE_MOCK_API, downloadResumePdf, getMasterResumeId } from "@/lib/api";

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    match: ["/dashboard", "/resumes", "/tailor", "/builder"],
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
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
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
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
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
      </svg>
    ),
  },
] as const;

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    const id = getMasterResumeId();
    if (!id) {
      router.push("/dashboard");
      return;
    }
    setExporting(true);
    try {
      const blob = await downloadResumePdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resume.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-shell flex h-dvh overflow-hidden bg-[#F4F6F8] text-[#111827]">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-5 pt-5 pb-6 no-underline"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#2563EB]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
              <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V8h3.5" />
            </svg>
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-[#111827]">
            TailorCV
          </span>
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
                className={[
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium no-underline transition",
                  on
                    ? "bg-[#F3F4F6] text-[#111827]"
                    : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]",
                ].join(" ")}
              >
                <span className={on ? "text-[#2563EB]" : "text-[#9CA3AF]"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-5">
          {USE_MOCK_API ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-medium text-[#6B7280]">
              <i className="h-2 w-2 rounded-full bg-[#EAB308]" />
              Mock API mode
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-[#E5E7EB] bg-white/80 px-6 backdrop-blur">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-[#111827] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-60"
            onClick={() => void onExport()}
            disabled={exporting}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB]"
            aria-label="More"
          >
            ···
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
