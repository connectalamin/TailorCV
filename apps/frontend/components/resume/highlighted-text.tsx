import type { ReactNode } from "react";

/** Split text and wrap keyword matches in <mark class="jd-hit">. */
export function HighlightedText({
  text,
  keywords,
}: {
  text: string;
  keywords: string[];
}): ReactNode {
  if (!text) return null;
  if (!keywords.length) return text;

  const escaped = keywords
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <mark key={`${m.index}-${i++}`} className="jd-hit">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}
