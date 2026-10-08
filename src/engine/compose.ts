import { MAX_TEAM, ROSTER, type SeatDefinition, type SeatId } from "./roster";
import type { Signal } from "./signals";

export type Team = {
  seated: Array<{ seat: SeatDefinition; why: string }>;
  declined: Array<{ seat: SeatId; reason: string }>;
};

export const SOLO_THRESHOLD_LINES = 30;

export function composeTeam(input: { signals: Signal[]; changedLines: number }): Team {
  const team: Team = { seated: [], declined: [] };

  if (input.changedLines < SOLO_THRESHOLD_LINES) {
    for (const seat of ROSTER) {
      if (seat.id === "correctness") team.seated.push({ seat, why: `standing; the PR is under ${SOLO_THRESHOLD_LINES} changed lines, so one seat reviews it` });
      else team.declined.push({ seat: seat.id, reason: `the PR is under ${SOLO_THRESHOLD_LINES} changed lines; a full team would produce filler` });
    }
    return team;
  }

  for (const seat of ROSTER) {
    if (seat.standing) {
      team.seated.push({ seat, why: "standing" });
      continue;
    }
    if (seat.unavailable) {
      team.declined.push({ seat: seat.id, reason: seat.unavailable });
      continue;
    }
    const fired = seat.triggers.filter((t) => input.signals.includes(t));
    if (fired.length === 0) {
      team.declined.push({ seat: seat.id, reason: seat.triggers.length > 0 ? `no ${seat.triggers.join(" / ")} signal` : "no mechanical trigger yet" });
      continue;
    }
    if (team.seated.length >= MAX_TEAM) {
      team.declined.push({ seat: seat.id, reason: `${fired.join(", ")} fired, but the team is capped at ${MAX_TEAM}` });
      continue;
    }
    team.seated.push({ seat, why: fired.join(", ") });
  }
  return team;
}

/** A seat given a lens that does not fit the diff invents findings, so the lead may decline conditional seats. */
export function applyLeadDeclines(team: Team, declines: Array<{ seat: string; reason: string }>): Team {
  const reasons = new Map(declines.map((d) => [d.seat, d.reason]));
  const dropped = team.seated.filter(({ seat }) => !seat.standing && reasons.has(seat.id));
  return {
    seated: team.seated.filter((entry) => !dropped.includes(entry)),
    declined: [...team.declined, ...dropped.map(({ seat }) => ({ seat: seat.id, reason: `lead: ${reasons.get(seat.id)}` }))],
  };
}
