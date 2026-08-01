"""
ATS Keyword Matcher — Extracts skill-oriented keywords from job descriptions
and scores them against a resume (dict → plain text).
"""

from __future__ import annotations

import re
from typing import Any

__all__ = [
    "extract_overlap_keywords",
    "resume_to_plain",
    "score_overlap",
    "extract",
    "is_skill_keyword",
    "entry_level_soft_skills",
    "validate_extracted_keywords",
    "hits_from_keywords",
]


# --------------------------------------------------------------------------- #
#  Stop-words (deduplicated)
# --------------------------------------------------------------------------- #
_STOP: frozenset[str] = frozenset({
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when",
    "at", "from", "by", "about", "into", "through", "during", "before",
    "after", "above", "below", "between", "among", "within", "without",
    "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "shall", "should",
    "can", "could", "may", "might", "must", "shall", "should",
    "this", "that", "these", "those", "i", "me", "my", "myself", "we",
    "our", "ours", "ourselves", "you", "your", "yours", "yourself",
    "yourselves", "he", "him", "his", "himself", "she", "her", "hers",
    "herself", "it", "its", "itself", "they", "them", "their", "theirs",
    "themselves", "what", "which", "who", "whom", "whose", "why", "how",
    "where", "here", "there", "everywhere", "anywhere", "somewhere",
    "all", "each", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "now", "also", "always", "never", "often", "sometimes",
    "usually", "already", "yet", "still", "even", "once", "twice",
    "etc", "eg", "ie", "viz", "et al", "et cetera",
    "job", "jobs", "work", "working", "worked", "worker", "workers",
    "role", "roles", "position", "positions", "career", "careers",
    "company", "companies", "employer", "employers", "employee",
    "employees", "team", "teams", "department", "departments",
    "office", "offices", "remote", "hybrid", "onsite", "on-site",
    "fulltime", "full-time", "parttime", "part-time", "contract",
    "permanent", "temporary", "temp", "freelance", "intern", "internship",
    "entry", "level", "senior", "junior", "mid", "lead", "principal",
    "staff", "manager", "management", "managing", "managed", "director",
    "executive", "vp", "vice", "president", "head", "chief", "cto", "ceo",
    "cfo", "cio", "coo", "cmo", "chro",
    "salary", "salaries", "compensation", "benefit", "benefits", "bonus",
    "bonuses", "stock", "equity", "options", "rsu", "rsus", "espp",
    "k", "year", "years", "month", "months", "week", "weeks", "day", "days",
    "hour", "hours", "annual", "monthly", "weekly", "hourly",
    "usd", "gbp", "eur", "cad", "aud", "inr", "cny", "jpy",
    "please", "kindly", "thank", "thanks", "regards", "best", "sincerely",
    "dear", "hi", "hello", "hey", "greetings",
    "looking", "seeking", "searching", "hiring", "hire", "hires", "hired",
    "apply", "applying", "applied", "application", "applications",
    "candidate", "candidates", "applicant", "applicants", "prospect",
    "prospects", "ideal", "perfect", "preferred", "preferable",
    "must", "should", "required", "requirement", "requirements",
    "desired", "desirable", "optional", "nice", "plus", "bonus",
    "minimum", "min", "maximum", "max", "at least", "up to", "plus",
    "etc", "including", "included", "includes", "include", "such as",
    "like", "e.g.", "i.e.", "namely", "specifically", "particularly",
    "especially", "mainly", "mostly", "largely", "primarily", "generally",
    "typically", "usually", "normally", "commonly", "frequently", "often",
    "sometimes", "occasionally", "rarely", "seldom", "never", "always",
    "ability", "abilities", "capable", "capability", "capabilities",
    "competent", "competence", "competency", "competencies",
    "proficient", "proficiency", "proficiencies",
    "familiar", "familiarity", "knowledge", "knowledges", "know", "knows",
    "understand", "understands", "understanding", "experience", "experiences",
    "experienced", "background", "backgrounds", "exposure", "exposures",
    "skill", "skills", "skilled", "expert", "experts", "expertise",
    "strong", "stronger", "strongest", "weak", "weaker", "weakest",
    "excellent", "good", "better", "best", "bad", "worse", "worst",
    "great", "greater", "greatest", "superb", "outstanding", "exceptional",
    "solid", "proven", "demonstrated", "demonstrable", "track", "record",
    "passion", "passionate", "enthusiastic", "enthusiasm", "motivated",
    "motivation", "driven", "self-starter", "selfstarter", "starter",
    "initiative", "initiatives", "proactive", "proactively", "active",
    "actively", "dynamic", "dynamics", "energetic", "creative", "creativity",
    "innovative", "innovation", "innovations", "strategic", "strategies",
    "strategy", "tactical", "tactics", "operational", "operations",
    "effective", "effectively", "efficient", "efficiently", "successful",
    "successfully", "success", "achieve", "achieves", "achieved",
    "accomplish", "accomplishes", "accomplished", "accomplishment",
    "accomplishments", "result", "results", "resulted", "resulting",
    "outcome", "outcomes", "output", "outputs", "deliver", "delivers",
    "delivered", "delivering", "delivery", "deliveries", "build", "builds",
    "built", "building", "create", "creates", "created", "creating",
    "creation", "develop", "develops", "developed", "developing",
    "development", "developer", "developers", "design", "designs",
    "designed", "designing", "designer", "designers", "implement",
    "implements", "implemented", "implementing", "implementation",
    "implementations", "maintain", "maintains", "maintained", "maintaining",
    "maintenance", "support", "supports", "supported", "supporting",
    "manage", "manages", "managed", "managing", "lead", "leads", "led",
    "leading", "leader", "leaders", "oversee", "oversees", "oversaw",
    "overseeing", "responsible", "responsibility", "responsibilities",
    "accountable", "ownership", "own", "owns", "owned", "owning",
    "collaborate", "collaborates", "collaborated", "collaborating",
    "collaboration", "collaborative", "coordinate", "coordinates",
    "coordinated", "coordinating", "coordination", "communicate",
    "communicates", "communicated", "communicating", "communication",
    "communicative", "interact", "interacts", "interacted", "interacting",
    "interaction", "interactions", "liaise", "liaises", "liaised",
    "liaising", "partner", "partners", "partnered", "partnering",
    "stakeholder", "stakeholders", "client", "clients", "customer",
    "customers", "user", "users", "end-user", "enduser", "end user",
    "vendor", "vendors", "supplier", "suppliers", "third-party",
    "thirdparty", "third party", "cross-functional", "crossfunctional",
    "cross functional", "multidisciplinary", "multi-disciplinary",
    "interdisciplinary", "inter-disciplinary",
    "detail", "details", "detailed", "detail-oriented", "detailoriented",
    "oriented", "focus", "focused", "focusing", "focuses",
    "driven", "drive", "drives", "driving", "driver", "drivers",
    "motivate", "motivates", "motivated", "motivating", "motivation",
    "commit", "commits", "committed", "committing", "commitment",
    "dedicate", "dedicates", "dedicated", "dedicating", "dedication",
    "reliable", "reliability", "dependable", "dependability", "trustworthy",
    "punctual", "punctuality", "timely", "time", "times", "timing",
    "deadline", "deadlines", "schedule", "schedules", "scheduled",
    "scheduling", "plan", "plans", "planned", "planning", "planner",
    "organize", "organizes", "organized", "organizing", "organization",
    "organizational", "prioritize", "prioritizes", "prioritized",
    "prioritizing", "priority", "priorities", "urgent", "urgency",
    "critical", "crucial", "vital", "essential", "important", "necessary",
    "needed", "need", "needs", "needing", "require", "requires",
    "requiring", "required", "requirement", "requirements", "mandatory",
    "compulsory", "obligatory", "prerequisite", "prerequisites",
    "qualification", "qualifications", "qualified", "eligible", "eligibility",
    "criteria", "criterion", "standard", "standards", "benchmark",
    "benchmarks", "metric", "metrics",
    "goal", "goals", "objective", "objectives", "target", "targets",
    "mission", "missions", "vision", "visions", "value", "values",
    "culture", "cultures", "environment", "environments", "atmosphere",
    "climate", "diversity", "inclusion", "inclusive", "belonging", "equity",
    "equal", "equality", "fair", "fairness", "ethical", "ethics",
    "integrity", "honest", "honesty", "transparent", "transparency",
    "accountable", "accountability", "responsible", "responsibility",
    "sustainable", "sustainability", "green", "eco-friendly", "ecofriendly",
    "social", "societal", "community", "communities", "nonprofit",
    "non-profit", "volunteer", "volunteers", "volunteering", "volunteered",
    "front", "back", "end", "stack", "full",  # prevent isolated fragments
    "software", "engineer", "engineering", "developer", "developers",
    "programmer", "programming", "plus",
    # Soft fluff that often leaks into "skills gap" (adverbs / filler / HR speak)
    "exactly", "entire", "entirely", "flexible", "flexibility", "genuine",
    "genuinely", "immediately", "immediate", "massive", "massively",
    "meetings", "meeting", "notice", "notices", "noticeable",
    "hands-on", "handson", "hands on", "fast-paced", "fastpaced",
    "results-driven", "resultsdriven", "self-motivated", "selfmotivated",
    "self-starter", "selfstarter", "detail-oriented", "detailoriented",
    "team-player", "teamplayer", "go-getter", "gogetter",
    "highly", "quickly", "readily", "clearly", "deeply", "closely",
    "truly", "really", "actually", "basically", "simply", "directly",
    "across", "along", "around", "within", "without", "towards", "toward",
    "others", "someone", "anyone", "everyone", "everything", "something",
    "anything", "whatever", "whenever", "wherever", "however", "therefore",
    "moreover", "furthermore", "otherwise", "meanwhile", "afterwards",
    "available", "availability", "interested", "interest", "exciting",
    "excited", "opportunity", "opportunities", "challenge", "challenges",
    "comfortable", "confident", "eager", "willing", "ready", "openness",
    "growth", "mindset", "learn", "learning", "learner", "learners",
    "fast", "pace", "paced", "busy", "tight", "deadline", "deadlines",
    "start", "starts", "starting", "started", "join", "joining", "joined",
    "offer", "offers", "offering", "offered", "package", "packages",
    # Generic nouns / eligibility — not hard skills
    "form", "forms", "platform", "platforms", "product", "products",
    "cse", "non-cse", "noncse", "graduate", "graduates", "fresh",
    "fresher", "freshers", "undergrad", "undergraduate", "bachelor",
    "bachelors", "degree", "degrees", "eligibility", "eligible",
})


