import { describe, expect, it } from "vitest";
import {
  effectiveHeartbeatTokens,
  evaluateRunawayGuardThresholds,
  type RunawayGuardThresholds,
} from "../services/heartbeat.js";

const thresholds: RunawayGuardThresholds = {
  perRunWarningTokens: 300_000,
  perRunHardStopTokens: 500_000,
  rollingWarningTokens: 750_000,
  rollingHardStopTokens: 1_000_000,
  rollingWarningRuns: 6,
  rollingHardStopRuns: 10,
  failureHardStopCount: 3,
};

describe("heartbeat runaway guard", () => {
  it("counts uncached input plus output tokens", () => {
    expect(effectiveHeartbeatTokens({
      inputTokens: 400_000,
      cachedInputTokens: 125_000,
      outputTokens: 50_000,
    })).toBe(325_000);
  });

  it("warns before a configured hard stop", () => {
    expect(evaluateRunawayGuardThresholds({
      currentRunEffectiveTokens: 325_000,
      rollingEffectiveTokens: 325_000,
      rollingRunCount: 1,
      recentFailureCount: 0,
    }, thresholds)).toEqual({
      severity: "warning",
      reasons: ["per_run_effective_tokens"],
    });
  });

  it("hard stops on cumulative tokens, run frequency, or repeated failures", () => {
    expect(evaluateRunawayGuardThresholds({
      currentRunEffectiveTokens: 10_000,
      rollingEffectiveTokens: 1_100_000,
      rollingRunCount: 10,
      recentFailureCount: 3,
    }, thresholds)).toEqual({
      severity: "hard_stop",
      reasons: [
        "rolling_effective_tokens",
        "rolling_run_count",
        "recent_timeout_or_process_loss_failures",
      ],
    });
  });
});
