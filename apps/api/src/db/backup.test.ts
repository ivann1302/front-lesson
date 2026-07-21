import { copyFile, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { backupDatabase, verifyDatabase } from "./backup";
import { createDatabase } from "./database";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "frontend-mentor-backup-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("SQLite backup", () => {
  it("creates a consistent online backup that restores application data", async () => {
    const directory = await temporaryDirectory();
    const sourceFilename = join(directory, "source.db");
    const backupDirectory = join(directory, "backups");
    const source = createDatabase(sourceFilename);
    await source.ready;
    await source.client.execute({
      sql: `INSERT INTO users
        (id, timezone, status, created_at, onboarding_completed)
        VALUES (?, ?, ?, ?, ?)`,
      args: ["backup-user", "Europe/Moscow", "active", Date.now(), 1],
    });

    const backup = await backupDatabase({
      databaseUrl: sourceFilename,
      backupDirectory,
      keep: 14,
      now: new Date("2026-07-17T08:00:00.000Z"),
    });
    source.close();
    await verifyDatabase(backup.filename);
    expect((await stat(backup.filename)).mode & 0o777).toBe(0o600);

    const restoredFilename = join(directory, "restored.db");
    await copyFile(backup.filename, restoredFilename);
    const restored = createDatabase(restoredFilename);
    await restored.ready;
    const users = await restored.client.execute(
      "SELECT id, timezone FROM users WHERE id = 'backup-user'",
    );
    restored.close();

    expect(users.rows).toEqual([{ id: "backup-user", timezone: "Europe/Moscow" }]);
  });

  it("rotates only managed backups beyond the retention count", async () => {
    const directory = await temporaryDirectory();
    const sourceFilename = join(directory, "source.db");
    const backupDirectory = join(directory, "backups");
    const source = createDatabase(sourceFilename);
    await source.ready;

    for (const hour of [8, 9, 10]) {
      await backupDatabase({
        databaseUrl: sourceFilename,
        backupDirectory,
        keep: 2,
        now: new Date(`2026-07-17T${String(hour).padStart(2, "0")}:00:00.000Z`),
      });
    }
    source.close();
    const filenames = await readdir(backupDirectory);

    expect(filenames.filter((filename) => filename.endsWith(".db"))).toHaveLength(2);
    expect(filenames.some((filename) => filename.includes("T08-00-00"))).toBe(false);
  });

  it("rejects a corrupt file during restore verification", async () => {
    const directory = await temporaryDirectory();
    const corrupt = join(directory, "corrupt.db");
    await writeFile(corrupt, "not a sqlite database");

    await expect(verifyDatabase(corrupt)).rejects.toThrow();
  });
});
