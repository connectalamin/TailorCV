"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ResumePreview } from "@/components/resume/resume-preview";
import {
  confirmTailor,
  ensureMasterLoaded,
  getMasterResumeId,
  improveResume,
  uploadJobDescriptions,
} from "@/lib/api";
import { DEFAULT_TEMPLATE_SETTINGS } from "@/lib/mock/data";
import type { ImproveResult, TailorIntensity } from "@/lib/types/resume";

const INTENSITIES: {
  id: TailorIntensity;
  label: string;
  blurb: string;
}[] = [
  {
    id: "light",
    label: "Light polish",
    blurb: "Subtle edits — weave in a few keywords, keep most of your wording.",
  },
  {
    id: "balanced",
    label: "Balanced match",
    blurb: "Recommended — align summary, skills, and bullets to the job posting.",
  },
  {
    id: "aggressive",
    label: "Aggressive rewrite",
    blurb: "Stronger rewrite for the role — still no invented employers or metrics.",
  },
];

export default function TailorPage() {
  const router = useRouter();
  const [jd, setJd] = useState(
    "Senior Frontend Engineer — Berlin / Hybrid.\n\nRequirements:\n- 5+ years React + TypeScript\n- Design systems / tokens\n- GraphQL and Playwright CI\n- Accessibility (WCAG)\n\nNice to Haves:\n- Mentorship\n- Open-source contributions",
  );
  const [intensity, setIntensity] = useState<TailorIntensity>("balanced");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImproveResult | null>(null);

  const settings = useMemo(() => structuredClone(DEFAULT_TEMPLATE_SETTINGS), []);
  const chars = jd.trim().length;

  async function onPreview() {
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
    setPreview(null);
    try {
      const { job_id } = await uploadJobDescriptions([jd], master);
      const res = await improveResume(master, job_id, jd, intensity);
      setPreview(res);
      toast.success("Preview ready — review, then confirm");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tailor failed";
      toast.error(msg, {
        description:
          /llm|api key|unconfigured|connection/i.test(msg)
            ? "Open Settings → API keys, save your provider, then try again."
            : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!preview) return;
    setBusy(true);
    try {
      await confirmTailor(preview.resume_id, preview.preview_hash, true);
      toast.success("Tailored resume saved");
      router.push(`/resumes/${preview.resume_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
      setBusy(false);
    }
  }

  function onDiscard() {
    setPreview(null);
  }

  return (
    <div className="tailor-page">
      <div className={`tailor-panel ${preview ? "tailor-panel--wide" : ""}`}>
        <div className="tailor-panel-head">
          <Link href="/dashboard" className="tailor-back">
            ← Dashboard
          </Link>
          <h1 className="tailor-title">Tailor your resume</h1>
          <p className="tailor-lead">
            Paste the job description, pick intensity, preview the draft, then
            confirm to save.
          </p>
        </div>

        {!preview ? (
          <>
            <fieldset className="tailor-intensity" disabled={busy}>
              <legend className="tailor-label">Intensity</legend>
              <div className="tailor-intensity-grid">
                {INTENSITIES.map((opt) => (
                  <label
                    key={opt.id}
                    className={`tailor-intensity-card${
                      intensity === opt.id ? " is-active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="intensity"
                      value={opt.id}
                      checked={intensity === opt.id}
                      onChange={() => setIntensity(opt.id)}
                    />
                    <span className="tailor-intensity-name">{opt.label}</span>
                    <span className="tailor-intensity-blurb">{opt.blurb}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="tailor-label" htmlFor="jd-input">
              Job description
            </label>
            <div className="tailor-editor">
              <textarea
                id="jd-input"
                className="tailor-textarea"
                rows={16}
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
              onClick={() => void onPreview()}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span className="tailor-spin" aria-hidden />
                  Generating preview…
                </span>
              ) : (
                "Generate preview"
              )}
            </button>
          </>
        ) : (
          <div className="tailor-preview">
            <div className="tailor-preview-meta">
              <p className="font-mono text-[10px] uppercase tracking-wider text-sub">
                Preview · {preview.intensity} · not saved until confirm
              </p>
              {preview.keywords?.length ? (
                <p className="tailor-kw">
                  Keywords:{" "}
                  {preview.keywords
                    .slice(0, 8)
                    .map((h) => h.k)
                    .join(" · ")}
                </p>
              ) : null}
            </div>

            {preview.data ? (
              <div className="tailor-preview-sheet">
                <ResumePreview data={preview.data} settings={settings} />
              </div>
            ) : null}

            <div className="tailor-preview-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={onDiscard}
              >
                Back / edit JD
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onConfirm()}
              >
                {busy ? "Saving…" : "Confirm & save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
