import { backupDatabase } from "./backup.js";

const keep = Number(process.env.BACKUP_KEEP ?? 14);
const result = await backupDatabase({
  databaseUrl: process.env.DATABASE_URL ?? "./data/mentor.db",
  backupDirectory: process.env.BACKUP_DIR ?? "./backups",
  keep,
});

process.stdout.write(
  `SQLite backup verified: ${result.filename}${
    result.removed.length ? `; rotated ${result.removed.length} old backup(s)` : ""
  }\n`,
);