# Soft hyphenated phrases that look "technical" only because of "-"
_SOFT_COMPOUND: frozenset[str] = frozenset({
    "hands-on", "detail-oriented", "self-starter", "self-motivated",
    "results-driven", "fast-paced", "full-time", "part-time", "on-site",
    "in-person", "real-time", "long-term", "short-term", "entry-level",
    "high-quality", "world-class", "cross-functional", "cross-team",
    "self-driven", "goal-oriented", "customer-facing", "client-facing",
    "team-player", "go-getter", "problem-solver",
})


# --------------------------------------------------------------------------- #
#  Tech allowlist (expanded & deduplicated)
# --------------------------------------------------------------------------- #
_TECH_ALLOWLIST: frozenset[str] = frozenset({
    # Languages
    "python", "java", "kotlin", "golang", "go", "rust", "swift", "php", "ruby",
    "scala", "haskell", "elixir", "clojure", "perl", "lua", "dart", "r",
    "matlab", "julia", "groovy", "solidity", "vyper", "move", "cairo",
    "typescript", "javascript", "html", "css", "sass", "scss", "less",
    "stylus", "coffeescript", "livescript", "elm", "purescript", "reason",
    "rescript", "wasm", "webassembly", "vb", "vba", "cobol", "fortran",
    "ada", "erlang", "ocaml", "fsharp", "csharp", "cpp", "cplusplus",
    "objc", "objectivec", "shell", "bash", "zsh", "fish", "powershell",
    "batch", "cmd", "awk", "sed", "tcl", "tk",
    # JS / Web frameworks
    "react", "angular", "vue", "svelte", "solidjs", "qwik", "astro", "htmx",
    "alpine", "preact", "inferno", "next", "nuxt", "remix", "gatsby",
    "eleventy", "hugo", "jekyll", "hexo", "docusaurus", "vuepress",
    "vitepress", "slidev", "redwood", "blitz", "t3", "cra",
    "reactjs", "angularjs", "vuejs", "nextjs", "nuxtjs",
    # CSS / UI frameworks
    "tailwind", "bootstrap", "bulma", "foundation", "semantic", "chakra",
    "mantine", "radix", "shadcn", "headlessui", "material", "mui", "vuetify",
    "quasar", "primevue", "primefaces", "primereact", "ant", "antd",
    "styled", "emotion", "jss", "linaria", "stitches", "vanilla", "extract",
    # State / Data fetching
    "redux", "zustand", "recoil", "jotai", "valtio", "mobx", "xstate",
    "reactquery", "tanstack", "swr", "apollo", "urql", "relay", "trpc",
    "grpc", "graphql", "rest", "soap", "odata", "openapi", "swagger",
    "postgrest", "supabase", "firebase", "appwrite", "pocketbase",
    # Backend frameworks
    "django", "flask", "fastapi", "tornado", "pyramid", "bottle", "falcon",
    "express", "nest", "nestjs", "sails", "loopback", "feathers", "koa",
    "hapi", "fastify", "restify", "meteor", "derby", "mean", "mern",
    "spring", "springboot", "micronaut", "quarkus", "vertx", "ktor",
    "laravel", "symfony", "zend", "cakephp", "codeigniter", "yii",
    "rails", "sinatra", "hanami", "phoenix", "play", "akka", "http4k",
    "gin", "echo", "fiber", "beego", "buffalo", "iris", "revel", "martini",
    "rocket", "actix", "axum", "tide", "warp", "poem", "salvo",
    # Databases
    "postgres", "postgresql", "mysql", "mariadb", "sqlite", "oracle",
    "mssql", "sqlserver", "db2", "cockroachdb", "cockroach", "yugabyte",
    "tidb", "planetscale", "neon", "turso", "libsql", "supabase",
    "mongodb", "dynamodb", "cosmosdb", "cassandra", "scylla", "redis",
    "memcached", "elasticsearch", "opensearch", "solr", "meilisearch",
    "algolia", "typesense", "sonic", "sphinx", "manticore", "clickhouse",
    "drill", "druid", "pinot", "kylin", "presto", "trino", "hive",
    "impala", "spark", "snowflake", "databricks", "bigquery", "redshift",
    "firebolt", "rockset", "singlestore", "couchbase", "couchdb",
    "rethinkdb", "arangodb", "neo4j", "janusgraph", "tigergraph",
    "neptune", "gremlin", "orientdb", "influxdb", "timescaledb",
    "victoriametrics", "m3db", "graphite", "rrd",
    "questdb", "dolphindb", "kdb", "kdbplus", "quest", "duckdb",
    "arrow", "parquet", "avro", "orc", "iceberg", "deltalake", "hudi",
    # Message queues / streaming
    "kafka", "rabbitmq", "zeromq", "nats", "pulsar", "rocketmq",
    "activemq", "artemis", "sqs", "sns", "eventbridge", "kinesis",
    "pubsub", "streams", "bull", "bee", "agenda", "nodecron",
    "sidekiq", "resque", "celery", "rq", "huey", "dramatiq",
    # DevOps / Cloud
    "docker", "kubernetes", "k8s", "helm", "istio", "linkerd", "consul",
    "vault", "nomad", "terraform", "pulumi", "crossplane", "ansible",
    "chef", "puppet", "saltstack", "vagrant", "packer",
    "jenkins", "circleci", "travis", "githubactions", "gitlabci",
    "azuredevops", "bitbucketpipelines", "buildkite", "droneci",
    "argo", "flux", "spinnaker", "tekton", "knative", "openfaas",
    "fission", "kubeless", "nuclio", "lambdajs", "serverless",
    "sam", "chalice", "zappa", "serverlessframework",
    "aws", "gcp", "azure", "vercel", "netlify", "heroku", "railway",
    "render", "fly", "digitalocean", "linode", "akamai", "cloudflare",
    "fastly", "ec2", "ecs", "eks", "fargate", "lambda", "s3",
    "rds", "aurora", "dynamodb", "eventbridge", "iam",
    "cognito", "kms", "secretsmanager", "cloudwatch", "xray", "cdk",
    "cloudformation", "elasticbeanstalk", "lightsail", "appsync",
    "amplify", "apigateway", "appmesh", "cloudfront", "route53",
    "globalaccelerator", "directconnect", "transitgateway", "privatelink",
    "vpc", "vpn", "waf", "shield", "guardduty", "inspector", "macie",
    "securityhub", "detective", "config", "cloudtrail", "organizations",
    "controltower", "wellarchitected", "computeoptimizer", "costexplorer",
    "budgets", "marketplace", "outposts", "wavelength", "localzones",
    "gke", "cloudrun", "cloudfunctions", "appengine", "computeengine",
    "cloudstorage", "bigquery", "dataflow", "dataproc",
    "cloudsql", "spanner", "firestore", "bigtable", "memorystore",
    "cloudcdn", "cloudarmor", "cloudiap", "cloudkms", "secretmanager",
    "cloudbuild", "clouddeploy", "cloudscheduler", "cloudtasks",
    "workflows", "eventarc", "run", "functions", "artifactregistry",
    "containerregistry", "containervulnerability", "binaryauthorization",
    "aks", "aci", "vmss", "appservice", "logicapps", "eventgrid",
    "servicebus", "storage", "synapse", "mlstudio", "cognitiveservices",
    "formrecognizer", "computervision", "speech", "luis", "qnamaker",
    "botframework", "powerbi", "powerapps", "powerautomate",
    "sharepoint", "teams", "onedrive", "intune", "entraid", "ad",
    "activedirectory",
    # Monitoring / Observability
    "prometheus", "grafana", "loki", "tempo", "jaeger", "zipkin",
    "opentelemetry", "otel", "datadog", "newrelic", "sentry",
    "pagerduty", "opsgenie", "victorops", "dynatrace", "appdynamics",
    "splunk", "elk", "elasticstack", "beats", "logstash", "kibana",
    "fluentd", "fluentbit", "vector", "telegraf", "influxdata",
    "chronograf", "kapacitor", "signoz", "highlight", "hyperdx",
    "axiom", "honeycomb", "lightstep", "pyroscope",
    "phlare", "parca", "conprof", "profefe", "stackdriver",
    "cloudwatchlogs", "azuremonitor", "googleoperations",
    # Testing
    "jest", "mocha", "chai", "jasmine", "karma", "cypress", "playwright",
    "puppeteer", "selenium", "webdriver", "appium", "detox", "xctest",
    "xcui", "espresso", "uiautomator", "calabash", "cucumber",
    "gherkin", "robot", "pytest", "unittest", "nose", "doctest",
    "tox", "nox", "hypothesis", "locust", "k6", "artillery", "gatling",
    "jmeter", "tsung", "vegeta", "boom", "wrk", "ab", "siege",
    "sonarqube", "sonarlint", "codecov", "coveralls", "stryker",
    "pitest", "mutmut", "infection", "humbug",
    # Build tools
    "webpack", "vite", "rollup", "esbuild", "swc", "turbopack",
    "parcel", "snowpack", "wmr", "microbundle", "tsup", "unbuild",
    "mkdist", "babel", "tsc", "tsnode", "tsx", "jsx",
    "eslint", "prettier", "biome", "rome", "oxc", "ruff", "black",
    "isort", "mypy", "pyright", "pylint", "flake8", "bandit",
    "safety", "pipenv", "poetry", "rye", "pdm", "hatch", "conda",
    "maven", "gradle", "ant", "sbt", "mill", "bazel", "buck", "pants",
    "please", "ninja", "cmake", "meson", "autotools", "make",
    "npm", "pnpm", "yarn", "bun", "deno", "volta", "fnm", "nvm",
    # Mobile
    "android", "ios", "flutter", "reactnative", "ionic", "cordova",
    "phonegap", "capacitor", "nativescript", "xamarin", "maui",
    "swiftui", "uikit", "jetpack", "compose", "storyboard",
    "expo", "eas", "fastlane", "match", "gym", "scan",
    # Desktop
    "electron", "tauri", "flutterdesktop", "qt", "gtk", "wxwidgets",
    "avalonia", "wpf", "winforms", "blazor", "uno",
    # Game / Graphics
    "unity", "unreal", "godot", "cryengine", "source", "idtech",
    "bevy", "amethyst", "ggez", "piston", "macroquad", "fna",
    "monogame", "love2d", "defold", "cocos", "phaser", "pixi",
    "threejs", "babylonjs", "playcanvas", "aframe", "webgl", "webgpu",
    "opengles", "vulkan", "directx", "metal", "hlsl", "glsl", "spirv",
    "shader", "compute", "raytracing", "dlss", "fsr", "taa", "ssao",
    # CMS / E-commerce / domain
    "cms", "headless", "headlesscms", "edtech", "fintech", "healthtech",
    "martech", "adtech", "biotech", "cleantech",
    "wordpress", "drupal", "joomla", "magento", "shopify", "bigcommerce",
    "woocommerce", "prestashop", "opencart", "shopware", "sylius",
    "strapi", "contentful", "sanity", "prismic", "dato", "ghost",
    "keystone", "directus", "payload", "apostrophe", "cockpit",
    "netlifycms", "decap", "tina", "forestry",
    # Business / marketing / finance hard skills (not soft fluff)
    "seo", "sem", "ppc", "cpc", "cpm", "ctr", "cvr", "roi", "roas",
    "kpi", "kpis", "okr", "okrs", "crm", "erp", "hris", "ats",
    "gaap", "ifrs", "pnl", "ebitda", "arr", "mrr", "ltv", "cac",
    "nps", "csat", "b2b", "b2c", "b2g", "saas", "paas", "iaas",
    "hubspot", "salesforce", "marketo", "mailchimp", "klaviyo",
    "braze", "segment", "mixpanel", "amplitude", "hotjar", "optimizely",
    "ga4", "gtm", "ahrefs", "semrush", "moz", "screamingfrog",
    "lookerstudio", "googleanalytics", "googleads", "metaads",
    "linkedinads", "tiktokads", "programmatic", "dsp", "ssp",
    "quickbooks", "xero", "netsuite", "sap", "oracleerp", "workday",
    "tableau", "powerbi", "looker", "excel", "sheets", "vlookup",
    "pivot", "pivottables", "financialmodeling", "forecasting",
    "underwriting", "actuarial", "bloomberg", "capm", "wacc",
    "scrum", "kanban", "jira", "confluence", "asana", "notion",
    "pmp", "prince2", "sixsigma", "lean", "itil",
    "copywriting", "contentstrategy", "brandstrategy", "gohighlevel",
    "rpa", "project-management", "product-management",
    "digital-marketing", "content-marketing", "growth-marketing",
    "performance-marketing", "email-marketing", "paid-search",
    "paid-social", "marketing-automation", "financial-modeling",
    # Assessment / hiring-domain + soft-hard hybrids (explicit JD requirements)
    "mcq", "mcqs", "problem-solving", "problemsolving",
    "communication-skills", "analytical-skills", "typeorm", "sqlalchemy",
    # EdTech / learning-product domain
    "assessment", "assessments", "quiz", "quizzes", "lms", "scorm",
    "moodle", "canvaslms", "coursera", "udemy", "skillsoft",
    # Design / Creative
    "figma", "sketch", "adobe", "photoshop", "illustrator", "indesign",
    "aftereffects", "premiere", "xd", "lightroom", "audition",
    "animate", "character", "dimension", "substance", "aero",
    "blender", "maya", "3dsmax", "cinema4d", "houdini", "zbrush",
    "substancepainter", "subtancedesigner", "marvelous",
    "fusion360", "onshape", "solidworks", "autocad",
    "revit", "archicad", "vectorworks", "sketchup", "rhino",
    "grasshopper", "lumion", "enscape", "twinmotion", "vray",
    "corona", "arnold", "redshift", "octane", "cycles", "eevee",
    "prorender", "iray", "keyshot", "marmoset",
    # Collaboration / Productivity
    "git", "github", "gitlab", "bitbucket", "gitea", "forgejo",
    "jira", "confluence", "notion", "slack", "teams", "discord",
    "zoom", "linear", "asana", "trello", "monday", "clickup",
    "height", "shortcut", "clubhouse", "zepel", "airtable", "smartsheet",
    "miro", "lucidchart", "drawio", "diagrams", "excalidraw",
    "figjam", "whimsical", "mural", "conceptboard",
    # Methodologies
    "agile", "scrum", "kanban", "xp", "lean", "sixsigma", "itil",
    "cobit", "togaf", "safe", "less", "dad", "crystal", "fdd",
    "tdd", "bdd", "atdd", "sbe", "ddd", "clean", "solid", "dry",
    "kiss", "yagni", "grasp", "cupid", "rad", "dora",
    # Security / Compliance
    "owasp", "cve", "cvss", "nist", "iso27001", "soc2", "hipaa",
    "gdpr", "ccpa", "pci", "dss", "sox", "fedramp", "cmmc",
    "csf", "rmf", "cis", "basel", "psd2", "swift", "mtls",
    "oauth", "oidc", "saml", "ldap", "kerberos", "spnego",
    "scim", "fido", "webauthn", "passkey", "totp", "hotp",
    # Data / ML
    "pandas", "numpy", "scipy", "scikitlearn", "sklearn", "xgboost",
    "lightgbm", "catboost", "tensorflow", "pytorch", "jax", "flax",
    "trax", "haiku", "optax", "equinox", "keras", "fastai",
    "huggingface", "transformers", "diffusers", "tokenizers",
    "datasets", "accelerate", "peft", "trl", "llamaindex",
    "langchain", "haystack", "semantic", "chromadb", "pinecone",
    "weaviate", "qdrant", "milvus", "faiss", "annoy", "nmslib",
    "hnsw", "pgvector", "redisvector", "elasticsearchvector",
    "opensearchvector", "vectordb", "vectordatabase",
    "dask", "ray", "modin", "polars", "duckdb",
    "dbt", "airflow", "prefect", "dagster", "mage", "kestra",
    "nifi", "streamsets", "talend", "informatica", "pentaho",
    "knime", "alteryx", "trifacta", "dataiku", "h2o", "rapidminer",
    "spss", "sas", "stata", "minitab", "jmp", "mathematica",
    "maple", "sagemath", "gap", "pari", "octave", "scilab",
    "jupyter", "colab", "kaggle", "tableau", "powerbi", "looker",
    "metabase", "superset", "redash", "mode", "hex", "count",
    "evidence", "streamlit", "dash", "shiny", "panel", "voila",
    "gradio", "bokeh", "altair", "plotly", "matplotlib", "seaborn",
    "plotnine", "ggplot", "geoplot", "folium", "kepler", "deckgl",
    "mapbox", "leaflet", "openlayers", "cesium", "d3", "nivo", "visx",
    "recharts", "victory", "apexcharts", "chartjs", "highcharts",
    "echarts", "amcharts", "fusioncharts", "zingchart", "canvasjs",
    # OS / Web servers / Proxies
    "linux", "unix", "bsd", "freebsd", "openbsd", "netbsd",
    "solaris", "aix", "hpux", "zos",
    "nginx", "apache", "httpd", "iis", "caddy", "traefik",
    "haproxy", "envoy", "squid", "varnish", "trafficserver",
    "tomcat", "jetty", "undertow", "wildfly", "glassfish",
    "weblogic", "websphere", "jboss", "liberty", "openliberty",
    "karaf", "felix", "equinox",
    # Misc concepts
    "microservices", "serverless", "containers", "kubernetes",
    "blockchain", "web3", "defi", "nft", "dao", "smartcontract",
    "ci", "cd", "cicd", "iac", "paas", "iaas", "saas", "faas",
    "llm", "llms", "nlp", "ocr", "gpu", "tpu", "fpga", "asic",
    "arm", "x86", "api", "apis", "graphql", "grpc", "rest", "soap",
    "oauth", "oauth2", "jwt", "mfa", "2fa", "otp", "sms", "smtp",
    "imap", "pop3", "http", "https", "tcp", "udp", "ip", "ipv4",
    "ipv6", "dhcp", "ftp", "sftp", "ssh", "websocket", "webrtc",
    "mqtt", "amqp", "xmpp", "scim", "oidc", "rbac", "abac",
    "cors", "csrf", "xss", "ddos", "sla", "gdpr", "hipaa",
    "iso", "pci", "dss", "pki", "hsm", "tpm", "vpn", "cdn", "waf",
    "siem", "soar", "xdr", "edr", "mdr", "ndr", "uba", "casb",
    "sse", "swg", "cspm", "cwpp", "ciem", "cnapp", "asm", "drp",
    "sast", "dast", "iast", "rasp", "sbom", "mfa", "totp", "hotp",
    "fido", "webauthn", "passkey", "oidc", "ldap", "saml", "sso",
    "scim", "kerberos", "spnego", "mtls", "oauth", "jwt",
})


