import type { CSSProperties, ReactNode } from "react";
import { PAGE } from "@/lib/mock/data";
import type {
  KeywordHit,
  ResumeData,
  ResumeItem,
  TemplateSettings,
} from "@/lib/types/resume";
import { categorizeSkills } from "@/lib/utils/skills-fmt";

const MM = 3.7795275591;
const FONTS = {
  "sans-serif": "var(--sans)",
  serif: "var(--serifF)",
  mono: "var(--mono)",
} as const;

export function sheetStyle(settings: TemplateSettings): CSSProperties {
  const p = PAGE[settings.pageSize];
  const fs = [10.5, 11.75, 13, 14.25, 15.5][settings.fontSize - 1];
  const nameFs = fs * (1.55 + 0.2 * settings.headerScale);
  const cm = settings.compact ? 0.68 : 1;
  const secSp = [16, 24, 32, 40, 48][settings.sectionSpacing - 1] * cm;
  const itemSp = [5, 9, 14, 19, 24][settings.itemSpacing - 1] * cm;
  const lh = 1.4 + 0.1 * settings.lineHeight;
  return {
    ["--pw" as string]: `${p.w}px`,
    ["--ph" as string]: `${p.h}px`,
    ["--mt" as string]: `${settings.margins.top * MM}px`,
    ["--mb" as string]: `${settings.margins.bottom * MM}px`,
    ["--ml" as string]: `${settings.margins.left * MM}px`,
    ["--mr" as string]: `${settings.margins.right * MM}px`,
    ["--fs" as string]: `${fs}px`,
    ["--name-fs" as string]: `${nameFs.toFixed(2)}px`,
    ["--sec-sp" as string]: `${secSp.toFixed(1)}px`,
    ["--item-sp" as string]: `${itemSp.toFixed(1)}px`,
    ["--lh" as string]: lh.toFixed(2),
    ["--f-head" as string]: FONTS[settings.headerFont],
    ["--f-body" as string]: FONTS[settings.bodyFont],
  };
}

function contactLine(data: ResumeData): string[] {
  return [
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    data.contact.linkedin,
    data.contact.github,
    data.contact.website,
  ].filter(Boolean) as string[];
}

