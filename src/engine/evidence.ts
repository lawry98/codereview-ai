import type { CommandResult } from "./types";
import { tailBytes } from "./util/text";

export type EvidenceEntry =
  | { id: string; seat: string; kind: "command"; cmd: string; exitCode: number; output: string; durationMs: number }
  | { id: string; seat: string; kind: "read"; path: string };

const STORED_OUTPUT_BYTES = 4_000;

/** Every command a seat runs and every file it reads. A finding is "verified" only if it cites ids from here. */
export class EvidenceLog {
  private readonly entries = new Map<string, EvidenceEntry>();
  private readonly counters = new Map<string, number>();

  recordCommand(seat: string, result: CommandResult): string {
    const id = this.nextId(seat);
    this.entries.set(id, {
      id,
      seat,
      kind: "command",
      cmd: result.cmd,
      exitCode: result.exitCode,
      output: tailBytes(result.output, STORED_OUTPUT_BYTES).text,
      durationMs: result.durationMs,
    });
    return id;
  }

  recordRead(seat: string, path: string): string {
    const id = this.nextId(seat);
    this.entries.set(id, { id, seat, kind: "read", path });
    return id;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): EvidenceEntry | undefined {
    return this.entries.get(id);
  }

  all(): EvidenceEntry[] {
    return [...this.entries.values()];
  }

  private nextId(seat: string): string {
    const n = (this.counters.get(seat) ?? 0) + 1;
    this.counters.set(seat, n);
    return `${seat}-${n}`;
  }
}
