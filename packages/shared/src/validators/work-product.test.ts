import { describe, expect, it } from "vitest";
import {
  attachmentArtifactWorkProductMetadataSchema,
  createIssueWorkProductSchema,
  issueWorkProductTypeSchema,
  structuredOutputWorkProductMetadataSchema,
} from "./work-product.js";

describe("attachmentArtifactWorkProductMetadataSchema", () => {
  it("accepts the attachment-backed artifact metadata contract", () => {
    const parsed = attachmentArtifactWorkProductMetadataSchema.parse({
      attachmentId: "11111111-1111-4111-8111-111111111111",
      contentType: "video/mp4",
      byteSize: 1234,
      contentPath: "/api/attachments/11111111-1111-4111-8111-111111111111/content",
      openPath: "/api/attachments/11111111-1111-4111-8111-111111111111/content",
      downloadPath: "/api/attachments/11111111-1111-4111-8111-111111111111/content?download=1",
      originalFilename: "demo.mp4",
    });

    expect(parsed.contentType).toBe("video/mp4");
    expect(parsed.downloadPath).toContain("download=1");
  });

  it("rejects off-route or scriptable paths", () => {
    const parsed = attachmentArtifactWorkProductMetadataSchema.safeParse({
      attachmentId: "11111111-1111-4111-8111-111111111111",
      contentType: "video/mp4",
      byteSize: 1234,
      contentPath: "https://evil.example/video.mp4",
      openPath: "javascript:alert(1)",
      downloadPath: "/api/attachments/11111111-1111-4111-8111-111111111111/content",
      originalFilename: "demo.mp4",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("Expected invalid attachment artifact metadata");
    }
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "contentPath",
      "openPath",
      "downloadPath",
    ]);
  });
});

describe("structuredOutputWorkProductMetadataSchema", () => {
  it("accepts nested JSON result metadata for structured output work products", () => {
    const metadata = structuredOutputWorkProductMetadataSchema.parse({
      contractVersion: "crm-outreach-result.v1",
      runKey: "outreach-generator:SYSA-2011:attempt-1",
      sourceSnapshotHash: "sha256:source",
      result: {
        prospects: [
          {
            id: "lead-1",
            signals: ["recent funding", "SOC2"],
            personalization: {
              subject: "Draft subject",
              scores: { fit: 0.91, urgency: 0.75 },
              approved: false,
              optionalNote: null,
            },
          },
        ],
      },
      resultHash: "sha256:result",
    });

    expect(metadata.result).toEqual({
      prospects: [
        {
          id: "lead-1",
          signals: ["recent funding", "SOC2"],
          personalization: {
            subject: "Draft subject",
            scores: { fit: 0.91, urgency: 0.75 },
            approved: false,
            optionalNote: null,
          },
        },
      ],
    });

    const product = createIssueWorkProductSchema.parse({
      type: "structured_output",
      provider: "paperclip",
      title: "Outreach generator result",
      status: "ready_for_review",
      isPrimary: true,
      metadata,
    });

    expect(product.type).toBe("structured_output");
    expect(product.status).toBe("ready_for_review");
    expect(product.isPrimary).toBe(true);
    expect(issueWorkProductTypeSchema.options).toContain("structured_output");
  });

  it("accepts exact reviewer lineage metadata at the structured output root", () => {
    const sourceWorkProductId = "11111111-1111-4111-8111-111111111111";
    const metadata = structuredOutputWorkProductMetadataSchema.parse({
      contractVersion: "crm-outreach-review.v1",
      runKey: "brand-reviewer:SYSA-2012:attempt-1",
      sourceSnapshotHash: "sha256:source",
      result: { verdict: "pass", blockers: [] },
      resultHash: "sha256:finding",
      reviewer: "brand_voice_reviewer",
      reviewedResultHash: "sha256:generator-result",
      reviewedSourceWorkProductId: sourceWorkProductId,
      sourceWorkProductId,
    });

    expect(metadata.reviewer).toBe("brand_voice_reviewer");
    expect(metadata.reviewedResultHash).toBe("sha256:generator-result");
    expect(metadata.reviewedSourceWorkProductId).toBe(sourceWorkProductId);
    expect(metadata.sourceWorkProductId).toBe(sourceWorkProductId);
  });

  it("rejects partial or conflicting reviewer lineage metadata", () => {
    const partial = structuredOutputWorkProductMetadataSchema.safeParse({
      contractVersion: "crm-outreach-review.v1",
      runKey: "brand-reviewer:SYSA-2012:attempt-1",
      sourceSnapshotHash: "sha256:source",
      result: { verdict: "pass", blockers: [] },
      resultHash: "sha256:finding",
      reviewer: "brand_voice_reviewer",
    });
    expect(partial.success).toBe(false);
    if (partial.success) throw new Error("Expected incomplete reviewer lineage metadata to fail");
    expect(partial.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "reviewedResultHash",
      "reviewedSourceWorkProductId",
    ]);

    const conflicting = structuredOutputWorkProductMetadataSchema.safeParse({
      contractVersion: "crm-outreach-review.v1",
      runKey: "brand-reviewer:SYSA-2012:attempt-1",
      sourceSnapshotHash: "sha256:source",
      result: { verdict: "pass", blockers: [] },
      resultHash: "sha256:finding",
      reviewer: "brand_voice_reviewer",
      reviewedResultHash: "sha256:generator-result",
      reviewedSourceWorkProductId: "11111111-1111-4111-8111-111111111111",
      sourceWorkProductId: "22222222-2222-4222-8222-222222222222",
    });
    expect(conflicting.success).toBe(false);
    if (conflicting.success) throw new Error("Expected conflicting reviewer source ids to fail");
    expect(conflicting.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "sourceWorkProductId",
    ]);
  });

  it("rejects incomplete or non-canonical structured output metadata", () => {
    const parsed = structuredOutputWorkProductMetadataSchema.safeParse({
      contractVersion: "crm-outreach-result.v1",
      runKey: "outreach-generator:SYSA-2011:attempt-1",
      sourceSnapshotHash: "sha256:source",
      result: undefined,
      resultHash: "sha256:result",
      extra: "not part of the contract",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("Expected invalid structured output metadata");
    }
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "result",
      "",
    ]);
  });
});
