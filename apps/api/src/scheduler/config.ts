export type SchedulerConfig = {
  token: string;
  appUrl: string;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function appUrl(env: NodeJS.ProcessEnv): string {
  const value = required(env, "APP_URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("APP_URL must be an absolute HTTP(S) URL");
  }
}

export function readSchedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  return {
    token: required(env, "TELEGRAM_BOT_TOKEN"),
    appUrl: appUrl(env),
  };
}
