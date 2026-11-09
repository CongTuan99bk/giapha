/** Hiển thị dùng chung cho phả đồ trên web và bản xuất PDF/SVG phía máy chủ. */

/**
 * Tách họ tên thành tối đa 2 dòng vừa ô (theo số ký tự ước lượng).
 * Tên quá dài: giữ phần cuối (tên gọi) ở dòng 2 và rút gọn dòng 1 bằng "…".
 */
export function wrapName(name: string, maxChars = 18): [string] | [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.join(" ").length <= maxChars) return [words.join(" ")];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxChars || !current) current = next;
    else {
      lines.push(current);
      current = w;
    }
  }
  lines.push(current);
  if (lines.length === 1) return [cut(lines[0]!, maxChars)];
  if (lines.length === 2) return [cut(lines[0]!, maxChars), cut(lines[1]!, maxChars)];
  // Hơn 2 dòng: dòng 2 là các từ cuối vừa ô, dòng 1 là phần đầu rút gọn
  let tail = words[words.length - 1]!;
  for (let i = words.length - 2; i > 0; i--) {
    const t = `${words[i]} ${tail}`;
    if (t.length > maxChars) break;
    tail = t;
  }
  const head = name.slice(0, name.length - tail.length).trim();
  return [cut(head, maxChars, true), cut(tail, maxChars)];
}

function cut(s: string, max: number, forceEllipsis = false): string {
  if (s.length <= max && !forceEllipsis) return s;
  return s.length < max ? `${s}…` : `${s.slice(0, max - 1).trimEnd()}…`;
}


/** "1920 – 1990", "sinh 1950", "? – 1990", "đã mất" — dòng phụ dưới tên trên phả đồ */
export function lifespan(p: { birthYear: number | null; deathYear?: number | null; isLiving: boolean }): string {
  const b = p.birthYear ?? null;
  const d = p.deathYear ?? null;
  if (p.isLiving) return b ? `sinh ${b}` : "";
  if (b && d) return `${b} – ${d}`;
  if (b) return `${b} – ?`;
  if (d) return `? – ${d}`;
  return "đã mất";
}
