"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  confirmTailor,
  ensureMasterLoaded,
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

  async function onProcess() {
    if (jd.trim().length < 50) {
      toast.error("Need at least 50 characters");
      return;
    }
    await ensureMasterLoaded();
    const master = getMasterResumeId();
    if (!master) {
      toast.error("Upload a master resume on Dashboard first");
      return;
    }
    setBusy(true);
    try {
      const { job_id } = await uploadJobDescriptions([jd], master);
      const res = await improveResume(master, job_id, jd);
      await confirmTailor(res.resume_id, res.preview_hash);
      toast.success("Tailored resume ready");
      router.push(`/resumes/${res.resume_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tailor failed");
      setBusy(false);
    }
  }

  const chars = jd.trim().length;

  return (
    <div className="tailor-page">
      <div className="tailor-panel">
        <div className="tailor-panel-head">
          <Link href="/dashboard" className="tailor-back">
            ← Dashboard
          </Link>
          <h1 className="tailor-title">Tailor your resume</h1>
          <p className="tailor-lead">
            Paste the job description. We align your master resume to the role.
          </p>
        </div>

        <label className="tailor-label" htmlFor="jd-input">
          Job description
        </label>
        <div className="tailor-editor">
          <textarea
            id="jd-input"
            className="tailor-textarea"
            rows={18}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            disabled={busy}
            placeholder="Paste the full posting here…"
          />
          <div className="tailor-meta">
            <span className={chars >= 50 ? "is-ok" : ""}>
              {chars} characters
              {chars < 50 ? " · need 50+" : ""}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary tailor-submit"
          disabled={busy}
          onClick={() => void onProcess()}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="tailor-spin" aria-hidden />
              Processing…
            </span>
          ) : (
            "Generate tailored resume"
          )}
        </button>
      </div>
    </div>
  );
}
