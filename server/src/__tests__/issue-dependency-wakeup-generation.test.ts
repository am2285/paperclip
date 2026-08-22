import { describe, expect, it } from "vitest";
import { buildIssueBlockersResolvedWakeIdempotencyKey } from "../services/issue-dependency-wakeups.js";

describe("dependency wake completion generations", () => {
  it("deduplicates within one blocker completion but permits a later completion cycle", () => {
    const base = {
      dependentIssueId: "dependent-1",
      resolvedBlockerIssueId: "blocker-1",
    };
    const firstCompletion = new Date("2026-08-21T10:00:00.000Z");
    const secondCompletion = new Date("2026-08-21T11:00:00.000Z");

    const firstKey = buildIssueBlockersResolvedWakeIdempotencyKey({
      ...base,
      resolvedBlockerCompletedAt: firstCompletion,
    });
    const repeatedFirstKey = buildIssueBlockersResolvedWakeIdempotencyKey({
      ...base,
      resolvedBlockerCompletedAt: firstCompletion.toISOString(),
    });
    const secondKey = buildIssueBlockersResolvedWakeIdempotencyKey({
      ...base,
      resolvedBlockerCompletedAt: secondCompletion,
    });

    expect(firstKey).toBe(repeatedFirstKey);
    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).toBe(
      `issue_blockers_resolved:dependent-1:blocker-1:${firstCompletion.getTime()}`,
    );
    expect(secondKey).toBe(
      `issue_blockers_resolved:dependent-1:blocker-1:${secondCompletion.getTime()}`,
    );
  });
});
