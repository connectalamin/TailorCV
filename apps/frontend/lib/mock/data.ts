import type {
  Application,
  KeywordHit,
  LLMConfig,
  ResumeData,
  ResumeRecord,
  SystemStatus,
  TemplateSettings,
} from "@/lib/types/resume";

/** ATS-safe LaTeX article defaults (10.5pt, A4, ~0.6in / 15mm margins). */
export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  template: "latex",
  pageSize: "A4",
  margins: { top: 15, bottom: 15, left: 15, right: 15 },
  sectionSpacing: 2,
  itemSpacing: 2,
  lineHeight: 2,
  fontSize: 1,
  headerScale: 2,
  headerFont: "serif",
  bodyFont: "serif",
  compact: false,
  showContactIcons: false,
  accent: "teal",
  projectsTwoColumn: false,
};

export const TPL_META = {
  latex: {
    name: "LaTeX ATS",
    desc: "Single column · titlerule · ATS-safe",
    fam: "latex" as const,
    two: false,
  },
} as const;

export const ACCENTS = {
  teal: { c: "#0D9488", soft: "#CCFBF1", ink: "#0F766E" },
  blue: { c: "#2563EB", soft: "#DBEAFE", ink: "#1D4ED8" },
  green: { c: "#16A34A", soft: "#DCFCE7", ink: "#15803D" },
  orange: { c: "#EA580C", soft: "#FFEDD5", ink: "#C2410C" },
  red: { c: "#DC2626", soft: "#FEE2E2", ink: "#B91C1C" },
} as const;

export const PAGE = {
  A4: { w: 794, h: 1123, label: "210 × 297 mm" },
  LETTER: { w: 816, h: 1056, label: "215.9 × 279.4 mm" },
} as const;

/** Fictional demo resume — not a real person. */
export const SAMPLE_RESUME: ResumeData = {
  name: "Alex Rivera",
  title: "Full-Stack Developer",
  summary:
    "Full-stack developer focused on React, Next.js, Node.js, and PostgreSQL. Builds reliable, accessible web apps with attention to performance and clear UX.",
  contact: {
    email: "alex.rivera@example.com",
    phone: "+1 (555) 010-2000",
    linkedin: "linkedin.com/in/alexrivera",
    github: "github.com/alexrivera",
    location: "Austin, TX",
  },
  edu: [
    {
      co: "State University",
      role: "B.S. in Computer Science",
      meta: "Aug 2021 – May 2025",
      loc: "GPA: 3.7 / 4.0",
      b: [],
    },
  ],
  exp: [
    {
      co: "Northwind Labs — Remote",
      role: "Frontend Developer (Contract)",
      meta: "2024 – 2025",
      loc: "",
      b: [
        {
          t: "Shipped responsive product UI for a B2B SaaS dashboard used by 2k+ weekly active users.",
        },
        {
          t: "Partnered with design to improve checkout conversion with clearer empty and error states.",
        },
        {
          t: "Reduced Largest Contentful Paint on the marketing site by optimizing images and route code-splitting.",
        },
      ],
    },
    {
      co: "Campus Tech Club — State University",
      role: "Web Team Lead",
      meta: "2023 – 2024",
      loc: "",
      b: [
        {
          t: "Led a small student team building the annual hackathon registration and schedule site.",
        },
        {
          t: "Implemented event registration, speaker schedules, and organizer admin views.",
        },
      ],
    },
  ],
  projects: [
    {
      co: "Next.js, TypeScript, PostgreSQL, Prisma",
      role: "Taskflow — Team Planning App",
      meta: "",
      loc: "",
      b: [
        {
          t: "Full-stack planner with shared workspaces, Kanban boards, and basic analytics.",
        },
      ],
    },
    {
      co: "React, Node.js, Socket.io",
      role: "Pulseboard — Realtime Status Board",
      meta: "",
      loc: "",
      b: [
        {
          t: "Live status board with websocket updates and role-based room access.",
        },
      ],
    },
    {
      co: "Python, FastAPI, Docker",
      role: "Resume Diff API — Sample Service",
      meta: "",
      loc: "",
      b: [
        {
          t: "Small FastAPI service that applies structured resume diffs and returns JSON.",
        },
      ],
    },
  ],
  skills: [
    "Languages: TypeScript, JavaScript, Python, SQL",
    "Frontend: React, Next.js, Tailwind CSS, HTML5, CSS3",
    "Backend: Node.js, Express, FastAPI, REST, JWT",
    "Databases: PostgreSQL, Redis, Prisma",
    "DevOps/Tools: Docker, Git, GitHub Actions, Linux",
  ],
  langs: [
    ["Organizer — University Hackathon", "2024"],
    ["Volunteer mentor — Intro to Web Dev workshop", "2023"],
  ],
  certs: [
    ["AWS Cloud Practitioner — Amazon Web Services", "2024"],
    ["Docker Foundations — Docker, Inc.", "2024"],
  ],
  awards: [
    ["Hackathon finalist — Regional student challenge", "2024"],
    ["Dean’s List — State University", "2023"],
  ],
};

export function defaultCoverLetter(data: ResumeData, roleHint?: string): string {
  const role = roleHint || data.title || "the open role";
  return [
    "Dear Hiring Manager,",
    "",
    `I am writing to express my interest in ${role}. ${data.summary}`,
    "",
    `My recent work includes ${data.projects[0]?.role || "relevant projects"}, and I am comfortable with ${data.skills
      .slice(0, 2)
      .join("; ")}.`,
    "",
    "I would welcome the chance to discuss how I can contribute to your team.",
    "",
    "Sincerely,",
    data.name,
  ].join("\n");
}

