"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchResumeList,
  getMasterResumeId,
  listApplications,
  uploadMasterResume,
} from "@/lib/api";
import type { ResumeListItem } from "@/lib/types/resume";

export default function DashboardPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [appCount, setAppCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, apps] = await Promise.all([
        fetchResumeList(true),
        listApplications(),
      ]);
      setResumes(list);
      setAppCount(Object.values(apps).flat().length);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadMasterResume(file);
      setUploadOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const master = resumes.find((r) => r.isMaster);
  const tailored = resumes.filter((r) => !r.isMaster);
  const hasMaster = Boolean(master || getMasterResumeId());

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
      <p className="text-[13px] font-medium text-[#2563EB]">Select module</p>
      <h1 className="mt-1 text-[32px] font-semibold tracking-tight text-[#111827]">
        Dashboard
      </h1>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Stats */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <p className="text-[13px] text-[#6B7280]">Applications sent</p>
          <p className="mt-2 text-[28px] font-semibold tracking-tight text-[#111827]">
            {loading ? "—" : appCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <p className="text-[13px] text-[#6B7280]">Resumes tailored</p>
          <p className="mt-2 text-[28px] font-semibold tracking-tight text-[#111827]">
            {loading ? "—" : tailored.length}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <p className="text-[13px] text-[#6B7280]">Master resume</p>
          <p
            className={[
              "mt-2 text-[28px] font-semibold tracking-tight",
              hasMaster ? "text-[#111827]" : "text-[#B45309]",
            ].join(" ")}
          >
            {loading ? "—" : hasMaster ? "Ready" : "Not set"}
          </p>
        </div>
      </div>

      {/* Action modules */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[220px] flex-col rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
              <path d="M14 3v5h5M12 11v6M9 14h6" />
            </svg>
          </div>
          <h2 className="mt-5 text-[18px] font-semibold text-[#111827]">
            {hasMaster ? "Master resume" : "Initialize master resume"}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">
            {hasMaster
              ? `${master?.title || "Master"} is ready — open it or replace the upload.`
              : "Set up your base resume once, reuse it everywhere."}
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            {hasMaster && master ? (
              <Link href={`/resumes/${master.id}`} className="no-underline">
                <button
                  type="button"
                  className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111827] hover:bg-[#F9FAFB]"
                >
                  Open master
                </button>
              </Link>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111827] hover:bg-[#F9FAFB]"
              onClick={() => setUploadOpen(true)}
            >
              {hasMaster ? "Replace upload" : "Get started"}
            </button>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-col rounded-2xl border border-[#BFDBFE] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#2563EB] text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3l1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4L12 3zM18 14l.7 2.1L21 17l-2.3.8L18 20l-.7-2.2L15 17l2.3-.9L18 14zM6 15l.6 1.8L8.5 17l-1.9.7L6 19.5l-.6-1.8L3.5 17l1.9-.2L6 15z" />
            </svg>
          </div>
          <h2 className="mt-5 text-[18px] font-semibold text-[#111827]">
            Create resume
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">
            Tailor a resume from a job description.
          </p>
          <div className="mt-auto pt-6">
            <Link
              href={hasMaster ? "/tailor" : "#"}
              className="no-underline"
              onClick={(e) => {
                if (!hasMaster) {
                  e.preventDefault();
                  setUploadOpen(true);
                }
              }}
            >
              <button
                type="button"
                className="rounded-lg bg-[#2563EB] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#1D4ED8]"
              >
                Tailor from JD
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tailored list */}
      {tailored.length > 0 ? (
        <div className="mt-8">
          <h3 className="mb-3 text-[14px] font-semibold text-[#374151]">
            Recent tailored resumes
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {tailored.map((item) => (
              <Link
                key={item.id}
                href={`/resumes/${item.id}`}
                className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 no-underline shadow-[0_1px_2px_rgba(16,24,40,.04)] transition hover:border-[#BFDBFE]"
              >
                <p className="text-[15px] font-semibold text-[#111827]">
                  {item.title}
                </p>
                <p className="mt-1 text-[13px] text-[#6B7280]">
                  {item.company || "Target"} · open
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {uploadOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={() => !uploading && setUploadOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <h2 className="text-[17px] font-semibold text-[#111827]">
                Upload resume
              </h2>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-5">
              <div
                className={[
                  "rounded-xl border border-dashed p-10 text-center transition",
                  dragOver
                    ? "border-[#2563EB] bg-[#EFF6FF]"
                    : "border-[#D1D5DB] bg-[#F9FAFB]",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFile(e.dataTransfer.files[0]);
                }}
              >
                <p className="text-[15px] font-semibold text-[#111827]">
                  {uploading ? "Parsing with mock AI…" : "Click or drag file"}
                </p>
                <p className="mt-1 text-[12px] text-[#6B7280]">
                  PDF, DOCX, TEX, TXT (max 4MB)
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.tex,.txt,.md"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className="mt-5 rounded-lg bg-[#2563EB] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? "Processing…" : "Choose file"}
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F4F6]"
                  disabled={uploading}
                  onClick={() => setUploadOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
