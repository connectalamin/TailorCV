"""Normalize flat skill lists into ATS categorized lines."""

from __future__ import annotations

import re

# Order matters for output
_CATEGORY_ORDER = (
    "Languages",
    "Frontend",
    "Backend",
    "Databases",
    "AI/Data",
    "DevOps/Tools",
    "Other",
)

_BUCKETS: dict[str, tuple[str, ...]] = {
    "Languages": (
        "javascript",
        "typescript",
        "python",
        "java",
        "c++",
        "c#",
        "go",
        "golang",
        "rust",
        "ruby",
        "php",
        "swift",
        "kotlin",
        "scala",
        "r",
        "sql",
        "html",
        "css",
        "bash",
        "shell",
    ),
    "Frontend": (
        "react",
        "next.js",
        "nextjs",
        "vue",
        "angular",
        "svelte",
        "tailwind",
        "tailwind css",
        "bootstrap",
        "redux",
        "zustand",
        "jquery",
        "webpack",
        "vite",
        "sass",
        "scss",
    ),
    "Backend": (
        "node.js",
        "nodejs",
        "node",
        "express",
        "fastapi",
        "django",
        "flask",
        "spring",
        "nestjs",
        "graphql",
        "rest",
        "grpc",
        "prisma",
        "drizzle",
        ".net",
        "asp.net",
    ),
    "Databases": (
        "postgresql",
        "postgres",
        "mysql",
        "mongodb",
        "redis",
        "sqlite",
        "dynamodb",
        "elasticsearch",
        "firestore",
        "supabase",
        "prisma",
    ),
    "AI/Data": (
        "pytorch",
        "tensorflow",
        "langchain",
        "openai",
        "llm",
        "pandas",
        "numpy",
        "scikit-learn",
        "sklearn",
        "huggingface",
        "machine learning",
        "deep learning",
        "nlp",
        "computer vision",
    ),
    "DevOps/Tools": (
        "docker",
        "kubernetes",
        "k8s",
        "aws",
        "gcp",
        "azure",
        "git",
        "github",
        "gitlab",
        "ci/cd",
        "linux",
        "nginx",
        "terraform",
        "jenkins",
        "vercel",
        "netlify",
        "firebase",
        "linux",
    ),
}


def _already_categorized(skills: list[str]) -> bool:
    if not skills:
        return False
    with_colon = sum(1 for s in skills if ":" in s and len(s.split(":", 1)[0].strip()) < 40)
    return with_colon >= max(1, (len(skills) + 1) // 2)


def _split_tokens(raw: str) -> list[str]:
    parts = re.split(r"[,|/•·;]+", raw)
    return [p.strip() for p in parts if p.strip()]


def _bucket_for(token: str) -> str:
    low = token.lower().strip()
    for cat, words in _BUCKETS.items():
        for w in words:
            if low == w or low.startswith(w + " ") or low.endswith(" " + w):
                return cat
            # next.js vs nextjs
            if low.replace(".", "") == w.replace(".", ""):
                return cat
    return "Other"


def categorize_skills(skills: list[str] | None) -> list[str]:
    """
    Turn ['React', 'Node.js', ...] or mixed lines into
    ['Languages: …', 'Frontend: …', ...].
    Preserves already-categorized lines when most entries have Category: items.
    """
    if not skills:
        return []

    cleaned = [str(s).strip() for s in skills if str(s).strip()]
    if not cleaned:
        return []

    if _already_categorized(cleaned):
        # Keep category lines; fold bare tokens into Other or matching category
        by_cat: dict[str, list[str]] = {c: [] for c in _CATEGORY_ORDER}
        for line in cleaned:
            if ":" in line:
                cat, rest = line.split(":", 1)
                cat = cat.strip() or "Other"
                if cat not in by_cat:
                    # normalize known aliases
                    cl = cat.lower()
                    mapped = None
                    for known in _CATEGORY_ORDER:
                        if known.lower() == cl or known.lower().startswith(cl):
                            mapped = known
                            break
                    cat = mapped or cat
                    if cat not in by_cat:
                        by_cat[cat] = []
                for tok in _split_tokens(rest):
                    if tok and tok.lower() not in {t.lower() for t in by_cat[cat]}:
                        by_cat[cat].append(tok)
            else:
                for tok in _split_tokens(line):
                    b = _bucket_for(tok)
                    if tok.lower() not in {t.lower() for t in by_cat[b]}:
                        by_cat[b].append(tok)
        out = []
        for cat in list(by_cat.keys()):
            items = by_cat[cat]
            if items:
                out.append(f"{cat}: {', '.join(items)}")
        return out[:10]

    # Flat list of individual skills → categorize
    by_cat: dict[str, list[str]] = {c: [] for c in _CATEGORY_ORDER}
    for line in cleaned:
        for tok in _split_tokens(line):
            b = _bucket_for(tok)
            if tok.lower() not in {t.lower() for t in by_cat[b]}:
                by_cat[b].append(tok)

    out = []
    for cat in _CATEGORY_ORDER:
        items = by_cat[cat]
        if items:
            out.append(f"{cat}: {', '.join(items)}")
    return out[:10] if out else cleaned[:12]
