/** Skill-oriented JD keyword matching — keep in sync with
 *  `apps/backend/services/keywords.py`. */

const STOP = new Set(
  `a an the and or but in on at to for of as is was are were be been being
  with by from that this these those it its i you he she we they them their
  our your my me him her us not no yes do does did done have has had will would
  can could should may might must shall about into over under after before
  than then so if when while where who whom what which how why all any each few
  more most other some such only own same too very just also both either neither
  every many much lot lots via per vs etc
  work working worked works team teams role roles join joining using use used uses
  build building built builds strong good great able ability experience experiences
  experienced years year plus including within across based remote onsite hybrid
  location salary benefits apply applying application applications description
  requirements requirement responsibilities responsibility nice haves bonus points
  skills skill looking seeking seek hiring hired day days job jobs company companies
  position positions candidate candidates please opportunity opportunities excited
  passion passionate love enjoy want wanted needs need needed help helps helping
  make makes making get gets getting got come comes coming go goes going take takes
  taking give gives giving keep keeps keeping know knows knowing learn learns learning
  think thinking feel feeling like likes well best better new high highly level levels
  part parts full time times first one two three something someone somewhere anything
  anyone everything everyone nothing actually really already still even away here
  there today tomorrow always never often usually generally specifically especially
  open opening openings posting posted email phone website link click submit send sent
  equal employer diversity inclusive inclusion culture mission vision values proud
  world people person human humans students student users user customers customer
  clients client product products platform platforms real form forms comment comments
  breaks break curve curves academy graduate graduates fresh junior senior mid entry
  intern internship contract fulltime parttime week weeks month months monthly hour hours
  cse non-cse noncse fresher freshers undergrad undergraduate bachelor bachelors
  degree degrees eligibility eligible
  ensure ensuring provide providing support supporting develop developing developed
  create creating created design designing designed implement implementing implemented
  maintain maintaining maintained collaborate collaborating collaboration communicate
  communicating communication written verbal oral problem problems solving solve solves
  solved understanding understand knowledge familiar familiarity preferred required
  ideal ideally minimum least related relevant similar various multiple solid proven
  track record thousands hundreds welcome welcoming
  stack stacks software engineer engineering developer developers programmer
  programming code codes coding blogs blog posts post content contents
  things thing stuff way ways
  exactly entire entirely flexible flexibility genuine genuinely immediately immediate
  massive massively meetings meeting notice notices noticeable
  hands-on handson fast-paced fastpaced results-driven resultsdriven
  self-motivated selfmotivated self-starter selfstarter detail-oriented detailoriented
  team-player teamplayer go-getter gogetter
  quickly readily clearly deeply closely truly basically simply directly
  others whatever whenever wherever however therefore moreover furthermore otherwise
  available availability interested interest exciting challenge challenges
  comfortable confident eager willing ready openness growth mindset learner learners
  fast pace paced busy tight deadline deadlines start starts starting started
  offer offers offering offered package packages detail details detailed`.split(/\s+/),
);

const SOFT_COMPOUND = new Set(
  `hands-on detail-oriented self-starter self-motivated results-driven fast-paced
  full-time part-time on-site in-person long-term short-term entry-level
  high-quality world-class cross-functional cross-team self-driven goal-oriented
  customer-facing client-facing team-player go-getter problem-solver`.split(/\s+/),
);

