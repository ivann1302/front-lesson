import Fastify, { type FastifyInstance } from "fastify";
import { webhookCallback, type Bot } from "grammy";

type WebhookServerOptions = {
  path: string;
  secretToken: string;
  logger?: boolean;
  timeoutMilliseconds?: number;
};

export function buildWebhookServer(bot: Bot, options: WebhookServerOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1_000_000,
  });
  const handleWebhook = webhookCallback(bot, "fastify", {
    secretToken: options.secretToken,
    onTimeout: "return",
    timeoutMilliseconds: options.timeoutMilliseconds ?? 1_000,
  });

  app.get("/health", async () => ({ status: "ok" as const, mode: "webhook" as const }));
  app.post(options.path, handleWebhook);

  return app;
}
