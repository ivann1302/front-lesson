export type ApiConfig = {
  host: string;
  port: number;
  trustProxy: false | number;
  databaseUrl: string;
  telegramInternalSecret: string | undefined;
};

function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim() || String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function readApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === "production";
  const host = env.HOST?.trim() || "0.0.0.0";
  const port = integer(env, "PORT", 3000, 1, 65_535);
  const trustProxyHops = integer(env, "TRUST_PROXY_HOPS", 0, 0, 10);
  const configuredDatabaseUrl = env.DATABASE_URL?.trim();
  if (production && !configuredDatabaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }
  const databaseUrl = configuredDatabaseUrl || "./data/mentor.db";
  if (production && databaseUrl === ":memory:") {
    throw new Error("DATABASE_URL must be persistent in production");
  }

  const telegramInternalSecret = env.TELEGRAM_INTERNAL_SECRET?.trim() || undefined;
  if (production && !telegramInternalSecret) {
    throw new Error("TELEGRAM_INTERNAL_SECRET is required in production");
  }
  if (telegramInternalSecret && telegramInternalSecret.length < 32) {
    throw new Error("TELEGRAM_INTERNAL_SECRET must contain at least 32 characters");
  }

  return {
    host,
    port,
    trustProxy: trustProxyHops === 0 ? false : trustProxyHops,
    databaseUrl,
    telegramInternalSecret,
  };
}
