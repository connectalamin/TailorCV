"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from "@/lib/api";
import type { Application, ApplicationStatus } from "@/lib/types/resume";

const KCOLS: { id: ApplicationStatus; name: string; c: string }[] = [
  { id: "wish", name: "Wishlist", c: "#9C9C9C" },
  { id: "applied", name: "Applied", c: "#6366F1" },
  { id: "interview", name: "Interview", c: "#F59E0B" },
  { id: "offer", name: "Offer", c: "#10B981" },
];

const EMPLOYMENT_TYPES = [
  { value: "", label: "—" },
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

function employmentLabel(value?: string) {
  if (!value) return null;
  const hit = EMPLOYMENT_TYPES.find((t) => t.value === value);
  return hit?.label || value;
}

/** Normalize stored date text to YYYY-MM-DD for `<input type="date">`. */
function toDateInputValue(raw?: string | null): string {
  if (!raw) return "";
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  const dt = new Date(t);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Display YYYY-MM-DD as a short locale date; pass through other text. */
function formatDateLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const iso = toDateInputValue(raw);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, mo, d] = iso.split("-").map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return raw.trim() || null;
}

function matchCls(m: number) {
  if (m >= 88) return "hi";
  if (m >= 80) return "mid";
  return "lo";
}

export default function TrackerPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [salary, setSalary] = useState("");
  const [deadline, setDeadline] = useState("");
  const [startDate, setStartDate] = useState("");
  const [col, setCol] = useState<ApplicationStatus>("applied");
  const [dragOver, setDragOver] = useState<ApplicationStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftCompany, setDraftCompany] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftEmploymentType, setDraftEmploymentType] = useState("");
  const [draftSalary, setDraftSalary] = useState("");
  const [draftDeadline, setDraftDeadline] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftStatus, setDraftStatus] = useState<ApplicationStatus>("wish");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dragId = useRef<string | null>(null);
  const skipClick = useRef(false);
  const popRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const columns = await listApplications();
    setApps(Object.values(columns).flat());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if ((e.target as HTMLElement).id === "newAppBtn") return;
      setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmDelete) setSelectedId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  const stats = useMemo(() => {
    const total = apps.length;
    const interviews = apps.filter((a) => a.status === "interview").length;
    const offers = apps.filter((a) => a.status === "offer").length;
    const avg =
      total === 0
        ? 0
        : Math.round(apps.reduce((s, a) => s + (a.match ?? 0), 0) / total);
    return { total, interviews, offers, avg };
  }, [apps]);

  const selected = useMemo(
    () => apps.find((a) => a.id === selectedId) ?? null,
    [apps, selectedId],
  );

  function openDetail(app: Application) {
    setSelectedId(app.id);
    setDraftCompany(app.company);
    setDraftRole(app.role);
    setDraftLocation(app.location ?? "");
    setDraftEmploymentType(app.employmentType ?? "");
    setDraftSalary(app.salary ?? "");
    setDraftDeadline(toDateInputValue(app.deadline));
    setDraftStartDate(toDateInputValue(app.startDate));
    setDraftStatus(app.status);
    setDraftNotes(app.notes ?? "");
    setOpen(false);
  }

  async function onCreate() {
    const c = company.trim() || "Untitled Co";
    const r = role.trim() || "Frontend Engineer";
    await createApplication({
      company: c,
      role: r,
      location: location.trim() || undefined,
      employmentType: employmentType || undefined,
      salary: salary.trim() || undefined,
      deadline: deadline.trim() || undefined,
      startDate: startDate.trim() || undefined,
      status: col,
    });
    setCompany("");
    setRole("");
    setLocation("");
    setEmploymentType("");
    setSalary("");
    setDeadline("");
    setStartDate("");
    setOpen(false);
    await load();
    toast.success(`${c} added to ${KCOLS.find((x) => x.id === col)?.name}`);
  }

  function onDragStart(id: string) {
    skipClick.current = true;
    dragId.current = id;
  }

  async function onDrop(to: ApplicationStatus) {
    const id = dragId.current;
    setDragOver(null);
    dragId.current = null;
    if (!id) return;
    const app = apps.find((a) => a.id === id);
    if (!app || app.status === to) return;
    await updateApplication(id, { status: to });
    await load();
    if (selectedId === id) setDraftStatus(to);
    toast.message(`${app.company} → ${KCOLS.find((c) => c.id === to)?.name}`);
  }

  async function onSaveDetail() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateApplication(selected.id, {
        company: draftCompany.trim() || selected.company,
        role: draftRole.trim() || selected.role,
        location: draftLocation.trim() || undefined,
        employmentType: draftEmploymentType || undefined,
        salary: draftSalary.trim() || undefined,
        deadline: draftDeadline.trim() || undefined,
        startDate: draftStartDate.trim() || undefined,
        status: draftStatus,
        notes: draftNotes,
      });
      await load();
      toast.success("Application updated");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    if (!selected) return;
    const id = selected.id;
    const label = selected.company;
    setDeleting(true);
    try {
      await deleteApplication(id);
      setConfirmDelete(false);
      setSelectedId(null);
      setApps((prev) => prev.filter((a) => a.id !== id));
      await load();
      toast.success(`${label} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete application");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="apps-view">
      <div className="apps-head">
        <div>
          <p className="apps-sub">
            Drag between stages · click a card for details
          </p>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{stats.total}</b>
            <span>Total</span>
          </div>
          <div className="stat">
            <b>{stats.interviews}</b>
            <span>Interviews</span>
          </div>
          <div className="stat">
            <b>{stats.offers}</b>
            <span>Offers</span>
          </div>
          <div className="stat acc">
            <b>{stats.avg}%</b>
            <span>Avg match</span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          id="newAppBtn"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          + New application
        </button>
      </div>

      <div className="board">
        {KCOLS.map((c) => {
          const cards = apps.filter((a) => a.status === c.id);
          return (
            <section
              key={c.id}
              className={["kcol", dragOver === c.id ? "drag" : ""].join(" ")}
              data-col={c.id}
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(c.id);
              }}
              onDragLeave={(e: DragEvent) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                  setDragOver((d) => (d === c.id ? null : d));
                }
              }}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                void onDrop(c.id);
              }}
            >
              <header className="kcol-h">
                <i className="cdot" style={{ ["--c" as string]: c.c }} />
                <h3>{c.name}</h3>
                <span className="kcount">{cards.length}</span>
              </header>
              <div className="kbody">
                {cards.map((a, i) => (
                  <article
                    key={a.id}
                    className={[
                      "kcard",
                      selectedId === a.id ? "is-open" : "",
                    ].join(" ")}
                    draggable
                    onDragStart={() => onDragStart(a.id)}
                    onDragEnd={() => {
                      dragId.current = null;
                      setDragOver(null);
                      window.setTimeout(() => {
                        skipClick.current = false;
                      }, 0);
                    }}
                    onClick={() => {
                      if (skipClick.current) return;
                      openDetail(a);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(a);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      animation: `rise .4s ${i * 45}ms ease both`,
                    }}
                  >
                    <div className="kc-top">
                      <b>{a.company}</b>
                      <span className="kc-grip" aria-hidden title="Drag">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="5" cy="4" r="1.25" />
                          <circle cx="11" cy="4" r="1.25" />
                          <circle cx="5" cy="8" r="1.25" />
                          <circle cx="11" cy="8" r="1.25" />
                          <circle cx="5" cy="12" r="1.25" />
                          <circle cx="11" cy="12" r="1.25" />
                        </svg>
                      </span>
                    </div>
                    <p>{a.role}</p>
                    {a.location || a.employmentType ? (
                      <p className="kc-sub">
                        {[a.location, employmentLabel(a.employmentType)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {a.deadline || a.startDate ? (
                      <p className="kc-sub">
                        {[
                          (() => {
                            const d = formatDateLabel(a.deadline);
                            return d ? `Due ${d}` : null;
                          })(),
                          (() => {
                            const d = formatDateLabel(a.startDate);
                            return d ? `Start ${d}` : null;
                          })(),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <div className="kc-meta">
                      <span className={`match ${matchCls(a.match ?? 0)}`}>
                        {a.match ?? 0}%
                      </span>
                      {a.salary ? (
                        <span className="ktag ktag-salary">{a.salary}</span>
                      ) : null}
                      <span className="kdate">{a.dateLabel || "—"}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {open ? (
        <div className="pop-new" ref={popRef}>
          <h4>New application</h4>
          <input
            placeholder="Company"
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <input
            placeholder="Role"
            autoComplete="off"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
          <input
            placeholder="Location"
            autoComplete="off"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            aria-label="Employment type"
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value || "none"} value={t.value}>
                {t.value ? t.label : "Type"}
              </option>
            ))}
          </select>
          <input
            placeholder="Salary"
            autoComplete="off"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
          <input
            type="date"
            aria-label="Deadline"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <input
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <select
            value={col}
            onChange={(e) => setCol(e.target.value as ApplicationStatus)}
          >
            {KCOLS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => void onCreate()}
          >
            Add to board
          </button>
        </div>
      ) : null}

      {selected ? (
        <>
          <button
            type="button"
            className="app-drawer-backdrop"
            aria-label="Close application details"
            disabled={confirmDelete || deleting}
            onClick={() => {
              if (!confirmDelete && !deleting) setSelectedId(null);
            }}
          />
          <aside
            className={`app-drawer${confirmDelete ? " is-inert" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-drawer-title"
            aria-hidden={confirmDelete || undefined}
          >
            <header className="app-drawer-head">
              <div>
                <p className="t-caption text-[var(--accent)]">Application</p>
                <h2 id="app-drawer-title" className="t-h2">
                  {selected.company}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={confirmDelete || deleting}
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </header>

            <div className="app-drawer-body">
              <div className="app-drawer-chips">
                <span className={`match ${matchCls(selected.match ?? 0)}`}>
                  {selected.match ?? 0}% match
                </span>
                {selected.salary ? (
                  <span className="ktag ktag-salary">{selected.salary}</span>
                ) : null}
                <span className="kdate">{selected.dateLabel || "—"}</span>
              </div>

              <div className="field">
                <label htmlFor="app-company">Company</label>
                <input
                  id="app-company"
                  value={draftCompany}
                  onChange={(e) => setDraftCompany(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="app-role">Role</label>
                <input
                  id="app-role"
                  value={draftRole}
                  onChange={(e) => setDraftRole(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="app-location">Location</label>
                <input
                  id="app-location"
                  placeholder="Remote, city, hybrid…"
                  value={draftLocation}
                  onChange={(e) => setDraftLocation(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="app-employment-type">Employment type</label>
                <select
                  id="app-employment-type"
                  value={draftEmploymentType}
                  onChange={(e) => setDraftEmploymentType(e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value || "none"} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="app-salary">Salary</label>
                <input
                  id="app-salary"
                  placeholder="$120k–$150k, €70k…"
                  value={draftSalary}
                  onChange={(e) => setDraftSalary(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="app-deadline">Deadline</label>
                <input
                  id="app-deadline"
                  type="date"
                  value={draftDeadline}
                  onChange={(e) => setDraftDeadline(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="app-start-date">Start date</label>
                <input
                  id="app-start-date"
                  type="date"
                  value={draftStartDate}
                  onChange={(e) => setDraftStartDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="app-status">Stage</label>
                <select
                  id="app-status"
                  value={draftStatus}
                  onChange={(e) =>
                    setDraftStatus(e.target.value as ApplicationStatus)
                  }
                >
                  {KCOLS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="app-notes">Notes</label>
                <textarea
                  id="app-notes"
                  rows={5}
                  placeholder="Interview notes, contacts, follow-ups…"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                />
              </div>
            </div>

            <footer className="app-drawer-foot">
              <div className="app-drawer-links">
                {selected.resumeId ? (
                  <>
                    <Link
                      href={`/builder?id=${selected.resumeId}`}
                      className="btn btn-secondary no-underline"
                    >
                      Open in builder
                    </Link>
                    <Link
                      href={`/resumes/${selected.resumeId}`}
                      className="btn btn-ghost no-underline"
                    >
                      View resume
                    </Link>
                  </>
                ) : (
                  <Link href="/tailor" className="btn btn-secondary no-underline">
                    Tailor a resume
                  </Link>
                )}
              </div>
              <div className="app-drawer-actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={confirmDelete || deleting}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving || confirmDelete || deleting}
                  onClick={() => void onSaveDetail()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </footer>
          </aside>
        </>
      ) : null}

      <ConfirmModal
        open={confirmDelete && !!selected}
        title="Delete application?"
        description={
          selected
            ? `This will permanently remove “${selected.company} — ${selected.role}”. This cannot be undone.`
            : ""
        }
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        onConfirm={() => void onConfirmDelete()}
      />
    </div>
  );
}
