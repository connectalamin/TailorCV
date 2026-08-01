from __future__ import annotations

from services.skills_fmt import categorize_skills


def escape(s: str) -> str:
    return (
        s.replace("\\", "\\textbackslash{}")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("$", "\\$")
        .replace("&", "\\&")
        .replace("#", "\\#")
        .replace("%", "\\%")
        .replace("_", "\\_")
        .replace("^", "\\^")
        .replace("~", "\\~")
        .replace("\n", " ")
    )


def _g(d: dict, k: str, default: str = "") -> str:
    v = d.get(k)
    return default if v is None else str(v)


def _bullets(items: list[dict]) -> str:
    if not items:
        return ""
    lines = "\n".join(f"    \\item {escape(_g(b, 't'))}" for b in items)
    return f"\\begin{{itemize}}\n{lines}\n\\end{{itemize}}"


def _skills(skills: list[str]) -> str:
    """Categorized skill lines; two-column tabular when 4+ categories (ATS-safe text)."""
    items: list[str] = []
    for s in skills:
        i = s.find(":")
        if i > 0:
            items.append(
                f"\\textbf{{{escape(s[: i + 1])}}}{escape(s[i + 1:])}"
            )
        else:
            items.append(escape(s))
    if not items:
        return ""
    if len(items) >= 4:
        # Pair into two columns without multicol package
        rows = []
        for i in range(0, len(items), 2):
            left = f"\\textbullet\\ {items[i]}"
            right = f"\\textbullet\\ {items[i + 1]}" if i + 1 < len(items) else ""
            rows.append(f"{left} & {right} \\\\")
        body = "\n".join(rows)
        return (
            "\\noindent\\begin{tabular*}{\\textwidth}{@{}p{0.48\\textwidth}@{\\extracolsep{\\fill}}p{0.48\\textwidth}@{}}\n"
            f"{body}\n\\end{{tabular*}}"
        )
    lines = "\n".join(f"    \\item {it}" for it in items)
    return f"\\begin{{itemize}}\n{lines}\n\\end{{itemize}}"


def _pairs(items: list, sep_paren: bool) -> str:
    """Achievement/cert lines; two-column when many items."""
    rows_txt: list[str] = []
    for p in items:
        a = p[0] if len(p) > 0 else ""
        b = p[1] if len(p) > 1 else ""
        if sep_paren:
            rows_txt.append(escape(a) + (f" ({escape(b)})" if b else ""))
        else:
            rows_txt.append(escape(a) + (f" --- {escape(b)}" if b else ""))
    if not rows_txt:
        return ""
    if len(rows_txt) >= 4:
        rows = []
        for i in range(0, len(rows_txt), 2):
            left = f"\\textbullet\\ {rows_txt[i]}"
            right = f"\\textbullet\\ {rows_txt[i + 1]}" if i + 1 < len(rows_txt) else ""
            rows.append(f"{left} & {right} \\\\")
        body = "\n".join(rows)
        return (
            "\\noindent\\begin{tabular*}{\\textwidth}{@{}p{0.48\\textwidth}@{\\extracolsep{\\fill}}p{0.48\\textwidth}@{}}\n"
            f"{body}\n\\end{{tabular*}}"
        )
    lines = "\n".join(f"    \\item {t}" for t in rows_txt)
    return f"\\begin{{itemize}}\n{lines}\n\\end{{itemize}}"


