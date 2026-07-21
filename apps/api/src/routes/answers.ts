import { submitAnswerRequestSchema } from "@mentor/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { AppDatabase } from "../db/database.js";
import { authIdentities } from "../db/schema.js";
import { submitAnswerForUser } from "../services/answer.js";

function getHeaderToken(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function registerAnswerRoutes(app: FastifyInstance, db: AppDatabase) {
  app.post("/answers", async (request, reply) => {
    const guestToken = getHeaderToken(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const [identity] = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)),
      )
      .limit(1);
    if (!identity) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const parsed = submitAnswerRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const result = await submitAnswerForUser(db, identity.userId, parsed.data);
    if ("error" in result) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.response);
  });
}