const PHRASE_RE =
  /\b(?:next\.?\s*js|node\.?\s*js|react\.?\s*js|vue\.?\s*js|nuxt\.?\s*js|type\s*script|java\s*script|c\s*\+\+|c\s*#|objective\s*c|machine\s+learning|deep\s+learning|data\s+science|data\s+structures?|rest\s+apis?|graphql|ci\s*\/?\s*cd|unit\s+tests?|end\s*to\s*end|full[\s-]?stack|front[\s-]?end|back[\s-]?end|dev\s*ops|react\s+native|tailwind\s+css|material\s+ui|redux\s+toolkit|amazon\s+web\s+services|google\s+cloud|vs\s*code|object\s+oriented|test\s+driven|domain\s+driven|large\s+language\s+models?|computer\s+vision|web\s+sockets?|service\s+workers?|headless\s+cms|search\s+engine\s+optimization|customer\s+relationship\s+management|google\s+analytics|google\s+ads|project\s+management|product\s+management|digital\s+marketing|content\s+marketing|growth\s+marketing|financial\s+modeling|profit\s+and\s+loss|p\s*&\s*l|problem[\s-]+solving|communication\s+skills|analytical\s+skills)\b/gi;

const TECH = new Set(
  `react angular vue svelte next nuxt remix django flask fastapi express nestjs
  spring laravel rails python java kotlin golang rust swift php ruby scala haskell
  elixir typescript javascript html css sass scss tailwind bootstrap redux zustand
  prisma sequelize mongoose postgres postgresql mysql mongodb redis sqlite
  elasticsearch kafka rabbitmq docker kubernetes k8s terraform ansible aws gcp azure
  vercel netlify heroku linux unix bash graphql grpc websocket oauth jwt strapi
  contentful sanity wordpress shopify figma jest cypress playwright pytest junit
  selenium webpack vite babel eslint prettier git github gitlab bitbucket jira
  confluence notion slack npm pnpm yarn pytorch tensorflow sklearn pandas numpy
  spark hadoop airflow dbt snowflake databricks tableau powerbi excel nginx apache
  cms headless headlesscms edtech fintech healthtech martech adtech microservices
  serverless saas paas iaas agile scrum kanban tdd bdd oop solid dry rest soap
  json xml yaml toml markdown latex photoshop illustrator blender unity unreal
  android ios flutter dart swiftui compose
  seo sem ppc cpc cpm ctr cvr roi roas kpi kpis okr okrs crm erp hris ats
  gaap ifrs pnl ebitda arr mrr ltv cac nps csat b2b b2c b2g hubspot salesforce
  marketo mailchimp klaviyo braze segment mixpanel amplitude hotjar optimizely
  ga4 gtm ahrefs semrush moz googleanalytics googleads metaads linkedinads
  quickbooks xero netsuite sap workday pmp prince2 sixsigma lean itil rpa
  project-management product-management digital-marketing content-marketing
  growth-marketing performance-marketing email-marketing paid-search paid-social
  marketing-automation financial-modeling mcq mcqs problem-solving problemsolving
  communication-skills analytical-skills typeorm sqlalchemy assessment assessments
  quiz quizzes lms scorm moodle`.split(/\s+/),
);

function normPhrase(p: string): string {
  let s = p.trim().toLowerCase().replace(/\s+/g, " ");
  s = s.replace(/type script/g, "typescript").replace(/java script/g, "javascript");
  s = s.replace(/next js/g, "next.js").replace(/nextjs/g, "next.js");
  s = s.replace(/node js/g, "node.js").replace(/nodejs/g, "node.js");
  s = s.replace(/react js/g, "react").replace(/c \+\+/g, "c++").replace(/c #/g, "c#");
  s = s.replace(/front end/g, "frontend").replace(/front-end/g, "frontend");
  s = s.replace(/back end/g, "backend").replace(/back-end/g, "backend");
  s = s.replace(/full stack/g, "fullstack").replace(/full-stack/g, "fullstack");
  s = s.replace(/dev ops/g, "devops").replace(/ci \/ cd/g, "ci/cd");
  s = s.replace(/search engine optimization/g, "seo");
  s = s.replace(/customer relationship management/g, "crm");
  s = s.replace(/google analytics/g, "googleanalytics");
  s = s.replace(/google ads/g, "googleads");
  s = s.replace(/project management/g, "project-management");
  s = s.replace(/product management/g, "product-management");
  s = s.replace(/digital marketing/g, "digital-marketing");
  s = s.replace(/content marketing/g, "content-marketing");
  s = s.replace(/growth marketing/g, "growth-marketing");
  s = s.replace(/financial modeling/g, "financial-modeling");
  s = s.replace(/profit and loss/g, "pnl").replace(/p & l/g, "pnl").replace(/p&l/g, "pnl");
  s = s.replace(/problem solving/g, "problem-solving");
  s = s.replace(/communication skills/g, "communication-skills");
  s = s.replace(/analytical skills/g, "analytical-skills");
  return s.trim();
}

function looksTechnical(tok: string): boolean {
  const t = tok.toLowerCase().trim();
  if (!t || STOP.has(t) || SOFT_COMPOUND.has(t)) return false;
  const compact = t.replace(/[.\s\-/]/g, "");
  if (TECH.has(t) || TECH.has(compact)) return true;
  if (/[.+#/]/.test(t)) return true;
  // Avoid "form" matching "...orm"
  if (/(js|sql|db|api|css|cli|sdk|ml|ai|ui|ux)$/.test(t) && t.length >= 3)
    return true;
  if (t === "orm" || (t.endsWith("orm") && t.length >= 5)) return true;
  if (t.includes("-") && !SOFT_COMPOUND.has(t)) {
    const [left, right] = t.split("-", 2);
    if (TECH.has(left) || TECH.has(right) || TECH.has(compact)) return true;
  }
  if (t.length >= 2 && /\d$/.test(t) && TECH.has(t.slice(0, -1))) return true;
  return false;
}

export function isSkillKeyword(tok: string): boolean {
  return looksTechnical(tok);
}

export function extractKeywords(text: string, limit = 40): string[] {
  const scored = new Map<string, number>();

  for (const m of text.matchAll(PHRASE_RE)) {
    const phrase = normPhrase(m[0]);
    if (phrase.length < 2 || STOP.has(phrase) || SOFT_COMPOUND.has(phrase))
      continue;
    scored.set(phrase, (scored.get(phrase) ?? 0) + 4);
  }

  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9+.#-]{1,}/g) ?? []) {
    const tok = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (tok.length < 2 || STOP.has(tok) || SOFT_COMPOUND.has(tok)) continue;
    if (!looksTechnical(tok)) continue;
    scored.set(tok, (scored.get(tok) ?? 0) + 3);
  }

  const ranked = [...scored.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const out: string[] = [];
  for (const [k] of ranked) {
    if (!out.includes(k)) out.push(k);
    if (out.length >= limit) break;
  }
  return out;
}

function tokenInResume(tok: string, plain: string): boolean {
  const t = tok.toLowerCase();
  if (plain.includes(t)) return true;
  const compact = t.replace(/[.\s-]/g, "");
  const plainC = plain.replace(/[.\s-]/g, "");
  return Boolean(compact) && plainC.includes(compact);
}

export function matchKeywords(
  resumeText: string,
  keywords: string[],
): { matches: string[]; missing: string[]; rate: number } {
  const skills = keywords.filter(isSkillKeyword);
  const lower = resumeText.toLowerCase();
  const matches = skills.filter((k) => tokenInResume(k, lower));
  const missing = skills.filter((k) => !tokenInResume(k, lower));
  const rate =
    skills.length === 0
      ? 0
      : Math.round((matches.length / skills.length) * 100);
  return { matches, missing, rate };
}

export function resumeToPlainText(data: {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  edu?: { co: string; role: string; meta?: string; loc?: string; b: { t: string }[] }[];
  exp: { co: string; role: string; meta?: string; loc?: string; b: { t: string }[] }[];
  projects: { co: string; role: string; meta?: string; loc?: string; b: { t: string }[] }[];
  certs?: (string | [string, string])[];
  achievements?: (string | [string, string])[];
  activities?: (string | [string, string])[];
}): string {
  const flat = (items: (string | [string, string])[] | undefined) =>
    (items ?? []).flatMap((item) =>
      Array.isArray(item) ? item.map(String) : [String(item)],
    );
  const bits = [
    data.name,
    data.title,
    data.summary,
    ...data.skills,
    ...(data.edu ?? []).flatMap((e) => [
      e.co,
      e.role,
      e.meta ?? "",
      e.loc ?? "",
      ...e.b.map((x) => x.t),
    ]),
    ...data.exp.flatMap((e) => [
      e.co,
      e.role,
      e.meta ?? "",
      e.loc ?? "",
      ...e.b.map((x) => x.t),
    ]),
    ...data.projects.flatMap((e) => [
      e.co,
      e.role,
      e.meta ?? "",
      e.loc ?? "",
      ...e.b.map((x) => x.t),
    ]),
    ...flat(data.certs),
    ...flat(data.achievements),
    ...flat(data.activities),
  ];
  return bits.join(" ");
}

export function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  const escaped = keywords
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return text.replace(re, '<mark class="jd-hit">$1</mark>');
}
