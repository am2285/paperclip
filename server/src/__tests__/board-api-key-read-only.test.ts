import { createHash, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  authUsers,
  boardApiKeys,
  companyMemberships,
  instanceUserRoles,
} from "@paperclipai/db";
import { actorMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";

function createDb(token: string, companyId: string) {
  const keyRow = {
    id: randomUUID(),
    userId: "user-1",
    name: "system8-monitor",
    accessMode: "read_only",
    keyHash: createHash("sha256").update(token).digest("hex"),
    lastUsedAt: null,
    revokedAt: null,
    expiresAt: null,
    createdAt: new Date(),
  };
  const rowsFor = (table: unknown) => {
    if (table === boardApiKeys) return [keyRow];
    if (table === authUsers) return [{ id: "user-1", name: "Founder", email: "founder@example.com" }];
    if (table === companyMemberships) {
      return [{ companyId, membershipRole: "owner", status: "active" }];
    }
    if (table === instanceUserRoles) return [];
    return [];
  };
  return {
    select: () => ({
      from(table: unknown) {
        return {
          where() {
            return Promise.resolve(rowsFor(table));
          },
        };
      },
    }),
    update: () => ({
      set() {
        return { where: () => Promise.resolve([]) };
      },
    }),
  } as any;
}

function createApp(db: any) {
  const app = express();
  app.use(express.json());
  app.use(actorMiddleware(db, {
    deploymentMode: "authenticated",
    resolveSession: async () => null,
  }));
  app.get("/read", (_req, res) => res.json({ ok: true }));
  app.post("/write", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("read-only board API keys", () => {
  it("allows reads and rejects mutations before route execution", async () => {
    const token = "pcp_board_read_only_test";
    const app = createApp(createDb(token, randomUUID()));

    const read = await request(app)
      .get("/read")
      .set("Authorization", `Bearer ${token}`);
    const write = await request(app)
      .post("/write")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({
      details: { code: "board_api_key_read_only" },
    });
  });
});
