import { API_BASE } from "@/lib/api/client";

async function readError(res: Response, path: string): Promise<string> {
  let detail = "";
  try {
    const j = (await res.json()) as { detail?: unknown; error?: string };
    if (typeof j.error === "string" && j.error) {
      detail = j.error;
    } else if (Array.isArray(j.detail)) {
      detail = j.detail
        .map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d))
        .join("; ");
    } else if (typeof j.detail === "string" && j.detail) {
      detail = j.detail;
    }
  } catch {
    /* ignore */
  }

  const generic = !detail || /^not found$/i.test(detail.trim());
  if (generic) {
    if (res.status === 404) {
      if (path.includes("/improve")) {
        return "Tailor endpoint missing — recreate or restart the backend container.";
      }
      if (path.includes("/llm")) {
        return "LLM settings API not found — is the backend running?";
      }
      if (path.includes("/resumes/")) {
        return "Resume not found. Upload a master resume on the Dashboard first.";
      }
      return `Not found (${path}). Check the backend is up to date.`;
    }
    if (res.status === 409) {
      return "Preview expired or changed — generate a new preview, then confirm.";
    }
    if (res.status >= 500) {
      return "Server error while talking to the backend. Check Docker logs.";
    }
    return `Request failed (${res.status})`;
  }
  return detail;
}

export async function jsonFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(await readError(res, path));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function formFetch<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, path));
  return (await res.json()) as T;
}