def build(
    data: dict,
    page_size: str = "LETTER",
    margin_in: float = 0.75,
    projects_two_column: bool = True,
) -> str:
    paper = "a4paper" if page_size == "A4" else "letterpaper"
    contact = (data.get("contact") or {})
    skills = categorize_skills(data.get("skills") or [])
    parts = [
        contact.get("location"),
        contact.get("email"),
        contact.get("phone"),
        contact.get("linkedin"),
        contact.get("github"),
        contact.get("website"),
    ]
    contact_tex = " \\quad | \\quad ".join(escape(str(c).strip()) for c in parts if c)

    edu = data.get("edu") or []
    edu_blocks = []
    for e in edu:
        # co=school, role=degree, meta=dates, loc=GPA
        school = _g(e, "co") or _g(e, "role")
        degree = _g(e, "role") if _g(e, "co") else ""
        dates = _g(e, "meta")
        gpa = _g(e, "loc")
        lines = []
        if school:
            lines.append(f"\\textbf{{{escape(school)}}} \\hfill {escape(dates)} \\\\")
        elif dates:
            lines.append(f"\\hfill {escape(dates)} \\\\")
        if degree or gpa:
            deg = escape(degree) if degree else ""
            gp = f"\\textit{{{escape(gpa)}}}" if gpa else ""
            if deg and gp:
                lines.append(f"{deg} \\hfill {gp} \\\\")
            elif deg:
                lines.append(f"{deg} \\\\")
            else:
                lines.append(f"\\hfill {gp} \\\\")
        for b in e.get("b") or []:
            lines.append(f"{escape(_g(b, 't'))} \\\\")
        edu_blocks.append("\n".join(x for x in lines if x))
    edu_tex = "\n\n".join(edu_blocks)

    proj_blocks = []
    for p in data.get("projects") or []:
        meta = _g(p, "meta")
        head = f"\\textbf{{{_g(p, 'role')}}}{(f' \\hfill {escape(meta)}' if meta else '')} \\\\"
        co = _g(p, "co")
        body = [head]
        if co:
            body.append(f"\\textit{{{escape(co)}}} \\\\")
        # Prefer short one-liner from first bullet when two-column (denser)
        bls = p.get("b") or []
        if bls:
            if projects_two_column and len(bls) == 1:
                body.append(f"\\textit{{{escape(_g(bls[0], 't'))}}}")
            else:
                body.append(_bullets(bls))
        proj_blocks.append("\n".join(body))

    if projects_two_column and len(proj_blocks) >= 2:
        rows = []
        for i in range(0, len(proj_blocks), 2):
            left = proj_blocks[i]
            right = proj_blocks[i + 1] if i + 1 < len(proj_blocks) else ""
            rows.append(
                "\\begin{minipage}[t]{0.48\\textwidth}\n"
                f"{left}\n\\end{{minipage}}\\hfill\n"
                "\\begin{minipage}[t]{0.48\\textwidth}\n"
                f"{right}\n\\end{{minipage}}"
            )
        proj_tex = "\n\\vspace{4pt}\n".join(rows)
    else:
        proj_tex = "\n\n".join(proj_blocks)

    exp_blocks = []
    for e in data.get("exp") or []:
        head = f"\\textbf{{{_g(e, 'role')}}} \\hfill {_g(e, 'meta')} \\\\"
        co = _g(e, "co")
        body = [head]
        if co:
            body.append(f"{escape(co)} \\\\")
        bl = _bullets(e.get("b") or [])
        if bl:
            body.append(bl)
        exp_blocks.append("\n".join(body))
    exp_tex = "\n\n".join(exp_blocks)

    awards = data.get("awards") or []
    certs = data.get("certs") or []
    langs = data.get("langs") or []

    sections: list[str] = []
    summary = (data.get("summary") or "").strip()
    if summary:
        sections.append(f"\\section*{{Objective}}\n{escape(summary)}")
    if skills:
        sections.append(f"\\section*{{Technical Skills}}\n{_skills(skills)}")
    if awards:
        sections.append(f"\\section*{{Achievements}}\n{_pairs(awards, sep_paren=False)}")
    if edu_tex:
        sections.append(f"\\section*{{Education}}\n{edu_tex}")
    if exp_tex:
        sections.append(f"\\section*{{Experience}}\n{exp_tex}")
    if proj_tex:
        sections.append(f"\\section*{{Projects}}\n{proj_tex}")
    if certs:
        sections.append(f"\\section*{{Certifications}}\n{_pairs(certs, sep_paren=True)}")
    if langs:
        sections.append(f"\\section*{{Activities}}\n{_pairs(langs, sep_paren=True)}")

    name = escape(_g(data, "name", "Candidate"))
    body = "\n\n".join(sections)

    return f"""\\documentclass[10.5pt, {paper}]{{article}}

% ===== ATS-SAFE: no multicol, no icons, no color blocks =====
\\usepackage[margin={margin_in}in]{{geometry}}
\\usepackage[T1]{{fontenc}}
\\usepackage{{lmodern}}
\\usepackage{{enumitem}}
\\usepackage{{titlesec}}
\\usepackage{{hyperref}}

\\pagestyle{{empty}}
\\setlist[itemize]{{leftmargin=*, itemsep=1pt, topsep=2pt, parsep=0pt}}
\\titleformat{{\\section}}{{\\bfseries\\large}}{{}}{{0em}}{{}}[\\titlerule]
\\titlespacing{{\\section}}{{0pt}}{{10pt}}{{6pt}}

\\hypersetup{{colorlinks=true, linkcolor=black, urlcolor=black}}

\\begin{{document}}

\\begin{{center}}
    {{\\Large \\textbf{{{name}}}}} \\\\[2pt]
    {contact_tex}
\\end{{center}}

{body}

\\end{{document}}
"""
