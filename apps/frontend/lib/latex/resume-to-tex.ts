import type { ResumeData } from "@/lib/types/resume";

/** Escape text for LaTeX body (ATS-safe plain text). */
export function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[{}]/g, (c) => (c === "{" ? "\\{" : "\\}"))
    .replace(/[$&#%_^~]/g, (c) => `\\${c}`)
    .replace(/\n+/g, " ");
}

function contactPart(raw: string): string {
  return escapeLatex(raw.trim());
}

function bullets(items: { t: string }[]): string {
  if (!items.length) return "";
  const lines = items
    .map((b) => `    \\item ${escapeLatex(b.t)}`)
    .join("\n");
  return `\\begin{itemize}\n${lines}\n\\end{itemize}`;
}

function skillItems(skills: string[]): string {
  const lines = skills
    .map((s) => {
      const i = s.indexOf(":");
      if (i > 0) {
        return `    \\item \\textbf{${escapeLatex(s.slice(0, i + 1))}}${escapeLatex(s.slice(i + 1))}`;
      }
      return `    \\item ${escapeLatex(s)}`;
    })
    .join("\n");
  return `\\begin{itemize}\n${lines}\n\\end{itemize}`;
}

export type TexOptions = {
  pageSize?: "A4" | "LETTER";
  marginIn?: number;
};

/**
 * ATS-safe single-column article.
 * No multicol, no icons, no color — one \\titlerule under each section.
 */
export function resumeToLatex(
  data: ResumeData,
  opts: TexOptions = {},
): string {
  const paper = opts.pageSize === "A4" ? "a4paper" : "letterpaper";
  const margin = opts.marginIn ?? 0.75;

  const contact = [
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    data.contact.linkedin,
    data.contact.github,
    data.contact.website,
  ]
    .filter(Boolean)
    .map((c) => contactPart(c as string))
    .join(" \\quad | \\quad ");

  /* School \\hfill dates; degree \\hfill CGPA */
  const edu = data.edu
    .map((e) => {
      const lines = [
        `\\textbf{${escapeLatex(e.role)}} \\hfill ${escapeLatex(e.meta)} \\\\`,
        e.co
          ? `${escapeLatex(e.co)}${e.loc ? ` \\hfill \\textit{${escapeLatex(e.loc)}}` : ""} \\\\`
          : e.loc
            ? `\\textit{${escapeLatex(e.loc)}} \\\\`
            : "",
        ...e.b.map((b) => `${escapeLatex(b.t)} \\\\`),
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");

  const projects = data.projects
    .map((p) => {
      return [
        `\\textbf{${escapeLatex(p.role)}}${p.meta ? ` \\hfill ${escapeLatex(p.meta)}` : ""} \\\\`,
        p.co ? `${escapeLatex(p.co)} \\\\` : "",
        bullets(p.b),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const exp = data.exp
    .map((e) => {
      return [
        `\\textbf{${escapeLatex(e.role)}} \\hfill ${escapeLatex(e.meta)} \\\\`,
        e.co ? `${escapeLatex(e.co)} \\\\` : "",
        bullets(e.b),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const awards =
    data.awards.length > 0
      ? `\\begin{itemize}\n${data.awards
          .map(
            ([a, b]) =>
              `    \\item ${escapeLatex(a)}${b ? ` --- ${escapeLatex(b)}` : ""}`,
          )
          .join("\n")}\n\\end{itemize}`
      : "";

  const certs =
    data.certs.length > 0
      ? `\\begin{itemize}\n${data.certs
          .map(
            ([a, b]) =>
              `    \\item ${escapeLatex(a)}${b ? ` (${escapeLatex(b)})` : ""}`,
          )
          .join("\n")}\n\\end{itemize}`
      : "";

  const activities =
    data.langs.length > 0
      ? `\\begin{itemize}\n${data.langs
          .map(
            ([a, b]) =>
              `    \\item ${escapeLatex(a)}${b ? ` (${escapeLatex(b)})` : ""}`,
          )
          .join("\n")}\n\\end{itemize}`
      : "";

  /* Single-column order matching ATS article (image content, no multicol) */
  const sections: string[] = [];
  if (data.summary.trim()) {
    sections.push(`\\section*{Objective}\n${escapeLatex(data.summary)}`);
  }
  if (data.skills.length) {
    sections.push(`\\section*{Technical Skills}\n${skillItems(data.skills)}`);
  }
  if (awards) sections.push(`\\section*{Achievements}\n${awards}`);
  if (edu) sections.push(`\\section*{Education}\n${edu}`);
  if (exp) sections.push(`\\section*{Experience}\n${exp}`);
  if (projects) sections.push(`\\section*{Projects}\n${projects}`);
  if (certs) sections.push(`\\section*{Certifications}\n${certs}`);
  if (activities) sections.push(`\\section*{Activities}\n${activities}`);

  return `\\documentclass[10.5pt, ${paper}]{article}

% ===== ATS-SAFE: no multicol, no icons, no color blocks =====
\\usepackage[margin=${margin}in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage{hyperref}

\\pagestyle{empty}
\\setlist[itemize]{leftmargin=*, itemsep=1pt, topsep=2pt, parsep=0pt}
\\titleformat{\\section}{\\bfseries\\large}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{10pt}{6pt}

\\hypersetup{colorlinks=true, linkcolor=black, urlcolor=black}

\\begin{document}

\\begin{center}
    {\\Large \\textbf{${escapeLatex(data.name)}}} \\\\[2pt]
    ${contact}
\\end{center}

${sections.join("\n\n")}

\\end{document}
`;
}
