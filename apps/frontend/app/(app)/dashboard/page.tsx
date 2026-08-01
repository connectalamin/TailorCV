"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  deleteApplication,
  deleteResume,
  fetchResumeList,
  listApplications,
  uploadMasterResume,
} from "@/lib/api";
import type {
  Application,
  ApplicationStatus,
  ResumeListItem,
} from "@/lib/types/resume";

type Activity = {
  id: string;
  entityId: string;
  label: string;
  when: string;
  kind: "resume" | "application";
  viewHref: string;
  editHref: string;
  status?: string;
  /** Linked / underlying resume label */
  resumeLabel?: string;
  /** ATS / JD match percent when known */
  atsMatch?: number;
};

const PIPELINE: {
  id: ApplicationStatus;
  name: string;
  color: string;
}[] = [
  { id: "wish", name: "Wishlist", color: "#9C9C9C" },
  { id: "applied", name: "Applied", color: "#6366F1" },
  { id: "interview", name: "Interview", color: "#F59E0B" },
  { id: "offer", name: "Offer", color: "#10B981" },
];

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWhen(when: string) {
  if (when.includes("T") || when.includes("-")) {
    const ago = timeAgo(when);
    return ago === "—" ? when || "—" : ago;
  }
  return when || "—";
}

function statusPillClass(status?: string) {
  switch (status) {
    case "offer":
    case "Ready":
    case "ready":
      return "pill pill-success";
    case "interview":
      return "pill pill-warning";
    case "applied":
    case "Wishlist":
    case "wish":
      return "pill pill-accent";
    default:
      return "pill pill-accent";
  }
}

function activityStatusLabel(kind: Activity["kind"], status?: string) {
  if (kind === "resume") {
    if (!status) return "Resume";
    if (status === "ready" || status === "Ready") return "Resume · Ready";
    return `Resume · ${status}`;
  }
  switch (status) {
    case "wish":
      return "App · Wishlist";
    case "applied":
      return "App · Applied";
    case "interview":
      return "App · Interview";
    case "offer":
      return "App · Offer";
    default:
      return status ? `App · ${status}` : "Application";
  }
}

function resumeDisplayName(r: ResumeListItem | undefined): string {
  if (!r) return "";
  if (r.isMaster) return r.sourceFile || r.title || "Master resume";
  if (r.company && r.role) return `${r.company} · ${r.role}`;
  if (r.company) return r.company;
  return r.title || r.sourceFile || "Resume";
}

function atsPillClass(pct: number) {
  if (pct >= 80) return "pill pill-success";
  if (pct >= 55) return "pill pill-warning";
  return "pill pill-accent";
}

