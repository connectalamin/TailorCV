export type ProcessingStatus =
  | "loading"
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export type AccentColor = "teal" | "blue" | "green" | "orange" | "red";

export type TemplateId =
  | "swiss-single"
  | "swiss-two-column"
  | "modern"
  | "modern-two-column"
  | "latex"
  | "clean"
  | "vivid";

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
  updatedAt: string;
  sourceFile?: string;
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

export type LLMConfig = {
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

export type KeywordHit = { k: string; m: number };
