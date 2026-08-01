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
  { id: "wish", name: "Wishlist", c: "#8A8A8A" },
  { id: "applied", name: "Applied", c: "#00BFFF" },
  { id: "interview", name: "Interview", c: "#E8A317" },
  { id: "offer", name: "Offer", c: "#76B900" },
];

function matchCls(m: number) {
  if (m >= 88) return "hi";
  if (m >= 80) return "mid";
  return "lo";
}

function templateTagCls(_template?: string) {
  return "ktag-latex";
}

export default function TrackerPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [col, setCol] = useState<ApplicationStatus>("applied");
  const [dragOver, setDragOver] = useState<ApplicationStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftCompany, setDraftCompany] = useState("");
  const [draftRole, setDraftRole] = useState("");
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
    setDraftStatus(app.status);
    setDraftNotes(app.notes ?? "");
    setOpen(false);
  }

  async function onCreate() {
    const c = company.trim() || "Untitled Co";
    const r = role.trim() || "Frontend Engineer";
    await createApplication({ company: c, role: r, status: col });
    setCompany("");
    setRole("");
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
    const label = selected.company;
    setDeleting(true);
    try {
      await deleteApplication(selected.id);
      setConfirmDelete(false);
      setSelectedId(null);
      await load();
      toast.success(`${label} removed`);
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
                      <span className="kc-grip" aria-hidden>
                        ⋮⋮
                      </span>
                    </div>
                    <p>{a.role}</p>
                    <div className="kc-meta">
                      <span className={`match ${matchCls(a.match ?? 0)}`}>
                        {a.match ?? 0}%
                      </span>
                      <span className={`ktag ${templateTagCls(a.template)}`}>
                        {a.template || "latex"}
                      </span>
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
            onClick={() => setSelectedId(null)}
          />
          <aside className="app-drawer" role="dialog" aria-modal="true" aria-labelledby="app-drawer-title">
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
                <span className={`ktag ${templateTagCls(selected.template)}`}>
                  {selected.template || "latex"}
                </span>
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
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
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
