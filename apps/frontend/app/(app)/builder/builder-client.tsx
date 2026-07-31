"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ResumePreview } from "@/components/resume/resume-preview";
import {
  downloadResumePdf,
  fetchResume,
  getSampleResume,
  updateResume,
} from "@/lib/api";
import {
  DEFAULT_TEMPLATE_SETTINGS,
  PAGE,
  TPL_META,
} from "@/lib/mock/data";
import type {
  ResumeData,
  ResumeRecord,
  TemplateId,
  TemplateSettings,
} from "@/lib/types/resume";
import {
  extractKeywords,
  highlightText,
  matchKeywords,
  resumeToPlainText,
} from "@/lib/utils/keyword-matcher";

type DocTab = "resume" | "cover" | "outreach" | "jd";

const SETTINGS_KEY = "resume_builder_settings";
const DRAFT_KEY = "resume_builder_draft";

function loadSettings(): TemplateSettings {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_TEMPLATE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_TEMPLATE_SETTINGS);
}

export default function BuilderClient() {
  const params = useSearchParams();
  const [tab, setTab] = useState<DocTab>("resume");
  const [settings, setSettings] = useState<TemplateSettings>(
    DEFAULT_TEMPLATE_SETTINGS,
  );
  const [record, setRecord] = useState<ResumeRecord | null>(null);
  const [data, setData] = useState<ResumeData>(getSampleResume());
  const [cover, setCover] = useState("");
  const [outreach, setOutreach] = useState("");
  const [jd, setJd] = useState("");
  const [zoom, setZoom] = useState(0.75);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const id = params.get("id");

  const load = useCallback(async () => {
    setSettings(loadSettings());
    if (!id) {
      setData(getSampleResume());
      return;
    }
    try {
      const r = await fetchResume(id);
      setRecord(r);
      setData(r.data);
      setCover(r.coverLetter || "");
      setOutreach(r.outreachMessage || "");
      setJd(r.jobDescription || "");
    } catch {
      setData(getSampleResume());
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ data, cover, outreach, jd, id }),
    );
  }, [data, cover, outreach, jd, id]);

  const keywords = useMemo(() => extractKeywords(jd), [jd]);
  const match = useMemo(() => {
    const plain = resumeToPlainText(data);
    return matchKeywords(plain, keywords);
  }, [data, keywords]);

  function patchSettings(p: Partial<TemplateSettings>) {
    setSettings((s) => ({ ...s, ...p }));
  }

  async function onSave() {
    if (!id) {
      setToast("Open a resume from Dashboard to save");
      return;
    }
    setBusy(true);
    try {
      const next = await updateResume(id, {
        data,
        coverLetter: cover,
        outreachMessage: outreach,
        jobDescription: jd || undefined,
      });
      setRecord(next);
      setToast("Saved");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    if (!id) return;
    setBusy(true);
    try {
      const blob = await downloadResumePdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const page = PAGE[settings.pageSize];
  const fam = TPL_META[settings.template].fam;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
        <div>
          <Link
            href="/dashboard"
            className="font-mono text-[11px] font-semibold tracking-wider text-teal-ink no-underline uppercase"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="font-[family-name:var(--disp)] text-2xl font-bold tracking-tight">
            Resume Builder
          </h1>
          <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-teal uppercase">
            // edit mode
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setSettings(structuredClone(DEFAULT_TEMPLATE_SETTINGS));
              setToast("Settings reset");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void onSave()}
          >
            Save
          </button>
          <button
            type="button"
            className="btn prime"
            disabled={busy || !id}
            onClick={() => void onDownload()}
          >
            Download
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[340px_1fr]">
        {/* Left panel */}
        <aside className="overflow-y-auto border-r border-line bg-panel">
          {tab === "resume" ? (
            <div className="space-y-6 p-4">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-teal uppercase">
                ■ Editor panel
              </p>

              <section>
                <p className="mb-2 text-[11px] font-bold tracking-wide uppercase">
                  Template
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TPL_META) as TemplateId[]).map((tid) => (
                    <button
                      key={tid}
                      type="button"
                      className={[
                        "rounded-lg border px-2 py-2 text-left text-[11px] font-semibold transition",
                        settings.template === tid
                          ? "border-teal bg-teal-soft/40 text-teal-ink"
                          : "border-line bg-white hover:border-line2",
                      ].join(" ")}
                      onClick={() => patchSettings({ template: tid })}
                    >
                      {TPL_META[tid].name}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 text-[11px] font-bold tracking-wide uppercase">
                  Page size
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["A4", "LETTER"] as const).map((ps) => (
                    <button
                      key={ps}
                      type="button"
                      className={[
                        "rounded-lg border px-3 py-2 text-sm font-bold",
                        settings.pageSize === ps
                          ? "border-teal bg-teal text-white"
                          : "border-line bg-white",
                      ].join(" ")}
                      onClick={() => patchSettings({ pageSize: ps })}
                    >
                      {ps === "LETTER" ? "US Letter" : ps}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-bold tracking-wide uppercase">
                  Margins (mm)
                </p>
                {(
                  [
                    ["top", "Top"],
                    ["bottom", "Bottom"],
                    ["left", "Left"],
                    ["right", "Right"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-10 font-mono text-sub">{label}</span>
                    <input
                      type="range"
                      min={6}
                      max={24}
                      value={settings.margins[k]}
                      onChange={(e) =>
                        patchSettings({
                          margins: {
                            ...settings.margins,
                            [k]: Number(e.target.value),
                          },
                        })
                      }
                      className="flex-1"
                    />
                    <span className="w-8 font-mono text-teal-ink">
                      {settings.margins[k]}
                    </span>
                  </label>
                ))}
              </section>

              {(
                [
                  ["sectionSpacing", "Section"],
                  ["itemSpacing", "Items"],
                  ["lineHeight", "Lines"],
                  ["fontSize", "Base"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{label}</span>
                  <div className="flex gap-0.5 rounded-lg border border-line bg-[#F1F5F3] p-0.5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={[
                          "h-[23px] min-w-[22px] rounded-[5px] font-mono text-[10.5px] font-semibold",
                          settings[key] === v
                            ? "bg-ink text-white"
                            : "text-sub hover:bg-white",
                        ].join(" ")}
                        onClick={() =>
                          patchSettings({ [key]: v } as Partial<TemplateSettings>)
                        }
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "cover" ? (
            <div className="flex h-full flex-col p-4">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-teal uppercase">
                ■ Cover letter editor
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-mut">
                <span>
                  {cover.trim().split(/\s+/).filter(Boolean).length} words /{" "}
                  {cover.length} chars
                </span>
                <button
                  type="button"
                  className="btn prime sm"
                  disabled={busy}
                  onClick={() => void onSave()}
                >
                  Save
                </button>
              </div>
              <textarea
                className="mt-3 min-h-[280px] flex-1 rounded-lg border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-teal"
                value={cover}
                onChange={(e) => setCover(e.target.value)}
              />
              <p className="mt-2 font-mono text-[10px] text-sub">
                Tip: aim for 300–400 words.
              </p>
            </div>
          ) : null}

          {tab === "outreach" ? (
            <div className="flex h-full flex-col p-4">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-teal uppercase">
                ■ Outreach editor
              </p>
              <textarea
                className="mt-3 min-h-[220px] flex-1 rounded-lg border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-teal"
                value={outreach}
                onChange={(e) => setOutreach(e.target.value)}
              />
            </div>
          ) : null}

          {tab === "jd" ? (
            <div className="space-y-3 p-4">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-teal uppercase">
                ■ JD match analysis
              </p>
              {[
                [
                  "About JD Match",
                  "Side-by-side view of the job description and your resume with shared keywords highlighted.",
                ],
                [
                  "Highlighted keywords",
                  "Yellow marks mean the term appears in both the JD and your resume.",
                ],
                [
                  "Tips",
                  "Add missing skills, mirror technical terms, and reuse strong action verbs from the posting.",
                ],
              ].map(([t, b]) => (
                <div
                  key={t}
                  className="rounded-[10px] border border-line bg-bg px-3.5 py-3"
                >
                  <div className="text-[12px] font-bold">{t}</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-mut">{b}</p>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        {/* Right preview */}
        <section className="flex min-h-0 flex-col bg-[#E6EBE9]">
          <div className="flex border-b border-line bg-[#F4F7F6]">
            {(
              [
                ["resume", "Resume"],
                ["cover", "Cover Letter"],
                ["outreach", "Outreach Mail"],
                ["jd", "JD Match"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={[
                  "px-4 py-2.5 text-[12px] font-bold tracking-wide uppercase transition",
                  tab === k
                    ? "border-b-2 border-teal bg-white text-ink"
                    : "text-mut hover:text-ink",
                ].join(" ")}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "jd" ? (
            <div className="border-b border-line bg-white px-4 py-2 font-mono text-[11px] text-mut">
              {keywords.length} keywords extracted · {match.matches.length}{" "}
              matches · Match rate:{" "}
              <span
                className={
                  match.rate >= 50
                    ? "font-bold text-green"
                    : match.rate >= 30
                      ? "font-bold text-amber"
                      : "font-bold text-red"
                }
              >
                {match.rate}%
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-line bg-white px-4 py-2">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.05))}
              >
                −
              </button>
              <span className="font-mono text-[11px]">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setZoom((z) => Math.min(1.2, z + 0.05))}
              >
                +
              </button>
              <span className="ml-auto font-mono text-[10px] text-sub">
                {fam} · {settings.pageSize} · {page.label}
              </span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto p-5">
            {tab === "resume" ? (
              <div
                className="mx-auto origin-top"
                style={{
                  width: page.w * zoom,
                  transform: `scale(1)`,
                }}
              >
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    width: page.w,
                  }}
                >
                  <ResumePreview data={data} settings={settings} />
                </div>
              </div>
            ) : null}

            {tab === "cover" || tab === "outreach" ? (
              <div
                className="mx-auto bg-white shadow-[0_20px_50px_rgba(12,20,19,.12)]"
                style={{
                  width: page.w * zoom,
                  minHeight: page.h * zoom,
                  padding: 40 * zoom,
                }}
              >
                <div
                  className="whitespace-pre-wrap font-[family-name:var(--serifF)] text-[13px] leading-relaxed text-ink"
                  style={{ fontSize: 13 * zoom }}
                >
                  <div className="mb-4 text-center font-[family-name:var(--disp)] text-xl font-bold">
                    {data.name}
                  </div>
                  <div className="mb-6 text-center font-mono text-[10px] text-mut">
                    {[data.contact.email, data.contact.phone, data.contact.linkedin]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {tab === "cover" ? cover : outreach}
                </div>
              </div>
            ) : null}

            {tab === "jd" ? (
              <div className="grid h-full min-h-[420px] gap-3 lg:grid-cols-2">
                <div className="overflow-auto rounded-[11px] border border-line bg-white p-4">
                  <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-sub uppercase">
                    Job description
                  </h3>
                  <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-mut">
                    {jd || "No JD stored — tailor a resume first."}
                  </pre>
                </div>
                <div className="overflow-auto rounded-[11px] border border-line bg-white p-4">
                  <h3 className="mb-2 font-mono text-[10px] font-bold tracking-wider text-sub uppercase">
                    Your resume (matching keywords highlighted)
                  </h3>
                  <div
                    className="font-[family-name:var(--serifF)] text-[13px] leading-relaxed [&_mark.jd-hit]:rounded [&_mark.jd-hit]:bg-[#FFF4A3] [&_mark.jd-hit]:px-0.5"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(
                        [
                          data.name,
                          data.title,
                          data.summary,
                          ...data.exp.flatMap((e) => [
                            `${e.role} at ${e.co}`,
                            ...e.b.map((b) => b.t),
                          ]),
                          data.skills.join(", "),
                        ].join("\n\n"),
                        match.matches,
                      ).replace(/\n/g, "<br/>"),
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="flex h-8 items-center justify-between border-t border-line bg-white px-4 font-mono text-[10px] text-teal-ink">
        <span>Resume builder module</span>
        <span>
          ■ {TPL_META[settings.template].name} · {settings.pageSize}
        </span>
      </footer>

      {toast ? (
        <div className="toast fixed right-4 bottom-12 z-50">{toast}</div>
      ) : null}
    </div>
  );
}
