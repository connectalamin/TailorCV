import type {
  Application,
  KeywordHit,
  LLMConfig,
  ResumeData,
  ResumeRecord,
  SystemStatus,
  TemplateSettings,
} from "@/lib/types/resume";

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  template: "swiss-single",
  pageSize: "A4",
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
  sectionSpacing: 3,
  itemSpacing: 2,
  lineHeight: 3,
  fontSize: 3,
  headerScale: 3,
  headerFont: "sans-serif",
  bodyFont: "sans-serif",
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
    desc: "Serif · ruled headers · classic / academic",
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
  name: "Maya Okonkwo",
  title: "Senior Frontend Engineer",
  summary:
    "Frontend engineer with 8 years building design systems, editor-grade interfaces and rendering pipelines. Ships accessible, heavily-tested React & TypeScript; cares about typography, latency budgets and boring, reliable deploys.",
  contact: {
    email: "maya@okonkwo.dev",
    phone: "+49 30 555 0192",
    linkedin: "in/maya-okonkwo",
    github: "mayaok",
    website: "okonkwo.dev",
  },
  exp: [
    {
      co: "Northwind Labs",
      role: "Senior Frontend Engineer",
      meta: "2021 — Present",
      loc: "Berlin · Hybrid",
      b: [
        {
          t: "Led rebuild of the document editor used by 40k teams; cut p95 render time from 610 ms to 180 ms via virtualization and memoized layout.",
        },
        {
          t: "Built the design-token pipeline (Figma → CSS variables) now powering six product surfaces.",
          d: "directly transferable to your design-systems roadmap.",
        },
        {
          t: "Introduced Playwright component tests in CI; flaky-test rate fell from 7% to 0.4%.",
          d: "matches your QA stack (Playwright, CI/CD).",
        },
        {
          t: "Mentor five engineers; run the frontend guild and the RFC process.",
        },
      ],
    },
    {
      co: "Helios Analytics",
      role: "Frontend Engineer",
      meta: "2018 — 2021",
      loc: "Amsterdam",
      b: [
        {
          t: "Shipped a real-time canvas charting engine rendering 1M-point dashboards at 60 fps.",
        },
        {
          t: "Owned the accessibility program — WCAG 2.1 AA across 120 screens.",
          d: "supports your stated WCAG 2.2 AA goal.",
        },
        {
          t: "Cut bundle size 41% through route-level code-splitting and dependency audits.",
        },
      ],
    },
  ],
  projects: [
    {
      co: "Inkwell",
      role: "Open-source resume engine",
      meta: "2.1k ★",
      loc: "TypeScript · headless Chrome",
      b: [
        {
          t: "Markdown → structured resume → pixel-perfect PDF pipeline; used by 30k+ users.",
        },
      ],
    },
  ],
  edu: [
    {
      co: "TU Berlin",
      role: "MSc Computer Science",
      meta: "2014 — 2016",
      loc: "Berlin",
      b: [
        {
          t: "Thesis: incremental layout algorithms for large documents (grade 1.3).",
        },
      ],
    },
  ],
  skills: [
    "React",
    "TypeScript",
    "GraphQL",
    "Node.js",
    "Next.js",
    "Playwright",
    "CSS architecture",
    "Design systems",
    "Accessibility",
    "Storybook",
    "CI/CD",
  ],
  langs: [
    ["English", "Native"],
    ["German", "C1"],
    ["French", "A2"],
  ],
  certs: [["AWS Certified Developer — Associate", "2023"]],
  awards: [["Frontend Award — Design Systems", "2024"]],
};

export const SAMPLE_KEYWORDS: KeywordHit[] = [
  { k: "React", m: 96 },
  { k: "TypeScript", m: 94 },
  { k: "GraphQL", m: 87 },
  { k: "design systems", m: 84 },
  { k: "accessibility", m: 79 },
  { k: "Playwright", m: 74 },
  { k: "CI/CD", m: 70 },
  { k: "mentorship", m: 64 },
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
  },
  {
    id: "app-2",
    company: "Figma",
    role: "Product Engineer",
    status: "interview",
    match: 90,
    template: "swiss-single",
    dateLabel: "Tue 11:00",
  },
  {
    id: "app-3",
    company: "Linear",
    role: "Design Engineer",
    status: "interview",
    match: 88,
    template: "vivid",
    dateLabel: "Thu 14:30",
  },
  {
    id: "app-4",
    company: "Ramp",
    role: "Senior Frontend Engineer",
    status: "offer",
    match: 93,
    template: "swiss-two-column",
    dateLabel: "$185k",
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
