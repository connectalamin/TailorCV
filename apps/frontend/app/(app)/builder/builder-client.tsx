"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ResumePreview } from "@/components/resume/resume-preview";
import { JdOverlapResume } from "@/components/resume/jd-overlap-resume";
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
  matchKeywords,
  resumeToPlainText,
} from "@/lib/utils/keyword-matcher";
import { toast } from "sonner";

type DocTab = "resume" | "cover" | "outreach" | "jd";

const SETTINGS_KEY = "resume_builder_settings";
const DRAFT_KEY = "resume_builder_draft";
const PANEL_W_KEY = "resume_builder_panel_w";
const PANEL_W_DEFAULT = 360;
const PANEL_W_MIN = 280;
const PANEL_W_MAX = 560;

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

function TplThumb({ tid }: { tid: TemplateId }) {
  const L = ({ w, d = false, cls = "" }: { w: string; d?: boolean; cls?: string }) => (
    <i
      className={`block h-[2px] rounded-full ${d ? "bg-[#4a4a46]" : "bg-[#ddd9d2]"} ${cls}`}
      style={{ width: w }}
    />
  );
  const R = () => <i className="block h-px w-full bg-[#1a1a18]" />;
  const hair = <i className="block h-px w-full bg-[#e2ded6]" />;

  switch (tid) {
    case "latex":
      return (
        <>
          <L w="46%" d cls="mx-auto h-[3px]" />
          <L w="64%" cls="mx-auto" />
          <div className="mt-[2px] flex flex-col gap-[3px]">
            <R />
            <L w="88%" />
            <L w="66%" />
            <R />
            <L w="78%" />
            <L w="52%" />
          </div>
        </>
      );
    case "swiss-single":
      return (
        <>
          <L w="50%" d cls="h-[3px]" />
          {hair}
          <L w="34%" d />
          <L w="90%" />
          <L w="72%" />
          <L w="34%" d cls="mt-[2px]" />
          <L w="84%" />
        </>
      );
    case "swiss-two-column":
      return (
        <div className="flex flex-1 gap-[4px]">
          <div className="flex flex-[2] flex-col gap-[3px]">
            <L w="60%" d />
            <L w="100%" />
            <L w="86%" />
            <L w="92%" />
            <L w="70%" />
          </div>
          <div className="flex flex-1 flex-col gap-[3px] border-l border-[#e2ded6] pl-[4px]">
            <L w="90%" />
            <L w="70%" />
            <L w="84%" />
          </div>
        </div>
      );
    case "modern":
      return (
        <>
          <div className="flex items-center gap-[3px]">
            <i className="block h-[10px] w-[2.5px] rounded-full bg-[#1a1a18]" />
            <L w="42%" d cls="h-[3px]" />
          </div>
          <L w="88%" />
          <L w="74%" />
          <div className="mt-[2px] flex items-center gap-[4px]">
            <L w="26%" d />
            <i className="block h-px flex-1 bg-[#e2ded6]" />
          </div>
          <L w="82%" />
        </>
      );
    case "modern-two-column":
      return (
        <>
          <div className="flex items-center gap-[3px]">
            <i className="block h-[9px] w-[2.5px] rounded-full bg-[#1a1a18]" />
            <L w="38%" d cls="h-[3px]" />
          </div>
          <div className="flex flex-1 gap-[4px]">
            <div className="flex flex-[2] flex-col gap-[3px]">
              <L w="96%" />
              <L w="82%" />
              <L w="90%" />
            </div>
            <div className="flex flex-1 flex-col gap-[3px] border-l border-[#e2ded6] pl-[4px]">
              <L w="88%" />
              <L w="66%" />
            </div>
          </div>
        </>
      );
    case "clean":
      return (
        <>
          <L w="44%" d cls="h-[3px]" />
          <L w="30%" />
          <L w="24%" d cls="mt-[5px]" />
          <L w="90%" />
          <L w="64%" />
        </>
      );
    case "vivid":
      return (
        <div className="flex flex-1 gap-[4px]">
          <div className="flex flex-[35] flex-col gap-[3px] border-r border-[#e2ded6] pr-[4px]">
            <i className="block h-[3px] w-[80%] rounded-full bg-[var(--accent)]" />
            <L w="90%" />
            <L w="68%" />
          </div>
          <div className="flex flex-[65] flex-col gap-[3px]">
            <L w="70%" d />
            <L w="94%" />
            <L w="80%" />
            <L w="88%" />
          </div>
        </div>
      );
    default:
      return null;
  }
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
  const [pages, setPages] = useState(1);
  const [panelW, setPanelW] = useState(PANEL_W_DEFAULT);
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelWRef = useRef(PANEL_W_DEFAULT);

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
    try {
      const raw = localStorage.getItem(PANEL_W_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          const w = Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, n));
          setPanelW(w);
          panelWRef.current = w;
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

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
      toast.message("Open a resume from Dashboard to save");
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
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
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
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  const page = PAGE[settings.pageSize];
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useLayoutEffect(() => {
    if (tab !== "resume") return;
    const el = sheetRef.current?.querySelector<HTMLElement>(".resume-print");
    if (!el) return;
    setPages(Math.max(1, Math.ceil((el.offsetHeight - 2) / page.h)));
  }, [data, settings, tab, page.h]);

  function fitZoom() {
    const w = canvasRef.current?.clientWidth ?? page.w + 80;
    setZoom(Math.min(1.2, Math.max(0.4, (w - 56) / page.w)));
  }

  function onPanelResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWRef.current;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      const next = Math.min(
        PANEL_W_MAX,
        Math.max(PANEL_W_MIN, startW + (ev.clientX - startX)),
      );
      panelWRef.current = next;
      setPanelW(next);
    }

    function onUp() {
      target.releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      try {
        localStorage.setItem(PANEL_W_KEY, String(panelWRef.current));
      } catch {
        /* ignore */
      }
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  const contactBits = [
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    data.contact.linkedin,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const docTitle =
    (data.name ? data.name : null) ||
    record?.title ||
    (record?.role ? record.role : null) ||
    "Untitled resume";

  const docSub = [
    record?.title && record.title !== data.name ? record.title : null,
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
            className="btn btn-ghost"
            onClick={() => {
              setSettings(structuredClone(DEFAULT_TEMPLATE_SETTINGS));
              toast.message("Reset to LaTeX defaults");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void onSave()}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-primary"
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

      <div className="builder-split flex min-h-0 flex-1">
        <aside
          className="builder-side overflow-y-auto bg-[var(--surface-1)]"
          style={{ width: panelW }}
        >
          {tab === "resume" ? (
            <div className="p-4">
              <div className="ctl-group space-y-3">
                <p className="t-caption">Candidate</p>
                <div className="field">
                  <label htmlFor="resume-name">Full name</label>
                  <input
                    id="resume-name"
                    value={data.name}
                    onChange={(e) =>
                      setData((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder="Your name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="resume-title">Headline</label>
                  <input
                    id="resume-title"
                    value={data.title}
                    onChange={(e) =>
                      setData((d) => ({ ...d, title: e.target.value }))
                    }
                    placeholder="e.g. Full-Stack Developer"
                  />
                </div>
              </div>

              <div className="ctl-group">
                <p className="t-caption mb-2">Template</p>
                <div className="tpl-grid">
                  {(Object.keys(TPL_META) as TemplateId[]).map((tid) => (
                    <button
                      key={tid}
                      type="button"
                      className="tpl-thumb"
                      aria-pressed={settings.template === tid}
                      onClick={() => patchSettings({ template: tid })}
                    >
                      <span className="tpl-thumb-page">
                        <TplThumb tid={tid} />
                      </span>
                      <span className="tpl-thumb-name">
                        {TPL_META[tid].name}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="t-body-sm mt-2 text-[var(--text-muted)]">
                  {TPL_META[settings.template].desc}
                </p>
              </div>

              <div className="ctl-group">
                <p className="t-caption mb-2">Page size</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["A4", "LETTER"] as const).map((ps) => (
                    <button
                      key={ps}
                      type="button"
                      className={[
                        "rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium transition",
                        settings.pageSize === ps
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] bg-white hover:border-[var(--border-strong)]",
                      ].join(" ")}
                      onClick={() => patchSettings({ pageSize: ps })}
                    >
                      {ps === "LETTER" ? "US Letter" : ps}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ctl-group space-y-2.5">
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
                      className="builder-range flex-1"
                    />
                    <span className="w-8 text-right font-mono text-[11px] text-[var(--text-muted)]">
                      {settings.margins[k]}
                    </span>
                  </label>
                ))}
              </div>

              <div className="ctl-group space-y-2.5">
                <p className="t-caption">Typography &amp; spacing</p>
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
                            "h-[23px] min-w-[22px] rounded-[4px] font-mono text-[10.5px] font-medium transition",
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
                  className="builder-resize-y min-h-[320px] w-full flex-1 font-[family-name:var(--serifF)] text-[13px] leading-relaxed"
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
                  className="builder-resize-y min-h-[240px] w-full flex-1 text-[13px] leading-relaxed"
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
                  className="builder-resize-y min-h-[240px] w-full flex-1 font-mono text-[12px] leading-relaxed"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job description here…"
                />
              </div>
              <div
                className={[
                  "match-card",
                  !jd.trim()
                    ? "is-empty"
                    : match.rate >= 50
                      ? "is-good"
                      : match.rate >= 30
                        ? "is-ok"
                        : "is-low",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="match-card-label">Match rate</span>
                  <span className="match-card-rate">
                    {jd.trim() ? `${match.rate}%` : "—"}
                  </span>
                </div>
                <p className="match-card-meta">
                  {jd.trim()
                    ? `${keywords.length} keywords · ${match.matches.length} found on resume`
                    : "Paste a JD to score overlap"}
                </p>
                {jd.trim() ? (
                  <div className="match-card-bar" aria-hidden>
                    <span style={{ width: `${Math.min(100, match.rate)}%` }} />
                  </div>
                ) : null}
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

        <div
          className="builder-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize data panel"
          aria-valuenow={panelW}
          aria-valuemin={PANEL_W_MIN}
          aria-valuemax={PANEL_W_MAX}
          onPointerDown={onPanelResizeStart}
        />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab !== "jd" ? (
            <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2">
              <button
                type="button"
                className="btn-ghost btn-icon"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.05))}
              >
                −
              </button>
              <span className="w-10 text-center font-mono text-[11px] text-[var(--text-secondary)]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="btn-ghost btn-icon"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(1.2, z + 0.05))}
              >
                +
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                onClick={fitZoom}
              >
                Fit
              </button>
              <span className="ml-auto flex items-center gap-2.5">
                {tab === "resume" ? (
                  <span
                    className={["page-pill", pages > 1 ? "warn" : "ok"].join(" ")}
                    title="Estimated page count"
                  >
                    {pages} page{pages > 1 ? "s" : ""}
                  </span>
                ) : null}
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {page.label}
                </span>
              </span>
            </div>
          ) : null}

          <div
            ref={canvasRef}
            className="builder-canvas min-h-0 flex-1 overflow-auto p-5"
          >
            {tab === "resume" ? (
              <div
                ref={sheetRef}
                key={settings.template}
                className="sheet-in mx-auto"
                style={{ width: page.w * zoom, minHeight: page.h * zoom }}
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
              <div className="mx-auto grid max-w-[1280px] gap-4 lg:grid-cols-2">
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
                  <div className="max-h-[70vh] overflow-auto bg-[var(--surface-0)] p-3 sm:p-4">
                    {jd.trim() ? (
                      <JdOverlapResume
                        data={data}
                        keywords={match.matches}
                        rate={match.rate}
                      />
                    ) : (
                      <p className="t-body-sm p-2 text-[var(--text-muted)]">
                        Paste a job description to see formatted resume overlap.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
