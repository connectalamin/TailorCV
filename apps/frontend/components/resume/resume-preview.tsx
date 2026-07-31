import type { CSSProperties, ReactNode } from "react";
import { PAGE, TPL_META } from "@/lib/mock/data";
import type {
  KeywordHit,
  ResumeData,
  ResumeItem,
  TemplateSettings,
} from "@/lib/types/resume";

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
  const meta = TPL_META[settings.template];
  const isLatex = meta.fam === "latex";
  const cls = `resume-print tpl-${settings.template} ${meta.fam} ${
    meta.two ? "two" : "one"
  }`;

  const items = isLatex
    ? contactLine(data)
    : ([
        data.contact.email,
        data.contact.phone,
        data.contact.linkedin,
        data.contact.github,
        data.contact.website,
      ].filter(Boolean) as string[]);

  const contactCls =
    meta.fam === "swiss" ? "col" : isLatex ? "pipe" : "row";

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
    if (isLatex && kind === "edu") {
      return (
        <article key={`${it.role}-${it.meta}`} className="resume-item">
          <div className="rv-item-top">
            <h4 className="resume-item-title">{it.role}</h4>
            <span className="resume-item-meta">{it.meta}</span>
          </div>
          {(it.co || it.loc) && (
            <div className="rv-item-sub">
              {it.co ? <span className="rv-degree">{it.co}</span> : <span />}
              {it.loc ? <span className="rv-cgpa">{it.loc}</span> : null}
            </div>
          )}
          {it.b.length ? bullets(it.b) : null}
        </article>
      );
    }

    if (isLatex && kind === "project") {
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
    isLatex ? "Objective" : "Summary",
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
    data.projects.map((it) => itemBlock(it, "project")),
    !data.projects.length,
  );
  const edu = section(
    "Education",
    data.edu.map((it) => itemBlock(it, "edu")),
    !data.edu.length,
  );
  const skills = section(
    isLatex ? "Technical Skills" : "Skills",
    isLatex ? (
      <ul className="rv-bullets rv-skill-list">
        {data.skills.map((s) => {
          const i = s.indexOf(":");
          return (
            <li
              key={s}
              className={`resume-text${skillHit(s) ? " hit" : ""}`}
            >
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
      </ul>
    ) : (
      <div className="rv-tags">
        {data.skills.map((s) => (
          <span key={s} className={`resume-tag${skillHit(s) ? " hit" : ""}`}>
            {s}
          </span>
        ))}
      </div>
    ),
    !data.skills.length,
  );
  const achievements = section(
    isLatex ? "Achievements" : "Awards",
    isLatex ? (
      <ul className="rv-bullets">
        {data.awards.map(([a, b]) => (
          <li key={a} className="resume-text">
            {a}
            {b ? ` — ${b}` : ""}
          </li>
        ))}
      </ul>
    ) : (
      data.awards.map(([a, b]) => (
        <article key={a} className="resume-item rv-pair">
          <div className="rv-item-top">
            <h4 className="resume-item-title" style={{ fontWeight: 500 }}>
              {a}
            </h4>
            <span className="resume-item-meta">{b}</span>
          </div>
        </article>
      ))
    ),
    !data.awards.length,
  );
  const activities = section(
    isLatex ? "Activities" : "Languages",
    isLatex ? (
      <ul className="rv-bullets">
        {data.langs.map(([a, b]) => (
          <li key={a} className="resume-text">
            {a}
            {b ? ` (${b})` : ""}
          </li>
        ))}
      </ul>
    ) : (
      data.langs.map(([a, b]) => (
        <article key={a} className="resume-item rv-pair">
          <div className="rv-item-top">
            <h4 className="resume-item-title" style={{ fontWeight: 500 }}>
              {a}
            </h4>
            <span className="resume-item-meta">{b}</span>
          </div>
        </article>
      ))
    ),
    !data.langs.length,
  );
  const certs = section(
    "Certifications",
    isLatex ? (
      <ul className="rv-bullets">
        {data.certs.map(([a, b]) => (
          <li key={a} className="resume-text">
            {a}
            {b ? ` (${b})` : ""}
          </li>
        ))}
      </ul>
    ) : (
      data.certs.map(([a, b]) => (
        <article key={a} className="resume-item rv-pair">
          <div className="rv-item-top">
            <h4 className="resume-item-title" style={{ fontWeight: 500 }}>
              {a}
            </h4>
            <span className="resume-item-meta">{b}</span>
          </div>
        </article>
      ))
    ),
    !data.certs.length,
  );

  /* ATS order: Objective → Skills → Achievements → Education → Experience → Projects → Certs → Activities */
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
  const mainSecs = meta.two
    ? [exp, projects, certs]
    : isLatex
      ? latexSecs
      : [objective, exp, projects, edu, skills, activities, certs, achievements];
  const sideSecs = meta.two
    ? [objective, edu, skills, activities, achievements]
    : [];

  return (
    <article className={cls} style={sheetStyle(settings)}>
      <header className="rv-head">
        <div className="rv-id">
          <h1 className="resume-name">{data.name}</h1>
          {!isLatex && data.title ? (
            <p className="resume-title">{data.title}</p>
          ) : null}
        </div>
        <address className={`rv-contact ${contactCls}`}>
          {items.map((t, i) => (
            <span key={t} className="c-item">
              {isLatex && i > 0 ? (
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
        <div className="rv-main">{mainSecs}</div>
        <div className="rv-side">{sideSecs}</div>
      </div>
    </article>
  );
}
