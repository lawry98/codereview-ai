/** Single-quote a value for bash. PR metadata (branch names, URLs) is attacker-controlled. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Keep the last `maxBytes` of `text`, starting at a line boundary when one exists. */
export function tailBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) return { text, truncated: false };
  let tail = buffer.subarray(buffer.byteLength - maxBytes).toString("utf8");
  const newline = tail.indexOf("\n");
  if (newline !== -1 && newline < tail.length - 1) tail = tail.slice(newline + 1);
  return { text: `[... truncated ...]\n${tail}`, truncated: true };
}

/** 1-based, inclusive line range with numbers; never returns more than `maxLines` lines. */
export function numberLines(text: string, start = 1, end?: number, maxLines = 400): string {
  const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
  const last = Math.min(lines.length, end ?? lines.length);
  const from = Math.max(1, start);
  const to = Math.min(last, from + maxLines - 1);
  const width = String(to).length;
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${String(i).padStart(width)}  ${lines[i - 1]}`);
  if (to < last) out.push(`[... ${last - to} more lines; request a later range ...]`);
  return out.join("\n");
}
