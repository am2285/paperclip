import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog, agentWakeupRequests } from "@paperclipai/db";

export const ISSUE_BLOCKERS_RESOLVED_WAKE_REASON = "issue_blockers_resolved";

const IDEMPOTENT_DEPENDENCY_WAKE_STATUSES = [
  "queued",
  "deferred_issue_execution",
  "claimed",
  "completed",
] as const;

export function buildIssueBlockersResolvedWakeIdempotencyKey(input: {
  dependentIssueId: string;
  resolvedBlockerIssueId: string;
  resolvedBlockerCompletedAt?: Date | string | null;
}) {
  const components = [
    ISSUE_BLOCKERS_RESOLVED_WAKE_REASON,
    input.dependentIssueId,
    input.resolvedBlockerIssueId,
  ];
  if (input.resolvedBlockerCompletedAt) {
    const completedAt = input.resolvedBlockerCompletedAt instanceof Date
      ? input.resolvedBlockerCompletedAt
      : new Date(input.resolvedBlockerCompletedAt);
    const completionGeneration = completedAt.getTime();
    if (Number.isFinite(completionGeneration)) {
      components.push(String(completionGeneration));
    }
  }
  return components.join(":");
}

export async function findExistingIssueBlockersResolvedWake(
  db: Db,
  input: {
    companyId: string;
    idempotencyKey: string;
  },
) {
  return db
    .select({ id: agentWakeupRequests.id, status: agentWakeupRequests.status })
    .from(agentWakeupRequests)
    .where(
      and(
        eq(agentWakeupRequests.companyId, input.companyId),
        eq(agentWakeupRequests.idempotencyKey, input.idempotencyKey),
        inArray(agentWakeupRequests.status, [...IDEMPOTENT_DEPENDENCY_WAKE_STATUSES]),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function findExistingIssueBlockersResolvedWakeForAnyKey(
  db: Db,
  input: {
    companyId: string;
    idempotencyKeys: string[];
  },
) {
  const idempotencyKeys = [...new Set(input.idempotencyKeys.filter(Boolean))];
  if (idempotencyKeys.length === 0) return null;

  return db
    .select({
      id: agentWakeupRequests.id,
      status: agentWakeupRequests.status,
      idempotencyKey: agentWakeupRequests.idempotencyKey,
    })
    .from(agentWakeupRequests)
    .where(
      and(
        eq(agentWakeupRequests.companyId, input.companyId),
        inArray(agentWakeupRequests.idempotencyKey, idempotencyKeys),
        inArray(agentWakeupRequests.status, [...IDEMPOTENT_DEPENDENCY_WAKE_STATUSES]),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function isLatestDependencyResolutionWakeSuppressedByBoardAudit(
  db: Db,
  input: {
    companyId: string;
    blockerIssueIds: string[];
  },
) {
  const blockerIssueIds = [...new Set(input.blockerIssueIds.filter(Boolean))];
  if (blockerIssueIds.length === 0) return false;

  const latestStatusMutation = await db
    .select({ details: activityLog.details })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, input.companyId),
        eq(activityLog.action, "issue.updated"),
        eq(activityLog.entityType, "issue"),
        inArray(activityLog.entityId, blockerIssueIds),
        sql`${activityLog.details}->>'status' is not null`,
        sql`${activityLog.details}->'_previous'->>'status' is not null`,
        sql`${activityLog.details}->'_previous'->>'status' is distinct from ${activityLog.details}->>'status'`,
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const details = latestStatusMutation?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;

  return (
    details.status === "done" &&
    details.wakeSuppressed === true &&
    details.auditOnly === true
  );
}
