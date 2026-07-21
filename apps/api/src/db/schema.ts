import type { ContentItem } from "@mentor/shared";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  timezone: text("timezone").notNull(),
  status: text("status", { enum: ["active", "paused", "deleted"] }).notNull(),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["guest", "telegram"] }).notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_provider_user_unique").on(table.provider, table.providerUserId),
    index("auth_user_idx").on(table.userId),
  ],
);

export const telegramLinkCodes = sqliteTable(
  "telegram_link_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("telegram_link_code_user_idx").on(table.userId)],
);

export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    ordinal: integer("ordinal").notNull(),
    type: text("type").notNull(),
    topic: text("topic").notNull(),
    difficulty: text("difficulty").notNull(),
    payload: text("payload", { mode: "json" }).$type<ContentItem>().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("content_topic_ordinal_idx").on(table.topic, table.ordinal)],
);

export const userContentState = sqliteTable(
  "user_content_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentId: text("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    intervalDays: integer("interval_days").notNull(),
    ease: real("ease").notNull(),
    streak: integer("streak").notNull(),
    lapses: integer("lapses").notNull(),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.contentId] }),
    index("user_content_due_idx").on(table.userId, table.dueAt),
  ],
);

export const userTheoryState = sqliteTable(
  "user_theory_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: text("article_id").notNull(),
    status: text("status", { enum: ["reading", "completed"] }).notNull(),
    bookmarked: integer("bookmarked", { mode: "boolean" }).notNull().default(false),
    lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.articleId] }),
    index("user_theory_bookmarked_idx").on(table.userId, table.bookmarked),
  ],
);

export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["daily", "mock"] }).notNull(),
    localDate: text("local_date").notNull(),
    status: text("status", { enum: ["pending", "active", "completed"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("daily_session_unique")
      .on(table.userId, table.localDate)
      .where(sql`${table.kind} = 'daily'`),
    index("session_user_idx").on(table.userId),
  ],
);

export const studySessionItems = sqliteTable(
  "study_session_items",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    contentId: text("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    status: text("status", { enum: ["pending", "answered", "skipped"] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.contentId] }),
    uniqueIndex("session_position_unique").on(table.sessionId, table.position),
  ],
);

export const mockInterviewSessions = sqliteTable(
  "mock_interview_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    setId: text("set_id").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    currentQuestionIndex: integer("current_question_index").notNull(),
    status: text("status", { enum: ["active", "completed"] }).notNull(),
    completionReason: text("completion_reason", {
      enum: ["finished", "timeout", "manual"],
    }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("mock_interview_user_status_idx").on(table.userId, table.status)],
);

export const mockInterviewQuestionAssessments = sqliteTable(
  "mock_interview_question_assessments",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => mockInterviewSessions.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    notes: text("notes").notNull().default(""),
    rating: text("rating", { enum: ["again", "hard", "good", "easy"] }),
    revealedAt: integer("revealed_at", { mode: "timestamp_ms" }).notNull(),
    assessedAt: integer("assessed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.questionId] }),
    index("mock_interview_assessment_session_idx").on(table.sessionId, table.rating),
  ],
);

export const answers = sqliteTable(
  "answers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    contentId: text("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "restrict" }),
    clientAnswerId: text("client_answer_id").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("answer_client_id_unique").on(table.clientAnswerId),
    uniqueIndex("answer_session_content_unique").on(table.sessionId, table.contentId),
    index("answer_user_content_idx").on(table.userId, table.contentId),
  ],
);

export const telegramQuizCallbacks = sqliteTable(
  "telegram_quiz_callbacks",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    contentId: text("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    clientAnswerId: text("client_answer_id").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("telegram_callback_answer_unique").on(table.clientAnswerId),
    index("telegram_callback_user_idx").on(table.userId),
  ],
);

export const notificationSettings = sqliteTable("notification_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["none", "telegram", "push"] }).notNull(),
  localTime: text("local_time").notNull(),
  timezone: text("timezone").notNull(),
  weekdays: text("weekdays", { mode: "json" }).$type<number[]>().notNull(),
  dailyLimit: integer("daily_limit").notNull(),
  pausedUntil: integer("paused_until", { mode: "timestamp_ms" }),
});

export const userTopicPreferences = sqliteTable(
  "user_topic_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.topic] })],
);

export const deliveryLog = sqliteTable(
  "delivery_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    notificationType: text("notification_type").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed", "skipped"] }).notNull(),
    attempts: integer("attempts").notNull(),
    errorCode: text("error_code"),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
    deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("delivery_idempotency_unique").on(
      table.userId,
      table.localDate,
      table.notificationType,
    ),
    index("delivery_retry_due_idx").on(table.status, table.nextAttemptAt),
  ],
);
