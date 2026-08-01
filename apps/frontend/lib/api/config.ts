import { delay, USE_MOCK_API } from "@/lib/api/client";
import { jsonFetch } from "@/lib/api/http";
import {
  DEFAULT_LLM,
  DEFAULT_STATUS,
  PROVIDER_INFO,
  SEED_APPLICATIONS,
} from "@/lib/mock/data";
import type {
  Application,
  ApplicationStatus,
  LLMConfig,
  LLMEntry,
  LLMMode,
  LLMProvider,
  SystemStatus,
} from "@/lib/types/resume";

export { PROVIDER_INFO };

let llm: LLMConfig = structuredClone(DEFAULT_LLM);
let apps: Application[] = structuredClone(SEED_APPLICATIONS);

function normalizeConfig(raw: Partial<LLMConfig> & { entries?: LLMEntry[] }): LLMConfig {
  const mode: LLMMode = raw.mode === "fallback" ? "fallback" : "single";
  let entries = raw.entries?.length
    ? raw.entries.map((e, i) => ({
        id: e.id || `e${i}`,
        provider: (e.provider || "openai") as LLMProvider,
        model: e.model || "",
        apiBase: e.apiBase,
        hasApiKey: Boolean(e.hasApiKey),
      }))
    : [
        {
          id: "primary",
          provider: (raw.provider || "openai") as LLMProvider,
          model: raw.model || "gpt-4o-mini",
          apiBase: raw.apiBase,
          hasApiKey: Boolean(raw.hasApiKey),
        },
      ];
  if (mode === "single") entries = entries.slice(0, 1);
  const first = entries[0];
  return {
    mode,
    entries,
    provider: first.provider,
    model: first.model,
    apiBase: first.apiBase,
    hasApiKey: first.hasApiKey,
  };
}

function loadApps() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("tailorcv_apps");
    if (raw) {
      const parsed = JSON.parse(raw) as Application[];
      const map: Record<string, ApplicationStatus> = {
        saved: "wish",
        wish: "wish",
        applied: "applied",
        no_response: "applied",
        response: "interview",
        interview: "interview",
        accepted: "offer",
        offer: "offer",
        rejected: "wish",
        withdrawn: "wish",
        ghosted: "applied",
      };
      apps = parsed.map((a) => ({
        ...a,
        status: map[a.status] ?? "wish",
      }));
      persistApps();
    }
  } catch {
    /* keep seed */
  }
}

function persistApps() {
  if (typeof window === "undefined") return;
  localStorage.setItem("tailorcv_apps", JSON.stringify(apps));
}

export type LLMUpdatePayload = {
  mode?: LLMMode;
  entries?: Array<{
    id?: string;
    provider?: LLMProvider;
    model?: string;
    apiBase?: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }>;
  provider?: LLMProvider;
  model?: string;
  apiBase?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  entryId?: string;
};

export async function fetchLlmConfig(): Promise<LLMConfig> {
  if (USE_MOCK_API) {
    await delay(150);
    return normalizeConfig(llm);
  }
  const raw = await jsonFetch<LLMConfig>("/llm");
  return normalizeConfig(raw);
}

export async function updateLlmConfig(
  update: LLMUpdatePayload,
): Promise<LLMConfig> {
  if (USE_MOCK_API) {
    await delay(250);
    const next = structuredClone(llm);
    if (update.mode) next.mode = update.mode;
    if (update.entries?.length) {
      next.entries = update.entries.map((e, i) => {
        const prev = next.entries.find((x) => x.id === e.id) || next.entries[i];
        return {
          id: e.id || prev?.id || `e${i}`,
          provider: (e.provider || prev?.provider || "openai") as LLMProvider,
          model: e.model ?? prev?.model ?? "",
          apiBase: e.apiBase ?? prev?.apiBase,
          hasApiKey: e.clearApiKey
            ? false
            : e.apiKey
              ? true
              : Boolean(prev?.hasApiKey),
        };
      });
    } else if (update.provider || update.model || update.apiKey || update.apiBase !== undefined) {
      const e0 = next.entries[0] || {
        id: "primary",
        provider: "openai" as LLMProvider,
        model: "",
        hasApiKey: false,
      };
      if (update.provider) e0.provider = update.provider;
      if (update.model) e0.model = update.model;
      if (update.apiBase !== undefined) e0.apiBase = update.apiBase;
      if (update.apiKey) e0.hasApiKey = true;
      if (update.clearApiKey) e0.hasApiKey = false;
      next.entries = [e0];
    }
    llm = normalizeConfig(next);
    return { ...llm };
  }
  const raw = await jsonFetch<LLMConfig>("/llm", {
    method: "PUT",
    body: JSON.stringify(update),
  });
  return normalizeConfig(raw);
}