# --------------------------------------------------------------------------- #
#  Regexes
# --------------------------------------------------------------------------- #
_TOKEN_RE = re.compile(r"[a-z][a-z0-9+.#\-]{1,}")

_PHRASE_RE = re.compile(
    r"\b(?:"
    # Dotted JS / web frameworks
    r"next\.?\s*js|node\.?\s*js|react\.?\s*js|vue\.?\s*js|nuxt\.?\s*js|"
    r"angular\.?\s*js|ember\.?\s*js|backbone\.?\s*js|"
    # Languages with special chars
    r"type\s*script|java\s*script|c\s*\+\+|c\s*#|objective\s*c|f\s*#|"
    # AI / ML
    r"machine\s+learning|deep\s+learning|data\s+science|data\s+structures?|"
    r"natural\s+language\s+processing|computer\s+vision|generative\s+ai|"
    r"artificial\s+intelligence|large\s+language\s+models?|reinforcement\s+learning|"
    # Cloud / DevOps
    r"amazon\s+web\s+services|google\s+cloud|microsoft\s+azure|vs\s*code|"
    r"ci\s*/?\s*cd|dev\s*ops|git\s*ops|ml\s*ops|data\s*ops|fin\s*ops|"
    r"site\s+reliability|cloud\s+native|"
    # Architecture
    r"rest\s+apis?|graphql|grpc|web\s+sockets?|service\s+workers?|"
    r"event\s+sourcing|service\s+mesh|api\s+gateway|micro\s+frontends?|"
    r"progressive\s+web\s+apps?|server\s+side\s+rendering|single\s+page\s+apps?|"
    r"static\s+site\s+generation|headless\s+cms|"
    # Engineering practices
    r"full[\s-]?stack|front[\s-]?end|back[\s-]?end|"
    r"object\s+oriented|test\s+driven|behavior\s+driven|domain\s+driven|"
    r"continuous\s+integration|continuous\s+deployment|continuous\s+delivery|"
    r"unit\s+tests?|end\s*to\s*end|integration\s+tests?|"
    # Data
    r"data\s+warehouse|data\s+lake|data\s+lakehouse|real\s+time\s+analytics|"
    r"vector\s+database|graph\s+database|time\s+series\s+database|"
    # Security
    r"content\s+delivery\s+network|load\s+balancer|web\s+application\s+firewall|"
    r"security\s+information|identity\s+management|zero\s+trust|"
    r"static\s+analysis|dynamic\s+analysis|software\s+bill\s+of\s+materials|"
    r"extended\s+detection|endpoint\s+detection|threat\s+intelligence|"
    # Other / business domains
    r"search\s+engine\s+optimization|customer\s+relationship\s+management|"
    r"enterprise\s+resource\s+planning|robotic\s+process\s+automation|"
    r"google\s+analytics|google\s+ads|meta\s+ads|project\s+management|"
    r"product\s+management|digital\s+marketing|content\s+marketing|"
    r"growth\s+marketing|performance\s+marketing|email\s+marketing|"
    r"paid\s+search|paid\s+social|marketing\s+automation|"
    r"financial\s+modeling|profit\s+and\s+loss|p\s*&\s*l|"
    r"problem[\s-]+solving|communication\s+skills|analytical\s+skills|"
    r"low[\s-]?code|no[\s-]?code|smart\s+contract|block\s*chain|web\s*3"
    r")\b",
    re.IGNORECASE,
)


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def _norm_phrase(p: str) -> str:
    """Normalize multi-word / special-char phrases."""
    p = re.sub(r"\s+", " ", p.strip().lower())
    p = p.replace("type script", "typescript")
    p = p.replace("java script", "javascript")
    p = p.replace("next js", "next.js").replace("nextjs", "next.js")
    p = p.replace("node js", "node.js").replace("nodejs", "node.js")
    p = p.replace("react js", "react").replace("c ++", "c++").replace("c #", "c#")
    p = p.replace("front end", "frontend").replace("front-end", "frontend")
    p = p.replace("back end", "backend").replace("back-end", "backend")
    p = p.replace("full stack", "fullstack").replace("full-stack", "fullstack")
    p = p.replace("dev ops", "devops").replace("ci / cd", "ci/cd")
    p = p.replace("search engine optimization", "seo")
    p = p.replace("customer relationship management", "crm")
    p = p.replace("enterprise resource planning", "erp")
    p = p.replace("robotic process automation", "rpa")
    p = p.replace("google analytics", "googleanalytics")
    p = p.replace("google ads", "googleads")
    p = p.replace("meta ads", "metaads")
    p = p.replace("project management", "project-management")
    p = p.replace("product management", "product-management")
    p = p.replace("digital marketing", "digital-marketing")
    p = p.replace("content marketing", "content-marketing")
    p = p.replace("growth marketing", "growth-marketing")
    p = p.replace("performance marketing", "performance-marketing")
    p = p.replace("email marketing", "email-marketing")
    p = p.replace("paid search", "paid-search")
    p = p.replace("paid social", "paid-social")
    p = p.replace("marketing automation", "marketing-automation")
    p = p.replace("financial modeling", "financial-modeling")
    p = p.replace("profit and loss", "pnl").replace("p & l", "pnl").replace("p&l", "pnl")
    p = p.replace("problem solving", "problem-solving")
    p = p.replace("communication skills", "communication-skills")
    p = p.replace("analytical skills", "analytical-skills")
    return p.strip()


