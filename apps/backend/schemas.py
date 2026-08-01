from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Contact(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    website: Optional[str] = None
    github: Optional[str] = None
    location: Optional[str] = None


class Bullet(BaseModel):
    t: str
    d: Optional[str] = None


class ResumeItem(BaseModel):
    co: str = ""
    role: str = ""
    meta: str = ""
    loc: str = ""
    b: list[Bullet] = Field(default_factory=list)


Pair = list[tuple[str, str]]


class ResumeData(BaseModel):
    name: str = ""
    title: str = ""
    summary: str = ""
    contact: Contact = Field(default_factory=Contact)
    exp: list[ResumeItem] = Field(default_factory=list)
    projects: list[ResumeItem] = Field(default_factory=list)
    edu: list[ResumeItem] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    langs: Pair = Field(default_factory=list)
    certs: Pair = Field(default_factory=list)
    awards: Pair = Field(default_factory=list)


class ResumeListItem(BaseModel):
    id: str
    title: str = ""
    isMaster: bool = False
    status: str = "ready"
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    employmentType: Optional[str] = None
    salary: Optional[str] = None
    deadline: Optional[str] = None
    startDate: Optional[str] = None
    updatedAt: str = ""
    sourceFile: Optional[str] = None
    # JD↔resume keyword overlap % when a job description is stored
    match: Optional[int] = None


class ResumeRecord(ResumeListItem):
    data: ResumeData = Field(default_factory=ResumeData)
    jobDescription: Optional[str] = None
    coverLetter: Optional[str] = None
    outreachMessage: Optional[str] = None


class ResumePatch(BaseModel):
    data: Optional[ResumeData] = None
    coverLetter: Optional[str] = None
    outreachMessage: Optional[str] = None
    jobDescription: Optional[str] = None
    title: Optional[str] = None


class Application(BaseModel):
    id: str
    company: str
    role: str
    location: Optional[str] = None
    employmentType: Optional[str] = None
    salary: Optional[str] = None
    deadline: Optional[str] = None
    startDate: Optional[str] = None
    status: str = "wish"
    notes: Optional[str] = None
    match: Optional[int] = None
    template: Optional[str] = None
    dateLabel: Optional[str] = None
    appliedAt: Optional[str] = None
    resumeId: Optional[str] = None


class AppCreate(BaseModel):
    company: str
    role: str
    location: Optional[str] = None
    employmentType: Optional[str] = None
    salary: Optional[str] = None
    deadline: Optional[str] = None
    startDate: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    template: Optional[str] = None
    match: Optional[int] = None
    resumeId: Optional[str] = None


class AppPatch(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    employmentType: Optional[str] = None
    salary: Optional[str] = None
    deadline: Optional[str] = None
    startDate: Optional[str] = None
    match: Optional[int] = None


class KeywordHit(BaseModel):
    k: str
    m: int


class LLMEntryOut(BaseModel):
    id: str
    provider: str
    model: str
    apiBase: Optional[str] = None
    hasApiKey: bool = False


class LLMConfigOut(BaseModel):
    mode: Literal["single", "fallback"] = "single"
    entries: list[LLMEntryOut] = Field(default_factory=list)
    # Legacy flat fields (first entry) for older clients
    provider: str = "openai"
    model: str = ""
    apiBase: Optional[str] = None
    hasApiKey: bool = False


class LLMEntryUpdate(BaseModel):
    id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    apiBase: Optional[str] = None
    apiKey: Optional[str] = None
    clearApiKey: Optional[bool] = None


class LLMUpdate(BaseModel):
    mode: Optional[Literal["single", "fallback"]] = None
    entries: Optional[list[LLMEntryUpdate]] = None
    # Legacy flat
    provider: Optional[str] = None
    model: Optional[str] = None
    apiBase: Optional[str] = None
    apiKey: Optional[str] = None
    clearApiKey: Optional[bool] = None
    entryId: Optional[str] = None  # for test targeting


class TestOut(BaseModel):
    ok: bool
    message: str


class LlmOpStats(BaseModel):
    calls: int = 0
    successes: int = 0
    failures: int = 0
    tokens: int = 0
    model: Optional[str] = None


class LlmStatsOut(BaseModel):
    since: str
    calls: int = 0
    successes: int = 0
    failures: int = 0
    promptTokens: int = 0
    completionTokens: int = 0
    totalTokens: int = 0
    byOperation: dict[str, LlmOpStats] = Field(default_factory=dict)
    byProvider: dict[str, LlmOpStats] = Field(default_factory=dict)
    lastCallAt: Optional[str] = None


class SystemStatus(BaseModel):
    backend: str
    llm: str
    resumes: int
    applications: int
    lastChecked: str


class JobsReq(BaseModel):
    descriptions: list[str] = Field(default_factory=list)
    resume_id: str = ""


class JobsOut(BaseModel):
    job_id: str


class AnalyzeReq(BaseModel):
    jd: str = ""


class ImproveReq(BaseModel):
    job_id: str = ""
    jd: Optional[str] = None
    intensity: Literal[
        "light",
        "balanced",
        "aggressive",
        # Legacy aliases (normalized server-side)
        "nudge",
        "keywords",
        "full",
    ] = "balanced"
    hint: str = ""


class ImproveOut(BaseModel):
    resume_id: str
    preview_hash: str
    cover_letter: str
    outreach_message: str
    intensity: str = "balanced"
    keywords: list[KeywordHit] = Field(default_factory=list)
    status: str = "preview"
    data: Optional[ResumeData] = None


class ConfirmReq(BaseModel):
    preview_hash: str = ""
    create_application: bool = True


class AiRewriteReq(BaseModel):
    section: str
    jd: Optional[str] = None
    intensity: Literal[
        "light",
        "balanced",
        "aggressive",
        "nudge",
        "keywords",
        "full",
    ] = "balanced"
    data: Optional[ResumeData] = None


class AiAuxReq(BaseModel):
    jd: Optional[str] = None
    data: Optional[ResumeData] = None


class AiMatchReq(BaseModel):
    jd: str = ""
    data: Optional[ResumeData] = None


class AiRewriteOut(BaseModel):
    data: ResumeData


class AiAuxOut(BaseModel):
    cover_letter: str = ""
    outreach_message: str = ""


class AiMatchCategory(BaseModel):
    id: str
    label: str
    score: int = 0


class AiMatchOut(BaseModel):
    keywords: list[KeywordHit] = Field(default_factory=list)
    notes: str = ""
    score: int = 0
    heuristicRate: int = 0
    keywordFound: int = 0
    keywordTotal: int = 0
    matchedSkills: list[str] = Field(default_factory=list)
    missingSkills: list[str] = Field(default_factory=list)
    categories: list[AiMatchCategory] = Field(default_factory=list)
    # "llm" = official AI verdict; "keyword" = local fallback only
    source: Literal["llm", "keyword"] = "llm"


class AiContentCheckReq(BaseModel):
    data: Optional[ResumeData] = None
    jd: Optional[str] = None


class ContentIssue(BaseModel):
    category: str
    severity: Literal["info", "warn", "fail"] = "warn"
    message: str
    location: Optional[str] = None
    suggestion: Optional[str] = None


class ContentCategoryScore(BaseModel):
    id: str
    label: str
    score: int = 0
    issueCount: int = 0
    status: Literal["ok", "warn", "fail"] = "ok"


class AiContentCheckOut(BaseModel):
    score: int = 0
    issueCount: int = 0
    categories: list[ContentCategoryScore] = Field(default_factory=list)
    issues: list[ContentIssue] = Field(default_factory=list)


class AiContentFixReq(BaseModel):
    data: Optional[ResumeData] = None
    jd: Optional[str] = None
    issues: list[ContentIssue] = Field(default_factory=list)


class AiContentFixOut(BaseModel):
    data: ResumeData


class AiAtsChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AiAtsChatReq(BaseModel):
    message: str = ""
    jd: Optional[str] = None
    data: Optional[ResumeData] = None
    missingSkills: list[str] = Field(default_factory=list)
    history: list[AiAtsChatMessage] = Field(default_factory=list)


class AiAtsChatOut(BaseModel):
    reply: str = ""
    applied: bool = False
    data: Optional[ResumeData] = None


class CompileReq(BaseModel):
    data: Optional[ResumeData] = None
    tex: Optional[str] = None
    pageSize: Optional[Literal["A4", "LETTER"]] = None
    marginIn: Optional[float] = None
    filename: Optional[str] = None
    projectsTwoColumn: Optional[bool] = None
    # When true (default), force single-column skills/projects/pairs for ATS parsers.
    atsSafe: Optional[bool] = None


class CompileStatus(BaseModel):
    pdflatex: bool
    status: str
