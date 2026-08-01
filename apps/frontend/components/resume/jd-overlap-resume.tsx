import { HighlightedText } from "@/components/resume/highlighted-text";
import type { ResumeData } from "@/lib/types/resume";

function SectionIcon({ kind }: { kind: "summary" | "exp" | "skills" | "edu" | "projects" }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
  } as const;
  switch (kind) {
    case "summary":
      return (
        <svg {...common}>
          <path d="M8 6h11M8 12h11M8 18h7" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case "exp":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "skills":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "edu":
      return (
        <svg {...common}>
          <path d="m4 10 8-4 8 4-8 4-8-4Z" />
          <path d="M8 12v4c2 1.5 6 1.5 8 0v-4" />
        </svg>
      );
    case "projects":
      return (
        <svg {...common}>
          <path d="M4 7h16v12H4z" />
          <path d="M8 7V5h8v2" />
        </svg>
      );
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function rateTone(rate: number) {
  if (rate >= 80) return "is-good";
  if (rate >= 55) return "is-ok";
  return "is-low";
}

export function JdOverlapResume({
  data,
  keywords,
  rate,
}: {
  data: ResumeData;
  keywords: string[];
  rate: number;
}) {
  const H = ({ text }: { text: string }) => (
    <HighlightedText text={text} keywords={keywords} />
  );

  return (
    <div className="jd-overlap">
      <div className="jd-overlap-banner">
        <div>
          <h3 className="jd-overlap-title">Your resume</h3>
          <p className="jd-overlap-sub">(matching keywords highlighted)</p>
        </div>
        <div className={`jd-overlap-rate ${rateTone(rate)}`}>
          <span className="jd-overlap-rate-label">ATS fit</span>
          <strong>{rate}%</strong>
        </div>
      </div>

      <div className="jd-overlap-stack">
        {data.summary ? (
          <section className="jd-sec">
            <header className="jd-sec-h">
              <span className="jd-sec-ico">
                <SectionIcon kind="summary" />
              </span>
              <h4>Summary</h4>
            </header>
            <p className="jd-sec-body">
              <H text={data.summary} />
            </p>
          </section>
        ) : null}

        {data.exp.length ? (
          <section className="jd-sec">
            <header className="jd-sec-h">
              <span className="jd-sec-ico">
                <SectionIcon kind="exp" />
              </span>
              <h4>Experience</h4>
            </header>
            <div className="jd-sec-list">
              {data.exp.map((it) => (
                <article key={`${it.co}-${it.role}-${it.meta}`} className="jd-item">
                  <div className="jd-item-top">
                    <h5>
                      <H text={it.role} />
                      {it.co ? (
                        <>
                          {" at "}
                          <H text={it.co} />
                        </>
                      ) : null}
                    </h5>
                    {it.meta ? <span className="jd-item-meta">{it.meta}</span> : null}
                  </div>
                  {it.b.length ? (
                    <ul>
                      {it.b.map((b) => (
                        <li key={b.t}>
                          <H text={b.t} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {data.projects.length ? (
          <section className="jd-sec">
            <header className="jd-sec-h">
              <span className="jd-sec-ico">
                <SectionIcon kind="projects" />
              </span>
              <h4>Projects</h4>
            </header>
            <div className="jd-sec-list">
              {data.projects.map((it) => (
                <article key={`${it.role}-${it.meta}`} className="jd-item">
                  <div className="jd-item-top">
                    <h5>
                      <H text={it.role} />
                    </h5>
                    {it.meta ? <span className="jd-item-meta">{it.meta}</span> : null}
                  </div>
                  {it.co ? (
                    <p className="jd-item-tech">
                      <H text={it.co} />
                    </p>
                  ) : null}
                  {it.b.length ? (
                    <ul>
                      {it.b.map((b) => (
                        <li key={b.t}>
                          <H text={b.t} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {data.edu.length ? (
          <section className="jd-sec">
            <header className="jd-sec-h">
              <span className="jd-sec-ico">
                <SectionIcon kind="edu" />
              </span>
              <h4>Education</h4>
            </header>
            <div className="jd-sec-list">
              {data.edu.map((it) => (
                <article key={`${it.role}-${it.co}`} className="jd-item">
                  <div className="jd-item-top">
                    <h5>
                      <H text={it.role} />
                    </h5>
                    {it.meta ? <span className="jd-item-meta">{it.meta}</span> : null}
                  </div>
                  {it.co ? (
                    <p>
                      <H text={it.co} />
                      {it.loc ? ` · ${it.loc}` : ""}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {data.skills.length ? (
          <section className="jd-sec">
            <header className="jd-sec-h">
              <span className="jd-sec-ico">
                <SectionIcon kind="skills" />
              </span>
              <h4>Skills</h4>
            </header>
            <ul className="jd-skill-list">
              {data.skills.map((s) => {
                const i = s.indexOf(":");
                return (
                  <li key={s}>
                    {i > 0 ? (
                      <>
                        <strong>
                          <H text={s.slice(0, i + 1)} />
                        </strong>
                        <H text={s.slice(i + 1)} />
                      </>
                    ) : (
                      <H text={s} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
