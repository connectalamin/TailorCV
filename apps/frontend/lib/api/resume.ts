import { API_URL, delay, USE_MOCK_API } from "@/lib/api/client";
import { formFetch, jsonFetch } from "@/lib/api/http";
import {
  SAMPLE_KEYWORDS,
  SAMPLE_RESUME,
  defaultCoverLetter,
  defaultOutreachMail,
  masterFromUpload,
} from "@/lib/mock/data";
import type {
  KeywordHit,
  ImproveResult,
  ResumeData,
  ResumeListItem,
  ResumeRecord,
  TailorIntensity,
} from "@/lib/types/resume";

let resumes: ResumeRecord[] = [];
let lastPreviewHash: string | null = null;
let cachedMaster: string | null = null;

const ALLOWED = [".pdf", ".docx", ".tex", ".txt", ".md"];

function assertClient() {
  if (typeof window === "undefined") {
    throw new Error("Client-only mock store");
  }
}

function loadFromStorage() {
  assertClient();
  try {
    const raw = localStorage.getItem("tailorcv_resumes");
    if (raw) resumes = JSON.parse(raw) as ResumeRecord[];
  } catch {
    resumes = [];
  }
}

function persist() {
  assertClient();
  localStorage.setItem("tailorcv_resumes", JSON.stringify(resumes));
  const master = resumes.find((r) => r.isMaster);
  if (master) localStorage.setItem("master_resume_id", master.id);
}

function ensureLoaded() {
  if (typeof window === "undefined") return;
  if (resumes.length === 0) {
    const raw = localStorage.getItem("tailorcv_resumes");
    if (raw) loadFromStorage();
  }
}

export async function uploadMasterResume(file: File): Promise<ResumeRecord> {
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED.includes(ext)) {
    throw new Error(`Unsupported type ${ext}. Use PDF, DOCX, TEX, or TXT.`);
  }
  if (USE_MOCK_API) {
    await delay(1400);
    ensureLoaded();
    const record = masterFromUpload(file.name);
    record.status = "ready";
    resumes = [record, ...resumes.filter((r) => !r.isMaster)];
    persist();
    return structuredClone(record);
  }
  const form = new FormData();
  form.append("file", file);
  return formFetch<ResumeRecord>("/resumes/upload", form);
}

export async function fetchResumeList(
  includeMaster = true,
): Promise<ResumeListItem[]> {
  if (USE_MOCK_API) {
    await delay(200);
    ensureLoaded();
    const out = resumes
      .filter((r) => includeMaster || !r.isMaster)
      .filter((r) => r.status !== "preview")
      .map(({ data: _d, ...item }) => item);
    const m = out.find((r) => r.isMaster);
    if (m) cachedMaster = m.id;
    return out;
  }
  const list = await jsonFetch<ResumeListItem[]>(
    `/resumes?include_master=${includeMaster}`,
  );
  const m = list.find((r) => r.isMaster);
  if (m) cachedMaster = m.id;
  return list;
}

export async function fetchResume(id: string): Promise<ResumeRecord> {
  if (USE_MOCK_API) {
    await delay(200);
    ensureLoaded();
    const found = resumes.find((r) => r.id === id);
    if (!found) throw new Error("Resume not found");
    return structuredClone(found);
  }
  return jsonFetch<ResumeRecord>(`/resumes/${encodeURIComponent(id)}`);
}

