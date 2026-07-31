"use client";

import { useEffect, useState } from "react";
import {
  fetchLlmConfig,
  testLlmConnection,
  updateLlmConfig,
  PROVIDER_INFO,
  providerList,
} from "@/lib/api";
import type { LLMConfig, LLMProvider } from "@/lib/types/resume";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<LLMConfig>({
    provider: "openai",
    model: "gpt-4o-mini",
    hasApiKey: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchLlmConfig().then(setCfg);
  }, []);

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
      setMsg("Saved (mock — local only until FastAPI exists)");
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="h-full overflow-auto px-6 py-8 sm:px-8">
      <p className="mb-1 font-mono text-[10px] font-bold tracking-[0.16em] text-teal uppercase">
        Settings
      </p>
      <h1 className="mb-6 font-[family-name:var(--disp)] text-3xl font-bold tracking-tight">
        LLM provider
      </h1>
      <div className="card max-w-xl">
        <div className="card-b space-y-3">
          <div>
            <label className="fld" htmlFor="provider">
              Provider
            </label>
            <select
              id="provider"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              value={cfg.provider}
              onChange={(e) => {
                const provider = e.target.value as LLMProvider;
                setCfg((c) => ({
                  ...c,
                  provider,
                  model: PROVIDER_INFO[provider].defaultModel,
                }));
              }}
            >
              {providerList().map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_INFO[p].name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="fld" htmlFor="model">
              Model
            </label>
            <input
              id="model"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              value={cfg.model}
              onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
            />
          </div>
          <div>
            <label className="fld" htmlFor="key">
              API key {cfg.hasApiKey ? "(configured)" : ""}
            </label>
            <input
              id="key"
              type="password"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg.hasApiKey ? "••••••••" : "sk-…"}
            />
          </div>
          <div>
            <label className="fld" htmlFor="base">
              Base URL (optional)
            </label>
            <input
              id="base"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              value={cfg.apiBase ?? ""}
              onChange={(e) =>
                setCfg((c) => ({ ...c, apiBase: e.target.value }))
              }
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn prime"
              disabled={busy}
              onClick={onSave}
            >
              Save
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={onTest}
            >
              Test connection
            </button>
          </div>
          {msg ? <p className="text-sm text-mut">{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}