function IconShow() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [list, cols] = await Promise.all([
        fetchResumeList(true),
        listApplications(),
      ]);
      setResumes(list);
      setApps(Object.values(cols).flat());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadMasterResume(file);
      setUploadOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const master = resumes.find((r) => r.isMaster);
  const tailored = resumes.filter((r) => !r.isMaster);
  const hasMaster = Boolean(master);
  const resumeById = useMemo(() => {
    const m = new Map<string, ResumeListItem>();
    for (const r of resumes) m.set(r.id, r);
    return m;
  }, [resumes]);
  const matchByResumeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resumes) {
      if (typeof r.match === "number") m.set(r.id, r.match);
    }
    for (const a of apps) {
      if (!a.resumeId || typeof a.match !== "number") continue;
      const prev = m.get(a.resumeId);
      if (prev == null || a.match > prev) m.set(a.resumeId, a.match);
    }
    return m;
  }, [apps, resumes]);
  const masterAts =
    master && typeof matchByResumeId.get(master.id) === "number"
      ? matchByResumeId.get(master.id)
      : typeof master?.match === "number"
        ? master.match
        : undefined;
  const interviews = apps.filter((a) => a.status === "interview").length;
  const offers = apps.filter((a) => a.status === "offer").length;
  const avgMatch = apps.length
    ? Math.round(apps.reduce((s, a) => s + (a.match ?? 0), 0) / apps.length)
    : 0;

  const pipelineCounts = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      wish: 0,
      applied: 0,
      interview: 0,
      offer: 0,
    };
    for (const a of apps) counts[a.status] += 1;
    return counts;
  }, [apps]);

  const pipelineMax = Math.max(1, ...Object.values(pipelineCounts));

  const activity = useMemo(() => {
    const rows: Activity[] = [];
    for (const r of tailored) {
      const ats = matchByResumeId.get(r.id);
      rows.push({
        id: `r-${r.id}`,
        entityId: r.id,
        label: r.company
          ? `${r.company} · ${r.role || r.title}`
          : `Tailored · ${r.title}`,
        when: r.updatedAt,
        kind: "resume",
        viewHref: `/resumes/${r.id}`,
        editHref: `/builder?id=${r.id}`,
        status: r.status === "ready" ? "Ready" : r.status,
        resumeLabel: resumeDisplayName(r),
        atsMatch: ats,
      });
    }
    for (const a of apps) {
      const linked = a.resumeId ? resumeById.get(a.resumeId) : undefined;
      rows.push({
        id: `a-${a.id}`,
        entityId: a.id,
        label: `${a.company} · ${a.role}`,
        when: a.appliedAt || a.dateLabel || "",
        kind: "application",
        viewHref: "/tracker",
        editHref: "/tracker",
        status: a.status,
        resumeLabel:
          resumeDisplayName(linked) ||
          (a.resumeId ? "Linked resume" : "No resume"),
      });
    }
    return rows
      .sort((a, b) => {
        const ta = Date.parse(a.when) || 0;
        const tb = Date.parse(b.when) || 0;
        return tb - ta;
      })
      .slice(0, 10);
  }, [apps, tailored, resumeById, matchByResumeId]);

  const topMatches = useMemo(
    () =>
      [...apps]
        .filter((a) => typeof a.match === "number")
        .sort((a, b) => (b.match ?? 0) - (a.match ?? 0))
        .slice(0, 4),
    [apps],
  );

  async function confirmDeleteRow() {
    const row = pendingDelete;
    if (!row) return;
    setBusyId(row.id);
    setError(null);
    try {
      if (row.kind === "resume") await deleteResume(row.entityId);
      else await deleteApplication(row.entityId);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  function openTailor() {
    if (hasMaster) router.push("/tailor");
    else setUploadOpen(true);
  }

  return (
    <div className="page">
      {error ? (
        <p
          className="t-body-sm mb-4 rounded-[var(--radius-md)] px-3 py-2"
          style={{
            background: "#fdecec",
            color: "var(--danger)",
            border: "0.5px solid var(--border-danger)",
          }}
        >
          {error}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-caption text-[var(--text-muted)]" style={{ letterSpacing: "0.08em" }}>
            OVERVIEW
          </p>
          <p className="t-body mt-1 text-[var(--text-secondary)]">
            {hasMaster
              ? `${tailored.length} tailored resume${tailored.length === 1 ? "" : "s"} · ${apps.length} application${apps.length === 1 ? "" : "s"} in flight`
              : "Upload a master resume to start tailoring for roles."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasMaster && master ? (
            <div className="dash-master-chip">
              <span className="dash-master-chip-name" title={resumeDisplayName(master)}>
                {resumeDisplayName(master)}
              </span>
              {typeof masterAts === "number" ? (
                <span className={atsPillClass(masterAts)}>ATS · {masterAts}%</span>
              ) : (
                <span className="pill">Master</span>
              )}
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setUploadOpen(true)}
          >
            {hasMaster ? "Replace master" : "Upload master"}
          </button>
          <button type="button" className="btn btn-primary" onClick={openTailor}>
            Tailor from JD
          </button>
        </div>
      </div>

      <div className="kpi-band dash-rise">
        {[
          {
            label: "Applications",
            value: loading ? "—" : String(apps.length),
            sub: loading ? null : `${pipelineCounts.applied} applied`,
            bar: apps.length ? Math.min(100, apps.length * 12) : 0,
            color: "var(--accent)",
          },
          {
            label: "Resumes tailored",
            value: loading ? "—" : String(tailored.length),
            sub: hasMaster ? "Master ready" : "No master yet",
            bar: tailored.length ? Math.min(100, tailored.length * 18) : 0,
            color: "var(--accent)",
          },
          {
            label: "Interviews",
            value: loading ? "—" : String(interviews),
            sub: offers ? `${offers} offer${offers === 1 ? "" : "s"}` : "None scheduled",
            bar: apps.length ? Math.round((interviews / Math.max(apps.length, 1)) * 100) : 0,
            color: "var(--warning)",
          },
          {
            label: "Avg match",
            value: loading ? "—" : `${avgMatch}%`,
            sub: apps.length ? "Across tracked roles" : "No matches yet",
            bar: avgMatch,
            color: "var(--success)",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="kpi-cell">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-sub">
              <div className="kpi-bar">
                <i style={{ width: `${kpi.bar}%`, background: kpi.color }} />
              </div>
              <span>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="panel p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="t-h3 text-[var(--text-primary)]">Application pipeline</h2>
              <Link
                href="/tracker"
                className="t-body-sm text-[var(--accent)] no-underline hover:underline"
              >
                Open tracker
              </Link>
            </div>
            {loading ? (
              <p className="t-body-sm py-6 text-center text-[var(--text-muted)]">Loading…</p>
            ) : (
              <div className="flex flex-col gap-3">
                {PIPELINE.map((stage) => {
                  const n = pipelineCounts[stage.id];
                  const pct = Math.round((n / pipelineMax) * 100);
                  return (
                    <div key={stage.id} className="fun-row">
                      <div className="fun-name">
                        <span className="fun-dot" style={{ background: stage.color }} />
                        {stage.name}
                      </div>
                      <div className="fun-track">
                        <div
                          className="fun-fill"
                          style={{
                            width: `${n ? Math.max(pct, 8) : 0}%`,
                            background: stage.color,
                          }}
                        />
                      </div>
                      <div className="fun-n">{n}</div>
                    </div>
                  );
                })}
                {apps.length === 0 ? (
                  <p className="t-body-sm mt-1 text-[var(--text-muted)]">
                    Tailor a resume or add roles in Applications to fill the pipeline.
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section className="panel px-4">
            <div className="mb-1 flex items-baseline justify-between gap-3 pt-4">
              <h2 className="t-h3 text-[var(--text-primary)]">Recent activity</h2>
              <Link
                href="/tracker"
                className="t-body-sm text-[var(--accent)] no-underline hover:underline"
              >
                View all
              </Link>
            </div>
            {loading ? (
              <div className="py-8 text-center t-body-sm text-[var(--text-muted)]">
                Loading…
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div className="icon-box mb-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M4 6h16M4 12h10M4 18h14" />
                  </svg>
                </div>
                <p className="t-body text-[var(--text-secondary)]">
                  No activity yet. Upload a master resume or tailor one for a role.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary mt-4"
                  onClick={() => setUploadOpen(true)}
                >
                  Upload master resume
                </button>
              </div>
            ) : (
              activity.map((row) => (
                <div key={row.id} className="list-row act-row">
                  <span className="text-[var(--text-secondary)]">
                    {row.kind === "resume" ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M7 3h7l4 4v14H7V3z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <rect x="4" y="7" width="16" height="13" rx="2" />
                      </svg>
                    )}
                  </span>
                  <button
                    type="button"
                    className="t-body min-w-0 flex-1 truncate text-left text-[var(--text-primary)]"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    onClick={() => router.push(row.viewHref)}
                  >
                    <span className="block truncate">{row.label}</span>
                    {row.kind === "application" && row.resumeLabel ? (
                      <span className="t-body-sm block truncate text-[var(--text-muted)]">
                        Resume · {row.resumeLabel}
                      </span>
                    ) : null}
                  </button>
                  <div className="act-tags">
                    {row.kind === "resume" && typeof row.atsMatch === "number" ? (
                      <span className={`${atsPillClass(row.atsMatch)} shrink-0`}>
                        ATS · {row.atsMatch}%
                      </span>
                    ) : null}
                    {row.status || row.kind ? (
                      <span className={`${statusPillClass(row.status)} shrink-0`}>
                        {activityStatusLabel(row.kind, row.status)}
                      </span>
                    ) : null}
                  </div>
                  <div className="row-actions act-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      title="Show"
                      aria-label="Show"
                      onClick={() => router.push(row.viewHref)}
                    >
                      <IconShow />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => router.push(row.editHref)}
                    >
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon row-action-danger"
                      title="Delete"
                      aria-label="Delete"
                      disabled={busyId === row.id}
                      onClick={() => setPendingDelete(row)}
                    >
                      <IconDelete />
                    </button>
                  </div>
                  <span className="t-body-sm shrink-0 text-[var(--text-muted)]">
                    {formatWhen(row.when)}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel p-3">
            <h2 className="t-h3 mb-2 px-1 text-[var(--text-primary)]">Quick actions</h2>
            <button
              type="button"
              className="qa-row accent w-full text-left"
              onClick={openTailor}
            >
              <span className="icon-box qa-ico accent">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-body block font-medium text-[var(--text-primary)]">
                  Tailor from JD
                </span>
                <span className="t-body-sm text-[var(--text-secondary)]">
                  Paste a posting, generate a match
                </span>
              </span>
              <span className="qa-chev">→</span>
            </button>
            <Link href="/tracker" className="qa-row">
              <span className="icon-box qa-ico">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <rect x="4" y="7" width="16" height="13" rx="2" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-body block font-medium text-[var(--text-primary)]">
                  Track applications
                </span>
                <span className="t-body-sm text-[var(--text-secondary)]">
                  Kanban across wishlist → offer
                </span>
              </span>
              <span className="qa-chev">→</span>
            </Link>
            {hasMaster && master ? (
              <Link href={`/resumes/${master.id}`} className="qa-row">
                <span className="icon-box qa-ico">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                    <path d="M14 3v5h5" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block font-medium text-[var(--text-primary)]">
                    Open master
                  </span>
                  <span className="t-body-sm truncate text-[var(--text-secondary)]">
                    {master.sourceFile || "Master resume"} · {timeAgo(master.updatedAt)}
                  </span>
                </span>
                <span className="qa-chev">→</span>
              </Link>
            ) : (
              <button
                type="button"
                className="qa-row w-full text-left"
                onClick={() => setUploadOpen(true)}
              >
                <span className="icon-box qa-ico">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M12 16V7M8.5 10.5 12 7l3.5 3.5" />
                    <path d="M5 18h14" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block font-medium text-[var(--text-primary)]">
                    Upload master resume
                  </span>
                  <span className="t-body-sm text-[var(--text-secondary)]">
                    PDF, DOCX, TEX, or TXT
                  </span>
                </span>
                <span className="qa-chev">→</span>
              </button>
            )}
          </section>

          <section className="panel p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="t-h3 text-[var(--text-primary)]">Tailored resumes</h2>
              <span className="t-caption text-[var(--text-muted)]">
                {loading ? "—" : tailored.length}
              </span>
            </div>
            {loading ? (
              <p className="t-body-sm text-[var(--text-muted)]">Loading…</p>
            ) : tailored.length === 0 ? (
              <p className="t-body-sm text-[var(--text-muted)]">
                No tailored versions yet. Start from a job description.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tailored.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/resumes/${r.id}`}
                      className="match-card block no-underline transition hover:border-[var(--border-strong)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="t-body truncate font-medium text-[var(--text-primary)]">
                            {r.company || r.title}
                          </p>
                          <p className="t-body-sm truncate text-[var(--text-secondary)]">
                            {r.role || "Tailored resume"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {typeof r.match === "number" ||
                          typeof matchByResumeId.get(r.id) === "number" ? (
                            <span
                              className={atsPillClass(
                                (typeof r.match === "number"
                                  ? r.match
                                  : matchByResumeId.get(r.id)) as number,
                              )}
                            >
                              ATS ·{" "}
                              {typeof r.match === "number"
                                ? r.match
                                : matchByResumeId.get(r.id)}
                              %
                            </span>
                          ) : null}
                          <span
                            className={statusPillClass(
                              r.status === "ready" ? "Ready" : r.status,
                            )}
                          >
                            {r.status === "ready" ? "Ready" : r.status}
                          </span>
                        </div>
                      </div>
                      <p className="t-caption mt-2 text-[var(--text-muted)]">
                        Updated {timeAgo(r.updatedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {tailored.length > 5 ? (
              <p className="t-body-sm mt-3 text-[var(--text-muted)]">
                +{tailored.length - 5} more in recent activity
              </p>
            ) : null}
          </section>

          {topMatches.length > 0 ? (
            <section className="panel p-4">
              <h2 className="t-h3 mb-3 text-[var(--text-primary)]">Top matches</h2>
              <ul className="flex flex-col gap-2.5">
                {topMatches.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="t-body truncate text-[var(--text-primary)]">{a.company}</p>
                      <p className="t-body-sm truncate text-[var(--text-muted)]">{a.role}</p>
                    </div>
                    <span
                      className="t-body shrink-0 font-medium tabular-nums"
                      style={{
                        color:
                          (a.match ?? 0) >= 88
                            ? "var(--success)"
                            : (a.match ?? 0) >= 80
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                      }}
                    >
                      {a.match}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title={
          pendingDelete?.kind === "application"
            ? "Delete application?"
            : "Delete resume?"
        }
        description={
          pendingDelete
            ? `This will permanently remove “${pendingDelete.label}”. This cannot be undone.`
            : ""
        }
        busy={!!busyId && busyId === pendingDelete?.id}
        onCancel={() => {
          if (!busyId) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDeleteRow()}
      />

      {uploadOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => !uploading && setUploadOpen(false)}
        >
          <div
            className="panel w-full max-w-[480px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <h2 className="t-h2">
                {hasMaster ? "Replace master resume" : "Upload resume"}
              </h2>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 32, height: 32, padding: 0 }}
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <div
                role="button"
                tabIndex={uploading ? -1 : 0}
                className="cursor-pointer rounded-[var(--radius-sm)] border border-dashed p-8 text-center transition"
                style={{
                  borderColor: dragOver ? "var(--accent)" : "var(--border-strong)",
                  background: dragOver ? "var(--accent-bg)" : "var(--surface-0)",
                  opacity: uploading ? 0.7 : 1,
                }}
                onClick={() => {
                  if (!uploading) inputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if (uploading) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFile(e.dataTransfer.files[0]);
                }}
              >
                <p className="t-body font-medium text-[var(--text-primary)]">
                  {uploading ? "Parsing…" : "Click or drag file"}
                </p>
                <p className="t-body-sm mt-1 text-[var(--text-muted)]">
                  PDF, DOCX, TEX, TXT — max 4MB
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.tex,.txt,.md"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <div className="panel-footer mx-6 mb-5">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={uploading}
                onClick={() => setUploadOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "Processing…" : "Choose file"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
