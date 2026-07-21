import { contentItems as catalogItems } from "@mentor/content";

import type { AppDatabase } from "./database.js";
import { contentItems } from "./schema.js";

export async function seedContent(db: AppDatabase): Promise<number> {
  const now = new Date();

  await db.transaction(async (transaction) => {
    for (const [ordinal, item] of catalogItems.entries()) {
      await transaction
        .insert(contentItems)
        .values({
          id: item.id,
          version: item.version,
          ordinal,
          type: item.type,
          topic: item.topic,
          difficulty: item.difficulty,
          payload: item,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: contentItems.id,
          set: {
            version: item.version,
            ordinal,
            type: item.type,
            topic: item.topic,
            difficulty: item.difficulty,
            payload: item,
            updatedAt: now,
          },
        })
        .run();
    }
  });

  return catalogItems.length;
}