def _looks_technical(tok: str) -> bool:
    """Heuristic: is this token a tech skill / tool / concept?"""
    t = tok.lower().strip()
    if not t or t in _STOP or t in _SOFT_COMPOUND:
        return False
    if t in _TECH_ALLOWLIST:
        return True
    # Compact allowlist hit (next.js → nextjs)
    compact = t.replace(".", "").replace(" ", "").replace("-", "").replace("/", "")
    if compact in _TECH_ALLOWLIST:
        return True
    # Hyphenated tech only when a side is allowlisted (ci-cd via allowlist/phrases;
    # do NOT treat non-cse / educational tags as skills)
    if "-" in t and t not in _SOFT_COMPOUND:
        left, _, right = t.partition("-")
        if left in _TECH_ALLOWLIST or right in _TECH_ALLOWLIST:
            return True
        if compact in _TECH_ALLOWLIST:
            return True
    # Tech sigils (not bare hyphen fluff)
    if any(c in t for c in ".#+/"):
        return True
    # Versioned tech: e.g., css3, html5, es6, python3
    if len(t) >= 2 and t[-1].isdigit() and t[:-1] in _TECH_ALLOWLIST:
        return True
    # Common skill suffixes — avoid "form" matching "...orm"
    if re.search(r"(js|sql|db|api|css|cli|sdk|ml|ui|ux)$", t) and len(t) >= 3:
        return True
    if t == "orm" or (t.endswith("orm") and len(t) >= 5):
        return True
    return False


