import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import {
  errorHandler,
  formatZodFieldErrors,
} from "../middleware/error-handler.js";
import { unprocessable } from "../errors.js";

describe("field-level request validation errors", () => {
  it("maps nested Zod paths to stable field errors", () => {
    const result = z.object({
      provider: z.string().min(1),
      metadata: z.object({ reviewer: z.string() }),
    }).safeParse({ provider: "", metadata: {} });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(formatZodFieldErrors(result.error)).toEqual([
      {
        field: "provider",
        path: ["provider"],
        code: "too_small",
        message: "String must contain at least 1 character(s)",
      },
      {
        field: "metadata.reviewer",
        path: ["metadata", "reviewer"],
        code: "invalid_type",
        message: "Required",
      },
    ]);
  });

  it("returns fieldErrors for structured-output HttpErrors while preserving details", () => {
    const issueDetails = [
      {
        code: "invalid_type",
        path: ["metadata", "reviewer"],
        message: "Required",
      },
    ];
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { status } as unknown as Response;

    errorHandler(
      unprocessable("Invalid structured output metadata", {
        code: "invalid_structured_output_metadata",
        details: issueDetails,
      }),
      {} as Request,
      response,
      vi.fn() as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: "invalid_structured_output_metadata",
      fieldErrors: [{
        field: "metadata.reviewer",
        path: ["metadata", "reviewer"],
        code: "invalid_type",
        message: "Required",
      }],
      details: {
        code: "invalid_structured_output_metadata",
        details: issueDetails,
      },
    }));
  });

  it("returns fieldErrors while preserving legacy details", () => {
    const result = z.object({ provider: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { status } as unknown as Response;

    errorHandler(result.error, {} as Request, response, vi.fn() as NextFunction);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: "request_validation_failed",
      fieldErrors: [expect.objectContaining({ field: "provider" })],
      details: result.error.errors,
    }));
  });
});
