import { describe, expect, it } from "vitest";
import { parsePrUrl } from "./parse-pr-url";

describe("parsePrUrl", () => {
  it("parses a canonical PR URL", () => {
    expect(parsePrUrl("https://github.com/vercel/next.js/pull/123")).toEqual({ owner: "vercel", repo: "next.js", number: 123 });
  });
  it("ignores tab suffixes, query strings and hashes", () => {
    expect(parsePrUrl("https://github.com/a/b/pull/9/files?w=1#diff")).toEqual({ owner: "a", repo: "b", number: 9 });
  });
  it("accepts owner/repo#number shorthand and surrounding whitespace", () => {
    expect(parsePrUrl("  a-b/c_d#42 ")).toEqual({ owner: "a-b", repo: "c_d", number: 42 });
  });
  it.each([
    "https://gitlab.com/a/b/merge_requests/1",
    "https://github.com/a/b/issues/1",
    "https://github.com/a/b/pull/0",
    "https://github.com/a/b/pull/abc",
    "not a url",
  ])("rejects %s", (input) => {
    expect(() => parsePrUrl(input)).toThrow(/pull request/);
  });
});