def is_skill_keyword(tok: str) -> bool:
    """Public gate: keep only skill-like terms for coverage / skills-gap UI."""
    t = (tok or "").strip().lower()
    if not t or len(t) < 2:
        return False
    if t in _STOP or t in _SOFT_COMPOUND:
        return False
    return _looks_technical(t)


_ENTRY_LEVEL_RE = re.compile(
    r"\b(jr\.?|junior|entry[\s-]?level|fresher|freshers|fresh\s+graduate|"
    r"new\s+grad|graduate\s+role|campus\s+hire|intern(?:ship)?)\b",
    re.I,
)

_SOFT_REQUIREMENT_PHRASES: tuple[tuple[str, str], ...] = (
    ("problem-solving", r"problem[\s-]+solving"),
    ("communication-skills", r"communication\s+skills|\bcommunication\b"),
    ("analytical-skills", r"analytical\s+skills|\banalytical\b"),
    ("teamwork", r"\bteamwork\b|team\s+player"),
    ("learning-agility", r"quick\s+learner|eager\s+to\s+learn|learning\s+agility"),
)


def entry_level_soft_skills(jd: str, resume_plain: str = "") -> dict[str, Any]:
    """
    For junior/entry JDs, surface soft-skill requirements separately.
    Does not affect technical keyword coverage score.
    """
    text = jd or ""
    is_entry = bool(_ENTRY_LEVEL_RE.search(text))
    if not is_entry:
        return {
            "is_entry_level": False,
            "in_jd": [],
            "matched": [],
            "missing": [],
            "note": "",
        }

    plain = (resume_plain or "").lower()
    in_jd: list[str] = []
    matched: list[str] = []
    missing: list[str] = []
    for label, pattern in _SOFT_REQUIREMENT_PHRASES:
        if not re.search(pattern, text, re.I):
            continue
        in_jd.append(label)
        # Resume may store hyphenated or spaced forms
        needle = label.replace("-", " ")
        hit = (
            label in plain
            or needle in plain
            or label.replace("-", "") in plain.replace("-", "").replace(" ", "")
        )
        if hit:
            matched.append(label)
        else:
            missing.append(label)

    note = ""
    if in_jd:
        note = (
            "Junior/entry role — soft requirements flagged separately "
            f"({', '.join(in_jd)}). They don’t replace tool/stack coverage."
        )
    else:
        note = (
            "Junior/entry role detected — prioritize stack keywords; "
            "add soft skills the JD emphasizes only if truthful."
        )

    return {
        "is_entry_level": True,
        "in_jd": in_jd,
        "matched": matched,
        "missing": missing,
        "note": note,
    }

