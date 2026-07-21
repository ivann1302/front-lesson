type BaseBotConfig = {
  token: string;
  apiUrl: string;
  appUrl: string;
  internalSecret: string;
};

type PollingBotConfig = BaseBotConfig & {
  mode: "polling";
};

export type WebhookBotConfig = BaseBotConfig & {
  mode: "webhook";
  webhookUrl: string;
  webhookPath: string;
  webhookSecret: string;
  webhookHost: string;
  webhookPort: number;
};

export type BotConfig = PollingBotConfig | WebhookBotConfig;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validHttpUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
}

function readMode(env: NodeJS.ProcessEnv): BotConfig["mode"] {
  const configuredMode = env.BOT_MODE?.trim().toLowerCase();
  const mode = configuredMode || (env.NODE_ENV === "production" ? "webhook" : "polling");
  if (mode !== "polling" && mode !== "webhook") {
    throw new Error("BOT_MODE must be either polling or webhook");
  }
  if (env.NODE_ENV === "production" && mode === "polling") {
    throw new Error("Polling is only allowed outside production");
  }
  return mode;
}

function readPort(env: NodeJS.ProcessEnv): number {
  const value = env.BOT_PORT?.trim() || "3001";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("BOT_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function readWebhookUrl(env: NodeJS.ProcessEnv): { url: string; path: string } {
  const value = required(env, "TELEGRAM_WEBHOOK_URL");
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname === "/"
    ) {
      throw new Error();
    }
    return { url: url.toString(), path: url.pathname };
  } catch {
    throw new Error(
      "TELEGRAM_WEBHOOK_URL must be an absolute HTTPS URL with a non-root path and no query or hash",
    );
  }
}

function readWebhookSecret(env: NodeJS.ProcessEnv): string {
  const secret = required(env, "TELEGRAM_WEBHOOK_SECRET");
  if (secret.length > 256 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must contain 1-256 characters: A-Z, a-z, 0-9, _ or -");
  }
  return secret;
}

export function readBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const internalSecret = required(env, "TELEGRAM_INTERNAL_SECRET");
  if (internalSecret.length < 32) {
    throw new Error("TELEGRAM_INTERNAL_SECRET must contain at least 32 characters");
  }

  const base = {
    token: required(env, "TELEGRAM_BOT_TOKEN"),
    apiUrl: validHttpUrl(required(env, "API_URL"), "API_URL"),
    appUrl: validHttpUrl(required(env, "APP_URL"), "APP_URL"),
    internalSecret,
  };
  const mode = readMode(env);
  if (mode === "polling") return { ...base, mode };

  const webhook = readWebhookUrl(env);
  return {
    ...base,
    mode,
    webhookUrl: webhook.url,
    webhookPath: webhook.path,
    webhookSecret: readWebhookSecret(env),
    webhookHost: env.BOT_HOST?.trim() || "0.0.0.0",
    webhookPort: readPort(env),
  };
}