export function ResumePreview({
  data,
  settings,
  analyzed = false,
  tailored = false,
  confirmed = false,
  keywords = [],
}: {
  data: ResumeData;
  settings: TemplateSettings;
  analyzed?: boolean;
  tailored?: boolean;
  confirmed?: boolean;
  keywords?: KeywordHit[];
}) {
  const cls = "resume-print tpl-latex latex one";
  const items = contactLine(data);
  const skillLines = categorizeSkills(data.skills);

  function skillHit(s: string) {
    return (
      analyzed &&
      keywords.some(
        (k) =>
          s.toLowerCase().includes(k.k.toLowerCase()) ||
          k.k.toLowerCase().includes(s.toLowerCase()),
      )
    );
  }

  function bullets(list: ResumeData["exp"][0]["b"]) {
    return (
      <ul className="rv-bullets">
        {list.map((b) => {
          const diff = tailored && b.d;
          const c = diff ? (confirmed ? " diff ok" : " diff") : "";
          return (
            <li key={b.t} className={`resume-text${c}`}>
              {b.t}
              {diff ? (
                <>
                  {" "}
                  <span className="diff-add">— {b.d}</span>
                  <em className="ai-chip">AI</em>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  function itemBlock(it: ResumeItem, kind: "exp" | "project" | "edu" = "exp") {
    if (kind === "edu") {
      // co=school, role=degree, meta=dates, loc=GPA
      const school = it.co || it.role;
      const degree = it.co ? it.role : "";
      return (
        <article key={`${school}-${it.meta}`} className="resume-item">
          <div className="rv-item-top">
            <h4 className="resume-item-title">{school}</h4>
            <span className="resume-item-meta">{it.meta}</span>
          </div>
          {(degree || it.loc) && (
            <div className="rv-item-sub">
              {degree ? <span className="rv-degree">{degree}</span> : <span />}
              {it.loc ? <span className="rv-cgpa">{it.loc}</span> : null}
            </div>
          )}
          {it.b.length ? bullets(it.b) : null}
        </article>
      );
    }

    if (kind === "project") {
      return (
        <article key={it.role} className="resume-item">
          <div className="rv-item-top">
            <h4 className="resume-item-title">{it.role}</h4>
            {it.meta ? <span className="resume-item-meta">{it.meta}</span> : null}
          </div>
          {it.co ? <p className="rv-tech">{it.co}</p> : null}
          {it.b.length ? bullets(it.b) : null}
        </article>
      );
    }

    return (
      <article key={`${it.co}-${it.role}-${it.meta}`} className="resume-item">
        <div className="rv-item-top">
          <h4 className="resume-item-title">{it.role}</h4>
          <span className="resume-item-meta">{it.meta}</span>
        </div>
        {it.co ? (
          <div className="rv-item-sub">
            <span className="rv-co">{it.co}</span>
          </div>
        ) : null}
        {it.b.length ? bullets(it.b) : null}
      </article>
    );
  }

  function section(title: string, inner: ReactNode, empty = false) {
    if (empty) return null;
    return (
      <section className="resume-section">
        <h3 className="resume-section-title">{title}</h3>
        <div className="resume-items">{inner}</div>
      </section>
    );
  }

  const objective = section(
    "Objective",
    <p className="resume-text rv-summary">{data.summary}</p>,
    !data.summary,
  );
  const exp = section(
    "Experience",
    data.exp.map((it) => itemBlock(it, "exp")),
    !data.exp.length,
  );
  const projects = section(
    "Projects",
    <div
      className={
        settings.projectsTwoColumn ? "rv-projects-grid" : undefined
      }
    >
      {data.projects.map((it) => itemBlock(it, "project"))}
    </div>,
    !data.projects.length,
  );
  const edu = section(
    "Education",
    data.edu.map((it) => itemBlock(it, "edu")),
    !data.edu.length,
  );
  const skills = section(
    "Technical Skills",
    <ul
      className={[
        "rv-bullets rv-skill-list",
        skillLines.length >= 4 ? "rv-skill-grid" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {skillLines.map((s) => {
        const i = s.indexOf(":");
        return (
          <li key={s} className={`resume-text${skillHit(s) ? " hit" : ""}`}>
            {i > 0 ? (
              <>
                <strong>{s.slice(0, i + 1)}</strong>
                {s.slice(i + 1)}
              </>
            ) : (
              s
            )}
          </li>
        );
      })}
    </ul>,
    !skillLines.length,
  );
  const achievements = section(
    "Achievements",
    <ul
      className={[
        "rv-bullets",
        data.awards.length >= 4 ? "rv-skill-grid" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {data.awards.map(([a, b]) => (
        <li key={a} className="resume-text">
          {a}
          {b ? ` — ${b}` : ""}
        </li>
      ))}
    </ul>,
    !data.awards.length,
  );
  const activities = section(
    "Activities",
    <ul className="rv-bullets">
      {data.langs.map(([a, b]) => (
        <li key={a} className="resume-text">
          {a}
          {b ? ` (${b})` : ""}
        </li>
      ))}
    </ul>,
    !data.langs.length,
  );
  const certs = section(
    "Certifications",
    <ul className="rv-bullets">
      {data.certs.map(([a, b]) => (
        <li key={a} className="resume-text">
          {a}
          {b ? ` (${b})` : ""}
        </li>
      ))}
    </ul>,
    !data.certs.length,
  );

  const latexSecs = [
    objective,
    skills,
    achievements,
    edu,
    exp,
    projects,
    certs,
    activities,
  ].filter(Boolean);

  return (
    <article className={cls} style={sheetStyle(settings)}>
      <header className="rv-head">
        <div className="rv-id">
          <h1 className="resume-name">{data.name}</h1>
        </div>
        <address className="rv-contact pipe">
          {items.map((t, i) => (
            <span key={t} className="c-item">
              {i > 0 ? (
                <span className="c-pipe" aria-hidden>
                  {" "}
                  |{" "}
                </span>
              ) : null}
              {t}
            </span>
          ))}
        </address>
      </header>
      <div className="rv-body">
        <div className="rv-main">{latexSecs}</div>
      </div>
    </article>
  );
}
