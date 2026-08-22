import { describe, expect, it, vi } from "vitest";
import { isAutomaticRecoverySuppressedByPauseHold } from "../services/recovery/pause-hold-guard.js";

describe("automatic recovery pause release guard", () => {
  it("suppresses recovery while a pause hold is active", async () => {
    const getNoWakePauseReleaseGate = vi.fn();
    const service = {
      getActivePauseHoldGate: vi.fn(async () => ({ holdId: "hold-active" })),
      getNoWakePauseReleaseGate,
    } as any;

    await expect(
      isAutomaticRecoverySuppressedByPauseHold({} as any, "company-1", "issue-1", service),
    ).resolves.toBe(true);
    expect(getNoWakePauseReleaseGate).not.toHaveBeenCalled();
  });

  it("keeps stale automatic recovery suppressed after a no-wake release", async () => {
    const service = {
      getActivePauseHoldGate: vi.fn(async () => null),
      getNoWakePauseReleaseGate: vi.fn(async () => ({
        holdId: "hold-released",
        rootIssueId: "issue-root",
        issueId: "issue-1",
        releasedAt: new Date("2026-08-21T10:00:00.000Z"),
        releaseReason: "operator containment",
      })),
    } as any;

    await expect(
      isAutomaticRecoverySuppressedByPauseHold({} as any, "company-1", "issue-1", service),
    ).resolves.toBe(true);
  });

  it("allows recovery once no active or unreleased no-wake gate remains", async () => {
    const service = {
      getActivePauseHoldGate: vi.fn(async () => null),
      getNoWakePauseReleaseGate: vi.fn(async () => null),
    } as any;

    await expect(
      isAutomaticRecoverySuppressedByPauseHold({} as any, "company-1", "issue-1", service),
    ).resolves.toBe(false);
  });
});
