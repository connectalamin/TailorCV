from __future__ import annotations

import re

_STOP = {
    "the", "and", "for", "with", "from", "that", "this", "your", "you", "our",
    "will", "have", "has", "are", "was", "were", "been", "being", "their",
    "they", "them", "about", "into", "over", "after", "also", "such", "than",
    "then", "when", "where", "which", "while", "who", "whom", "what", "work",
    "working", "team", "role", "join", "using", "build", "building", "strong",
    "good", "great", "must", "should", "able", "experience", "years", "year",
    "plus", "etc", "including", "within", "across", "based", "remote", "onsite",
    "hybrid", "location", "salary", "benefits", "apply", "application",
    "description", "requirements", "responsibilities", "nice", "have", "haves",
    "bonus", "points", "skills", "skill", "looking", "seeking", "seek",
}


def extract(jd: str) -> list[dict]:
    if not jd or not jd.strip():
        return []
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9#+.\-]{2,}", jd)
    seen: set[str] = set()
    out: list[str] = []
    for t in tokens:
        low = t.lower()
        if low in _stop or low in seen:
            continue
        seen.add(low)
        out.append(t)
        if len(out) >= 12:
            break
    hits = []
    for i, k in enumerate(out):
        hits.append({"k": k, "m": max(60, 96 - i * 2)})
    return hits
