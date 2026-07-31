"use client";

import { useEffect, useState } from "react";
import {
  fetchLlmConfig,
  testLlmConnection,
  updateLlmConfig,
  PROVIDER_INFO,
  providerList,
  USE_MOCK_API,
} from "@/lib/api";
import type { LLMConfig, LLMProvider } from "@/lib/types/resume";

type Section = "llm" | "preferences" | "danger";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "llm", label: "API keys" },
  { id: "preferences", label: "Preferences" },
  { id: "danger", label: "Danger zone" },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("llm");
  const [cfg, setCfg] = useState<LLMConfig>({
    provider: "openai",
    model: "gpt-4o-mini",
    hasApiKey: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [useMock, setUseMock] = useState(USE_MOCK_API);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void fetchLlmConfig().then(setCfg);
  }, []);

  function patchCfg(next: Partial<LLMConfig>) {
    setCfg((c) => ({ ...c, ...next }));
    setDirty(true);
    setMsg(null);
  }

  async function onSave() {
    setBusy(true);
    try {
      const next = await updateLlmConfig({
        provider: cfg.provider,
        model: cfg.model,
        apiBase: cfg.apiBase,
        apiKey: apiKey || undefined,
      });
      setCfg(next);
      setApiKey("");
      setDirty(false);
      setMsg("Saved locally");
    } finally {
      setBusy(false);
    }
  }

  function onDiscard() {
    void fetchLlmConfig().then((c) => {
      setCfg(c);
      setApiKey("");
      setDirty(false);
      setMsg(null);
    });
  }

  async function onTest() {
    setBusy(true);
    try {
      const r = await testLlmConnection();
      setMsg(r.message);
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
    setMsg("Local data cleared — refresh to see empty state");
  }

  return (
    <div className="page">
      <div className="settings-layout">
        <nav className="settings-subnav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={["nav-link w-full text-left", section === s.id ? "active" : ""].join(
                " ",
              )}
              onClick={() => setSection(s.id)}
            >
              <span className="nav-label">{s.label}</span>
            </button>
          ))}
        </nav>

        {section === "llm" ? (
          <div className="panel p-6">
            <div className="settings-section">
              <h2 className="t-h2 text-[var(--text-primary)]">LLM provider</h2>
              <p className="t-body-sm mt-1 text-[var(--text-muted)]">
                Used when the backend is connected. Values are stored in this browser for now.
              </p>
            </div>

            <div className="settings-section space-y-4">
              <div className="field">
                <label htmlFor="provider">Provider</label>
                <select
                  id="provider"
                  value={cfg.provider}
                  onChange={(e) => {
                    const provider = e.target.value as LLMProvider;
                    patchCfg({
                      provider,
                      model: PROVIDER_INFO[provider].defaultModel,
                    });
                  }}
                >
                  {providerList().map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_INFO[p].name}
                    </option>
                  ))}
                </select>
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
                  API key{cfg.hasApiKey ? " (saved)" : ""}
                </label>
                <input
                  id="key"
                  type="password"
                  className="t-mono"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setDirty(true);
                    setMsg(null);
                  }}
                  placeholder={cfg.hasApiKey ? "••••••••" : "sk-…"}
                />
                <p className="hint">Never committed. Kept in local storage only.</p>
              </div>

              <div className="field">
                <label htmlFor="base">Base URL</label>
                <input
                  id="base"
                  className="t-mono"
                  value={cfg.apiBase ?? ""}
                  onChange={(e) => patchCfg({ apiBase: e.target.value })}
                  placeholder="Optional"
                />
                <p className="hint">Leave blank for the provider default endpoint.</p>
              </div>
            </div>

            {msg ? (
              <p className="t-body-sm mt-4 text-[var(--text-secondary)]">{msg}</p>
            ) : null}

            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-ghost mr-auto"
                disabled={busy}
                onClick={() => void onTest()}
              >
                Test connection
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

        {section === "preferences" ? (
          <div className="panel overflow-hidden">
            <div className="px-6 pt-6 pb-2">
              <h2 className="t-h2 text-[var(--text-primary)]">Preferences</h2>
              <p className="t-body-sm mt-1 text-[var(--text-muted)]">
                Client-side switches for this preview build.
              </p>
            </div>
            <div className="px-6">
              <div className="list-row !h-auto py-4">
                <div className="min-w-0 flex-1 pr-4">
                  <p className="t-body font-medium text-[var(--text-primary)]">
                    Use mock API
                  </p>
                  <p className="t-body-sm mt-0.5 text-[var(--text-muted)]">
                    When on, uploads and tailor run in the browser without a backend.
                    Controlled by NEXT_PUBLIC_USE_MOCK at build time — toggle is visual only here.
                  </p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={useMock}
                    onChange={(e) => setUseMock(e.target.checked)}
                  />
                  <i />
                </label>
              </div>
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
            {msg ? (
              <p className="t-body-sm mt-4 text-[var(--text-secondary)]">{msg}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
