import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client/sqlite3";
import { drizzle } from "drizzle-orm/libsql";

import { migrations } from "./migrations.js";

async function applyMigrations(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS _app_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  for (const migration of migrations) {
    const existing = await client.execute({
      sql: "SELECT 1 FROM _app_migrations WHERE id = ?",
      args: [migration.id],
    });
    if (existing.rows.length) continue;

    const escapedId = migration.id.replaceAll("'", "''");
    await client.executeMultiple(`
      BEGIN IMMEDIATE;
      ${migration.sql}
      INSERT INTO _app_migrations (id, applied_at) VALUES ('${escapedId}', ${Date.now()});
      COMMIT;
    `);
  }
}

function databaseUrl(filename: string): string {
  if (filename === ":memory:") return ":memory:";
  if (filename.startsWith("file:")) {
    mkdirSync(dirname(filename.slice("file:".length)), { recursive: true });
    return filename;
  }
  mkdirSync(dirname(filename), { recursive: true });
  return `file:${filename}`;
}

function createDrizzleClient(client: Client) {
  return drizzle(client);
}

export type AppDatabase = ReturnType<typeof createDrizzleClient>;

export type DatabaseHandle = {
  db: AppDatabase;
  client: Client;
  ready: Promise<void>;
  close: () => void;
};

export function createDatabase(
  filename = process.env.DATABASE_URL ?? "./data/mentor.db",
): DatabaseHandle {
  const isEphemeral = filename === ":memory:";
  const effectiveFilename = isEphemeral
    ? join(tmpdir(), `frontend-mentor-${randomUUID()}.db`)
    : filename;
  const client = createClient({ url: databaseUrl(effectiveFilename) });
  const ready = (async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    await client.execute("PRAGMA busy_timeout = 5000");
    await client.execute("PRAGMA journal_mode = WAL");
    await applyMigrations(client);
  })();

  return {
    db: createDrizzleClient(client),
    client,
    ready,
    close: () => {
      client.close();
      if (isEphemeral) {
        rmSync(effectiveFilename, { force: true });
        rmSync(`${effectiveFilename}-shm`, { force: true });
        rmSync(`${effectiveFilename}-wal`, { force: true });
      }
    },
  };
}
