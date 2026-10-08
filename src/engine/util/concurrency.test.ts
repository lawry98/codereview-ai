import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (ms, i) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(ms);
      active -= 1;
      return i;
    });
    expect(result).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it("starts nothing new after a failure and rejects only once the calls already in flight have settled", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const run = mapWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      if (item === 0) throw new Error("boom");
      await sleep(20);
      finished.push(item);
      return item;
    });
    await expect(run).rejects.toThrow("boom");
    expect(started).toEqual([0, 1]);
    expect(finished).toEqual([1]);
  });

  it("rejects with the first failure when several calls fail", async () => {
    const run = mapWithConcurrency([0, 1], 2, async (item) => {
      await sleep(item === 0 ? 5 : 15);
      throw new Error(`failed ${item}`);
    });
    await expect(run).rejects.toThrow("failed 0");
  });
});
