import { delay, USE_MOCK_API } from "@/lib/api/client";
import {
  SAMPLE_KEYWORDS,
  SAMPLE_RESUME,
  masterFromUpload,
} from "@/lib/mock/data";
import type {
  KeywordHit,
  ResumeData,
  ResumeListItem,
  ResumeRecord,
} from "@/lib/types/resume";

let resumes: ResumeRecord[] = [];
let lastPreviewHash: string | null = null;

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
  throw new Error("Live upload requires backend");
}

export async function fetchResumeList(
  includeMaster = true,
): Promise<ResumeListItem[]> {
  if (USE_MOCK_API) {
    await delay(200);
    ensureLoaded();
    return resumes
      .filter((r) => includeMaster || !r.isMaster)
      .map(({ data: _d, ...item }) => item);
  }
  throw new Error("Backend not connected");
}

export async function fetchResume(id: string): Promise<ResumeRecord> {
  if (USE_MOCK_API) {
    await delay(200);
    ensureLoaded();
    const found = resumes.find((r) => r.id === id);
    if (!found) throw new Error("Resume not found");
    return structuredClone(found);
  }
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
}

export async function analyzeJob(jd: string): Promise<KeywordHit[]> {
  if (USE_MOCK_API) {
    await delay(700);
    void jd;
    return structuredClone(SAMPLE_KEYWORDS);
  }
  throw new Error("Backend not connected");
}

export async function improveResume(
  resumeId: string,
  jobId: string,
  jdText?: string,
): Promise<{
  resume_id: string;
  preview_hash: string;
  cover_letter: string;
  outreach_message: string;
}> {
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
    const coverLetter = `Dear Hiring Manager,\n\nI am writing to express interest in the ${data.title} role. With experience across ${data.skills.slice(0, 4).join(", ")}, I build reliable product interfaces and design systems.\n\n${data.summary}\n\nI would welcome the chance to discuss how I can contribute.\n\nSincerely,\n${data.name}`;
    const outreachMessage = `Hi — saw the ${data.title} opening. I've shipped similar work (React/TS, accessibility, CI). Happy to share a tailored resume if useful.\n\n— ${data.name}`;
    resumes = [
      ...resumes,
      {
        id,
        title: `Tailored · ${data.title}`,
        isMaster: false,
        status: "ready",
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
    };
  }
  throw new Error("Backend not connected");
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
  throw new Error("Backend not connected");
}

export async function fetchJobDescription(
  resumeId: string,
): Promise<string | null> {
  if (USE_MOCK_API) {
    await delay(150);
    ensureLoaded();
    return resumes.find((r) => r.id === resumeId)?.jobDescription ?? null;
  }
  throw new Error("Backend not connected");
}

export async function confirmTailor(
  resumeId: string,
  previewHash: string,
): Promise<void> {
  if (USE_MOCK_API) {
    await delay(300);
    if (lastPreviewHash && previewHash !== lastPreviewHash) {
      throw new Error("preview_hash mismatch — confirm rejected");
    }
    void resumeId;
    return;
  }
  throw new Error("Backend not connected");
}

export async function downloadResumePdf(resumeId: string): Promise<Blob> {
  if (USE_MOCK_API) {
    await delay(900);
    void resumeId;
    return new Blob(
      ["%PDF-1.4\n% Mock PDF — wire LaTeX backend later\n"],
      { type: "application/pdf" },
    );
  }
  throw new Error("Backend not connected");
}

export function getMasterResumeId(): string | null {
  if (typeof window === "undefined") return null;
  ensureLoaded();
  return (
    localStorage.getItem("master_resume_id") ||
    resumes.find((r) => r.isMaster)?.id ||
    null
  );
}

export function getSampleResume(): ResumeData {
  return structuredClone(SAMPLE_RESUME);
}
