from __future__ import annotations


def default_cover(data: dict, role_hint: str | None = None) -> str:
    role = role_hint or data.get("title") or "the open role"
    summary = data.get("summary") or ""
    projects = data.get("projects") or []
    skills = data.get("skills") or []
    first_proj = projects[0].get("role") if projects else "relevant projects"
    top_skills = "; ".join(skills[:2]) if skills else "relevant tooling"
    name = data.get("name") or ""
    return "\n".join(
        [
            "Dear Hiring Manager,",
            "",
            f"I am writing to express my interest in {role}. {summary}".strip(),
            "",
            f"My recent work includes {first_proj}, and I am comfortable with {top_skills}.",
            "",
            "I would welcome the chance to discuss how I can contribute to your team.",
            "",
            "Sincerely,",
            name,
        ]
    )


def default_outreach(data: dict, role_hint: str | None = None) -> str:
    role = role_hint or data.get("title") or "your opening"
    skills = data.get("skills") or []
    projects = data.get("projects") or []
    first_skill = skills[0] if skills else "relevant technical work"
    first_proj = projects[0].get("role") if projects else "related projects"
    name = data.get("name") or ""
    return "\n".join(
        [
            f"Hi — I saw the {role} posting and wanted to reach out briefly.",
            "",
            f"I focus on {first_skill} and recently worked on {first_proj}. Happy to share a tailored resume if useful.",
            "",
            f"— {name}",
        ]
    )
