import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CompileResult =
  | { ok: true; pdf: Buffer }
  | { ok: false; error: string; log?: string };

/**
 * Compile a .tex string with pdflatex (installed in the Docker image).
 */
export async function compileLatexPdf(texSource: string): Promise<CompileResult> {
  const dir = await mkdtemp(join(tmpdir(), "tailorcv-tex-"));
  const texPath = join(dir, "resume.tex");
  const pdfPath = join(dir, "resume.pdf");
  const logPath = join(dir, "resume.log");

  try {
    await writeFile(texPath, texSource, "utf8");

    try {
      await execFileAsync(
        "pdflatex",
        [
          "-interaction=nonstopmode",
          "-halt-on-error",
          `-output-directory=${dir}`,
          texPath,
        ],
        {
          cwd: dir,
          timeout: 60_000,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, PATH: process.env.PATH },
        },
      );
    } catch (e) {
      let log = "";
      try {
        log = await readFile(logPath, "utf8");
      } catch {
        /* ignore */
      }
      const msg = e instanceof Error ? e.message : String(e);
      const tail = log.split("\n").slice(-40).join("\n");
      return {
        ok: false,
        error: `pdflatex failed: ${msg}`,
        log: tail || undefined,
      };
    }

    const pdf = await readFile(pdfPath);
    if (pdf.length < 100 || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return { ok: false, error: "pdflatex produced an invalid PDF" };
    }
    return { ok: true, pdf };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function latexAvailable(): Promise<boolean> {
  try {
    await execFileAsync("pdflatex", ["-version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
