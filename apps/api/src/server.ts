import { buildApp } from "./app.js";
import { readApiConfig } from "./config.js";

const config = readApiConfig();
const app = buildApp({
  logger: true,
  trustProxy: config.trustProxy,
  databaseUrl: config.databaseUrl,
  ...(config.telegramInternalSecret
    ? { telegramInternalSecret: config.telegramInternalSecret }
    : {}),
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
