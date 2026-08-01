"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  deleteLlmEntry,
  fetchLlmConfig,
  testLlmConnection,
  updateLlmConfig,
  PROVIDER_INFO,
  providerList,
} from "@/lib/api";
import type { LLMConfig, LLMEntry, LLMMode, LLMProvider } from "@/lib/types/resume";

type Section = "llm" | "danger";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "llm", label: "API keys" },
  { id: "danger", label: "Danger zone" },
];

function defaultBase(provider: LLMProvider): string {
  if (provider === "ollama") return "http://host.docker.internal:11434";
  return "";
}

function newEntry(provider: LLMProvider = "openai"): LLMEntry & { draftKey: string } {
  const info = PROVIDER_INFO[provider];
  return {
    id: `e-${Date.now().toString(36)}`,
    provider,
    model: info.defaultModel,
    apiBase: defaultBase(provider) || undefined,
    hasApiKey: false,
    draftKey: "",
  };
}

type EntryDraft = LLMEntry & {
  draftKey: string;
  replacing?: boolean;
  clearApiKey?: boolean;
};

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("llm");
  const [mode, setMode] = useState<LLMMode>("single");
  const [entries, setEntries] = useState<EntryDraft[]>([newEntry()]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function applyConfig(c: LLMConfig) {
    setMode(c.mode || "single");
    const source: LLMEntry[] =
      c.entries?.length > 0
        ? c.entries
        : [
            {
              id: "primary",
              provider: c.provider,
              model: c.model,
              apiBase: c.apiBase,
              hasApiKey: c.hasApiKey,
            },
          ];
    const list = source.map((e, i) => ({
      id: e.id || `e${i}`,
      provider: e.provider,
      model: e.model,
      apiBase: e.apiBase,
      hasApiKey: e.hasApiKey,
      draftKey: "",
      replacing: false,
    }));
    setEntries(list);
    setDirty(false);
  }

  useEffect(() => {
    void fetchLlmConfig().then(applyConfig);
  }, []);

  function patchEntry(id: string, patch: Partial<EntryDraft>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setDirty(true);
  }

  function onModeChange(next: LLMMode) {
    setMode(next);
    if (next === "single" && entries.length > 1) {
      setEntries((list) => list.slice(0, 1));
    }
    setDirty(true);
  }

  function addEntry() {
    setEntries((list) => [...list, newEntry()]);
    setMode("fallback");
    setDirty(true);
  }

  function moveEntry(id: string, dir: -1 | 1) {
    setEntries((list) => {
      const i = list.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }

  async function onSave() {
    for (const e of entries) {
      if (e.provider === "openai_compatible" && !(e.apiBase || "").trim()) {
        toast.error("Base URL is required for OpenAI Compatible");
        return;
      }
    }
    setBusy(true);
    try {
      const next = await updateLlmConfig({
        mode,
        entries: entries.map((e) => ({
          id: e.id,
          provider: e.provider,
          model: e.model,
          apiBase: e.apiBase || undefined,
          apiKey: e.draftKey || undefined,
          clearApiKey: e.clearApiKey || undefined,
        })),
      });
      applyConfig(next);
      toast.success("Saved to server");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function onDiscard() {
    void fetchLlmConfig().then(applyConfig);
  }

  async function onTest(entryId?: string) {
    const target = entryId
      ? entries.find((e) => e.id === entryId)
      : entries[0];
    if (!target) return;
    if (target.provider === "openai_compatible" && !(target.apiBase || "").trim()) {
      toast.error("Base URL is required for OpenAI Compatible");
      return;
    }
    setBusy(true);
    try {
      const r = await testLlmConnection({
        mode,
        entryId: target.id,
        entries: entries.map((e) => ({
          id: e.id,
          provider: e.provider,
          model: e.model,
          apiBase: e.apiBase || undefined,
          apiKey: e.draftKey || undefined,
        })),
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteEntry(id: string) {
    setBusy(true);
    try {
      if (entries.length <= 1) {
        // Clear key on sole entry instead of deleting
        const next = await updateLlmConfig({
          mode: "single",
          entries: entries.map((e) =>
            e.id === id
              ? {
                  id: e.id,
                  provider: e.provider,
                  model: e.model,
                  apiBase: e.apiBase,
                  clearApiKey: true,
                }
              : { id: e.id, provider: e.provider, model: e.model, apiBase: e.apiBase },
          ),
        });
        applyConfig(next);
        toast.success("API key removed");
      } else {
        const next = await deleteLlmEntry(id);
        applyConfig(next);
        toast.success("Provider removed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  }

  function clearLocalData() {
    localStorage.removeItem("tailorcv_resumes");
    localStorage.removeItem("master_resume_id");
    localStorage.removeItem("tailorcv_apps");
    localStorage.removeItem("resume_builder_settings");
    localStorage.removeItem("resume_builder_draft");
    setClearConfirmOpen(false);
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
              <p className="t-body-sm mt-1 text-[var(--text-secondary)]">
                Use one API, or add fallbacks that are tried in order when a call fails.
              </p>
            </div>

            <div className="settings-section">
              <p className="t-caption mb-2">Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["single", "One API"],
                    ["fallback", "Multiple (fallback)"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={[
                      "rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium transition",
                      mode === id
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] bg-white hover:border-[var(--border-strong)]",
                    ].join(" ")}
                    onClick={() => onModeChange(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section flex flex-col gap-6">
              {entries.map((entry, idx) => {
                const needsBase =
                  entry.provider === "openai_compatible" ||
                  entry.provider === "ollama";
                return (
                  <div
                    key={entry.id}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="t-caption">
                        {mode === "fallback"
                          ? `Provider ${idx + 1}${idx === 0 ? " (primary)" : " (fallback)"}`
                          : "Provider"}
                      </p>
                      <div className="flex gap-1">
                        {mode === "fallback" ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy || idx === 0}
                              onClick={() => moveEntry(entry.id, -1)}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy || idx === entries.length - 1}
                              onClick={() => moveEntry(entry.id, 1)}
                            >
                              Down
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void onTest(entry.id)}
                        >
                          Test
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => setDeleteId(entry.id)}
                        >
                          {entries.length <= 1 ? "Clear key" : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="field">
                        <label htmlFor={`provider-${entry.id}`}>Provider</label>
                        <select
                          id={`provider-${entry.id}`}
                          value={entry.provider}
                          onChange={(e) => {
                            const provider = e.target.value as LLMProvider;
                            const info = PROVIDER_INFO[provider];
                            patchEntry(entry.id, {
                              provider,
                              model: info.defaultModel,
                              apiBase:
                                defaultBase(provider) || entry.apiBase || "",
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

                      {needsBase ? (
                        <div className="field field-emphasis">
                          <label htmlFor={`base-${entry.id}`}>
                            Base URL (required)
                          </label>
                          <input
                            id={`base-${entry.id}`}
                            className="t-mono"
                            value={entry.apiBase ?? ""}
                            onChange={(e) =>
                              patchEntry(entry.id, { apiBase: e.target.value })
                            }
                            placeholder={
                              entry.provider === "ollama"
                                ? "http://host.docker.internal:11434"
                                : "https://api.example.com/v1"
                            }
                          />
                        </div>
                      ) : (
                        <div className="field">
                          <label htmlFor={`base-${entry.id}`}>Base URL</label>
                          <input
                            id={`base-${entry.id}`}
                            className="t-mono"
                            value={entry.apiBase ?? ""}
                            onChange={(e) =>
                              patchEntry(entry.id, { apiBase: e.target.value })
                            }
                            placeholder="Leave blank for provider default"
                          />
                        </div>
                      )}

                      <div className="field">
                        <label htmlFor={`model-${entry.id}`}>Model</label>
                        <input
                          id={`model-${entry.id}`}
                          className="t-mono"
                          value={entry.model}
                          onChange={(e) =>
                            patchEntry(entry.id, { model: e.target.value })
                          }
                        />
                      </div>

                      <div className="field">
                        <label htmlFor={`key-${entry.id}`}>API key</label>
                        {entry.hasApiKey && !entry.replacing ? (
                          <>
                            <input
                              id={`key-${entry.id}`}
                              type="password"
                              className="t-mono"
                              value="••••••••••••••••"
                              disabled
                              readOnly
                              aria-label="API key saved"
                            />
                            <p className="hint">
                              API key saved in the database.{" "}
                              <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                  patchEntry(entry.id, {
                                    replacing: true,
                                    draftKey: "",
                                  })
                                }
                              >
                                Replace key
                              </button>
                            </p>
                          </>
                        ) : (
                          <>
                            <input
                              id={`key-${entry.id}`}
                              type="password"
                              className="t-mono"
                              value={entry.draftKey}
                              onChange={(e) =>
                                patchEntry(entry.id, {
                                  draftKey: e.target.value,
                                  replacing: true,
                                })
                              }
                              placeholder="sk-…"
                            />
                            <p className="hint">
                              {entry.hasApiKey
                                ? "Enter a new key to replace the saved one, then Save."
                                : "Required for cloud providers."}
                              {entry.hasApiKey ? (
                                <>
                                  {" "}
                                  <button
                                    type="button"
                                    className="underline"
                                    onClick={() =>
                                      patchEntry(entry.id, {
                                        replacing: false,
                                        draftKey: "",
                                      })
                                    }
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : null}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {mode === "fallback" || entries.length < 2 ? (
              <div className="mb-4">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={addEntry}
                >
                  Add fallback provider
                </button>
              </div>
            ) : null}

            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-test mr-auto"
                disabled={busy}
                onClick={() => void onTest()}
              >
                {busy ? "Testing…" : "Test primary"}
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
                onClick={() => setClearConfirmOpen(true)}
              >
                Reset local data
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={clearConfirmOpen}
        title="Clear local data?"
        description="This clears resumes and applications stored in this browser. This cannot be undone."
        confirmLabel="Clear data"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={clearLocalData}
      />

      <ConfirmModal
        open={Boolean(deleteId)}
        title={entries.length <= 1 ? "Clear API key?" : "Remove provider?"}
        description={
          entries.length <= 1
            ? "The saved API key will be removed from the database."
            : "This provider will be removed from the fallback list."
        }
        confirmLabel={entries.length <= 1 ? "Clear key" : "Delete"}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void onDeleteEntry(deleteId);
        }}
      />
    </div>
  );
}
