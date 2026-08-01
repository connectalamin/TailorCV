/** Group flat skill tokens into ATS "Category: a, b, c" lines (mirrors backend). */

const CATEGORY_ORDER = [
  "Languages",
  "Frontend",
  "Backend",
  "Databases",
  "AI/Data",
  "DevOps/Tools",
  "Other",
] as const;

const BUCKETS: Record<(typeof CATEGORY_ORDER)[number], string[]> = {
  Languages: [
    "javascript",
    "typescript",
    "python",
    "java",
    "c++",
    "c",
    "c#",
    "go",
    "golang",
    "rust",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "scala",
    "r",
    "sql",
    "html",
    "html5",
    "css",
    "css3",
    "bash",
    "shell",
  ],
  Frontend: [
    "react",
    "next.js",
    "nextjs",
    "vue",
    "angular",
    "svelte",
    "tailwind",
    "tailwind css",
    "bootstrap",
    "redux",
    "redux toolkit",
    "zustand",
    "jquery",
    "webpack",
    "vite",
    "sass",
    "scss",
  ],
  Backend: [
    "node.js",
    "nodejs",
    "node",
    "express",
    "fastapi",
    "django",
    "flask",
    "spring",
    "nestjs",
    "graphql",
    "rest",
    "rest api",
    "jwt",
    "grpc",
    "prisma",
    "drizzle",
    ".net",
    "asp.net",
  ],
  Databases: [
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "sqlite",
    "mariadb",
    "dynamodb",
    "elasticsearch",
    "firestore",
    "supabase",
  ],
  "AI/Data": [
    "pytorch",
    "tensorflow",
    "langchain",
    "openai",
    "llm",
    "pandas",
    "numpy",
    "scikit-learn",
    "sklearn",
    "machine learning",
    "deep learning",
    "nlp",
  ],
  "DevOps/Tools": [
    "docker",
    "kubernetes",
    "k8s",
    "aws",
    "gcp",
    "azure",
    "git",
    "github",
    "gitlab",
    "ci/cd",
    "linux",
    "nginx",
    "terraform",
    "jenkins",
    "vercel",
    "netlify",
    "firebase",
  ],
  Other: [],
};

function alreadyCategorized(skills: string[]): boolean {
  if (!skills.length) return false;
  const withColon = skills.filter(
    (s) => s.includes(":") && s.split(":", 1)[0].trim().length < 40,
  ).length;
  return withColon >= Math.max(1, Math.ceil((skills.length + 1) / 2));
}

function splitTokens(raw: string): string[] {
  return raw
    .split(/[,|/•·;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function bucketFor(token: string): (typeof CATEGORY_ORDER)[number] {
  const low = token.toLowerCase().trim();
  for (const cat of CATEGORY_ORDER) {
    if (cat === "Other") continue;
    for (const w of BUCKETS[cat]) {
      if (
        low === w ||
        low.replace(/\./g, "") === w.replace(/\./g, "") ||
        low.startsWith(w + " ") ||
        low.endsWith(" " + w)
      ) {
        return cat;
      }
    }
  }
  return "Other";
}

function pushUnique(list: string[], tok: string) {
  if (!list.some((t) => t.toLowerCase() === tok.toLowerCase())) list.push(tok);
}

export function categorizeSkills(skills: string[] | undefined | null): string[] {
  const cleaned = (skills || []).map((s) => String(s).trim()).filter(Boolean);
  if (!cleaned.length) return [];

  const byCat: Record<string, string[]> = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, [] as string[]]),
  );

  const ingestLine = (line: string) => {
    if (line.includes(":")) {
      const idx = line.indexOf(":");
      let cat = line.slice(0, idx).trim() || "Other";
      const known = CATEGORY_ORDER.find(
        (k) =>
          k.toLowerCase() === cat.toLowerCase() ||
          k.toLowerCase().startsWith(cat.toLowerCase()),
      );
      cat = known || cat;
      if (!byCat[cat]) byCat[cat] = [];
      for (const tok of splitTokens(line.slice(idx + 1))) pushUnique(byCat[cat], tok);
      return;
    }
    for (const tok of splitTokens(line)) {
      pushUnique(byCat[bucketFor(tok)], tok);
    }
  };

  if (alreadyCategorized(cleaned)) {
    for (const line of cleaned) ingestLine(line);
  } else {
    for (const line of cleaned) ingestLine(line);
  }

  const out: string[] = [];
  for (const cat of Object.keys(byCat)) {
    const items = byCat[cat];
    if (items.length) out.push(`${cat}: ${items.join(", ")}`);
  }
  return out.length ? out.slice(0, 10) : cleaned.slice(0, 12);
}
