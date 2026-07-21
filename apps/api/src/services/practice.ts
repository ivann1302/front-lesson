import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";

import { toPublicContentItem } from "../content/public-item.js";
import type { AppDatabase } from "../db/database.js";
import { contentItems, studySessionItems, studySessions } from "../db/schema.js";

function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function createPracticeSessionForUser(
  db: AppDatabase,
  input: { userId: string; timezone: string; contentIds: string[] },
  now = new Date(),
) {
  if (input.contentIds.length === 0) return null;
  const rows = await db
    .select({ id: contentItems.id, payload: contentItems.payload })
    .from(contentItems)
    .where(inArray(contentItems.id, input.contentIds));
  const foundById = new Map(rows.map((row) => [row.id, row.payload]));
  if (foundById.size !== input.contentIds.length) return null;

  const session = {
    id: randomUUID(),
    userId: input.userId,
    kind: "mock" as const,
    localDate: localDate(now, input.timezone),
    status: "pending" as const,
    createdAt: now,
    completedAt: null,
  };

  await db.transaction(async (transaction) => {
    await transaction.insert(studySessions).values(session).run();
    await transaction
      .insert(studySessionItems)
      .values(
        input.contentIds.map((contentId, position) => ({
          sessionId: session.id,
          contentId,
          position,
          status: "pending" as const,
        })),
      )
      .run();
  });

  return {
    session: {
      id: session.id,
      localDate: session.localDate,
      status: session.status,
      answered: 0,
      total: input.contentIds.length,
    },
    items: input.contentIds.map((contentId) => ({
      ...toPublicContentItem(foundById.get(contentId)!),
      status: "pending" as const,
    })),
  };
}