def _token_in_resume(tok: str, plain: str) -> bool:
    """
    Word-boundary-aware token check.
    Prevents false positives like 'go' matching 'google' or 'rust' in 'thrust'.
    """
    t = tok.lower()
    escaped = re.escape(t)

    # Boundary: not preceded by alnum; not followed by a letter
    # (digits allowed after → handles python3, es6, css3, etc.)
    if re.search(rf"(?<![a-z0-9]){escaped}(?![a-z])", plain):
        return True

    # Compact form: next.js ↔ nextjs, ci/cd ↔ cicd, etc.
    compact_t = t.replace(".", "").replace(" ", "").replace("-", "").replace("/", "")
    if compact_t != t:
        compact_plain = plain.replace(".", "").replace(" ", "").replace("-", "").replace("/", "")
        compact_escaped = re.escape(compact_t)
        if re.search(rf"(?<![a-z0-9]){compact_escaped}(?![a-z])", compact_plain):
            return True

    return False


def _display_label(k: str) -> str:
    """Pretty-print a lowercase keyword for UI display."""
    if not k:
        return k

    acronyms = {
        "api", "apis", "css", "html", "sql", "json", "xml", "yaml", "ui", "ux",
        "saas", "paas", "iaas", "faas", "db", "sdk", "cli", "orm", "ml", "ai",
        "nlp", "ocr", "gpu", "tpu", "cpu", "ram", "ssd", "hdd", "dns", "cdn",
        "vpn", "ldap", "saml", "sso", "rbac", "abac", "cors", "csrf", "xss",
        "ddos", "sla", "kpi", "roi", "okrs", "gdpr", "hipaa", "soc2", "iso",
        "aws", "gcp", "gke", "eks", "ecs", "ec2", "rds", "s3", "iam", "kms",
        "vpc", "waf", "fpga", "asic", "arm", "x86", "tcp", "udp", "ip", "ipv4",
        "ipv6", "dhcp", "ftp", "sftp", "ssh", "smtp", "imap", "pop3", "http",
        "https", "ws", "wss", "mqtt", "amqp", "oauth", "jwt", "mfa", "2fa",
        "otp", "scim", "oidc", "rest", "soap", "grpc", "ci", "cd", "cicd",
        "iac", "llm", "llms", "nft", "dao", "defi", "web3", "pki", "hsm",
        "tpm", "siem", "soar", "xdr", "edr", "mdr", "ndr", "uba", "casb",
        "sse", "swg", "cspm", "cwpp", "ciem", "cnapp", "asm", "drp",
        "sast", "dast", "iast", "rasp", "sbom", "totp", "hotp", "fido",
    }
    if k in acronyms:
        return k.upper()

    if any(c in k for c in ".+#"):
        # e.g., next.js → Next.js, c++ → C++, c# → C#
        return k[0].upper() + k[1:]

    if " " in k:
        return k.title()

    # Single word
    return k[0].upper() + k[1:]


