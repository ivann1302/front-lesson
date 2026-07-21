import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";

type RateLimitRule = {
  id: string;
  method: string;
  path: string | RegExp;
  limit: number;
  windowMs: number;
  identity: (request: FastifyRequest) => string;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestPath(request: FastifyRequest): string {
  return request.url.split("?", 1)[0] ?? request.url;
}

const guestIdentity = (request: FastifyRequest) =>
  opaqueIdentity(
    firstHeader(request.headers["x-guest-token"]) ? "guest" : "ip",
    firstHeader(request.headers["x-guest-token"]) ?? request.ip,
  );

function opaqueIdentity(kind: "guest" | "ip", value: string): string {
  return `${kind}:${createHash("sha256").update(value).digest("hex")}`;
}

function matches(rule: RateLimitRule, request: FastifyRequest, path: string): boolean {
  return (
    rule.method === request.method &&
    (typeof rule.path === "string" ? rule.path === path : rule.path.test(path))
  );
}

const rateLimitRules: RateLimitRule[] = [
  {
    id: "guest-bootstrap",
    method: "POST",
    path: "/auth/guest",
    limit: 30,
    windowMs: 60_000,
    identity: (request) => opaqueIdentity("ip", request.ip),
  },
  {
    id: "telegram-code",
    method: "POST",
    path: "/auth/telegram-code",
    limit: 10,
    windowMs: 10 * 60_000,
    identity: guestIdentity,
  },
  {
    id: "practice-create",
    method: "POST",
    path: "/study/practice",
    limit: 30,
    windowMs: 60_000,
    identity: guestIdentity,
  },
  {
    id: "interview-create",
    method: "POST",
    path: "/mock-interviews/sessions",
    limit: 30,
    windowMs: 60_000,
    identity: guestIdentity,
  },
  {
    id: "interview-practice",
    method: "POST",
    path: /^\/mock-interviews\/sessions\/[^/]+\/practice$/,
    limit: 30,
    windowMs: 60_000,
    identity: guestIdentity,
  },
  {
    id: "answers",
    method: "POST",
    path: "/answers",
    limit: 120,
    windowMs: 60_000,
    identity: guestIdentity,
  },
  {
    id: "settings",
    method: "PUT",
    path: "/settings",
    limit: 30,
    windowMs: 60_000,
    identity: guestIdentity,
  },
  {
    id: "theory-state",
    method: "PUT",
    path: /^\/theory\/[^/]+\/state$/,
    limit: 60,
    windowMs: 60_000,
    identity: guestIdentity,
  },
  {
    id: "interview-actions",
    method: "POST",
    path: /^\/mock-interviews\/sessions\/[^/]+\/(reveal|next|complete)$/,
    limit: 120,
    windowMs: 60_000,
    identity: guestIdentity,
  },
];

export function registerHttpProtection(app: FastifyInstance): void {
  const buckets = new Map<string, RateBucket>();

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    const path = requestPath(request);
    const rule = rateLimitRules.find((candidate) => matches(candidate, request, path));
    if (!rule) return;

    const now = Date.now();
    const key = `${rule.id}:${rule.identity(request)}`;
    const existing = buckets.get(key);
    const bucket =
      !existing || existing.resetAt <= now ? { count: 0, resetAt: now + rule.windowMs } : existing;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    reply.header("x-ratelimit-limit", String(rule.limit));
    reply.header("x-ratelimit-remaining", String(Math.max(0, rule.limit - bucket.count)));
    reply.header("x-ratelimit-reset", String(Math.ceil(bucket.resetAt / 1_000)));

    if (bucket.count > rule.limit) {
      reply.header("retry-after", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000))));
      return reply.code(429).send({ error: "RATE_LIMITED" });
    }
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    reply.header("cross-origin-resource-policy", "same-origin");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    if (requestPath(request) !== "/health") {
      reply.header("cache-control", "private, no-store");
    }
  });
}
