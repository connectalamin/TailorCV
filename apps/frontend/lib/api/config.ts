import { delay, USE_MOCK_API } from "@/lib/api/client";
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
  LLMProvider,
  SystemStatus,
} from "@/lib/types/resume";

export { PROVIDER_INFO };

let llm: LLMConfig = { ...DEFAULT_LLM };
let apps: Application[] = structuredClone(SEED_APPLICATIONS);

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

export async function fetchLlmConfig(): Promise<LLMConfig> {
  if (USE_MOCK_API) {
    await delay(150);
    return { ...llm };
  }
  throw new Error("Backend not connected");
}

export async function updateLlmConfig(
  update: Partial<LLMConfig> & { apiKey?: string },
): Promise<LLMConfig> {
  if (USE_MOCK_API) {
    await delay(250);
    const { apiKey, ...rest } = update;
    llm = {
      ...llm,
      ...rest,
      hasApiKey: apiKey ? apiKey.length > 0 : llm.hasApiKey,
    };
    if (rest.provider && PROVIDER_INFO[rest.provider] && !rest.model) {
      llm.model = PROVIDER_INFO[rest.provider].defaultModel;
    }
    return { ...llm };
  }
  throw new Error("Backend not connected");
}

export async function testLlmConnection(): Promise<{
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
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
}

export async function deleteApplication(id: string): Promise<void> {
  if (USE_MOCK_API) {
    await delay(150);
    loadApps();
    apps = apps.filter((a) => a.id !== id);
    persistApps();
    return;
  }
  throw new Error("Backend not connected");
}

export function providerList(): LLMProvider[] {
  return Object.keys(PROVIDER_INFO) as LLMProvider[];
}
