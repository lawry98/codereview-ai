import { describe, expect, it } from "vitest";
import { numberLines, shq, tailBytes } from "./text";

describe("shq", () => {
  it("wraps in single quotes", () => expect(shq("main")).toBe("'main'"));
  it("escapes embedded single quotes", () => expect(shq("a'b")).toBe(`'a'\\''b'`));
  it("neutralises shell metacharacters", () => expect(shq("x; rm -rf /")).toBe("'x; rm -rf /'"));
});

describe("tailBytes", () => {
  it("returns short text unchanged", () => {
    expect(tailBytes("abc", 10)).toEqual({ text: "abc", truncated: false });
  });
  it("keeps the tail and starts at a line boundary", () => {
    expect(tailBytes("line1\nline2\nline3\n", 9)).toEqual({ text: "[... truncated ...]\nline3\n", truncated: true });
  });
});

describe("numberLines", () => {
  it("numbers every line and ignores the trailing newline", () => {
    expect(numberLines("a\nb\n")).toBe("1  a\n2  b");
  });
  it("respects an inclusive range", () => {
    expect(numberLines("a\nb\nc\nd", 2, 3)).toBe("2  b\n3  c");
  });
  it("caps output and says how to continue", () => {
    const text = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join("\n");
    expect(numberLines(text, 1, undefined, 3)).toBe("1  l1\n2  l2\n3  l3\n[... 7 more lines; request a later range ...]");
  });
});
