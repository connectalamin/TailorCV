from __future__ import annotations

import json
import re
from typing import Any, Optional

import litellm

PROVIDER_INFO: dict[str, dict[str, Any]] = {
    "openai": {"name": "OpenAI", "defaultModel": "gpt-4o-mini", "requiresKey": True},
    "openai_compatible": {
        "name": "OpenAI Compatible",
        "defaultModel": "gpt-4o-mini",
        "requiresKey": True,
        "requiresBase": True,
    },
    "anthropic": {"name": "Anthropic", "defaultModel": "claude-haiku-4-5-20251001", "requiresKey": True},
    "openrouter": {"name": "OpenRouter", "defaultModel": "deepseek/deepseek-chat", "requiresKey": True},
    "gemini": {"name": "Google Gemini", "defaultModel": "gemini-2.0-flash", "requiresKey": True},
    "deepseek": {"name": "DeepSeek", "defaultModel": "deepseek-chat", "requiresKey": True},
    "ollama": {"name": "Ollama (Local)", "defaultModel": "llama3.2", "requiresKey": False},
}

_PREFIX = {"openrouter": "openrouter/", "deepseek": "deepseek/", "gemini": "gemini/"}


def is_configured(cfg: dict) -> bool:
    provider = cfg.get("provider")
    info = PROVIDER_INFO.get(provider or "")
    if not info:
        return False
    if info["requiresKey"] and not cfg.get("api_key"):
        return False
    if info.get("requiresBase") and not (cfg.get("api_base") or "").strip():
        return False
    return True


def _model(cfg: dict) -> str:
    provider = cfg.get("provider") or ""
    model = cfg.get("model") or PROVIDER_INFO.get(provider, {}).get("defaultModel") or ""
    if provider == "openai_compatible":
        if model and not model.startswith("openai/"):
            return f"openai/{model}"
        return model
    pfx = _PREFIX.get(provider)
    if pfx and model and not model.startswith(pfx):
        model = pfx + model
    return model


def _base_kwargs(cfg: dict) -> dict:
    kw: dict[str, Any] = {"model": _model(cfg)}
    key = cfg.get("api_key")
    if key:
        kw["api_key"] = key
    base = (cfg.get("api_base") or "").strip()
    if base:
        kw["api_base"] = base
    elif (cfg.get("provider") or "") == "ollama":
        # Host Ollama from inside Docker (Desktop / WSL)
        kw["api_base"] = "http://host.docker.internal:11434"
    return kw


def _strip_fence(s: str) -> str:
    s = s.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", s, re.S)
    if m:
        return m.group(1).strip()
    return s


def _complete(cfg: dict, messages: list[dict], *, json_mode: bool = False, max_tokens: int = 1400) -> Optional[str]:
    try:
        kw = _base_kwargs(cfg)
        kw.update(messages=messages, max_tokens=max_tokens, temperature=0.2)
        if json_mode:
            kw["response_format"] = {"type": "json_object"}
        resp = litellm.completion(**kw)
        return resp.choices[0].message.content or ""
    except Exception:
        return None


_SCHEMA_HINT = (
    "Return ONLY a JSON object with these exact keys: "
    "name (string, required), title (string), summary (string), "
    "contact {email, phone, linkedin, website, github, location} (strings or omit), "
    "exp, projects, edu each an array of {co, role, meta, loc, b:[{t}]} (strings; b are bullet objects with key t), "
    "skills array of strings, langs/certs/awards arrays of [string,string]. "
    "Use empty arrays/strings when unknown. No prose, no markdown."
)


def structure(text: str, cfg: dict) -> Optional[dict]:
    if not is_configured(cfg) or not text.strip():
        return None
    msgs = [
        {"role": "system", "content": "You extract a resume into strict JSON. " + _SCHEMA_HINT},
        {"role": "user", "content": f"Resume text:\n\n{text[:6000]}"},
    ]
    raw = _complete(cfg, msgs, json_mode=True, max_tokens=2000)
    if not raw:
        return None
    try:
        return json.loads(_strip_fence(raw))
    except json.JSONDecodeError:
        return None


def tailor(data: dict, jd: str, cfg: dict) -> Optional[dict]:
    if not is_configured(cfg) or not jd.strip():
        return None
    role = data.get("title") or "the role"
    msgs = [
        {
            "role": "system",
            "content": (
                "You tailor a candidate's resume to a job description. "
                "Return ONLY JSON with keys: summary (string, 2-3 sentences, keyword-aligned), "
                "cover_letter (string, formal, 3 short paragraphs), "
                "outreach_message (string, 60-90 word cold email). No markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Target role: {role}\n\nJob description:\n{jd[:4000]}\n\n"
                f"Candidate summary: {data.get('summary','')}\n"
                f"Top skills: {', '.join((data.get('skills') or [])[:4])}\n"
                f"Name: {data.get('name','')}"
            ),
        },
    ]
    raw = _complete(cfg, msgs, json_mode=True, max_tokens=900)
    if not raw:
        return None
    try:
        obj = json.loads(_strip_fence(raw))
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        return None
    return None


def test(cfg: dict) -> tuple[bool, str]:
    info = PROVIDER_INFO.get(cfg.get("provider") or "")
    if not info:
        return False, f"Unknown provider: {cfg.get('provider')}"
    if info["requiresKey"] and not cfg.get("api_key"):
        return False, "API key not configured"
    if info.get("requiresBase") and not (cfg.get("api_base") or "").strip():
        return False, "Base URL is required for OpenAI Compatible"
    raw = _complete(cfg, [{"role": "user", "content": "Reply with the single word OK."}], max_tokens=8)
    if raw is None:
        return False, "Connection failed (check key / model / base URL)"
    return True, "Connection OK"
