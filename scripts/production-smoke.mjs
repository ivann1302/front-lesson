/* global AbortSignal, console, fetch, process, URL */

const baseUrl = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init) {
  const response = await fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method || "GET"} ${path}: ${response.status} ${body.slice(0, 200)}`);
  }
  return { response, body };
}

const webHealth = await request("/health");
expect(JSON.parse(webHealth.body).service === "web", "Web health payload is invalid");

const apiHealth = await request("/api/health");
const apiHealthBody = JSON.parse(apiHealth.body);
expect(apiHealthBody.status === "ok", "API is not healthy");
expect(apiHealthBody.database === "ok", "Database is not healthy");
expect(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    apiHealth.response.headers.get("x-request-id") || "",
  ),
  "API request ID is missing or invalid",
);

const page = await request("/");
expect(page.body.includes('<div id="root"></div>'), "Web application HTML is invalid");
expect(
  page.response.headers.get("content-security-policy")?.includes("default-src 'self'"),
  "Content-Security-Policy header is missing",
);

const guest = await request("/api/auth/guest", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ timezone: "UTC" }),
});
const guestBody = JSON.parse(guest.body);
expect(typeof guestBody.guestToken === "string", "Guest token was not created");

const learning = await request("/api/learning", {
  headers: { "x-guest-token": guestBody.guestToken },
});
const learningBody = JSON.parse(learning.body);
expect(learningBody.summary?.total === 60, "Knowledge base does not contain 60 materials");
expect(learningBody.items?.length === 60, "Learning catalog response is incomplete");

console.log(
  JSON.stringify({
    status: "ok",
    baseUrl: baseUrl.toString(),
    apiVersion: apiHealthBody.version,
    materials: learningBody.items.length,
  }),
);