# --------------------------------------------------------------------------- #
#  Public API
# --------------------------------------------------------------------------- #
def extract_overlap_keywords(jd: str, limit: int = 40) -> list[str]:
    """
    Extract skill-oriented keywords from a job-description string.
    Returns deduplicated, ranked list (best first). Soft filler words are never included.
    """
    if not jd or not isinstance(jd, str):
        return []

    plain = jd.lower()

    # 1. Phrase extraction (known skill multi-word patterns)
    phrases: list[str] = []
    for m in _PHRASE_RE.finditer(plain):
        p = _norm_phrase(m.group())
        if p and p not in _STOP and p not in _SOFT_COMPOUND and p not in phrases:
            phrases.append(p)

    # 2. Token extraction — skill-like only (no long common-word padding)
    tokens: list[str] = []
    for m in _TOKEN_RE.finditer(plain):
        t = m.group().lower().rstrip(".,;:)")
        if not t or t in _STOP or t in _SOFT_COMPOUND:
            continue
        if len(t) < 2:
            continue
        if not _looks_technical(t):
            continue
        if t not in tokens:
            tokens.append(t)

    # 3. Score & rank (all kept items are skills; weight by specificity)
    scored: list[tuple[float, str]] = []
    seen: set[str] = set()

    for p in phrases:
        if p in seen:
            continue
        seen.add(p)
        weight = 1.0 if _looks_technical(p) else 0.85
        scored.append((weight, p))

    for t in tokens:
        if t in seen:
            continue
        seen.add(t)
        scored.append((0.9, t))

    # Sort by weight desc, then length desc (longer = more specific)
    scored.sort(key=lambda x: (x[0], len(x[1])), reverse=True)

    return [s[1] for s in scored[:limit]]


