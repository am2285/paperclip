import type { Request, Response, NextFunction } from "express";
import type { Db } from "@paperclipai/db";
import { ZodError } from "zod";
import { HttpError } from "../errors.js";
import { trackErrorHandlerCrash } from "@paperclipai/shared/telemetry";
import { getTelemetryClient } from "../telemetry.js";
import { COMPANY_IMPORT_API_PATH } from "../routes/company-import-paths.js";
import { logger } from "./logger.js";
import {
  recordResponsibleUserDenialOnActiveRun,
} from "../services/responsible-user-denial-run-outcomes.js";

export interface ValidationFieldError {
  field: string;
  path: string[];
  code: string;
  message: string;
}

export interface ErrorContext {
  error: { message: string; stack?: string; name?: string; details?: unknown; raw?: unknown };
  method: string;
  url: string;
  reqBody?: unknown;
  reqParams?: unknown;
  reqQuery?: unknown;
}

function isRedactedSkillPolicyDenial(details: Record<string, unknown> | null) {
  return details?.code === "skill_policy_denied";
}

function attachErrorContext(
  req: Request,
  res: Response,
  payload: ErrorContext["error"],
  rawError?: Error,
) {
  (res as any).__errorContext = {
    error: payload,
    method: req.method,
    url: req.originalUrl,
    reqBody: req.body,
    reqParams: req.params,
    reqQuery: req.query,
  } satisfies ErrorContext;
  if (rawError) {
    (res as any).err = rawError;
  }
}

function getPaperclipDb(req: Request): Db | null {
  const locals = req.app?.locals as { paperclipDb?: Db; db?: Db } | undefined;
  return locals?.paperclipDb ?? locals?.db ?? null;
}

function recordResponsibleUserDenialFromHttpError(
  req: Request,
  details: Record<string, unknown> | null,
) {
  if (req.actor?.type !== "agent") return;
  const db = getPaperclipDb(req);
  if (!db) return;

  void recordResponsibleUserDenialOnActiveRun(db, {
    runId: req.actor.runId ?? null,
    agentId: req.actor.agentId ?? null,
    companyId: req.actor.companyId ?? null,
    code: details?.code,
  }).catch((recordErr) => {
    logger.warn(
      {
        err: recordErr,
        runId: req.actor?.runId ?? null,
        agentId: req.actor?.type === "agent" ? req.actor.agentId ?? null : null,
      },
      "failed to record responsible-user denial on heartbeat run",
    );
  });
}

export function formatValidationIssues(issues: unknown): ValidationFieldError[] {
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) return [];
    const candidate = issue as Record<string, unknown>;
    if (!Array.isArray(candidate.path) || typeof candidate.message !== "string") return [];
    const path = candidate.path.map(String);
    return [{
      field: path.length > 0 ? path.join(".") : "$",
      path,
      code: typeof candidate.code === "string" ? candidate.code : "invalid",
      message: candidate.message,
    }];
  });
}

export function formatZodFieldErrors(err: ZodError): ValidationFieldError[] {
  return formatValidationIssues(err.errors);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    const details = err.details && typeof err.details === "object" && !Array.isArray(err.details)
      ? err.details as Record<string, unknown>
      : null;
    const redactedSkillPolicyDenial = isRedactedSkillPolicyDenial(details);
    const fieldErrors = formatValidationIssues(details?.details);
    const structuredConnectionError = new Set([
      "user_authorization_required",
      "grant_revoked",
      "needs_reauthorization",
      "installation_required",
      "connection_not_installed",
      "subject_not_permitted",
    ]).has(typeof details?.code === "string" ? details.code : "");
    recordResponsibleUserDenialFromHttpError(req, details);
    if (err.status >= 500) {
      attachErrorContext(
        req,
        res,
        { message: err.message, stack: err.stack, name: err.name, details: err.details },
        err,
      );
      const tc = getTelemetryClient();
      if (tc) trackErrorHandlerCrash(tc, { errorCode: err.name });
    }
    res.status(err.status).json({
      error: err.message,
      ...(typeof details?.code === "string" ? { code: details.code } : {}),
      ...(redactedSkillPolicyDenial && typeof details?.reason === "string" ? { reason: details.reason } : {}),
      ...(typeof details?.remediation === "string" || (structuredConnectionError && details?.remediation && typeof details.remediation === "object")
        ? { remediation: details.remediation }
        : {}),
      ...(structuredConnectionError && details?.connection ? { connection: details.connection } : {}),
      ...(structuredConnectionError && details?.subject ? { subject: details.subject } : {}),
      ...(structuredConnectionError && typeof details?.grantId === "string" ? { grantId: details.grantId } : {}),
      ...(fieldErrors.length > 0 ? { fieldErrors } : {}),
      ...(!redactedSkillPolicyDenial && err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      code: "request_validation_failed",
      fieldErrors: formatZodFieldErrors(err),
      details: err.errors,
    });
    return;
  }

  const rootError = err instanceof Error ? err : new Error(String(err));
  attachErrorContext(
    req,
    res,
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name }
      : { message: String(err), raw: err, stack: rootError.stack, name: rootError.name },
    rootError,
  );

  const tc = getTelemetryClient();
  if (tc) trackErrorHandlerCrash(tc, { errorCode: rootError.name });

  res.status(500).json({
    error: "Internal server error",
    ...(shouldExposeTrustedCloudTenantImportError(req) ? { message: rootError.message } : {}),
  });
}

function shouldExposeTrustedCloudTenantImportError(req: Request) {
  return req.actor?.source === "cloud_tenant"
    && req.method === "POST"
    && req.originalUrl.split("?")[0] === COMPANY_IMPORT_API_PATH;
}
