import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@libsql/client/sqlite3";

const backupPattern = /^mentor-\d{4}-\d{2}-\d{2}T.*\.db$/;

function localDatabasePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") {
    throw new Error("Cannot back up an in-memory database");
  }
  if (!databaseUrl.startsWith("file:") && /^[a-z][a-z\d+.-]*:/i.test(databaseUrl)) {
    throw new Error("Only local SQLite databases can be backed up");
  }
  const filename = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
  return resolve(filename);
}

function sqliteUrl(filename: string): string {
  return `file:${filename}`;
}

function firstColumn(row: Record<string, unknown> | undefined): unknown {
  return row ? Object.values(row)[0] : undefined;
}

export async function verifyDatabase(databaseUrl: string): Promise<void> {
  const filename = localDatabasePath(databaseUrl);
  await access(filename);
  const client = createClient({ url: sqliteUrl(filename) });
  try {
    const integrity = await client.execute("PRAGMA integrity_check");
    if (firstColumn(integrity.rows[0]) !== "ok") {
      throw new Error("SQLite integrity_check failed");
    }
    const foreignKeys = await client.execute("PRAGMA foreign_key_check");
    if (foreignKeys.rows.length) {
      throw new Error("SQLite foreign_key_check failed");
    }
  } finally {
    client.close();
  }
}

export type BackupResult = {
  filename: string;
  removed: string[];
};

export async function backupDatabase(options: {
  databaseUrl: string;
  backupDirectory: string;
  keep: number;
  now?: Date;
}): Promise<BackupResult> {
  if (!Number.isInteger(options.keep) || options.keep < 1) {
    throw new Error("Backup retention must be a positive integer");
  }
  const source = localDatabasePath(options.databaseUrl);
  await access(source);
  const backupDirectory = resolve(options.backupDirectory);
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const timestamp = (options.now ?? new Date()).toISOString().replaceAll(":", "-");
  const filename = resolve(backupDirectory, `mentor-${timestamp}-${randomUUID().slice(0, 8)}.db`);
  const client = createClient({ url: sqliteUrl(source) });

  try {
    await client.execute("PRAGMA busy_timeout = 5000");
    await client.execute("PRAGMA wal_checkpoint(PASSIVE)");
    await client.execute({ sql: "VACUUM INTO ?", args: [filename] });
    await chmod(filename, 0o600);
  } finally {
    client.close();
  }

  try {
    await verifyDatabase(filename);
  } catch (error) {
    await rm(filename, { force: true });
    throw error;
  }

  const backups = (await readdir(backupDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && backupPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  const removed = backups.slice(options.keep);
  await Promise.all(removed.map((entry) => rm(resolve(backupDirectory, entry), { force: true })));

  return { filename, removed };
}