def resume_to_plain(data: dict[str, Any] | None) -> str:
    """
    Flatten a resume dict into searchable plain text.
    Supports TailorCV ResumeData (exp/edu/projects/co/role/b) and looser shapes.
    """
    if not data or not isinstance(data, dict):
        return ""

    parts: list[str] = []

    for key in ("summary", "objective", "headline", "title", "name"):
        val = data.get(key)
        if isinstance(val, str):
            parts.append(val)

    for section in (
        "exp",
        "edu",
        "projects",
        "experience",
        "work",
        "work_experience",
        "education",
    ):
        entries = data.get(section) or []
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, dict):
                for sub in (
                    "co",
                    "role",
                    "meta",
                    "loc",
                    "title",
                    "company",
                    "description",
                    "summary",
                    "degree",
                    "field",
                    "school",
                    "university",
                    "major",
                    "name",
                    "tech",
                    "technologies",
                ):
                    v = entry.get(sub)
                    if isinstance(v, str):
                        parts.append(v)
                    elif isinstance(v, list):
                        parts.extend(str(i) for i in v if isinstance(i, (str, int, float)))
                for b in entry.get("b") or []:
                    if isinstance(b, dict):
                        parts.append(str(b.get("t") or ""))
                    elif isinstance(b, str):
                        parts.append(b)
            elif isinstance(entry, str):
                parts.append(entry)

    skills = data.get("skills") or data.get("skill") or []
    if isinstance(skills, list):
        for s in skills:
            if isinstance(s, str):
                parts.append(s)
            elif isinstance(s, dict):
                name = s.get("name")
                if isinstance(name, str):
                    parts.append(name)
    elif isinstance(skills, str):
        parts.append(skills)

    for key in (
        "certs",
        "certifications",
        "certificates",
        "awards",
        "achievements",
        "activities",
        "publications",
    ):
        items = data.get(key) or []
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, (list, tuple)):
                parts.extend(str(x) for x in item)
            elif isinstance(item, dict):
                name = item.get("name") or item.get("title")
                if isinstance(name, str):
                    parts.append(name)

    return " ".join(parts).lower()


def validate_extracted_keywords(
    keywords: list[str],
    jd: str = "",
    *,
    limit: int = 40,
) -> list[str]:
    """
    Post-filter AI (or any) keyword list with stop-list + context false-positive checks.
    Does not require the tech allowlist — AI may surface valid niche skills.
    """
    jd_lower = (jd or "").lower()
    # Generic terms that are noise unless they appear in a skill-like context
    context_exclude: dict[str, tuple[str, ...]] = {
        "form": ("fill the form", "submit form", "application form", "google form"),
        "forms": ("fill the form", "submit form", "application form"),
        "platform": ("our platform", "the platform", "edtech platform", "learning platform"),
        "product": ("our product", "real product", "the product"),
        "system": ("our system", "the system"),
        "application": ("job application", "submit application"),
    }

    out: list[str] = []
    seen: set[str] = set()
    for raw in keywords:
        k = _norm_phrase(str(raw or "").strip())
        if not k or len(k) < 2:
            continue
        low = k.lower()
        if low in _STOP or low in _SOFT_COMPOUND:
            continue
        # Soft-skill phrases AI sometimes still emits
        if low in {
            "communication",
            "teamwork",
            "leadership",
            "problem-solving",
            "problemsolving",
            "analytical",
            "analytical-skills",
            "communication-skills",
            "creativity",
            "adaptability",
        }:
            continue
        bad_ctx = context_exclude.get(low)
        if bad_ctx and any(ctx in jd_lower for ctx in bad_ctx):
            continue
        if low in seen:
            continue
        seen.add(low)
        out.append(k)
        if len(out) >= limit:
            break
    return out


def hits_from_keywords(keywords: list[str]) -> list[dict[str, Any]]:
    """Convert plain skill strings → KeywordHit-shaped dicts for UI/LLM panels."""
    hits: list[dict[str, Any]] = []
    for i, k in enumerate(keywords):
        label = _display_label(k)
        hits.append({"k": label, "m": max(55, 96 - i * 2)})
    return hits


def score_overlap(
    data: dict[str, Any] | None = None,
    jd: str = "",
    **kwargs: Any,
) -> dict[str, Any]:
    """
    Compare JD keywords against a resume dict.

    Compatible calling conventions:
      score_overlap(data, jd)           # TailorCV
      score_overlap(jd=..., resume=...)
      score_overlap(jd, resume)         # kimi legacy when first arg is str

    Optional kwargs:
      keywords: precomputed skill list (AI or local)
      keyword_source: "ai" | "local"
    """
    resume = data
    job = jd
    if kwargs.get("resume") is not None:
        resume = kwargs["resume"]
    if isinstance(data, str) and isinstance(jd, dict):
        job = data
        resume = jd
    elif isinstance(data, str) and not jd:
        job = data
        resume = kwargs.get("resume")

    plain = resume_to_plain(resume if isinstance(resume, dict) else None)
    pre = kwargs.get("keywords")
    if isinstance(pre, list) and pre:
        keywords = [str(k).strip() for k in pre if str(k).strip()]
        keyword_source = str(kwargs.get("keyword_source") or "ai")
    else:
        keywords = extract_overlap_keywords(job or "", limit=40)
        keyword_source = "local"

    if not keywords:
        return {
            "score": 0.0,
            "rate": 0,
            "matched": [],
            "matches": [],
            "missing": [],
            "keywords": [],
            "total_keywords": 0,
            "keyword_source": keyword_source,
        }

    matched: list[str] = []
    missing: list[str] = []
    for kw in keywords:
        if plain and _token_in_resume(kw, plain):
            matched.append(kw)
        else:
            missing.append(kw)

    total = len(keywords)
    frac = (len(matched) / total) if total else 0.0
    rate = int(round(frac * 100))
    return {
        "score": round(frac, 3),
        "rate": rate,
        "matched": matched,
        "matches": matched,
        "missing": missing,
        "keywords": keywords,
        "total_keywords": total,
        "keyword_source": keyword_source,
    }


def extract(jd: str) -> list[dict[str, Any]]:
    """Lightweight keyword hits for AI panels (skill-oriented)."""
    keys = extract_overlap_keywords(jd, limit=12)
    hits: list[dict[str, Any]] = []
    for i, k in enumerate(keys):
        label = _display_label(k)
        hits.append({"k": label, "m": max(60, 96 - i * 2)})
    return hits
