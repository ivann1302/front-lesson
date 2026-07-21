import { verifyDatabase } from "./backup.js";

const databaseUrl = process.argv[2] ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Pass a SQLite filename or set DATABASE_URL");
}

await verifyDatabase(databaseUrl);
process.stdout.write(`SQLite database verified: ${databaseUrl}\n`);
