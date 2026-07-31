"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteApplication,
  deleteResume,
  fetchResumeList,
  getMasterResumeId,
  listApplications,
  uploadMasterResume,
} from "@/lib/api";
import type { Application, ResumeListItem } from "@/lib/types/resume";

type Activity = {
  id: string;
  entityId: string;
  label: string;
  when: string;
  kind: "resume" | "application";
  viewHref: string;
  editHref: string;
  status?: string;
};

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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    const onFocus = () => void load();
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
  const hasMaster = Boolean(master || getMasterResumeId());
  const interviews = apps.filter((a) => a.status === "interview").length;
  const avgMatch = apps.length
    ? Math.round(apps.reduce((s, a) => s + (a.match ?? 0), 0) / apps.length)
    : 0;

  const activity = useMemo(() => {
    const rows: Activity[] = [];
    for (const r of tailored) {
      rows.push({
        id: `r-${r.id}`,
        entityId: r.id,
        label: `Tailored resume · ${r.title}`,
        when: r.updatedAt,
        kind: "resume",
        viewHref: `/resumes/${r.id}`,
        editHref: `/builder?id=${r.id}`,
        status: r.status === "ready" ? "Ready" : r.status,
      });
    }
    for (const a of apps) {
      rows.push({
        id: `a-${a.id}`,
        entityId: a.id,
        label: `${a.company} · ${a.role}`,
        when: a.appliedAt || a.dateLabel || "",
        kind: "application",
        viewHref: "/tracker",
        editHref: "/tracker",
        status: a.status,
      });
    }
    return rows
      .sort((a, b) => {
        const ta = Date.parse(a.when) || 0;
        const tb = Date.parse(b.when) || 0;
        return tb - ta;
      })
      .slice(0, 8);
  }, [apps, tailored]);

  async function onDeleteRow(row: Activity) {
    const what = row.kind === "resume" ? "resume" : "application";
    if (!window.confirm(`Delete this ${what}?`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      if (row.kind === "resume") await deleteResume(row.entityId);
      else await deleteApplication(row.entityId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Applications sent", loading ? "—" : apps.length],
          ["Resumes tailored", loading ? "—" : tailored.length],
          ["Interviews", loading ? "—" : interviews],
          ["Avg match", loading ? "—" : `${avgMatch}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="metric-card">
            <p className="t-caption text-[var(--text-secondary)]">{label}</p>
            <p
              className="mt-2 text-[24px] font-medium tracking-tight"
              style={{ color: "var(--text-primary)", lineHeight: 1.2 }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="action-card">
          <div className="icon-box">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
              <path d="M14 3v5h5" />
            </svg>
          </div>
          <div className="action-card-body">
            <h2 className="t-h3 text-[var(--text-primary)]">
              {hasMaster ? "Master resume" : "Initialize master resume"}
            </h2>
            <p className="t-body-sm text-[var(--text-secondary)]">
              {hasMaster
                ? `${master?.sourceFile || "Uploaded"} · parsed ${timeAgo(master?.updatedAt)}`
                : "Set up your base resume once, reuse it everywhere."}
            </p>
            <div className="action-card-actions">
              {hasMaster && master ? (
                <Link href={`/resumes/${master.id}`} className="no-underline">
                  <button type="button" className="btn btn-secondary">
                    Open master
                  </button>
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUploadOpen(true)}
              >
                {hasMaster ? "Replace upload" : "Upload resume"}
              </button>
            </div>
          </div>
        </div>

        <div className="action-card featured">
          <div className="icon-box accent">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="action-card-body">
            <h2 className="t-h3 text-[var(--text-primary)]">Create resume</h2>
            <p className="t-body-sm text-[var(--text-secondary)]">
              Tailor a resume from a job description.
            </p>
            <div className="action-card-actions">
              <Link
                href={hasMaster ? "/tailor" : "#"}
                className="no-underline"
                onClick={(e) => {
                  if (!hasMaster) {
                    e.preventDefault();
                    setUploadOpen(true);
                  }
                }}
              >
                <button type="button" className="btn btn-secondary">
                  Tailor from JD
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="t-h2 text-[var(--text-primary)]">Recent activity</h2>
          <Link
            href="/tracker"
            className="t-body-sm text-[var(--accent)] no-underline hover:underline"
          >
            View applications
          </Link>
        </div>

        <div className="panel px-4">
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
              <div key={row.id} className="list-row">
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
                  {row.label}
                </button>
                {row.status ? (
                  <span className="pill pill-accent hidden sm:inline-flex">
                    {row.status}
                  </span>
                ) : null}
                <div className="row-actions">
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
                    onClick={() => void onDeleteRow(row)}
                  >
                    <IconDelete />
                  </button>
                </div>
                <span className="t-body-sm shrink-0 text-[var(--text-muted)]">
                  {timeAgo(
                    row.when.includes("T") || row.when.includes("-")
                      ? row.when
                      : undefined,
                  ) === "—"
                    ? row.when || "—"
                    : timeAgo(row.when)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

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
