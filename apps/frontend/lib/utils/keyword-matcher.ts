/** Keyword extraction / matching for JD Match (mock client-side). */

const STOP = new Set(
  `a an the and or but in on at to for of as is was are were be been being
  with by from that this these those it its i you he she we they them their
  our your my me him her us not no yes do does did done have has had will would
  can could should may might must shall about into over under after before
  than then so if when while where who what which how why all any each few
  more most other some such only own same too very just also`.split(/\s+/),
);

export function extractKeywords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9+.#-]{1,}/g) ?? []) {
    if (STOP.has(raw) || raw.length < 3) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 68)
    .map(([k]) => k);
}

export function matchKeywords(
  resumeText: string,
  keywords: string[],
): { matches: string[]; missing: string[]; rate: number } {
  const lower = resumeText.toLowerCase();
  const matches = keywords.filter((k) => lower.includes(k.toLowerCase()));
  const missing = keywords.filter((k) => !lower.includes(k.toLowerCase()));
  const rate =
    keywords.length === 0
      ? 0
      : Math.round((matches.length / keywords.length) * 100);
  return { matches, missing, rate };
}

export function resumeToPlainText(data: {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  edu?: { co: string; role: string; b: { t: string }[] }[];
  exp: { co: string; role: string; b: { t: string }[] }[];
  projects: { co: string; role: string; b: { t: string }[] }[];
}): string {
  const bits = [
    data.name,
    data.title,
    data.summary,
    ...data.skills,
    ...(data.edu ?? []).flatMap((e) => [e.co, e.role, ...e.b.map((x) => x.t)]),
    ...data.exp.flatMap((e) => [e.co, e.role, ...e.b.map((x) => x.t)]),
    ...data.projects.flatMap((e) => [e.co, e.role, ...e.b.map((x) => x.t)]),
  ];
  return bits.join(" ");
}

export function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  const escaped = keywords
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return text.replace(re, '<mark class="jd-hit">$1</mark>');
}
