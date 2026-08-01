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
import { ContentCheckerPanel } from "@/components/resume/content-checker-panel";
import {
  aiAtsChat,
  aiContentCheck,
  aiContentFix,
  aiGenerateCover,
  aiGenerateOutreach,
  aiMatchJd,
  downloadResumePdf,
  fetchResume,
  getSampleResume,
  improveResume,
  restructureResume,
  updateResume,
  uploadJobDescriptions,
} from "@/lib/api";
import {
  DEFAULT_TEMPLATE_SETTINGS,
  PAGE,
  defaultCoverLetter,
  defaultOutreachMail,
} from "@/lib/mock/data";
import type {
  AiMatchCategory,
  AtsChatMessage,
  ContentCheckResult,
  ContentIssue,
  KeywordHit,
  ResumeData,
  ResumeRecord,
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
  { id: "jd", label: "ATS fit" },
];

function loadSettings(): TemplateSettings {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TemplateSettings>;
      return {
        ...DEFAULT_TEMPLATE_SETTINGS,
        ...parsed,
        template: "latex",
        projectsTwoColumn:
          parsed.projectsTwoColumn ??
          DEFAULT_TEMPLATE_SETTINGS.projectsTwoColumn,
      };
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiKind, setAiKind] = useState<
    null | "cover" | "outreach" | "match" | "retailor" | "content" | "restructure"
  >(null);
  const [pages, setPages] = useState(1);
  const [panelW, setPanelW] = useState(PANEL_W_DEFAULT);
  const [aiNotes, setAiNotes] = useState("");
  const [aiKeywords, setAiKeywords] = useState<KeywordHit[]>([]);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiHeuristicRate, setAiHeuristicRate] = useState<number | null>(null);
  const [aiKeywordFound, setAiKeywordFound] = useState<number | null>(null);
  const [aiKeywordTotal, setAiKeywordTotal] = useState<number | null>(null);
  const [aiMatchedSkills, setAiMatchedSkills] = useState<string[]>([]);
  const [aiCategories, setAiCategories] = useState<AiMatchCategory[]>([]);
  const [aiMissingSkills, setAiMissingSkills] = useState<string[]>([]);
  const [aiSource, setAiSource] = useState<"llm" | "keyword" | null>(null);
  const [keywordSource, setKeywordSource] = useState<"ai" | "local" | null>(
    null,
  );
  const [entryLevelNote, setEntryLevelNote] = useState("");
  const [softSkillsMissing, setSoftSkillsMissing] = useState<string[]>([]);
  const [contentCheck, setContentCheck] = useState<ContentCheckResult | null>(
    null,
  );
  const [atsChat, setAtsChat] = useState<AtsChatMessage[]>([]);
  const [atsChatInput, setAtsChatInput] = useState("");
  const [atsChatBusy, setAtsChatBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelWRef = useRef(PANEL_W_DEFAULT);
  const atsReqRef = useRef(0);
  const lastAtsKeyRef = useRef("");

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
  // Official score is LLM when available; keyword % is evidence only (never the headline competitor).
  const hasOfficial = aiScore != null;
  const isKeywordFallback = aiSource === "keyword";
  const displayRate = hasOfficial
    ? (aiScore as number)
    : jd.trim()
      ? match.rate
      : 0;
  const coverageFound = aiKeywordFound ?? match.matches.length;
  const coverageTotal = aiKeywordTotal ?? keywords.length;
  const skeletonMatched =
    aiMatchedSkills.length > 0 ? aiMatchedSkills : match.matches;
  const skeletonMissing =
    aiMissingSkills.length > 0 ? aiMissingSkills : match.missing;

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
      const blob = await downloadResumePdf(id, {
        pageSize: settings.pageSize,
        marginIn: Number((settings.margins.top / 25.4).toFixed(2)),
        projectsTwoColumn: settings.projectsTwoColumn,
        // Dense two-column layout opts out of strict ATS single-column mode.
        atsSafe: !settings.projectsTwoColumn,
      });
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

  async function runAi<T>(
    label: string,
    fn: () => Promise<T>,
    kind:
      | "cover"
      | "outreach"
      | "match"
      | "retailor"
      | "content"
      | "restructure" = "content",
  ): Promise<T | null> {
    if (!id) {
      toast.message("Open a resume from Dashboard first");
      return null;
    }
    setAiBusy(true);
    setAiKind(kind);
    try {
      const result = await fn();
      toast.success(label);
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
      return null;
    } finally {
      setAiBusy(false);
      setAiKind(null);
    }
  }

  async function onRestructure() {
    const next = await runAi(
      "Structure rebuilt",
      () => restructureResume(id!),
      "restructure",
    );
    if (next) {
      setData(next.data);
      setRecord(next);
    }
  }

  async function onContentCheck(): Promise<ContentCheckResult | null> {
    if (!id) {
      toast.message("Open a resume from Dashboard first");
      return null;
    }
    const res = await runAi(
      "Content check ready",
      () => aiContentCheck(id, { jd, data }),
      "content",
    );
    if (res) setContentCheck(res);
    return res;
  }

  async function onContentFix(issues: ContentIssue[]) {
    if (!id) {
      toast.message("Open a resume from Dashboard first");
      return;
    }
    const next = await runAi(
      "Issues fixed — Save to persist",
      () => aiContentFix(id, { jd, data, issues }),
      "content",
    );
    if (next) {
      setData(next);
      const again = await aiContentCheck(id, { jd, data: next });
      setContentCheck(again);
    }
  }

  async function onRetailor() {
    if (!id) {
      toast.message("Open a resume from Dashboard first");
      return;
    }
    if (jd.trim().length < 40) {
      toast.error("Paste a fuller job posting in the ATS fit tab first");
      return;
    }
    setAiBusy(true);
    setAiKind("retailor");
    try {
      const { job_id } = await uploadJobDescriptions([jd], id);
      const res = await improveResume(id, job_id, jd, "balanced");
      if (res.data) setData(res.data);
      setAiKeywords(res.keywords || []);
      toast.success("Re-tailored draft applied to editor — Save to persist");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-tailor failed");
    } finally {
      setAiBusy(false);
      setAiKind(null);
    }
  }

  async function onGenCover() {
    const res = await runAi(
      "Cover letter generated",
      () => aiGenerateCover(id!, { jd, data }),
      "cover",
    );
    if (res?.cover_letter) setCover(res.cover_letter);
  }

  async function onGenOutreach() {
    const res = await runAi(
      "Outreach generated",
      () => aiGenerateOutreach(id!, { jd, data }),
      "outreach",
    );
    if (res?.outreach_message) setOutreach(res.outreach_message);
  }

  async function onAiMatch(opts?: { silent?: boolean }) {
    if (!id) {
      if (!opts?.silent) toast.message("Open a resume from Dashboard first");
      return;
    }
    const jdText = jd.trim();
    if (jdText.length < 40) {
      if (!opts?.silent) toast.error("Paste a fuller job posting first");
      return;
    }
    const key = `${id}\n${jdText}`;
    if (opts?.silent && key === lastAtsKeyRef.current && aiScore != null) {
      return;
    }
    const req = ++atsReqRef.current;
    setAiBusy(true);
    setAiKind("match");
    try {
      const res = await aiMatchJd(id, jdText, data);
      if (req !== atsReqRef.current) return;
      setAiKeywords(res.keywords || []);
      setAiNotes(res.notes || "");
      setAiScore(typeof res.score === "number" ? res.score : null);
      setAiHeuristicRate(
        typeof res.heuristicRate === "number" ? res.heuristicRate : null,
      );
      setAiKeywordFound(
        typeof res.keywordFound === "number" ? res.keywordFound : null,
      );
      setAiKeywordTotal(
        typeof res.keywordTotal === "number" ? res.keywordTotal : null,
      );
      setAiMatchedSkills(res.matchedSkills || []);
      setAiCategories(res.categories || []);
      setAiMissingSkills(res.missingSkills || []);
      setAiSource(res.source === "keyword" ? "keyword" : "llm");
      setKeywordSource(
        res.keywordSource === "ai" || res.keywordSource === "local"
          ? res.keywordSource
          : null,
      );
      setEntryLevelNote(res.softSkillsNote || "");
      setSoftSkillsMissing(res.softSkillsMissing || []);
      lastAtsKeyRef.current = key;
      if (!opts?.silent) toast.success("ATS fit updated");
    } catch (e) {
      if (req !== atsReqRef.current) return;
      toast.error(e instanceof Error ? e.message : "AI ATS check failed");
    } finally {
      if (req === atsReqRef.current) {
        setAiBusy(false);
        setAiKind(null);
      }
    }
  }

  async function onAtsChatSend(rawMessage?: string) {
    if (!id) {
      toast.message("Open a resume from Dashboard first");
      return;
    }
    const message = (rawMessage ?? atsChatInput).trim();
    if (message.length < 2) return;
    if (jd.trim().length < 40) {
      toast.error("Paste a fuller job posting first");
      return;
    }
    const history = atsChat.slice(-6);
    const nextHistory: AtsChatMessage[] = [
      ...atsChat,
      { role: "user", content: message },
    ];
    setAtsChat(nextHistory);
    setAtsChatInput("");
    setAtsChatBusy(true);
    try {
      const res = await aiAtsChat(id, {
        message,
        jd,
        data,
        missingSkills: aiMissingSkills.length
          ? aiMissingSkills
          : match.missing.slice(0, 12),
        history,
      });
      setAtsChat((prev) => [
        ...prev,
        { role: "assistant", content: res.reply || "Done." },
      ]);
      if (res.applied && res.data) {
        setData(res.data);
        lastAtsKeyRef.current = "";
        toast.success("Resume updated — click Check ATS when ready");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ATS coach failed");
      setAtsChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry — that request failed. Check Settings → API keys.",
        },
      ]);
    } finally {
      setAtsChatBusy(false);
    }
  }

  const page = PAGE[settings.pageSize];
  /** Extra white band above/below each page frame (preview only). */
  const PAGE_EDGE = 36;
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

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
    "LaTeX ATS",
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

              <div className="ctl-group space-y-2">
                <ContentCheckerPanel
                  resumeId={id}
                  data={data}
                  jd={jd}
                  busy={aiBusy}
                  result={contentCheck}
                  onCheck={onContentCheck}
                  onFix={onContentFix}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={aiBusy || !id}
                    onClick={() => void onRestructure()}
                  >
                    Re-parse structure
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={aiBusy || !id}
                    onClick={() => void onRetailor()}
                  >
                    {aiBusy && aiKind === "retailor" ? "Working…" : "Re-tailor for JD"}
                  </button>
                </div>
              </div>

              <div className="ctl-group space-y-3">
                <p className="t-caption">Objective</p>
                <div className="field">
                  <textarea
                    className="builder-resize-y min-h-[88px] w-full text-[13px]"
                    value={data.summary}
                    onChange={(e) =>
                      setData((d) => ({ ...d, summary: e.target.value }))
                    }
                    placeholder="1–2 sentence objective"
                  />
                </div>
              </div>

              <div className="ctl-group space-y-3">
                <p className="t-caption">Technical Skills</p>
                <div className="field">
                  <textarea
                    className="builder-resize-y min-h-[100px] w-full font-mono text-[12px]"
                    value={data.skills.join("\n")}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        skills: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder={"Languages: Python, C++\nFrontend: React, Next.js"}
                  />
                </div>
                <p className="hint">One category per line: Category: items</p>
              </div>

              <div className="ctl-group space-y-3">
                <p className="t-caption">Experience bullets</p>
                {data.exp.map((ex, ei) => (
                  <div key={`${ex.role}-${ei}`} className="field">
                    <label>
                      {ex.role || "Role"} — {ex.co || "Company"}
                    </label>
                    <textarea
                      className="builder-resize-y min-h-[72px] w-full text-[12px]"
                      value={(ex.b || []).map((b) => b.t).join("\n")}
                      onChange={(e) => {
                        const lines = e.target.value
                          .split("\n")
                          .map((t) => t.trim())
                          .filter(Boolean)
                          .map((t) => ({ t }));
                        setData((d) => {
                          const exp = [...d.exp];
                          exp[ei] = { ...exp[ei], b: lines };
                          return { ...d, exp };
                        });
                      }}
                    />
                  </div>
                ))}
                {!data.exp.length ? (
                  <p className="t-body-sm text-[var(--text-muted)]">
                    No experience entries — use Re-parse structure after upload.
                  </p>
                ) : null}
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

              <div className="ctl-group">
                <p className="t-caption mb-2">Projects layout</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      [false, "1 column"],
                      [true, "2 columns"],
                    ] as const
                  ).map(([two, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={[
                        "rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium transition",
                        settings.projectsTwoColumn === two
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] bg-white hover:border-[var(--border-strong)]",
                      ].join(" ")}
                      onClick={() => patchSettings({ projectsTwoColumn: two })}
                    >
                      {label}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="t-body-sm text-[var(--text-muted)]">
                  {wordCount(cover)} words
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setCover(defaultCoverLetter(data, record?.role))
                    }
                  >
                    Insert template
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={aiBusy || !id}
                    onClick={() => void onGenCover()}
                  >
                    {aiBusy && aiKind === "cover"
                      ? "Generating…"
                      : "AI generate"}
                  </button>
                </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="t-body-sm text-[var(--text-muted)]">
                  {wordCount(outreach)} words
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setOutreach(defaultOutreachMail(data, record?.role))
                    }
                  >
                    Insert template
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={aiBusy || !id}
                    onClick={() => void onGenOutreach()}
                  >
                    {aiBusy && aiKind === "outreach"
                      ? "Generating…"
                      : "AI generate"}
                  </button>
                </div>
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
            <div className="ats-panel">
              <header className="ats-panel-hero">
                <div className="ats-panel-hero-top">
                  <div>
                    <p className="ats-panel-kicker">ATS fit</p>
                    <p className="ats-panel-hero-meta">
                      {!jd.trim()
                        ? "Paste a posting, then Check ATS"
                        : aiBusy && aiKind === "match"
                          ? `Scanning… ${coverageFound}/${Math.max(coverageTotal, 1)}`
                          : hasOfficial
                            ? coverageTotal > 0
                              ? `${coverageFound}/${coverageTotal} skills · via ${
                                  keywordSource === "ai"
                                    ? "AI"
                                    : keywordSource === "local"
                                      ? "patterns"
                                      : "matcher"
                                }`
                              : isKeywordFallback
                                ? "Keyword coverage"
                                : "LLM score ready"
                            : jd.trim().length < 40
                              ? "Paste a fuller posting to enable Check ATS"
                              : "Click Check ATS for an AI score"}
                    </p>
                  </div>
                  <div
                    className={[
                      "ats-panel-score",
                      !jd.trim()
                        ? "is-empty"
                        : displayRate >= 70
                          ? "is-good"
                          : displayRate >= 45
                            ? "is-ok"
                            : "is-low",
                    ].join(" ")}
                  >
                    <span className="ats-panel-score-n">
                      {jd.trim() ? displayRate : "—"}
                    </span>
                    <span className="ats-panel-score-u">
                      {jd.trim() ? "%" : ""}
                    </span>
                  </div>
                </div>
                {jd.trim() ? (
                  <div className="ats-panel-meter" aria-hidden>
                    <span style={{ width: `${Math.min(100, displayRate)}%` }} />
                  </div>
                ) : null}
                <div className="ats-panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary ats-panel-action-primary"
                    disabled={aiBusy || !id || jd.trim().length < 40}
                    onClick={() => {
                      lastAtsKeyRef.current = "";
                      void onAiMatch();
                    }}
                  >
                    {aiBusy && aiKind === "match"
                      ? "Analyzing…"
                      : hasOfficial
                        ? "Re-check"
                        : "Check ATS"}
                  </button>
                </div>
              </header>

              {isKeywordFallback && hasOfficial ? (
                <div className="ats-panel-banner is-warn">
                  AI score unavailable — keyword coverage only. Fix API key in
                  Settings, then re-check.
                </div>
              ) : null}

              {entryLevelNote ? (
                <div className="ats-panel-banner is-info">
                  {entryLevelNote}
                  {softSkillsMissing.length
                    ? ` Missing on resume: ${softSkillsMissing.join(", ")}.`
                    : ""}
                </div>
              ) : null}

              <section className="ats-panel-card">
                <div className="ats-panel-card-head">
                  <h3 className="ats-panel-card-title">Target job</h3>
                  <span className="ats-panel-card-count">
                    {jd.trim().length
                      ? `${jd.trim().length.toLocaleString()} chars`
                      : "Empty"}
                  </span>
                </div>
                <textarea
                  className="ats-panel-jd"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job posting here…"
                  rows={jd.trim().length > 80 ? 6 : 8}
                />
              </section>

              {jd.trim() &&
              (skeletonMatched.length > 0 || skeletonMissing.length > 0) ? (
                <section className="ats-panel-card">
                  <div className="ats-panel-card-head">
                    <h3 className="ats-panel-card-title">Skills coverage</h3>
                  </div>
                  {skeletonMatched.length ? (
                    <div className="ats-panel-skill-block">
                      <div className="ats-panel-skill-label is-ok">
                        <span>Found</span>
                        <span>{skeletonMatched.length}</span>
                      </div>
                      <div className="ats-panel-chips">
                        {skeletonMatched.slice(0, 24).map((k) => (
                          <span key={`m-${k}`} className="ats-chip is-ok">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {skeletonMissing.length ? (
                    <div className="ats-panel-skill-block">
                      <div className="ats-panel-skill-label is-gap">
                        <span>Gap</span>
                        <span>{skeletonMissing.length}</span>
                      </div>
                      <div className="ats-panel-chips">
                        {skeletonMissing.slice(0, 24).map((k) => (
                          <span key={`x-${k}`} className="ats-chip is-gap">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {aiCategories.length && !isKeywordFallback ? (
                <section className="ats-panel-card">
                  <div className="ats-panel-card-head">
                    <h3 className="ats-panel-card-title">Breakdown</h3>
                  </div>
                  <ul className="ats-panel-bars">
                    {aiCategories.map((c) => (
                      <li key={c.id} className="ats-panel-bar-row">
                        <div className="ats-panel-bar-meta">
                          <span>{c.label}</span>
                          <span className="ats-panel-bar-n">{c.score}%</span>
                        </div>
                        <div className="ats-panel-bar-track" aria-hidden>
                          <span
                            className={
                              c.score >= 70
                                ? "is-good"
                                : c.score >= 45
                                  ? "is-ok"
                                  : "is-low"
                            }
                            style={{ width: `${Math.min(100, c.score)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {aiNotes && !isKeywordFallback ? (
                <section className="ats-panel-card">
                  <div className="ats-panel-card-head">
                    <h3 className="ats-panel-card-title">AI notes</h3>
                  </div>
                  <ul className="ats-panel-notes">
                    {aiNotes
                      .split(/\n+/)
                      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
                      .filter(Boolean)
                      .map((line, i) => (
                        <li key={`note-${i}`}>{line}</li>
                      ))}
                  </ul>
                </section>
              ) : null}

              <section
                className={[
                  "ats-panel-card ats-coach",
                  atsChatBusy ? "is-busy" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-busy={atsChatBusy}
              >
                <div className="ats-panel-card-head">
                  <h3 className="ats-panel-card-title">ATS coach</h3>
                  <span className="ats-coach-hint">Save to keep</span>
                </div>
                <div className="ats-coach-actions">
                  <button
                    type="button"
                    className="ats-coach-chip"
                    disabled={atsChatBusy || aiBusy || !id || jd.trim().length < 40}
                    onClick={() =>
                      void onAtsChatSend(
                        "Raise my ATS fit score for this job. Weave in missing skills I can truthfully claim.",
                      )
                    }
                  >
                    Raise score
                  </button>
                  <button
                    type="button"
                    className="ats-coach-chip"
                    disabled={
                      atsChatBusy ||
                      aiBusy ||
                      !id ||
                      jd.trim().length < 40 ||
                      !skeletonMissing.length
                    }
                    onClick={() =>
                      void onAtsChatSend(
                        `Close the skills gap using these missing terms where truthful: ${skeletonMissing.slice(0, 10).join(", ")}.`,
                      )
                    }
                  >
                    Close gap
                  </button>
                </div>
                {atsChat.length ? (
                  <div className="ats-coach-log" aria-live="polite">
                    {atsChat.map((m, i) => (
                      <div
                        key={`${m.role}-${i}`}
                        className={`ats-coach-bubble is-${m.role}`}
                      >
                        {m.content}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ats-coach-empty">
                    Ask the coach to raise score or close gaps — edits land in
                    the editor.
                  </p>
                )}
                <div className="ats-coach-compose">
                  <input
                    type="text"
                    className="ats-coach-input"
                    value={atsChatInput}
                    disabled={atsChatBusy || !id}
                    placeholder="Ask coach…"
                    aria-label="Message ATS coach"
                    onChange={(e) => setAtsChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void onAtsChatSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="ats-coach-send"
                    disabled={
                      atsChatBusy ||
                      !id ||
                      atsChatInput.trim().length < 2 ||
                      jd.trim().length < 40
                    }
                    onClick={() => void onAtsChatSend()}
                    aria-label={atsChatBusy ? "Sending" : "Send"}
                  >
                    {atsChatBusy ? "…" : "Send"}
                  </button>
                </div>
                {atsChatBusy ? (
                  <div className="ats-coach-overlay" role="status">
                    <span className="ats-coach-spinner" aria-hidden />
                    <span className="ats-coach-overlay-label">Coach is working…</span>
                  </div>
                ) : null}
              </section>
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
              <div className="resume-page-stack mx-auto">
                {/* Off-screen measure sheet for page count */}
                <div
                  ref={sheetRef}
                  aria-hidden
                  className="pointer-events-none absolute -left-[9999px] top-0"
                  style={{ width: page.w }}
                >
                  <ResumePreview data={data} settings={settings} />
                </div>
                {Array.from({ length: pages }, (_, i) => (
                  <div
                    key={`${settings.template}-p${i}`}
                    className="resume-page-frame"
                    style={{
                      width: page.w * zoom,
                      height: (page.h + PAGE_EDGE * 2) * zoom,
                      paddingTop: PAGE_EDGE * zoom,
                      paddingBottom: PAGE_EDGE * zoom,
                      boxSizing: "border-box",
                    }}
                  >
                    {pages > 1 ? (
                      <span
                        className="resume-page-label"
                        style={{ top: Math.max(6, PAGE_EDGE * zoom * 0.25) }}
                      >
                        {i + 1} / {pages}
                      </span>
                    ) : null}
                    <div
                      className="resume-page-clip"
                      style={{
                        height: page.h * zoom,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          transform: `translateY(${-i * page.h * zoom}px) scale(${zoom})`,
                          transformOrigin: "top left",
                          width: page.w,
                        }}
                      >
                        <ResumePreview data={data} settings={settings} />
                      </div>
                    </div>
                  </div>
                ))}
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
                    <h3 className="t-h3">Target job</h3>
                  </div>
                  <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-[var(--text-primary)]">
                    {jd.trim() ||
                      "Paste a job posting in the left panel to analyze fit."}
                  </pre>
                </div>
                <div className="panel overflow-hidden p-0">
                  <div className="max-h-[70vh] overflow-auto bg-[var(--surface-0)] p-3 sm:p-4">
                    {jd.trim() ? (
                      <JdOverlapResume
                        data={data}
                        keywords={match.matches}
                        rate={hasOfficial ? displayRate : match.rate}
                      />
                    ) : (
                      <p className="t-body-sm p-2 text-[var(--text-muted)]">
                        Paste a job posting to see resume keyword overlap.
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
