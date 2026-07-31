"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  fetchLlmConfig,
  testLlmConnection,
  updateLlmConfig,
  PROVIDER_INFO,
  providerList,
} from "@/lib/api";
import type { LLMConfig, LLMProvider } from "@/lib/types/resume";

type Section = "llm" | "danger";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "llm", label: "API keys" },
  { id: "danger", label: "Danger zone" },
];

function defaultBase(provider: LLMProvider): string {
  if (provider === "ollama") return "http://host.docker.internal:11434";
  return "";
}

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("llm");
  const [cfg, setCfg] = useState<LLMConfig>({
    provider: "openai",
    model: "gpt-4o-mini",
    hasApiKey: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void fetchLlmConfig().then(setCfg);
  }, []);

  const needsBase =
    cfg.provider === "openai_compatible" || cfg.provider === "ollama";

  const formPatch = useMemo(
    () => ({
      provider: cfg.provider,
      model: cfg.model,
      apiBase: cfg.apiBase || undefined,
      apiKey: apiKey || undefined,
    }),
    [cfg.provider, cfg.model, cfg.apiBase, apiKey],
  );

  function patchCfg(next: Partial<LLMConfig>) {
    setCfg((c) => ({ ...c, ...next }));
    setDirty(true);
  }

  function onProviderChange(provider: LLMProvider) {
    const info = PROVIDER_INFO[provider];
    patchCfg({
      provider,
      model: info.defaultModel,
      apiBase: defaultBase(provider) || cfg.apiBase || "",
    });
  }

  async function onSave() {
    if (cfg.provider === "openai_compatible" && !(cfg.apiBase || "").trim()) {
      toast.error("Base URL is required for OpenAI Compatible");
      return;
    }
    setBusy(true);
    try {
      const next = await updateLlmConfig(formPatch);
      setCfg(next);
      setApiKey("");
      setDirty(false);
      toast.success("Saved to server");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function onDiscard() {
    void fetchLlmConfig().then((c) => {
      setCfg(c);
      setApiKey("");
      setDirty(false);
    });
  }

  async function onTest() {
    if (cfg.provider === "openai_compatible" && !(cfg.apiBase || "").trim()) {
      toast.error("Base URL is required for OpenAI Compatible");
      return;
    }
    setBusy(true);
    try {
      const r = await testLlmConnection(formPatch);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  function clearLocalData() {
    if (!confirm("This clears resumes and applications stored in this browser.")) {
      return;
    }
    localStorage.removeItem("tailorcv_resumes");
    localStorage.removeItem("master_resume_id");
    localStorage.removeItem("tailorcv_apps");
    localStorage.removeItem("resume_builder_settings");
    localStorage.removeItem("resume_builder_draft");
    toast.message("Local data cleared — refresh to see empty state");
  }

  return (
    <div className="page">
      <div className="settings-layout">
        <nav className="settings-subnav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={[
                "settings-nav-btn",
                section === s.id ? "is-active" : "",
              ].join(" ")}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {section === "llm" ? (
          <div className="panel p-6">
            <div className="settings-section">
              <h2 className="t-h2 text-[var(--text-primary)]">LLM connection</h2>
              <p className="t-body-sm mt-1 text-[var(--text-muted)]">
                Provider is a label for defaults. Base URL is what routes the request —
                required for OpenAI Compatible endpoints.
              </p>
            </div>

            <div className="settings-section flex flex-col gap-4">
              <div className="field">
                <label htmlFor="provider">Provider name</label>
                <select
                  id="provider"
                  value={cfg.provider}
                  onChange={(e) =>
                    onProviderChange(e.target.value as LLMProvider)
                  }
                >
                  {providerList().map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_INFO[p].name}
                    </option>
                  ))}
                </select>
                <p className="hint">Name only — picks default model hints.</p>
              </div>

              <div className="field field-emphasis">
                <label htmlFor="base">
                  Base URL{needsBase ? " (required)" : ""}
                </label>
                <input
                  id="base"
                  className="t-mono"
                  value={cfg.apiBase ?? ""}
                  onChange={(e) => patchCfg({ apiBase: e.target.value })}
                  placeholder={
                    cfg.provider === "openai_compatible"
                      ? "https://api.example.com/v1"
                      : cfg.provider === "ollama"
                        ? "http://host.docker.internal:11434"
                        : "Leave blank for provider default"
                  }
                  required={cfg.provider === "openai_compatible"}
                />
                <p className="hint">
                  {cfg.provider === "openai_compatible"
                    ? "OpenAI-compatible API root (include /v1 if your host needs it)."
                    : "Override the provider endpoint when needed."}
                </p>
              </div>

              <div className="field">
                <label htmlFor="model">Model</label>
                <input
                  id="model"
                  className="t-mono"
                  value={cfg.model}
                  onChange={(e) => patchCfg({ model: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="key">
                  API key{cfg.hasApiKey ? " (saved on server)" : ""}
                </label>
                <input
                  id="key"
                  type="password"
                  className="t-mono"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={cfg.hasApiKey ? "••••••••" : "sk-…"}
                />
                <p className="hint">Leave blank to keep the existing saved key.</p>
              </div>
            </div>

            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-test mr-auto"
                disabled={busy}
                onClick={() => void onTest()}
              >
                {busy ? "Testing…" : "Test connection"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || !dirty}
                onClick={onDiscard}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !dirty}
                onClick={() => void onSave()}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}

        {section === "danger" ? (
          <div className="panel danger-panel p-6">
            <h2 className="t-h2" style={{ color: "var(--text-danger)" }}>
              Danger zone
            </h2>
            <p className="t-body-sm mt-1 text-[var(--text-secondary)]">
              Clear resumes, applications, and builder drafts stored in this browser.
              This cannot be undone.
            </p>
            <div className="mt-5">
              <button
                type="button"
                className="btn btn-danger"
                onClick={clearLocalData}
              >
                Reset local data
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