export async function deleteResume(id: string): Promise<void> {
  if (USE_MOCK_API) {
    await delay(200);
    ensureLoaded();
    resumes = resumes.filter((r) => r.id !== id);
    persist();
    if (id === localStorage.getItem("master_resume_id")) {
      localStorage.removeItem("master_resume_id");
    }
    return;
  }
  await jsonFetch<void>(`/resumes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (id === cachedMaster) cachedMaster = null;
}

export async function uploadJobDescriptions(
  descriptions: string[],
  resumeId: string,
): Promise<{ job_id: string }> {
  if (USE_MOCK_API) {
    await delay(500);
    void descriptions;
    void resumeId;
    return { job_id: `job-${Date.now()}` };
  }
  return jsonFetch<{ job_id: string }>("/jobs", {
    method: "POST",
    body: JSON.stringify({ descriptions, resume_id: resumeId }),
  });
}

export async function analyzeJob(jd: string): Promise<KeywordHit[]> {
  if (USE_MOCK_API) {
    await delay(700);
    void jd;
    return structuredClone(SAMPLE_KEYWORDS);
  }
  return jsonFetch<KeywordHit[]>("/jobs/analyze", {
    method: "POST",
    body: JSON.stringify({ jd }),
  });
}

export async function improveResume(
  resumeId: string,
  jobId: string,
  jdText?: string,
  intensity: TailorIntensity = "balanced",
): Promise<ImproveResult> {
  if (USE_MOCK_API) {
    await delay(1100);
    ensureLoaded();
    const base =
      resumes.find((r) => r.id === resumeId) ??
      resumes.find((r) => r.isMaster);
    if (!base) throw new Error("No master resume — upload one first");
    const id = `tailored-${Date.now()}`;
    const hash = `sha256:${id.slice(-8)}…${jobId.slice(-4)}`;
    lastPreviewHash = hash;
    const data = structuredClone(base.data);
    const jd =
      jdText?.trim() ||
      "Senior Frontend Engineer — React, TypeScript, design systems.";
    if (intensity !== "light") {
      data.summary = `${data.summary} Aligned for this role (${intensity}).`.trim();
    }
    const coverLetter = defaultCoverLetter(data);
    const outreachMessage = defaultOutreachMail(data);
    resumes = [
      ...resumes,
      {
        id,
        title: `Tailored · ${data.name || data.title}`,
        isMaster: false,
        status: "preview",
        company: "Target Company",
        role: data.title,
        updatedAt: new Date().toISOString(),
        data,
        jobDescription: jd,
        coverLetter,
        outreachMessage,
      },
    ];
    persist();
    return {
      resume_id: id,
      preview_hash: hash,
      cover_letter: coverLetter,
      outreach_message: outreachMessage,
      intensity,
      keywords: structuredClone(SAMPLE_KEYWORDS),
      status: "preview",
      data,
    };
  }
  return jsonFetch<ImproveResult>(
    `/resumes/${encodeURIComponent(resumeId)}/improve/preview`,
    {
      method: "POST",
      body: JSON.stringify({
        job_id: jobId,
        jd: jdText ?? "",
        intensity,
      }),
    },
  );
}

export async function updateResume(
  id: string,
  patch: Partial<
    Pick<
      ResumeRecord,
      "data" | "coverLetter" | "outreachMessage" | "jobDescription" | "title"
    >
  >,
): Promise<ResumeRecord> {
  if (USE_MOCK_API) {
    await delay(200);
    ensureLoaded();
    const idx = resumes.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Resume not found");
    resumes[idx] = {
      ...resumes[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    persist();
    return structuredClone(resumes[idx]);
  }
  return jsonFetch<ResumeRecord>(`/resumes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function fetchJobDescription(
  resumeId: string,
): Promise<string | null> {
  if (USE_MOCK_API) {
    await delay(150);
    ensureLoaded();
    return resumes.find((r) => r.id === resumeId)?.jobDescription ?? null;
  }
  return jsonFetch<string | null>(`/resumes/${encodeURIComponent(resumeId)}/jd`);
}

export async function confirmTailor(
  resumeId: string,
  previewHash: string,
  createApplication = true,
): Promise<void> {
  if (USE_MOCK_API) {
    await delay(300);
    if (lastPreviewHash && previewHash !== lastPreviewHash) {
      throw new Error("preview_hash mismatch — confirm rejected");
    }
    ensureLoaded();
    const idx = resumes.findIndex((r) => r.id === resumeId);
    if (idx >= 0) {
      resumes[idx] = {
        ...resumes[idx],
        status: "ready",
        updatedAt: new Date().toISOString(),
      };
      persist();
    }
    void createApplication;
    return;
  }
  await jsonFetch<void>(
    `/resumes/${encodeURIComponent(resumeId)}/improve/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        preview_hash: previewHash,
        create_application: createApplication,
      }),
    },
  );
}

export async function downloadResumePdf(
  resumeId: string,
  opts?: {
    pageSize?: "A4" | "LETTER";
    marginIn?: number;
    projectsTwoColumn?: boolean;
  },
): Promise<Blob> {
  let record: ResumeRecord | undefined;
  if (USE_MOCK_API) {
    ensureLoaded();
    record = resumes.find((r) => r.id === resumeId);
  } else {
    try {
      record = await fetchResume(resumeId);
    } catch {
      record = undefined;
    }
  }
  if (!record) throw new Error("Resume not found");

  const res = await fetch(`${API_URL}/api/compile-resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: record.data,
      pageSize: opts?.pageSize || "LETTER",
      marginIn: opts?.marginIn ?? 0.75,
      projectsTwoColumn: opts?.projectsTwoColumn ?? true,
      filename: record.data.name,
    }),
  });

  if (!res.ok) {
    let detail = `PDF compile failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      if (j.error) detail = j.error;
      else if (typeof j.detail === "string" && j.detail) detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return res.blob();
}

export function getMasterResumeId(): string | null {
  if (cachedMaster) return cachedMaster;
  if (typeof window === "undefined") return null;
  ensureLoaded();
  return (
    localStorage.getItem("master_resume_id") ||
    resumes.find((r) => r.isMaster)?.id ||
    null
  );
}

export async function ensureMasterLoaded(): Promise<void> {
  if (USE_MOCK_API) {
    ensureLoaded();
    return;
  }
  if (cachedMaster) return;
  try {
    const list = await fetchResumeList(true);
    const m = list.find((r) => r.isMaster);
    if (m) cachedMaster = m.id;
  } catch {
    /* ignore */
  }
}

export function getSampleResume(): ResumeData {
  return structuredClone(SAMPLE_RESUME);
}

export async function restructureResume(id: string): Promise<ResumeRecord> {
  if (USE_MOCK_API) {
    await delay(800);
    ensureLoaded();
    const found = resumes.find((r) => r.id === id);
    if (!found) throw new Error("Resume not found");
    return structuredClone(found);
  }
  return jsonFetch<ResumeRecord>(
    `/resumes/${encodeURIComponent(id)}/restructure`,
    { method: "POST" },
  );
}

export async function aiRewriteSection(
  id: string,
  section: string,
  opts?: { jd?: string; intensity?: TailorIntensity; data?: ResumeData },
): Promise<ResumeData> {
  if (USE_MOCK_API) {
    await delay(700);
    ensureLoaded();
    const found = resumes.find((r) => r.id === id);
    const data = structuredClone(opts?.data || found?.data || SAMPLE_RESUME);
    if (section === "summary" || section === "objective") {
      data.summary = `${data.summary} (AI rewrite)`.slice(0, 280);
    }
    return data;
  }
  const res = await jsonFetch<{ data: ResumeData }>(
    `/resumes/${encodeURIComponent(id)}/ai/rewrite-section`,
    {
      method: "POST",
      body: JSON.stringify({
        section,
        jd: opts?.jd ?? "",
        intensity: opts?.intensity ?? "balanced",
        data: opts?.data,
      }),
    },
  );
  return res.data;
}

export async function aiGenerateCover(
  id: string,
  opts?: { jd?: string; data?: ResumeData },
): Promise<{ cover_letter: string; outreach_message: string }> {
  if (USE_MOCK_API) {
    await delay(700);
    const data = opts?.data || SAMPLE_RESUME;
    return {
      cover_letter: defaultCoverLetter(data),
      outreach_message: defaultOutreachMail(data),
    };
  }
  return jsonFetch(`/resumes/${encodeURIComponent(id)}/ai/generate-cover`, {
    method: "POST",
    body: JSON.stringify({ jd: opts?.jd ?? "", data: opts?.data }),
  });
}

export async function aiGenerateOutreach(
  id: string,
  opts?: { jd?: string; data?: ResumeData },
): Promise<{ cover_letter: string; outreach_message: string }> {
  if (USE_MOCK_API) {
    await delay(700);
    const data = opts?.data || SAMPLE_RESUME;
    return {
      cover_letter: defaultCoverLetter(data),
      outreach_message: defaultOutreachMail(data),
    };
  }
  return jsonFetch(`/resumes/${encodeURIComponent(id)}/ai/generate-outreach`, {
    method: "POST",
    body: JSON.stringify({ jd: opts?.jd ?? "", data: opts?.data }),
  });
}

export async function aiMatchJd(
  id: string,
  jd: string,
  data?: ResumeData,
): Promise<{ keywords: KeywordHit[]; notes: string }> {
  if (USE_MOCK_API) {
    await delay(700);
    void id;
    void data;
    return {
      keywords: structuredClone(SAMPLE_KEYWORDS),
      notes: "Strong frontend overlap. Emphasize React and TypeScript in Objective.",
    };
  }
  return jsonFetch(`/resumes/${encodeURIComponent(id)}/ai/match`, {
    method: "POST",
    body: JSON.stringify({ jd, data }),
  });
}
