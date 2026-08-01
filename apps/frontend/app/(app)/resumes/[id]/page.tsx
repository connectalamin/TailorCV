"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ResumePreview } from "@/components/resume/resume-preview";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { deleteResume, downloadResumePdf, fetchResume } from "@/lib/api";
import { DEFAULT_TEMPLATE_SETTINGS } from "@/lib/mock/data";
import type { ResumeRecord, TemplateSettings } from "@/lib/types/resume";

const SETTINGS_KEY = "resume_builder_settings";

function loadSettings(): TemplateSettings {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_TEMPLATE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_TEMPLATE_SETTINGS);
}

export default function ResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<ResumeRecord | null>(null);
  const [settings, setSettings] = useState<TemplateSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRecord(await fetchResume(params.id));
      setSettings(loadSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not found");
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDownload() {
    setBusy(true);
    try {
      const blob = await downloadResumePdf(params.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record?.data.name.replace(/\s+/g, "_") ?? "resume"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    setDeleting(true);
    try {
      await deleteResume(params.id);
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-rose-700">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-teal-ink">
          ← Dashboard
        </Link>
      </div>
    );
  }

  if (!record || !settings) {
    return <div className="p-8 text-sm text-mut">Loading…</div>;
  }

  const { data } = record;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
        <Link href="/dashboard" className="no-underline">
          <button type="button" className="btn ghost">
            ← Back to Dashboard
          </button>
        </Link>
        <div className="flex flex-wrap gap-2">
          {!record.isMaster ? (
            <Link href="/tailor" className="no-underline">
              <button type="button" className="btn prime">
                ✦ Enhance Resume
              </button>
            </Link>
          ) : (
            <Link href="/tailor" className="no-underline">
              <button type="button" className="btn prime">
                ✦ Tailor for a job
              </button>
            </Link>
          )}
          <Link href={`/builder?id=${record.id}`} className="no-underline">
            <button type="button" className="btn ghost">
              Edit Resume
            </button>
          </Link>
          <button
            type="button"
            className="btn prime"
            disabled={busy}
            onClick={() => void onDownload()}
          >
            Download Resume
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[radial-gradient(#D5DDDA_1px,transparent_1px)] bg-size-[18px_18px] p-8">
        <div className="mx-auto mb-3 max-w-[794px] text-center">
          <p className="font-mono text-[10px] text-sub">
            {record.isMaster ? "Master resume" : "Tailored resume"}
            {record.status === "preview" ? " · preview" : ""} ·{" "}
            {record.title || record.id}
          </p>
          <h1 className="font-[family-name:var(--disp)] text-xl font-bold">
            {data.name}
          </h1>
        </div>
        <div className="mx-auto w-fit shadow-[0_24px_60px_rgba(12,20,19,.12)]">
          <ResumePreview data={data} settings={settings} />
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Delete resume?"
        description={`This will permanently remove “${record.title || data.name}”. This cannot be undone.`}
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={() => void onConfirmDelete()}
      />
    </div>
  );
}