export async function deleteLlmEntry(entryId: string): Promise<LLMConfig> {
  if (USE_MOCK_API) {
    await delay(200);
    llm = normalizeConfig({
      ...llm,
      entries: llm.entries.filter((e) => e.id !== entryId),
    });
    return { ...llm };
  }
  const raw = await jsonFetch<LLMConfig>(
    `/llm/entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
  return normalizeConfig(raw);
}

export async function testLlmConnection(
  update?: LLMUpdatePayload,
): Promise<{
  ok: boolean;
  message: string;
}> {
  if (USE_MOCK_API) {
    await delay(600);
    if (!llm.hasApiKey && PROVIDER_INFO[llm.provider].requiresKey) {
      return { ok: false, message: "API key not configured (mock)" };
    }
    return { ok: true, message: "Mock connection OK" };
  }
  return jsonFetch<{ ok: boolean; message: string }>("/llm/test", {
    method: "POST",
    body: JSON.stringify(update ?? {}),
  });
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  if (USE_MOCK_API) {
    await delay(150);
    loadApps();
    const resumeRaw = localStorage.getItem("tailorcv_resumes");
    const resumeCount = resumeRaw
      ? (JSON.parse(resumeRaw) as unknown[]).length
      : 0;
    return {
      ...DEFAULT_STATUS,
      resumes: resumeCount,
      applications: apps.length,
      llm: llm.hasApiKey ? "ok" : "unconfigured",
      lastChecked: new Date().toISOString(),
    };
  }
  return jsonFetch<SystemStatus>("/status");
}

export async function listApplications(): Promise<
  Record<ApplicationStatus, Application[]>
> {
  if (USE_MOCK_API) {
    await delay(200);
    loadApps();
    const columns: Record<ApplicationStatus, Application[]> = {
      wish: [],
      applied: [],
      interview: [],
      offer: [],
    };
    for (const app of apps) columns[app.status].push(app);
    return columns;
  }
  return jsonFetch<Record<ApplicationStatus, Application[]>>("/applications");
}

export async function createApplication(payload: {
  company: string;
  role: string;
  notes?: string;
  status?: ApplicationStatus;
  template?: string;
}): Promise<Application> {
  if (USE_MOCK_API) {
    await delay(200);
    loadApps();
    const app: Application = {
      id: `app-${Date.now()}`,
      company: payload.company,
      role: payload.role,
      notes: payload.notes,
      status: payload.status || "wish",
      match: 70 + Math.floor(Math.random() * 25),
      template: payload.template || "latex",
      dateLabel: "now",
    };
    apps = [...apps, app];
    persistApps();
    return app;
  }
  return jsonFetch<Application>("/applications", {
    method: "POST",
    body: JSON.stringify({ ...payload, template: payload.template || "latex" }),
  });
}

export async function updateApplication(
  id: string,
  payload: Partial<Pick<Application, "status" | "notes" | "company" | "role">>,
): Promise<Application> {
  if (USE_MOCK_API) {
    await delay(150);
    loadApps();
    apps = apps.map((a) => (a.id === id ? { ...a, ...payload } : a));
    persistApps();
    const found = apps.find((a) => a.id === id);
    if (!found) throw new Error("Not found");
    return found;
  }
  return jsonFetch<Application>(`/applications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteApplication(id: string): Promise<void> {
  if (USE_MOCK_API) {
    await delay(150);
    loadApps();
    apps = apps.filter((a) => a.id !== id);
    persistApps();
    return;
  }
  await jsonFetch<void>(`/applications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function providerList(): LLMProvider[] {
  return Object.keys(PROVIDER_INFO) as LLMProvider[];
}
