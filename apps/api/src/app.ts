import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { createDatabase, type DatabaseHandle } from "./db/database.js";
import { seedContent } from "./db/seed.js";
import { registerAnswerRoutes } from "./routes/answers.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBotRoutes } from "./routes/bot.js";
import { registerLearningRoutes } from "./routes/learning.js";
import { registerMockInterviewRoutes } from "./routes/mock-interviews.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerStudyRoutes } from "./routes/study.js";
import { registerTheoryRoutes } from "./routes/theory.js";
import { registerHttpProtection } from "./security/http-protection.js";

type BuildAppOptions = {
  logger?: boolean;
  trustProxy?: FastifyServerOptions["trustProxy"];
  database?: DatabaseHandle;
  databaseUrl?: string;
  telegramInternalSecret?: string;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
    genReqId: () => randomUUID(),
  });
  const database = options.database ?? createDatabase(options.databaseUrl);
  const telegramInternalSecret =
    options.telegramInternalSecret ?? process.env.TELEGRAM_INTERNAL_SECRET;

  app.addHook("onReady", async () => {
    await database.ready;
    await seedContent(database.db);
  });
  app.addHook("onClose", async () => database.close());
  registerHttpProtection(app);

  app.setErrorHandler((error, request, reply) => {
    const details = error as { statusCode?: unknown; code?: unknown };
    const statusCode = typeof details.statusCode === "number" ? details.statusCode : 500;
    const errorCode = typeof details.code === "string" ? details.code : undefined;
    if (statusCode >= 500) {
      request.log.error(
        {
          err: error,
          requestId: request.id,
          method: request.method,
          route: request.routeOptions.url,
        },
        "Request failed",
      );
      const databaseBusy = errorCode === "SQLITE_BUSY" || errorCode === "SQLITE_BUSY_TIMEOUT";
      if (databaseBusy) reply.header("retry-after", "1");
      return reply
        .code(databaseBusy ? 503 : 500)
        .send({ error: databaseBusy ? "DATABASE_BUSY" : "INTERNAL_SERVER_ERROR" });
    }

    return reply.code(statusCode).send({ error: errorCode || "BAD_REQUEST" });
  });

  app.get("/health", async (_request, reply) => {
    try {
      await database.client.execute("SELECT 1");
      return {
        status: "ok" as const,
        version: "0.2.0",
        database: "ok" as const,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return reply.code(503).send({
        status: "error",
        version: "0.2.0",
        database: "error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  registerAuthRoutes(app, database.db, telegramInternalSecret);
  registerBotRoutes(app, database.db, telegramInternalSecret);
  registerLearningRoutes(app, database.db);
  registerMockInterviewRoutes(app, database.db);
  registerStudyRoutes(app, database.db);
  registerAnswerRoutes(app, database.db);
  registerSettingsRoutes(app, database.db);
  registerStatsRoutes(app, database.db);
  registerTheoryRoutes(app, database.db);

  return app;
}
