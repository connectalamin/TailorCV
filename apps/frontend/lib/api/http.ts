import { API_BASE } from "@/lib/api/client";

async function readError(res: Response): Promise<string> {
  let detail = `Request failed (${res.status})`;
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
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function formFetch<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}
