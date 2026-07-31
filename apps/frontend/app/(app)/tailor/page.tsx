"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmTailor,
  getMasterResumeId,
  improveResume,
  uploadJobDescriptions,
} from "@/lib/api";

export default function TailorPage() {
  const router = useRouter();
  const [jd, setJd] = useState(
    "Senior Frontend Engineer — Berlin / Hybrid.\n\nRequirements:\n- 5+ years React + TypeScript\n- Design systems / tokens\n- GraphQL and Playwright CI\n- Accessibility (WCAG)\n\nNice to Haves:\n- Mentorship\n- Open-source contributions",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onProcess() {
    if (jd.trim().length < 50) {
      setMsg("Need at least 50 characters");
      return;
    }
    const master = getMasterResumeId();
    if (!master) {
      setMsg("Upload a master resume on Dashboard first");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { job_id } = await uploadJobDescriptions([jd], master);
      const res = await improveResume(master, job_id, jd);
      await confirmTailor(res.resume_id, res.preview_hash);
      router.push(`/resumes/${res.resume_id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Tailor failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-auto px-4 py-10">
      <div className="w-full max-w-2xl rounded-[14px] border border-line bg-panel p-6 shadow-panel sm:p-8">
        <Link
          href="/dashboard"
          className="font-mono text-[11px] font-semibold tracking-wider text-teal-ink no-underline uppercase"
        >
          ← Back
        </Link>
        <h1 className="mt-4 text-center font-[family-name:var(--disp)] text-3xl font-bold tracking-tight">
          Tailor Your Resume
        </h1>
        <p className="mt-2 text-center font-mono text-[10px] font-bold tracking-[0.14em] text-teal uppercase">
          // paste job description below
        </p>

        <div className="relative mt-6">
          <textarea
            rows={14}
            className="w-full rounded-xl border border-line bg-bg px-4 py-3 font-mono text-[12.5px] leading-relaxed text-mut outline-none focus:border-teal"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            disabled={busy}
          />
          <span className="pointer-events-none absolute right-3 bottom-3 font-mono text-[10px] text-sub">
            {jd.trim().length} chars
          </span>
        </div>

        <button
          type="button"
          className="btn prime mt-4 w-full py-3 text-sm disabled:opacity-70"
          disabled={busy}
          onClick={() => void onProcess()}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Processing…
            </span>
          ) : (
            "Generate tailored resume"
          )}
        </button>

        {msg ? <p className="mt-3 text-center text-sm text-mut">{msg}</p> : null}

        <p className="mt-8 text-center font-mono text-[9px] tracking-[0.16em] text-sub uppercase">
          AI-powered optimization engine · mock
        </p>
      </div>
    </div>
  );
}