export function defaultOutreachMail(data: ResumeData, roleHint?: string): string {
  const role = roleHint || data.title || "your opening";
  return [
    `Hi — I saw the ${role} posting and wanted to reach out briefly.`,
    "",
    `I focus on ${data.skills[0] || "relevant technical work"} and recently worked on ${data.projects[0]?.role || "related projects"}. Happy to share a tailored resume if useful.`,
    "",
    `— ${data.name}`,
  ].join("\n");
}

export const SAMPLE_KEYWORDS: KeywordHit[] = [
  { k: "React", m: 96 },
  { k: "Next.js", m: 94 },
  { k: "Node.js", m: 90 },
  { k: "PostgreSQL", m: 88 },
  { k: "TypeScript", m: 86 },
  { k: "Docker", m: 82 },
  { k: "Prisma", m: 78 },
  { k: "Tailwind", m: 74 },
];

export const DEFAULT_LLM: LLMConfig = {
  mode: "single",
  entries: [
    {
      id: "primary",
      provider: "openai",
      model: "gpt-4o-mini",
      hasApiKey: false,
    },
  ],
  provider: "openai",
  model: "gpt-4o-mini",
  hasApiKey: false,
};

export const DEFAULT_STATUS: SystemStatus = {
  backend: "degraded",
  llm: "unconfigured",
  resumes: 0,
  applications: 0,
  lastChecked: new Date().toISOString(),
};

export const SEED_APPLICATIONS: Application[] = [
  {
    id: "app-1",
    company: "Acme Cloud",
    role: "Frontend Engineer",
    location: "Remote",
    employmentType: "full-time",
    salary: "$140k–$170k",
    startDate: "ASAP",
    status: "applied",
    match: 92,
    template: "latex",
    dateLabel: "2d",
    resumeId: "master-001",
    notes: "Recruiter screen scheduled.",
  },
  {
    id: "app-2",
    company: "Brightly",
    role: "Full-Stack Engineer",
    location: "Berlin",
    employmentType: "full-time",
    salary: "€70k–€90k",
    deadline: "2026-08-15",
    status: "interview",
    match: 90,
    template: "latex",
    dateLabel: "Tue 11:00",
    resumeId: "master-001",
    notes: "Technical screen — review system design basics.",
  },
  {
    id: "app-3",
    company: "Northwind",
    role: "Software Engineer",
    location: "Hybrid",
    employmentType: "full-time",
    startDate: "Q4 2026",
    status: "interview",
    match: 88,
    template: "latex",
    dateLabel: "Thu 14:30",
    notes: "Take-home submitted.",
  },
  {
    id: "app-4",
    company: "Harbor Soft",
    role: "Frontend Engineer",
    location: "Amsterdam",
    employmentType: "full-time",
    salary: "€85k",
    status: "offer",
    match: 93,
    template: "latex",
    dateLabel: "Offer",
    resumeId: "master-001",
    notes: "Verbal offer — reviewing details.",
  },
  {
    id: "app-5",
    company: "Contour",
    role: "React Developer",
    location: "Remote",
    employmentType: "contract",
    salary: "$80/hr",
    deadline: "2026-08-01",
    startDate: "Immediate",
    status: "applied",
    match: 81,
    template: "latex",
    dateLabel: "5d",
  },
  {
    id: "app-6",
    company: "Leaf Labs",
    role: "Developer Experience Eng",
    location: "Remote",
    employmentType: "full-time",
    status: "wish",
    match: 84,
    template: "latex",
    dateLabel: "—",
    notes: "Watch for DX openings.",
  },
  {
    id: "app-7",
    company: "Pixel Forge",
    role: "Frontend Engineer",
    location: "London",
    employmentType: "full-time",
    salary: "£65k–£80k",
    status: "wish",
    match: 78,
    template: "latex",
    dateLabel: "—",
  },
  {
    id: "app-8",
    company: "Signal Metrics",
    role: "Software Engineer II",
    location: "NYC",
    employmentType: "full-time",
    salary: "$160k–$190k",
    deadline: "Rolling",
    status: "applied",
    match: 76,
    template: "latex",
    dateLabel: "1w",
  },
];

export const PROVIDER_INFO = {
  openai: { name: "OpenAI", defaultModel: "gpt-4o-mini", requiresKey: true },
  openai_compatible: {
    name: "OpenAI Compatible",
    defaultModel: "gpt-5.5",
    requiresKey: true,
    requiresBase: true,
  },
  anthropic: {
    name: "Anthropic",
    defaultModel: "claude-opus-4-8",
    requiresKey: true,
  },
  openrouter: {
    name: "OpenRouter",
    defaultModel: "deepseek/deepseek-chat",
    requiresKey: true,
  },
  gemini: {
    name: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    requiresKey: true,
  },
  deepseek: {
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    requiresKey: true,
  },
  ollama: {
    name: "Ollama (Local)",
    defaultModel: "llama3.2",
    requiresKey: false,
  },
} as const;

export function emptyResumes(): ResumeRecord[] {
  return [];
}

export function masterFromUpload(fileName: string): ResumeRecord {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const data = structuredClone(SAMPLE_RESUME);
  if (base && base.toLowerCase() !== "resume") {
    data.name = base
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return {
    id: "master-001",
    title: "Master Resume",
    isMaster: true,
    status: "ready",
    updatedAt: new Date().toISOString(),
    sourceFile: fileName,
    data,
  };
}
