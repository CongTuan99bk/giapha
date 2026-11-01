import { slugify } from "./format";

/** Bỏ phần đầu YAML (---) và ghi chú HTML dành cho người phát triển trước khi hiển thị. */
export function stripForReaders(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "").trimStart();
}

/** Mục lục từ các tiêu đề cấp 2 ("## ..."), bỏ qua tiêu đề nằm trong khối code. */
export function tableOfContents(md: string): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = [];
  let inCode = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) inCode = !inCode;
    const m = !inCode && /^##\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ id: headingId(m[1]!), title: m[1]!.replace(/[*_`]/g, "") });
  }
  return out;
}

export const headingId = (text: string) => slugify(text.replace(/[*_`]/g, "")) || "muc";
