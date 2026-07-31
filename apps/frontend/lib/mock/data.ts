import type {
  Application,
  KeywordHit,
  LLMConfig,
  ResumeData,
  ResumeRecord,
  SystemStatus,
  TemplateSettings,
} from "@/lib/types/resume";

/** ATS-safe LaTeX article defaults (10.5pt, letter, 0.75in margins). */
export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  template: "latex",
  pageSize: "LETTER",
  margins: { top: 19, bottom: 19, left: 19, right: 19 },
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
};

export const TPL_META = {
  "swiss-single": {
    name: "Swiss Single",
    desc: "Full-width vertical · minimalist + teal accent",
    fam: "swiss" as const,
    two: false,
  },
  "swiss-two-column": {
    name: "Swiss Two-Column",
    desc: "65% main + 35% sidebar · hairline divider",
    fam: "swiss" as const,
    two: true,
  },
  modern: {
    name: "Modern",
    desc: "Single column · accent headers",
    fam: "modern" as const,
    two: false,
  },
  "modern-two-column": {
    name: "Modern 2-Col",
    desc: "65/35 split · accent headers",
    fam: "modern" as const,
    two: true,
  },
  latex: {
    name: "LaTeX",
    desc: "Single column · titlerule · ATS-safe (default)",
    fam: "latex" as const,
    two: false,
  },
  clean: {
    name: "Clean",
    desc: "Minimal sans · understated monochrome",
    fam: "clean" as const,
    two: false,
  },
  vivid: {
    name: "Vivid",
    desc: "63/37 · Awesome-CV style accent",
    fam: "vivid" as const,
    two: true,
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

export const SAMPLE_RESUME: ResumeData = {
  name: "Al-Amin",
  title: "Full-Stack Developer",
  summary:
    "I am a Full-Stack Developer focused on React/Next.js, Node.js, and PostgreSQL, building reliable and user-focused web applications with emphasis on scalability, performance, and usability.",
  contact: {
    email: "your.email@example.com",
    phone: "+880 XXXXXXXXXX",
    linkedin: "linkedin.com/in/yourprofile",
    github: "github.com/yourusername",
    location: "Dhaka, Bangladesh",
  },
  /* Education: role=school, meta=dates, co=degree, loc=CGPA */
  edu: [
    {
      co: "B.Sc. (Eng.) in Computer Science and Engineering",
      role: "Comilla University",
      meta: "Jan 2022 – Present",
      loc: "CGPA: 3.65 / 4.00",
      b: [],
    },
  ],
  exp: [
    {
      co: "TechLand BD — Bangladesh",
      role: "Frontend Developer (Freelance)",
      meta: "2025",
      loc: "",
      b: [
        {
          t: "Designed and developed key frontend features for techlandbd.com, a tech e-commerce platform.",
        },
        {
          t: "Built responsive UI for product browsing and smoother customer navigation.",
        },
        {
          t: "Delivered production-ready interfaces with strong usability focus.",
        },
      ],
    },
    {
      co: "Department of CSE, Comilla University — Comilla, Bangladesh",
      role: "CSEFEST Website Developer",
      meta: "2025",
      loc: "",
      b: [
        {
          t: "Developed the official website for CSEFEST, the flagship CSE department event.",
        },
        {
          t: "Implemented registration, scheduling, and centralized event information modules.",
        },
        {
          t: "Delivered a clean responsive experience for students and organizers.",
        },
      ],
    },
  ],
  /* Projects: role=title, co=tech stack, b=description */
  projects: [
    {
      co: "Next.js, React, Tailwind CSS, AI",
      role: "Momentum (2026) — AI-Powered Planning App",
      meta: "",
      loc: "",
      b: [
        {
          t: "AI-powered planning app for daily scheduling, academic tracking, budgeting, and analytics.",
        },
      ],
    },
    {
      co: "React, Firebase, Tailwind CSS",
      role: "Meditrack (2026) — Team Collaboration Hub",
      meta: "",
      loc: "",
      b: [
        {
          t: "Workspace-focused platform with Kanban workflows, realtime chat, and team management.",
        },
      ],
    },
    {
      co: "React, Next.js, Node.js, PostgreSQL, Prisma, Tailwind CSS",
      role: "Code Connect (2025) — Developer Community Platform",
      meta: "",
      loc: "",
      b: [
        {
          t: "Community platform with ranking system, security-focused architecture, and rich UI.",
        },
      ],
    },
    {
      co: "React, PWA, NASA APIs, Chart.js",
      role: "Stellar Tales (NASA Space Apps 2025) — Space Weather Learning PWA",
      meta: "",
      loc: "",
      b: [
        {
          t: "Progressive web app for teaching children space weather with offline support.",
        },
      ],
    },
  ],
  skills: [
    "Languages: JavaScript, TypeScript, Python, Java, C, C++, SQL",
    "Frontend: React, Next.js, Redux Toolkit, Tailwind CSS, HTML5, CSS3",
    "Backend: Node.js, Express, NestJS, REST API, JWT, Socket.io",
    "Databases: PostgreSQL, MongoDB, MySQL, Redis, Prisma",
    "AI/Data: AI Agents, MCP Servers, RAG, Pandas, NumPy, Scikit-learn",
    "DevOps/Tools: Docker, Git, GitHub Actions, Linux, AWS, n8n, Figma",
  ],
  /* Activities (single-column; not a second layout column) */
  langs: [
    ["Executive Member, Creative Team — CoU IT Society", "2023 – 2025"],
    ["Graphics Team Lead, IT Fest — CoU IT Society", "Nov 2024"],
  ],
  certs: [
    ["Docker Foundations Professional Certificate — Docker, Inc.", "Oct 2024"],
    ["Postman API Fundamentals Student Expert — Postman", "Nov 2024"],
    ["Learning Docker — LinkedIn Learning", "Oct 2024"],
    [
      "Object Oriented Programming in Java — Coursera, UC San Diego",
      "Mar 2022",
    ],
  ],
  awards: [
    ["Global Finalist — NASA Space Apps Challenge 2025", ""],
    ["Ranked 11th (National Level) — SOLVIO AI Hackathon 2025", ""],
    ["Ranked 12th out of 170+ teams — BUBT InnovateX Hackathon 2025", ""],
    ["National Finalist — Bangladesh Blockchain Olympiad", ""],
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
    company: "Stripe",
    role: "Senior Frontend Engineer",
    status: "applied",
    match: 92,
    template: "swiss-two-column",
    dateLabel: "2d",
    resumeId: "master-001",
    notes: "Recruiter screen done. Waiting on hiring manager loop.",
  },
  {
    id: "app-2",
    company: "Figma",
    role: "Product Engineer",
    status: "interview",
    match: 90,
    template: "swiss-single",
    dateLabel: "Tue 11:00",
    resumeId: "master-001",
    notes: "Onsite panel Tuesday — prepare design-system war stories.",
  },
  {
    id: "app-3",
    company: "Linear",
    role: "Design Engineer",
    status: "interview",
    match: 88,
    template: "vivid",
    dateLabel: "Thu 14:30",
    notes: "Take-home submitted. Live coding Thursday.",
  },
  {
    id: "app-4",
    company: "Ramp",
    role: "Senior Frontend Engineer",
    status: "offer",
    match: 93,
    template: "swiss-two-column",
    dateLabel: "$185k",
    resumeId: "master-001",
    notes: "Verbal offer. Negotiate remote + equity.",
  },
  {
    id: "app-5",
    company: "Notion",
    role: "Frontend Engineer",
    status: "applied",
    match: 81,
    template: "clean",
    dateLabel: "5d",
  },
  {
    id: "app-6",
    company: "Vercel",
    role: "Developer Experience Eng",
    status: "wish",
    match: 84,
    template: "modern",
    dateLabel: "—",
    notes: "Watch for DX openings — strong Next.js fit.",
  },
  {
    id: "app-7",
    company: "Retool",
    role: "Frontend Engineer",
    status: "wish",
    match: 78,
    template: "latex",
    dateLabel: "—",
  },
  {
    id: "app-8",
    company: "Datadog",
    role: "Software Engineer II",
    status: "applied",
    match: 76,
    template: "modern-two-column",
    dateLabel: "1w",
  },
];

export const PROVIDER_INFO = {
  openai: { name: "OpenAI", defaultModel: "gpt-4o-mini", requiresKey: true },
  openai_compatible: {
    name: "OpenAI Compatible",
    defaultModel: "gpt-4o-mini",
    requiresKey: true,
  },
  anthropic: {
    name: "Anthropic",
    defaultModel: "claude-haiku-4-5-20251001",
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
