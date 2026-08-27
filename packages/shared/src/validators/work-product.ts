import { z } from "zod";
import { workspaceFileRefSchema } from "./workspace-file-resource.js";

function attachmentContentPath(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/content`;
}

export const issueWorkProductTypeSchema = z.enum([
  "preview_url",
  "runtime_service",
  "pull_request",
  "branch",
  "commit",
  "artifact",
  "document",
  "structured_output",
]);

export const issueWorkProductStatusSchema = z.enum([
  "active",
  "ready_for_review",
  "approved",
  "changes_requested",
  "merged",
  "closed",
  "failed",
  "archived",
  "draft",
]);

export const issueWorkProductReviewStateSchema = z.enum([
  "none",
  "needs_board_review",
  "approved",
  "changes_requested",
]);

export const attachmentArtifactWorkProductMetadataSchema = z.object({
  attachmentId: z.string().uuid(),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  contentPath: z.string().min(1),
  openPath: z.string().min(1),
  downloadPath: z.string().min(1),
  originalFilename: z.string().optional().nullable(),
}).superRefine((value, ctx) => {
  const contentPath = attachmentContentPath(value.attachmentId);
  if (value.contentPath !== contentPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contentPath"],
      message: "contentPath must point to the same-origin attachment content route",
    });
  }
  if (value.openPath !== contentPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["openPath"],
      message: "openPath must point to the same-origin attachment content route",
    });
  }
  if (value.downloadPath !== `${contentPath}?download=1`) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["downloadPath"],
      message: "downloadPath must point to the same-origin attachment download route",
    });
  }
});

export type AttachmentArtifactWorkProductMetadata = z.infer<typeof attachmentArtifactWorkProductMetadataSchema>;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

const nonEmptyStringRecordSchema = z.record(z.string(), z.string().min(1)).refine(
  (value) => Object.keys(value).length > 0,
  "must contain at least one entry",
);
const nonEmptyUuidRecordSchema = z.record(z.string(), z.string().uuid()).refine(
  (value) => Object.keys(value).length > 0,
  "must contain at least one entry",
);

export const structuredOutputWorkProductMetadataSchema = z.object({
  contractVersion: z.string().min(1),
  runKey: z.string().min(1),
  sourceSnapshotHash: z.string().min(1),
  result: jsonValueSchema,
  resultHash: z.string().min(1),
  reviewer: z.string().min(1).optional(),
  reviewedResultHash: z.string().min(1).optional(),
  reviewedSourceWorkProductId: z.string().uuid().optional(),
  sourceWorkProductId: z.string().uuid().optional(),
  instructionHashes: nonEmptyStringRecordSchema.optional(),
  childIssueIds: nonEmptyUuidRecordSchema.optional(),
  reviewerFindings: z.array(jsonValueSchema).min(1).optional(),
}).strict().superRefine((value, ctx) => {
  const hasReviewerLineage =
    value.reviewer !== undefined ||
    value.reviewedResultHash !== undefined ||
    value.reviewedSourceWorkProductId !== undefined ||
    value.sourceWorkProductId !== undefined;
  if (hasReviewerLineage) {
    if (!value.reviewer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewer"],
        message: "reviewer is required when reviewer lineage metadata is present",
      });
    }
    if (!value.reviewedResultHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewedResultHash"],
        message: "reviewedResultHash is required when reviewer lineage metadata is present",
      });
    }
    if (!value.reviewedSourceWorkProductId && !value.sourceWorkProductId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewedSourceWorkProductId"],
        message: "a reviewed source work product id is required when reviewer lineage metadata is present",
      });
    }
    if (
      value.reviewedSourceWorkProductId &&
      value.sourceWorkProductId &&
      value.reviewedSourceWorkProductId !== value.sourceWorkProductId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceWorkProductId"],
        message: "sourceWorkProductId must match reviewedSourceWorkProductId when both are present",
      });
    }
  }

  const hasManagerLineage =
    value.instructionHashes !== undefined ||
    value.childIssueIds !== undefined ||
    value.reviewerFindings !== undefined;
  if (hasManagerLineage) {
    if (!value.instructionHashes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instructionHashes"],
        message: "instructionHashes is required when manager lineage metadata is present",
      });
    }
    if (!value.childIssueIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["childIssueIds"],
        message: "childIssueIds is required when manager lineage metadata is present",
      });
    }
    if (!value.reviewerFindings) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewerFindings"],
        message: "reviewerFindings is required when manager lineage metadata is present",
      });
    }
  }
});

export type StructuredOutputWorkProductMetadata = z.infer<typeof structuredOutputWorkProductMetadataSchema>;

export const issueWorkProductMetadataSchema = z
  .object({
    resourceRef: workspaceFileRefSchema.optional().nullable(),
    contractVersion: z.string().min(1).optional(),
    runKey: z.string().min(1).optional(),
    sourceSnapshotHash: z.string().min(1).optional(),
    result: jsonValueSchema.optional(),
    resultHash: z.string().min(1).optional(),
    reviewer: z.string().min(1).optional(),
    reviewedResultHash: z.string().min(1).optional(),
    reviewedSourceWorkProductId: z.string().uuid().optional(),
    sourceWorkProductId: z.string().uuid().optional(),
    instructionHashes: nonEmptyStringRecordSchema.optional(),
    childIssueIds: nonEmptyUuidRecordSchema.optional(),
    reviewerFindings: z.array(jsonValueSchema).min(1).optional(),
  })
  .passthrough();

export type IssueWorkProductMetadata = z.infer<typeof issueWorkProductMetadataSchema>;

export const createIssueWorkProductSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  executionWorkspaceId: z.string().uuid().optional().nullable(),
  runtimeServiceId: z.string().uuid().optional().nullable(),
  type: issueWorkProductTypeSchema,
  provider: z.string().min(1),
  externalId: z.string().optional().nullable(),
  title: z.string().min(1),
  url: z.string().url().optional().nullable(),
  status: issueWorkProductStatusSchema.default("active"),
  reviewState: issueWorkProductReviewStateSchema.optional().default("none"),
  isPrimary: z.boolean().optional().default(false),
  healthStatus: z.enum(["unknown", "healthy", "unhealthy"]).optional().default("unknown"),
  summary: z.string().optional().nullable(),
  metadata: issueWorkProductMetadataSchema.optional().nullable(),
  createdByRunId: z.string().uuid().optional().nullable(),
});

export type CreateIssueWorkProduct = z.infer<typeof createIssueWorkProductSchema>;

export const updateIssueWorkProductSchema = createIssueWorkProductSchema.partial();

export type UpdateIssueWorkProduct = z.infer<typeof updateIssueWorkProductSchema>;
