"use client";

import { useMemo, useState } from "react";
import type {
  ContentCategoryScore,
  ContentCheckResult,
  ContentIssue,
  ResumeData,
} from "@/lib/types/resume";

type Props = {
  resumeId: string | null;
  data: ResumeData;
  jd?: string;
  busy?: boolean;
  /** When false, hide Fix (e.g. Tailor preview hash constraints). Default true. */
  allowFix?: boolean;
  onCheck: () => Promise<ContentCheckResult | null>;
  onFix?: (issues: ContentIssue[]) => Promise<void>;
  result: ContentCheckResult | null;
};

function toneClass(score: number | null): string {
  if (score == null) return "is-empty";
  if (score >= 80) return "is-good";
  if (score >= 55) return "is-ok";
  return "is-low";
}

function CategoryRow({
  cat,
  active,
  onSelect,
}: {
  cat: ContentCategoryScore;
  active: boolean;
  onSelect: () => void;
}) {
  const ok = cat.status === "ok" && cat.issueCount === 0;
  return (
    <button
      type="button"
      className={`content-check-row${active ? " is-active" : ""}`}
      onClick={onSelect}
    >
      <span className={`content-check-mark ${ok ? "is-ok" : "is-fail"}`} aria-hidden>
        {ok ? "✓" : "✕"}
      </span>
      <span className="content-check-row-label">{cat.label}</span>
      <span className="content-check-row-meta">
        {cat.issueCount > 0 ? `${cat.issueCount}` : "—"}
      </span>
    </button>
  );
}

export function ContentCheckerPanel({
  resumeId,
  data: _data,
  busy = false,
  allowFix = true,
  onCheck,
  onFix,
  result,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const working = busy || localBusy;

  const activeId = selected || result?.categories[0]?.id || null;
  const filteredIssues = useMemo(() => {
    if (!result || !activeId) return [];
    return result.issues.filter((i) => i.category === activeId);
  }, [result, activeId]);

  async function handleCheck() {
    if (!resumeId) return;
    setLocalBusy(true);
    try {
      await onCheck();
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleFix() {
    if (!resumeId || !result || !onFix) return;
    setLocalBusy(true);
    try {
      await onFix(result.issues);
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="content-check">
      <p className="t-caption">Content check</p>

      <div
        className={[
          "match-card content-check-score",
          toneClass(result ? result.score : null),
        ].join(" ")}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="match-card-label">Your score</span>
          <span className="match-card-rate">
            {result ? `${result.score}/100` : "—"}
          </span>
        </div>
        <p className="match-card-meta">
          {result
            ? result.issueCount
              ? `${result.issueCount} issue${result.issueCount === 1 ? "" : "s"}`
              : "No major issues"
            : "Run a check to score spelling, impact, and ATS readiness"}
        </p>
        {result ? (
          <div className="match-card-bar" aria-hidden>
            <span style={{ width: `${Math.min(100, result.score)}%` }} />
          </div>
        ) : null}
      </div>

      {result?.categories?.length ? (
        <div className="content-check-list">
          {result.categories.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              active={cat.id === activeId}
              onSelect={() => setSelected(cat.id)}
            />
          ))}
        </div>
      ) : null}

      {filteredIssues.length > 0 ? (
        <ul className="content-check-issues">
          {filteredIssues.map((issue, idx) => (
            <li key={`${issue.category}-${idx}`}>
              <p className="content-check-issue-msg">{issue.message}</p>
              {issue.suggestion ? (
                <p className="content-check-issue-sug">{issue.suggestion}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={working || !resumeId}
          onClick={() => void handleCheck()}
        >
          {working ? "Working…" : result ? "Re-check" : "Check content"}
        </button>
        {allowFix ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={working || !resumeId || !result}
            onClick={() => void handleFix()}
          >
            Fix issues
          </button>
        ) : null}
      </div>
    </div>
  );
}
