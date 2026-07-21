import assert from "node:assert/strict";

import { buildApp } from "../dist/app.js";
import { createDatabase } from "../dist/db/database.js";

const app = buildApp({ database: createDatabase(":memory:") });

try {
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), {
    status: "ok",
    version: "0.2.0",
    database: "ok",
    timestamp: health.json().timestamp,
  });
  assert.match(health.headers["content-security-policy"] ?? "", /default-src 'none'/);

  const guest = await app.inject({
    method: "POST",
    url: "/auth/guest",
    payload: { timezone: "UTC" },
  });
  assert.equal(guest.statusCode, 201);
  const guestToken = guest.json().guestToken;
  assert.equal(typeof guestToken, "string");
  assert.ok(guestToken.length > 0);

  const today = await app.inject({
    method: "GET",
    url: "/study/today",
    headers: { "x-guest-token": guestToken },
  });
  assert.equal(today.statusCode, 200);
  assert.equal(today.json().session.total, 5);
  assert.equal(today.json().items.length, 5);
  assert.equal(today.headers["cache-control"], "private, no-store");
} finally {
  await app.close();
}
