import type { PrRef } from "../types";

const NAME = "[A-Za-z0-9_.-]+";
const URL_RE = new RegExp(`^https?://(?:www\\.)?github\\.com/(${NAME})/(${NAME})/pull/(\\d+)(?:[/?#].*)?$`);
const SHORT_RE = new RegExp(`^(${NAME})/(${NAME})#(\\d+)$`);

export function parsePrUrl(input: string): PrRef {
  const text = input.trim();
  const match = URL_RE.exec(text) ?? SHORT_RE.exec(text);
  const number = match ? Number(match[3]) : NaN;
  if (!match || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Not a GitHub pull request URL: "${input}". Expected https://github.com/<owner>/<repo>/pull/<number>.`);
  }
  return { owner: match[1], repo: match[2], number };
}
