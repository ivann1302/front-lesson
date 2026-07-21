import { createDatabase } from "./database.js";
import { seedContent } from "./seed.js";

const database = createDatabase();

try {
  await database.ready;
  const count = await seedContent(database.db);
  console.log(`✓ SQLite seed завершён: ${count} материалов`);
} finally {
  database.close();
}
