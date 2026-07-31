from __future__ import annotations


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
    out = []
    for s in skills:
        i = s.find(":")
        if i > 0:
            out.append(
                f"    \\item \\textbf{{{escape(s[: i + 1])}}}{escape(s[i + 1:])}"
            )
        else:
            out.append(f"    \\item {escape(s)}")
    return "\\begin{itemize}\n" + "\n".join(out) + "\n\\end{itemize}"


def _pairs(items: list, sep_paren: bool) -> str:
    rows = []
    for p in items:
        a = p[0] if len(p) > 0 else ""
        b = p[1] if len(p) > 1 else ""
        if sep_paren:
            rows.append(f"    \\item {escape(a)}{(f' ({escape(b)})' if b else '')}")
        else:
            rows.append(f"    \\item {escape(a)}{(f' --- {escape(b)}' if b else '')}")
    return "\\begin{itemize}\n" + "\n".join(rows) + "\n\\end{itemize}"


def build(data: dict, page_size: str = "LETTER", margin_in: float = 0.75) -> str:
    paper = "a4paper" if page_size == "A4" else "letterpaper"
    contact = (data.get("contact") or {})
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
        lines = [f"\\textbf{{{_g(e, 'role')}}} \\hfill {_g(e, 'meta')} \\\\"]
        co = _g(e, "co")
        loc = _g(e, "loc")
        if co:
            lines.append(
                f"{escape(co)}{(f' \\hfill \\textit{{{escape(loc)}}}' if loc else '')} \\\\"
            )
        elif loc:
            lines.append(f"\\textit{{{escape(loc)}}} \\\\")
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
            body.append(f"{escape(co)} \\\\")
        bl = _bullets(p.get("b") or [])
        if bl:
            body.append(bl)
        proj_blocks.append("\n".join(body))
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
    if data.get("skills"):
        sections.append(f"\\section*{{Technical Skills}}\n{_skills(data['skills'])}")
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
