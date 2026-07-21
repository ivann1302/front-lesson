export const migrations = [
  {
    id: "0001_initial",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE auth_identities (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX auth_provider_user_unique ON auth_identities(provider, provider_user_id);
      CREATE INDEX auth_user_idx ON auth_identities(user_id);

      CREATE TABLE content_items (
        id TEXT PRIMARY KEY NOT NULL,
        version INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        type TEXT NOT NULL,
        topic TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX content_topic_ordinal_idx ON content_items(topic, ordinal);

      CREATE TABLE user_content_state (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        due_at INTEGER,
        interval_days INTEGER NOT NULL,
        ease REAL NOT NULL,
        streak INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        last_reviewed_at INTEGER,
        PRIMARY KEY(user_id, content_id)
      );
      CREATE INDEX user_content_due_idx ON user_content_state(user_id, due_at);

      CREATE TABLE study_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE UNIQUE INDEX daily_session_unique ON study_sessions(user_id, local_date, kind);
      CREATE INDEX session_user_idx ON study_sessions(user_id);

      CREATE TABLE study_session_items (
        session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
        content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY(session_id, content_id)
      );
      CREATE UNIQUE INDEX session_position_unique ON study_session_items(session_id, position);

      CREATE TABLE answers (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
        content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
        client_answer_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        is_correct INTEGER,
        latency_ms INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX answer_client_id_unique ON answers(client_answer_id);
      CREATE INDEX answer_user_content_idx ON answers(user_id, content_id);

      CREATE TABLE notification_settings (
        user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        local_time TEXT NOT NULL,
        timezone TEXT NOT NULL,
        weekdays TEXT NOT NULL,
        daily_limit INTEGER NOT NULL,
        paused_until INTEGER
      );

      CREATE TABLE delivery_log (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        error_code TEXT,
        delivered_at INTEGER
      );
      CREATE UNIQUE INDEX delivery_idempotency_unique
        ON delivery_log(user_id, local_date, notification_type);
    `,
  },
  {
    id: "0002_one_answer_per_session_item",
    sql: `
      CREATE UNIQUE INDEX answer_session_content_unique ON answers(session_id, content_id);
    `,
  },
  {
    id: "0003_onboarding_and_topics",
    sql: `
      ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE user_topic_preferences (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        PRIMARY KEY(user_id, topic)
      );
    `,
  },
  {
    id: "0004_multiple_practice_sessions",
    sql: `
      DROP INDEX daily_session_unique;
      CREATE UNIQUE INDEX daily_session_unique
        ON study_sessions(user_id, local_date)
        WHERE kind = 'daily';
    `,
  },
  {
    id: "0005_telegram_link_codes",
    sql: `
      CREATE TABLE telegram_link_codes (
        code_hash TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX telegram_link_code_user_idx ON telegram_link_codes(user_id);
      CREATE UNIQUE INDEX telegram_identity_user_unique
        ON auth_identities(user_id)
        WHERE provider = 'telegram';
    `,
  },
  {
    id: "0006_telegram_quiz_callbacks",
    sql: `
      CREATE TABLE telegram_quiz_callbacks (
        token TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
        content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        option_id TEXT NOT NULL,
        client_answer_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE UNIQUE INDEX telegram_callback_answer_unique
        ON telegram_quiz_callbacks(client_answer_id);
      CREATE INDEX telegram_callback_user_idx
        ON telegram_quiz_callbacks(user_id);
    `,
  },
  {
    id: "0007_delivery_retry",
    sql: `
      ALTER TABLE delivery_log ADD COLUMN next_attempt_at INTEGER;
      ALTER TABLE delivery_log ADD COLUMN last_attempt_at INTEGER;
      UPDATE delivery_log SET next_attempt_at = 0 WHERE status = 'pending';
      CREATE INDEX delivery_retry_due_idx
        ON delivery_log(status, next_attempt_at);
    `,
  },
  {
    id: "0008_mock_interview_sessions",
    sql: `
      CREATE TABLE mock_interview_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        set_id TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        current_question_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        completion_reason TEXT,
        started_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX mock_interview_user_status_idx
        ON mock_interview_sessions(user_id, status);
    `,
  },
  {
    id: "0009_user_theory_state",
    sql: `
      CREATE TABLE user_theory_state (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        article_id TEXT NOT NULL,
        status TEXT NOT NULL,
        bookmarked INTEGER NOT NULL DEFAULT 0,
        last_opened_at INTEGER NOT NULL,
        completed_at INTEGER,
        PRIMARY KEY(user_id, article_id)
      );
      CREATE INDEX user_theory_bookmarked_idx
        ON user_theory_state(user_id, bookmarked);
    `,
  },
  {
    id: "0010_mock_interview_assessments",
    sql: `
      CREATE TABLE mock_interview_question_assessments (
        session_id TEXT NOT NULL REFERENCES mock_interview_sessions(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        rating TEXT,
        revealed_at INTEGER NOT NULL,
        assessed_at INTEGER,
        PRIMARY KEY(session_id, question_id)
      );
      CREATE INDEX mock_interview_assessment_session_idx
        ON mock_interview_question_assessments(session_id, rating);
    `,
  },
] as const;
