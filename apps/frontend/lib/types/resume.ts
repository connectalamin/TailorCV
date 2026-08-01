export type ProcessingStatus =
  | "loading"
  | "pending"
  | "processing"
  | "preview"
  | "ready"
  | "failed";

export type TailorIntensity = "light" | "balanced" | "aggressive";

export type AccentColor = "teal" | "blue" | "green" | "orange" | "red";

export type TemplateId = "latex";

export type TemplateSettings = {
  template: TemplateId;
  pageSize: "A4" | "LETTER";
  margins: { top: number; bottom: number; left: number; right: number };
  sectionSpacing: 1 | 2 | 3 | 4 | 5;
  itemSpacing: 1 | 2 | 3 | 4 | 5;
  lineHeight: 1 | 2 | 3 | 4 | 5;
  fontSize: 1 | 2 | 3 | 4 | 5;
  headerScale: 1 | 2 | 3 | 4 | 5;
  headerFont: "serif" | "sans-serif" | "mono";
  bodyFont: "serif" | "sans-serif" | "mono";
  compact: boolean;
  showContactIcons: boolean;
  accent: AccentColor;
  /** Projects section as two columns (preview + PDF) */
  projectsTwoColumn: boolean;
};

export type Bullet = { t: string; d?: string };

export type ResumeItem = {
  co: string;
  role: string;
  meta: string;
  loc: string;
  b: Bullet[];
};

export type ResumeData = {
  name: string;
  title: string;
  summary: string;
  contact: {
    email?: string;
    phone?: string;
    linkedin?: string;
    website?: string;
    github?: string;
    /** City / region shown in ATS header contact line */
    location?: string;
  };
  exp: ResumeItem[];
  projects: ResumeItem[];
  edu: ResumeItem[];
  skills: string[];
  langs: [string, string][];
  certs: [string, string][];
  awards: [string, string][];
};

export type ResumeListItem = {
  id: string;
  title: string;
  isMaster: boolean;
  status: ProcessingStatus;
  company?: string;
  role?: string;
  location?: string;
  employmentType?: string;
  salary?: string;
  deadline?: string;
  startDate?: string;
  updatedAt: string;
  sourceFile?: string;
  /** JD↔resume keyword / ATS overlap % when available */
  match?: number;
};

export type ResumeRecord = ResumeListItem & {
  data: ResumeData;
  jobDescription?: string;
  coverLetter?: string;
  outreachMessage?: string;
};

export type ApplicationStatus =
  | "wish"
  | "applied"
  | "interview"
  | "offer";

export type Application = {
  id: string;
  company: string;
  role: string;
  location?: string;
  employmentType?: string;
  salary?: string;
  deadline?: string;
  startDate?: string;
  status: ApplicationStatus;
  notes?: string;
  match?: number;
  template?: string;
  dateLabel?: string;
  appliedAt?: string;
  resumeId?: string;
};

export type LLMProvider =
  | "openai"
  | "openai_compatible"
  | "anthropic"
  | "openrouter"
  | "gemini"
  | "deepseek"
  | "ollama";

export type LLMMode = "single" | "fallback";

export type LLMEntry = {
  id: string;
  provider: LLMProvider;
  model: string;
  apiBase?: string;
  hasApiKey: boolean;
};

export type LLMConfig = {
  mode: LLMMode;
  entries: LLMEntry[];
  /** Legacy convenience — mirrors first entry */
  provider: LLMProvider;
  model: string;
  apiBase?: string;
  hasApiKey: boolean;
};

export type SystemStatus = {
  backend: "ok" | "degraded" | "down";
  llm: "ok" | "unconfigured" | "error";
  resumes: number;
  applications: number;
  lastChecked: string;
};

export type LlmOpStats = {
  calls: number;
  successes: number;
  failures: number;
  tokens: number;
  model?: string;
};

export type LlmStats = {
  since: string;
  calls: number;
  successes: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byOperation: Record<string, LlmOpStats>;
  byProvider: Record<string, LlmOpStats>;
  lastCallAt: string | null;
};

export type KeywordHit = { k: string; m: number };

export type AiMatchCategory = {
  id: string;
  label: string;
  score: number;
};

export type AiMatchResult = {
  keywords: KeywordHit[];
  notes: string;
  score: number;
  heuristicRate: number;
  keywordFound?: number;
  keywordTotal?: number;
  matchedSkills?: string[];
  missingSkills: string[];
  categories: AiMatchCategory[];
  source?: "llm" | "keyword";
  keywordSource?: "ai" | "local";
  entryLevel?: boolean;
  softSkillsNote?: string;
  softSkillsInJd?: string[];
  softSkillsMissing?: string[];
};

export type ImproveResult = {
  resume_id: string;
  preview_hash: string;
  cover_letter: string;
  outreach_message: string;
  intensity: TailorIntensity | string;
  keywords: KeywordHit[];
  status: string;
  data?: ResumeData;
};

export type ContentIssueSeverity = "info" | "warn" | "fail";
export type ContentCategoryStatus = "ok" | "warn" | "fail";

export type ContentIssue = {
  category: string;
  severity: ContentIssueSeverity;
  message: string;
  location?: string | null;
  suggestion?: string | null;
};

export type ContentCategoryScore = {
  id: string;
  label: string;
  score: number;
  issueCount: number;
  status: ContentCategoryStatus;
};

export type ContentCheckResult = {
  score: number;
  issueCount: number;
  categories: ContentCategoryScore[];
  issues: ContentIssue[];
};

export type AtsChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AtsChatResult = {
  reply: string;
  applied: boolean;
  data?: ResumeData;
};
