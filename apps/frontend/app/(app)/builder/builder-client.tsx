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
  defaultCoverLetter,
  defaultOutreachMail,
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

const DOC_TABS: { id: DocTab; label: string }[] = [
  { id: "resume", label: "Resume" },
  { id: "cover", label: "Cover letter" },
  { id: "outreach", label: "Outreach mail" },
  { id: "jd", label: "JD match" },
];

function loadSettings(): TemplateSettings {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TemplateSettings>;
      return { ...DEFAULT_TEMPLATE_SETTINGS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_TEMPLATE_SETTINGS);
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
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
  const [subject, setSubject] = useState("");
  const [jd, setJd] = useState("");
  const [zoom, setZoom] = useState(0.78);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const id = params.get("id");

  const load = useCallback(async () => {
    setSettings(loadSettings());
    if (!id) {
      const sample = getSampleResume();
      setData(sample);
      setCover(defaultCoverLetter(sample));
      setOutreach(defaultOutreachMail(sample));
      setSubject(`Interest in ${sample.title}`);
      return;
    }
    try {
      const r = await fetchResume(id);
      setRecord(r);
      setData(r.data);
      setCover(r.coverLetter || defaultCoverLetter(r.data, r.role));
      setOutreach(r.outreachMessage || defaultOutreachMail(r.data, r.role));
      setSubject(
        r.company
          ? `Application — ${r.role || r.data.title} at ${r.company}`
          : `Interest in ${r.role || r.data.title}`,
      );
      setJd(r.jobDescription || "");
    } catch {
      const sample = getSampleResume();
      setData(sample);
      setCover(defaultCoverLetter(sample));
      setOutreach(defaultOutreachMail(sample));
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
      JSON.stringify({ data, cover, outreach, subject, jd, id }),
    );
  }, [data, cover, outreach, subject, jd, id]);

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
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Download failed");
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
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const contactBits = [
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    data.contact.linkedin,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const docTitle =
    record?.title ||
    (record?.role ? record.role : null) ||
    data.name ||
    "Untitled resume";

  const docSub = [
    data.name,
    TPL_META[settings.template].name,
    settings.pageSize === "LETTER" ? "US Letter" : "A4",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-0)]">
      <header className="builder-topbar">
        <div className="builder-topbar-meta min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="t-body-sm text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]"
            >
              Dashboard
            </Link>
            <span className="t-body-sm text-[var(--text-muted)]" aria-hidden>
              /
            </span>
            <p className="t-caption text-[var(--accent)]">Builder</p>
          </div>
          <h1 className="t-h1 truncate text-[var(--text-primary)]">{docTitle}</h1>
          <p className="t-body-sm truncate text-[var(--text-muted)]">{docSub}</p>
        </div>
        <div className="builder-topbar-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setSettings(structuredClone(DEFAULT_TEMPLATE_SETTINGS));
              setToast("Reset to LaTeX ATS defaults");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void onSave()}
          >
            Save
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !id}
            onClick={() => void onDownload()}
          >
            {busy ? "Working…" : "Download PDF"}
          </button>
        </div>
      </header>

      <div className="builder-tabs" role="tablist" aria-label="Document type">
        {DOC_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="builder-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
        <aside className="overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-1)]">
          {tab === "resume" ? (
            <div className="space-y-5 p-4">
              <p className="t-caption">Template</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TPL_META) as TemplateId[]).map((tid) => (
                  <button
                    key={tid}
                    type="button"
                    className={[
                      "rounded-[var(--radius-md)] border px-2 py-2 text-left text-[12px] font-medium transition",
                      settings.template === tid
                        ? "border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                    ].join(" ")}
                    onClick={() => patchSettings({ template: tid })}
                  >
                    {TPL_META[tid].name}
                  </button>
                ))}
              </div>

              <div>
                <p className="t-caption mb-2">Page size</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["A4", "LETTER"] as const).map((ps) => (
                    <button
                      key={ps}
                      type="button"
                      className={[
                        "rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium",
                        settings.pageSize === ps
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] bg-white",
                      ].join(" ")}
                      onClick={() => patchSettings({ pageSize: ps })}
                    >
                      {ps === "LETTER" ? "US Letter" : ps}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="t-caption">Margins (mm)</p>
                {(
                  [
                    ["top", "Top"],
                    ["bottom", "Bottom"],
                    ["left", "Left"],
                    ["right", "Right"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-[12px]">
                    <span className="w-12 text-[var(--text-secondary)]">
                      {label}
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={30}
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
                    <span className="w-8 font-mono text-[var(--text-muted)]">
                      {settings.margins[k]}
                    </span>
                  </label>
                ))}
              </div>

              {(
                [
                  ["sectionSpacing", "Section"],
                  ["itemSpacing", "Items"],
                  ["lineHeight", "Lines"],
                  ["fontSize", "Base"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-[12px] font-medium">{label}</span>
                  <div className="flex gap-0.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-0)] p-0.5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={[
                          "h-[23px] min-w-[22px] rounded-[4px] font-mono text-[10.5px] font-medium",
                          settings[key] === v
                            ? "bg-[var(--text-primary)] text-white"
                            : "text-[var(--text-secondary)] hover:bg-white",
                        ].join(" ")}
                        onClick={() =>
                          patchSettings({
                            [key]: v,
                          } as Partial<TemplateSettings>)
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
            <div className="flex h-full flex-col gap-3 p-4">
              <div>
                <p className="t-caption">Cover letter</p>
                <p className="t-body-sm mt-1 text-[var(--text-secondary)]">
                  Formal one-page letter. Mirror keywords from the JD.
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="t-body-sm text-[var(--text-muted)]">
                  {wordCount(cover)} words
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setCover(defaultCoverLetter(data, record?.role))
                  }
                >
                  Insert template
                </button>
              </div>
              <div className="field flex-1">
                <textarea
                  className="min-h-[320px] flex-1 resize-none font-[family-name:var(--serifF)] text-[13px] leading-relaxed"
                  value={cover}
                  onChange={(e) => setCover(e.target.value)}
                  placeholder="Dear Hiring Manager,…"
                />
              </div>
              <p className="t-body-sm text-[var(--text-muted)]">
                Aim for 250–400 words. Keep black text only for ATS paste.
              </p>
            </div>
          ) : null}

          {tab === "outreach" ? (
            <div className="flex h-full flex-col gap-3 p-4">
              <div>
                <p className="t-caption">Outreach mail</p>
                <p className="t-body-sm mt-1 text-[var(--text-secondary)]">
                  Short cold email / LinkedIn note. 80–120 words works best.
                </p>
              </div>
              <div className="field">
                <label htmlFor="outreach-subject">Subject</label>
                <input
                  id="outreach-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Interest in Role — Company"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="t-body-sm text-[var(--text-muted)]">
                  {wordCount(outreach)} words
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setOutreach(defaultOutreachMail(data, record?.role))
                  }
                >
                  Insert template
                </button>
              </div>
              <div className="field flex-1">
                <textarea
                  className="min-h-[240px] flex-1 resize-none text-[13px] leading-relaxed"
                  value={outreach}
                  onChange={(e) => setOutreach(e.target.value)}
                  placeholder="Hi — I saw the opening…"
                />
              </div>
            </div>
          ) : null}

          {tab === "jd" ? (
            <div className="flex h-full flex-col gap-3 p-4">
              <div>
                <p className="t-caption">Job description</p>
                <p className="t-body-sm mt-1 text-[var(--text-secondary)]">
                  Paste the posting. We extract keywords and score overlap.
                </p>
              </div>
              <div className="field flex-1">
                <textarea
                  className="min-h-[220px] flex-1 resize-none font-mono text-[12px] leading-relaxed"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job description here…"
                />
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="t-body-sm font-medium">Match rate</span>
                  <span
                    className="t-h2"
                    style={{
                      color:
                        match.rate >= 50
                          ? "var(--success)"
                          : match.rate >= 30
                            ? "var(--warning)"
                            : "var(--danger)",
                    }}
                  >
                    {jd.trim() ? `${match.rate}%` : "—"}
                  </span>
                </div>
                <p className="t-body-sm mt-1 text-[var(--text-muted)]">
                  {keywords.length} keywords · {match.matches.length} found on
                  resume
                </p>
              </div>
              {match.missing.length ? (
                <div>
                  <p className="t-caption mb-2">Missing from resume</p>
                  <div className="flex flex-wrap gap-1.5">
                    {match.missing.slice(0, 24).map((k) => (
                      <span
                        key={k}
                        className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {match.matches.length ? (
                <div>
                  <p className="t-caption mb-2">Matched</p>
                  <div className="flex flex-wrap gap-1.5">
                    {match.matches.slice(0, 24).map((k) => (
                      <span
                        key={k}
                        className="rounded-[var(--radius-sm)] bg-[var(--success-bg)] px-2 py-0.5 text-[11px] text-[var(--success)]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section className="flex min-h-0 flex-col">
          {tab !== "jd" ? (
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.05))}
              >
                −
              </button>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setZoom((z) => Math.min(1.2, z + 0.05))}
              >
                +
              </button>
              <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
                {page.label}
              </span>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto p-5">
            {tab === "resume" ? (
              <div
                className="mx-auto"
                style={{ width: page.w * zoom, height: page.h * zoom }}
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

            {tab === "cover" ? (
              <div
                className="mx-auto bg-white shadow-[0_1px_2px_rgba(15,23,21,0.08),0_24px_60px_-28px_rgba(15,23,21,0.35)]"
                style={{
                  width: page.w * zoom,
                  minHeight: page.h * zoom,
                  padding: `${28 * zoom}px ${36 * zoom}px`,
                }}
              >
                <div
                  className="font-[family-name:var(--serifF)] text-[#111827]"
                  style={{ fontSize: 11 * zoom, lineHeight: 1.55 }}
                >
                  <div
                    className="text-center font-bold"
                    style={{ fontSize: 16 * zoom }}
                  >
                    {data.name}
                  </div>
                  <div
                    className="mt-1 text-center text-[#4b5563]"
                    style={{ fontSize: 10 * zoom }}
                  >
                    {contactBits}
                  </div>
                  <div
                    className="mx-auto mt-3 border-b border-[#111827]"
                    style={{ width: "100%" }}
                  />
                  <p className="mt-6">{today}</p>
                  <p className="mt-4 text-[#4b5563]">
                    Hiring Manager
                    {record?.company ? (
                      <>
                        <br />
                        {record.company}
                      </>
                    ) : null}
                  </p>
                  <div className="mt-6 whitespace-pre-wrap">{cover}</div>
                </div>
              </div>
            ) : null}

            {tab === "outreach" ? (
              <div
                className="mx-auto overflow-hidden rounded-[12px] border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,21,0.06)]"
                style={{ width: Math.min(640, page.w * zoom) }}
              >
                <div className="border-b border-[var(--border)] bg-[var(--surface-0)] px-4 py-3">
                  <p className="t-caption">Message preview</p>
                </div>
                <div className="space-y-3 border-b border-[var(--border)] px-4 py-3 text-[13px]">
                  <div className="flex gap-3">
                    <span className="w-14 shrink-0 text-[var(--text-muted)]">
                      To
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      hiring@{record?.company?.toLowerCase().replace(/\s+/g, "") || "company"}
                      .com
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-14 shrink-0 text-[var(--text-muted)]">
                      From
                    </span>
                    <span>
                      {data.name} &lt;{data.contact.email || "you@email.com"}
                      &gt;
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-14 shrink-0 text-[var(--text-muted)]">
                      Subject
                    </span>
                    <span className="font-medium">{subject || "(no subject)"}</span>
                  </div>
                </div>
                <div className="whitespace-pre-wrap px-4 py-5 text-[14px] leading-relaxed text-[var(--text-primary)]">
                  {outreach || (
                    <span className="text-[var(--text-muted)]">
                      Write your outreach on the left…
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "jd" ? (
              <div className="mx-auto grid max-w-[1140px] gap-4 lg:grid-cols-2">
                <div className="panel overflow-hidden p-0">
                  <div className="border-b border-[var(--border)] px-4 py-2.5">
                    <h3 className="t-h3">Job description</h3>
                  </div>
                  <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    {jd.trim() ||
                      "Paste a job description in the left panel to analyze keywords."}
                  </pre>
                </div>
                <div className="panel overflow-hidden p-0">
                  <div className="border-b border-[var(--border)] px-4 py-2.5">
                    <h3 className="t-h3">Resume overlap</h3>
                    <p className="t-body-sm text-[var(--text-muted)]">
                      Highlighted terms appear in both documents
                    </p>
                  </div>
                  <div
                    className="max-h-[70vh] overflow-auto p-4 font-[family-name:var(--serifF)] text-[13px] leading-relaxed text-[#111827] [&_mark.jd-hit]:bg-[#FFF4A3] [&_mark.jd-hit]:px-0.5"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(
                        [
                          data.name,
                          data.summary,
                          ...data.edu.map(
                            (e) => `${e.role}\n${e.co}\n${e.b.map((b) => b.t).join("\n")}`,
                          ),
                          ...data.skills,
                          ...data.projects.map(
                            (e) =>
                              `${e.role}\n${e.b.map((b) => b.t).join("\n")}`,
                          ),
                          ...data.exp.map(
                            (e) =>
                              `${e.role} at ${e.co}\n${e.b.map((b) => b.t).join("\n")}`,
                          ),
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

      {toast ? (
        <div className="toast fixed right-4 bottom-12 z-50">{toast}</div>
      ) : null}
    </div>
  );
}
