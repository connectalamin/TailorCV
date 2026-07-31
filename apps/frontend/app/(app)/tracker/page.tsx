"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  createApplication,
  listApplications,
  updateApplication,
} from "@/lib/api";
import type { Application, ApplicationStatus } from "@/lib/types/resume";

const KCOLS: { id: ApplicationStatus; name: string; c: string }[] = [
  { id: "wish", name: "Wishlist", c: "#8B9591" },
  { id: "applied", name: "Applied", c: "#2563EB" },
  { id: "interview", name: "Interview", c: "#D97706" },
  { id: "offer", name: "Offer", c: "#0D9488" },
];

function matchCls(m: number) {
  if (m >= 88) return "hi";
  if (m >= 80) return "mid";
  return "lo";
}

function pushToast(setToasts: (fn: (t: string[]) => string[]) => void, msg: string) {
  setToasts((t) => [...t, msg]);
  setTimeout(() => {
    setToasts((t) => t.slice(1));
  }, 3400);
}

export default function TrackerPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [col, setCol] = useState<ApplicationStatus>("applied");
  const [toasts, setToasts] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState<ApplicationStatus | null>(null);
  const dragId = useRef<string | null>(null);
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

  async function onCreate() {
    const c = company.trim() || "Untitled Co";
    const r = role.trim() || "Frontend Engineer";
    await createApplication({ company: c, role: r, status: col });
    setCompany("");
    setRole("");
    setOpen(false);
    await load();
    pushToast(setToasts, `${c} added to ${KCOLS.find((x) => x.id === col)?.name}`);
  }

  function onDragStart(id: string) {
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
    pushToast(
      setToasts,
      `${app.company} → ${KCOLS.find((c) => c.id === to)?.name}`,
    );
  }

  return (
    <div className="apps-view">
      <div className="apps-head">
        <div>
          <h1 className="apps-title">Applications</h1>
          <p className="apps-sub">
            Kanban synced with the backend · drag cards between stages
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
          className="btn prime"
          id="newAppBtn"
          style={{ padding: "10px 16px" }}
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
                    className="kcard"
                    draggable
                    onDragStart={() => onDragStart(a.id)}
                    onDragEnd={() => {
                      dragId.current = null;
                      setDragOver(null);
                    }}
                    style={{
                      animation: `rise .4s ${i * 45}ms ease both`,
                    }}
                  >
                    <div className="kc-top">
                      <b>{a.company}</b>
                      <span className="kc-grip">⋮⋮</span>
                    </div>
                    <p>{a.role}</p>
                    <div className="kc-meta">
                      <span className={`match ${matchCls(a.match ?? 0)}`}>
                        {a.match ?? 0}%
                      </span>
                      <span className="ktag">{a.template || "swiss-single"}</span>
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
            className="btn prime"
            style={{ width: "100%" }}
            onClick={() => void onCreate()}
          >
            Add to board
          </button>
        </div>
      ) : null}

      <div className="toasts" aria-live="polite">
        {toasts.map((t, i) => (
          <div key={`${t}-${i}`} className="toast">
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}
