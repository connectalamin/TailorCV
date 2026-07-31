import type { CSSProperties, ReactNode } from "react";
import {
  ACCENTS,
  PAGE,
  TPL_META,
} from "@/lib/mock/data";
import type {
  KeywordHit,
  ResumeData,
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
  const fam = TPL_META[settings.template].fam;
  const accentKey = fam === "swiss" ? "teal" : settings.accent;
  const A = ACCENTS[accentKey];

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
    ["--acc" as string]: A.c,
    ["--acc-soft" as string]: A.soft,
    ["--acc-ink" as string]: A.ink,
    ["--f-head" as string]: FONTS[settings.headerFont],
    ["--f-body" as string]: FONTS[settings.bodyFont],
  };
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
  const cls = `resume-print tpl-${settings.template} ${meta.fam} ${
    meta.two ? "two" : "one"
  }`;

  const contactItems = [
    data.contact.email,
    data.contact.phone,
    data.contact.linkedin,
    data.contact.github,
    data.contact.website,
  ].filter(Boolean) as string[];

  const contactCls = meta.fam === "swiss" ? "col" : "row";

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

  function bullets(items: ResumeData["exp"][0]["b"]) {
    return (
      <ul className="rv-bullets">
        {items.map((b) => {
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

  function itemBlock(it: ResumeData["exp"][0]) {
    return (
      <article key={`${it.co}-${it.role}-${it.meta}`} className="resume-item">
        <div className="rv-item-top">
          <h4 className="resume-item-title">{it.role}</h4>
          <span className="resume-item-meta">{it.meta}</span>
        </div>
        <div className="rv-item-sub">
          <span className="rv-co">{it.co}</span>
          <span className="rv-loc">{it.loc}</span>
        </div>
        {it.b.length ? bullets(it.b) : null}
      </article>
    );
  }

  function section(title: string, inner: ReactNode) {
    return (
      <section className="resume-section">
        <h3 className="resume-section-title">{title}</h3>
        <div className="resume-items">{inner}</div>
      </section>
    );
  }

  const summary = section(
    "Summary",
    <p className="resume-text rv-summary">{data.summary}</p>,
  );
  const exp = section("Work Experience", data.exp.map(itemBlock));
  const projects = section("Projects", data.projects.map(itemBlock));
  const edu = section("Education", data.edu.map(itemBlock));
  const skills = section(
    "Skills",
    <div className="rv-tags">
      {data.skills.map((s) => (
        <span key={s} className={`resume-tag${skillHit(s) ? " hit" : ""}`}>
          {s}
        </span>
      ))}
    </div>,
  );
  const langs = section(
    "Languages",
    data.langs.map(([a, b]) => (
      <article key={a} className="resume-item rv-pair">
        <div className="rv-item-top">
          <h4 className="resume-item-title" style={{ fontWeight: 500 }}>
            {a}
          </h4>
          <span className="resume-item-meta">{b}</span>
        </div>
      </article>
    )),
  );
  const certs = section(
    "Certifications",
    data.certs.map(([a, b]) => (
      <article key={a} className="resume-item rv-pair">
        <div className="rv-item-top">
          <h4 className="resume-item-title" style={{ fontWeight: 500 }}>
            {a}
          </h4>
          <span className="resume-item-meta">{b}</span>
        </div>
      </article>
    )),
  );
  const awards = section(
    "Awards",
    data.awards.map(([a, b]) => (
      <article key={a} className="resume-item rv-pair">
        <div className="rv-item-top">
          <h4 className="resume-item-title" style={{ fontWeight: 500 }}>
            {a}
          </h4>
          <span className="resume-item-meta">{b}</span>
        </div>
      </article>
    )),
  );

  const mainSecs = meta.two
    ? [exp, projects, certs]
    : [summary, exp, projects, edu, skills, langs, certs, awards];
  const sideSecs = meta.two
    ? [summary, edu, skills, langs, awards]
    : [];

  return (
    <article className={cls} style={sheetStyle(settings)}>
      <header className="rv-head">
        <div className="rv-id">
          <h1 className="resume-name">{data.name}</h1>
          <p className="resume-title">{data.title}</p>
        </div>
        <address className={`rv-contact ${contactCls}`}>
          {contactItems.map((t) => (
            <span key={t} className="c-item">
              {t.includes("@") || t.includes(".") ? (
                <span style={{ color: "var(--acc, #0D9488)" }}>{t}</span>
              ) : (
                t
              )}
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
