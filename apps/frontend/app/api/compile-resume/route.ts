import { NextResponse } from "next/server";
import { compileLatexPdf, latexAvailable } from "@/lib/latex/compile";
import { resumeToLatex } from "@/lib/latex/resume-to-tex";
import type { ResumeData } from "@/lib/types/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  data?: ResumeData;
  tex?: string;
  pageSize?: "A4" | "LETTER";
  marginIn?: number;
  filename?: string;
};

export async function GET() {
  const available = await latexAvailable();
  return NextResponse.json({
    pdflatex: available,
    status: available ? "ready" : "missing",
  });
}

export async function POST(req: Request) {
  if (!(await latexAvailable())) {
    return NextResponse.json(
      {
        error:
          "pdflatex is not installed. Rebuild the Docker image (TeX Live in runner).",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let tex = body.tex?.trim();
  if (!tex) {
    if (!body.data?.name) {
      return NextResponse.json(
        { error: "Provide `data` (ResumeData) or raw `tex`" },
        { status: 400 },
      );
    }
    tex = resumeToLatex(body.data, {
      pageSize: body.pageSize || "LETTER",
      marginIn: body.marginIn ?? 0.75,
    });
  }

  const result = await compileLatexPdf(tex);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, log: result.log },
      { status: 422 },
    );
  }

  const name = (body.filename || body.data?.name || "resume")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(result.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
