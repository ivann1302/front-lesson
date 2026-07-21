import { z } from "zod";

export const topicSchema = z.enum(["javascript", "typescript", "react", "browser", "node", "css"]);
export const difficultySchema = z.enum(["junior", "middle", "senior"]);
export const contentTypeSchema = z.enum([
  "term",
  "flashcard",
  "single_choice",
  "multiple_choice",
  "code_output",
  "find_bug",
  "interview_question",
]);
export const codeLanguageSchema = z.enum([
  "javascript",
  "typescript",
  "tsx",
  "html",
  "css",
  "json",
]);
export const contentIdSchema = z
  .string()
  .regex(
    /^(js|ts|react|browser|node|css)-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/,
    "id должен иметь вид topic-readable-slug-001",
  );

export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);

export const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Нужна корректная IANA timezone");

export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время должно иметь формат HH:mm");

const selectedTopicsSchema = z
  .array(topicSchema)
  .min(1, "Выберите хотя бы одну тему")
  .max(topicSchema.options.length)
  .refine((topics) => new Set(topics).size === topics.length, "Темы не должны повторяться");

const settingsShape = {
  topics: selectedTopicsSchema,
  dailyLimit: z.number().int().min(1).max(5),
  localTime: localTimeSchema,
  timezone: timezoneSchema,
};

export const updateSettingsRequestSchema = z.object(settingsShape).strict();
export const userSettingsSchema = z.object({
  onboardingCompleted: z.boolean(),
  ...settingsShape,
});

export const telegramLinkCodeSchema = z
  .string()
  .length(8)
  .regex(/^[A-HJ-NP-Z2-9]+$/, "Некорректный код привязки Telegram");

export const telegramUserIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/, "Некорректный Telegram user id");

export const telegramLinkCodeResponseSchema = z.object({
  code: telegramLinkCodeSchema,
  expiresAt: z.string().datetime(),
});

export const telegramLinkRequestSchema = z
  .object({
    code: telegramLinkCodeSchema,
    telegramUserId: telegramUserIdSchema,
  })
  .strict();

export const telegramLinkResponseSchema = z.object({
  linked: z.literal(true),
  userId: z.string().uuid(),
  telegramUserId: telegramUserIdSchema,
});

export const botTodayRequestSchema = z
  .object({
    telegramUserId: telegramUserIdSchema,
  })
  .strict();

export const telegramAnswerCallbackSchema = z
  .string()
  .regex(/^answer:[A-Za-z0-9_-]{12}$/, "Некорректный Telegram callback");

export const botTodayResponseSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["pending", "active", "completed"]),
    answered: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  nextItem: z
    .object({
      id: contentIdSchema,
      type: contentTypeSchema,
      topic: topicSchema,
      prompt: z.string(),
      estimatedSeconds: z.number().int().positive(),
      options: z
        .array(
          z.object({
            text: z.string(),
            callbackData: telegramAnswerCallbackSchema,
          }),
        )
        .optional(),
    })
    .nullable(),
});

export const botAnswerRequestSchema = z
  .object({
    telegramUserId: telegramUserIdSchema,
    callbackData: telegramAnswerCallbackSchema,
  })
  .strict();

export const botAnswerResponseSchema = z.object({
  answer: z.object({
    isCorrect: z.boolean(),
  }),
  feedback: z.object({
    explanation: z.string(),
  }),
  session: z.object({
    status: z.enum(["active", "completed"]),
    answered: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const botSettingsRequestSchema = z
  .object({
    telegramUserId: telegramUserIdSchema,
  })
  .strict();

export const botPauseActionSchema = z.enum(["day", "week", "resume"]);

export const botPauseRequestSchema = z
  .object({
    telegramUserId: telegramUserIdSchema,
    action: botPauseActionSchema,
  })
  .strict();

export const botSettingsResponseSchema = z.object({
  topics: z.array(topicSchema),
  dailyLimit: z.number().int().min(1).max(5),
  localTime: localTimeSchema,
  timezone: timezoneSchema,
  weekdays: z.array(z.number().int().min(1).max(7)),
  channel: z.enum(["none", "telegram", "push"]),
  pausedUntil: z.string().datetime().nullable(),
});

const nullablePercentSchema = z.number().min(0).max(100).nullable();

export const statsResponseSchema = z.object({
  summary: z.object({
    totalAnswers: z.number().int().nonnegative(),
    objectiveAnswers: z.number().int().nonnegative(),
    correctAnswers: z.number().int().nonnegative(),
    accuracy: nullablePercentSchema,
    completedSessions: z.number().int().nonnegative(),
    currentStreak: z.number().int().nonnegative(),
    dueReviews: z.number().int().nonnegative(),
    nextReviewAt: z.string().datetime().nullable(),
  }),
  topics: z.array(
    z.object({
      topic: topicSchema,
      attempts: z.number().int().nonnegative(),
      objectiveAttempts: z.number().int().nonnegative(),
      correctAnswers: z.number().int().nonnegative(),
      accuracy: nullablePercentSchema,
      dueReviews: z.number().int().nonnegative(),
      averageLatencyMs: z.number().int().nonnegative().nullable(),
    }),
  ),
  activity: z.array(
    z.object({
      localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      answers: z.number().int().nonnegative(),
      completed: z.boolean(),
    }),
  ),
});

export const learningProgressStatusSchema = z.enum(["new", "learning", "due", "mastered"]);

export const learningCatalogItemSchema = z.object({
  id: contentIdSchema,
  topic: topicSchema,
  subtopic: z.string(),
  difficulty: difficultySchema,
  type: contentTypeSchema,
  tags: z.array(z.string()),
  prompt: z.string(),
  estimatedSeconds: z.number().int().positive(),
  progressStatus: learningProgressStatusSchema,
  streak: z.number().int().nonnegative(),
  lastReviewedAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
});

export const learningCatalogResponseSchema = z.object({
  summary: z.object({
    total: z.number().int().nonnegative(),
    seen: z.number().int().nonnegative(),
    mastered: z.number().int().nonnegative(),
    due: z.number().int().nonnegative(),
  }),
  topics: z.array(
    z.object({
      topic: topicSchema,
      total: z.number().int().nonnegative(),
      seen: z.number().int().nonnegative(),
      mastered: z.number().int().nonnegative(),
      due: z.number().int().nonnegative(),
      estimatedMinutes: z.number().int().nonnegative(),
    }),
  ),
  items: z.array(learningCatalogItemSchema),
});

export const createPracticeSessionRequestSchema = z
  .object({
    contentIds: z
      .array(contentIdSchema)
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length, "Материалы не должны повторяться"),
  })
  .strict();

export const mockInterviewTrackSchema = z.enum([
  "frontend_core",
  "react",
  "javascript_deep_dive",
  "browser",
  "node_basics",
  "react_native",
]);

export const mockInterviewQuestionIdSchema = z
  .string()
  .regex(
    /^miq-(core|react|js|browser|node|rn)-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/,
    "Некорректный id вопроса mock-интервью",
  );

export const mockInterviewSetIdSchema = z
  .string()
  .regex(
    /^mock-(frontend-core|react|javascript-deep-dive|browser|node-basics|react-native)$/,
    "Некорректный id набора mock-интервью",
  );

export const mockInterviewQuestionSchema = z
  .object({
    id: mockInterviewQuestionIdSchema,
    track: mockInterviewTrackSchema,
    prompt: z.string().trim().min(24).max(2_000),
    tags: z.array(z.string().trim().min(2).max(40)).min(1).max(10),
    estimatedSeconds: z.number().int().min(120).max(900),
    referencePoints: z.array(z.string().trim().min(12).max(500)).min(3).max(10),
    relatedContentIds: z.array(contentIdSchema).min(1).max(8),
  })
  .strict()
  .superRefine((question, context) => {
    if (new Set(question.tags).size !== question.tags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tags"],
        message: "Теги вопроса не должны повторяться",
      });
    }
    if (new Set(question.referencePoints).size !== question.referencePoints.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referencePoints"],
        message: "Эталонные тезисы не должны повторяться",
      });
    }
    if (new Set(question.relatedContentIds).size !== question.relatedContentIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relatedContentIds"],
        message: "Связанные материалы не должны повторяться",
      });
    }
  });

export const mockInterviewSetSchema = z
  .object({
    id: mockInterviewSetIdSchema,
    version: z.number().int().positive(),
    track: mockInterviewTrackSchema,
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().min(24).max(500),
    recommendedDurationMinutes: z.number().int().min(15).max(90),
    questionIds: z.array(mockInterviewQuestionIdSchema).min(5).max(12),
  })
  .strict()
  .superRefine((set, context) => {
    if (new Set(set.questionIds).size !== set.questionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionIds"],
        message: "Вопросы набора не должны повторяться",
      });
    }
  });

export const mockInterviewCatalogSchema = z
  .object({
    questions: z.array(mockInterviewQuestionSchema).min(1),
    sets: z.array(mockInterviewSetSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    const questionIds = new Set<string>();
    const setIds = new Set<string>();
    const tracks = new Set<string>();
    const usedQuestionIds = new Set(catalog.sets.flatMap((set) => set.questionIds));

    catalog.questions.forEach((question, index) => {
      if (questionIds.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "id"],
          message: `Дублирующийся вопрос ${question.id}`,
        });
      }
      questionIds.add(question.id);
      if (!usedQuestionIds.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "id"],
          message: `Вопрос ${question.id} не входит ни в один набор`,
        });
      }
    });

    catalog.sets.forEach((set, setIndex) => {
      if (setIds.has(set.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sets", setIndex, "id"],
          message: `Дублирующийся набор ${set.id}`,
        });
      }
      setIds.add(set.id);
      if (tracks.has(set.track)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sets", setIndex, "track"],
          message: `Дублирующийся track ${set.track}`,
        });
      }
      tracks.add(set.track);
      set.questionIds.forEach((questionId, questionIndex) => {
        if (!questionIds.has(questionId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sets", setIndex, "questionIds", questionIndex],
            message: `Не найден вопрос ${questionId}`,
          });
        }
      });
    });
  });

export const mockInterviewDurationSchema = z.union([z.literal(15), z.literal(30), z.literal(45)]);

export const mockInterviewCatalogResponseSchema = z.object({
  sets: z.array(
    z.object({
      id: mockInterviewSetIdSchema,
      track: mockInterviewTrackSchema,
      title: z.string(),
      description: z.string(),
      recommendedDurationMinutes: z.number().int(),
      questionCount: z.number().int().positive(),
    }),
  ),
});

export const startMockInterviewRequestSchema = z
  .object({
    setId: mockInterviewSetIdSchema,
    durationMinutes: mockInterviewDurationSchema,
  })
  .strict();

export const advanceMockInterviewRequestSchema = z
  .object({
    questionId: mockInterviewQuestionIdSchema,
    rating: reviewRatingSchema,
  })
  .strict();

export const revealMockInterviewRequestSchema = z
  .object({
    questionId: mockInterviewQuestionIdSchema,
    notes: z.string().trim().max(5_000),
  })
  .strict();

const publicMockInterviewQuestionSchema = z.object({
  id: mockInterviewQuestionIdSchema,
  prompt: z.string(),
  tags: z.array(z.string()),
  estimatedSeconds: z.number().int().positive(),
  position: z.number().int().positive(),
  total: z.number().int().positive(),
  notes: z.string(),
  revealed: z.boolean(),
  referencePoints: z.array(z.string()).optional(),
});

export const mockInterviewSessionResponseSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    setId: mockInterviewSetIdSchema,
    title: z.string(),
    status: z.enum(["active", "completed"]),
    completionReason: z.enum(["finished", "timeout", "manual"]).nullable(),
    durationMinutes: mockInterviewDurationSchema,
    currentQuestionIndex: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    assessedQuestions: z.number().int().nonnegative(),
    weakQuestions: z.number().int().nonnegative(),
    startedAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  }),
  question: publicMockInterviewQuestionSchema.nullable(),
});

export const mockInterviewHistoryItemSchema = z.object({
  id: z.string().uuid(),
  setId: mockInterviewSetIdSchema,
  title: z.string(),
  completionReason: z.enum(["finished", "timeout", "manual"]),
  durationMinutes: mockInterviewDurationSchema,
  total: z.number().int().positive(),
  assessedQuestions: z.number().int().nonnegative(),
  weakQuestions: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export const mockInterviewAnalyticsSchema = z.object({
  summary: z.object({
    sessions: z.number().int().nonnegative(),
    assessedQuestions: z.number().int().nonnegative(),
    weakQuestions: z.number().int().nonnegative(),
    confidencePercent: z.number().int().min(0).max(100).nullable(),
  }),
  trend: z.array(
    z.object({
      sessionId: z.string().uuid(),
      title: z.string(),
      completedAt: z.string().datetime(),
      assessedQuestions: z.number().int().nonnegative(),
      weakQuestions: z.number().int().nonnegative(),
      confidencePercent: z.number().int().min(0).max(100).nullable(),
    }),
  ),
  weakTopics: z.array(
    z.object({
      tag: z.string().min(1),
      count: z.number().int().positive(),
    }),
  ),
});

export const mockInterviewHistoryResponseSchema = z.object({
  sessions: z.array(mockInterviewHistoryItemSchema),
  analytics: mockInterviewAnalyticsSchema,
});

export const mockInterviewReportResponseSchema = z.object({
  session: mockInterviewHistoryItemSchema,
  questions: z.array(
    z.object({
      id: mockInterviewQuestionIdSchema,
      prompt: z.string(),
      tags: z.array(z.string()),
      position: z.number().int().positive(),
      notes: z.string(),
      rating: reviewRatingSchema.nullable(),
      scheduledForReview: z.boolean(),
      referencePoints: z.array(z.string()),
      assessedAt: z.string().datetime().nullable(),
    }),
  ),
});

export const answerSubmissionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("selection"),
      selectedOptionIds: z
        .array(z.string().regex(/^[a-z0-9-]+$/))
        .min(1)
        .max(8),
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      text: z.string().trim().min(1).max(5_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("self_assessment"),
      rating: reviewRatingSchema,
      text: z.string().trim().min(1).max(5_000).optional(),
    })
    .strict(),
]);

export const submitAnswerRequestSchema = z
  .object({
    clientAnswerId: z.string().uuid(),
    sessionId: z.string().uuid(),
    contentId: contentIdSchema,
    answer: answerSubmissionSchema,
    latencyMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.answer.kind !== "selection") return;
    if (
      new Set(request.answer.selectedOptionIds).size !== request.answer.selectedOptionIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer", "selectedOptionIds"],
        message: "Варианты ответа не должны повторяться",
      });
    }
  });

export type Topic = z.infer<typeof topicSchema>;
export type Difficulty = z.infer<typeof difficultySchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
export type CodeLanguage = z.infer<typeof codeLanguageSchema>;
export type ReviewRating = z.infer<typeof reviewRatingSchema>;
export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;
export type SubmitAnswerRequest = z.infer<typeof submitAnswerRequestSchema>;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
export type UserSettings = z.infer<typeof userSettingsSchema>;
export type TelegramLinkCodeResponse = z.infer<typeof telegramLinkCodeResponseSchema>;
export type TelegramLinkRequest = z.infer<typeof telegramLinkRequestSchema>;
export type TelegramLinkResponse = z.infer<typeof telegramLinkResponseSchema>;
export type BotTodayRequest = z.infer<typeof botTodayRequestSchema>;
export type BotTodayResponse = z.infer<typeof botTodayResponseSchema>;
export type BotAnswerRequest = z.infer<typeof botAnswerRequestSchema>;
export type BotAnswerResponse = z.infer<typeof botAnswerResponseSchema>;
export type BotSettingsRequest = z.infer<typeof botSettingsRequestSchema>;
export type BotPauseAction = z.infer<typeof botPauseActionSchema>;
export type BotPauseRequest = z.infer<typeof botPauseRequestSchema>;
export type BotSettingsResponse = z.infer<typeof botSettingsResponseSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type LearningProgressStatus = z.infer<typeof learningProgressStatusSchema>;
export type LearningCatalogItem = z.infer<typeof learningCatalogItemSchema>;
export type LearningCatalogResponse = z.infer<typeof learningCatalogResponseSchema>;
export type CreatePracticeSessionRequest = z.infer<typeof createPracticeSessionRequestSchema>;
export type MockInterviewTrack = z.infer<typeof mockInterviewTrackSchema>;
export type MockInterviewQuestion = z.infer<typeof mockInterviewQuestionSchema>;
export type MockInterviewSet = z.infer<typeof mockInterviewSetSchema>;
export type MockInterviewCatalog = z.infer<typeof mockInterviewCatalogSchema>;
export type MockInterviewDuration = z.infer<typeof mockInterviewDurationSchema>;
export type MockInterviewCatalogResponse = z.infer<typeof mockInterviewCatalogResponseSchema>;
export type StartMockInterviewRequest = z.infer<typeof startMockInterviewRequestSchema>;
export type AdvanceMockInterviewRequest = z.infer<typeof advanceMockInterviewRequestSchema>;
export type RevealMockInterviewRequest = z.infer<typeof revealMockInterviewRequestSchema>;
export type MockInterviewSessionResponse = z.infer<typeof mockInterviewSessionResponseSchema>;
export type MockInterviewHistoryItem = z.infer<typeof mockInterviewHistoryItemSchema>;
export type MockInterviewAnalytics = z.infer<typeof mockInterviewAnalyticsSchema>;
export type MockInterviewHistoryResponse = z.infer<typeof mockInterviewHistoryResponseSchema>;
export type MockInterviewReportResponse = z.infer<typeof mockInterviewReportResponseSchema>;

const commonShape = {
  id: contentIdSchema,
  version: z.number().int().positive(),
  topic: topicSchema,
  subtopic: z.string().trim().min(2).max(64),
  difficulty: difficultySchema,
  tags: z.array(z.string().trim().min(2).max(40)).min(1).max(10),
  prompt: z.string().trim().min(12).max(2_000),
  explanation: z.string().trim().min(24).max(5_000),
  estimatedSeconds: z.number().int().min(15).max(900),
  relatedIds: z.array(contentIdSchema).max(12).optional(),
};

export const choiceOptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  text: z.string().trim().min(1).max(500),
});

const termItemSchema = z.object({
  ...commonShape,
  type: z.literal("term"),
  term: z.string().trim().min(2).max(120),
  definition: z.string().trim().min(16).max(2_000),
});

const flashcardItemSchema = z.object({
  ...commonShape,
  type: z.literal("flashcard"),
  answer: z.string().trim().min(8).max(3_000),
});

const singleChoiceItemSchema = z.object({
  ...commonShape,
  type: z.literal("single_choice"),
  code: z.string().trim().min(1).max(5_000).optional(),
  language: codeLanguageSchema.optional(),
  options: z.array(choiceOptionSchema).min(2).max(6),
  correctOptionIds: z.array(z.string()).length(1),
});

const multipleChoiceItemSchema = z.object({
  ...commonShape,
  type: z.literal("multiple_choice"),
  code: z.string().trim().min(1).max(5_000).optional(),
  language: codeLanguageSchema.optional(),
  options: z.array(choiceOptionSchema).min(3).max(8),
  correctOptionIds: z.array(z.string()).min(2).max(7),
});

const codeOutputItemSchema = z.object({
  ...commonShape,
  type: z.literal("code_output"),
  code: z.string().trim().min(8).max(5_000),
  language: codeLanguageSchema,
  answer: z.string().trim().min(1).max(2_000),
});

const findBugItemSchema = z.object({
  ...commonShape,
  type: z.literal("find_bug"),
  code: z.string().trim().min(8).max(5_000),
  language: codeLanguageSchema,
  answer: z.string().trim().min(8).max(2_000),
  solution: z.string().trim().min(8).max(5_000),
});

const interviewQuestionItemSchema = z.object({
  ...commonShape,
  type: z.literal("interview_question"),
  rubric: z.array(z.string().trim().min(4).max(300)).min(3).max(8),
  referencePoints: z.array(z.string().trim().min(8).max(500)).min(2).max(12),
});

const rawContentItemSchema = z.discriminatedUnion("type", [
  termItemSchema,
  flashcardItemSchema,
  singleChoiceItemSchema,
  multipleChoiceItemSchema,
  codeOutputItemSchema,
  findBugItemSchema,
  interviewQuestionItemSchema,
]);

function hasBalancedCodeFences(value: string): boolean {
  return (value.match(/```/g)?.length ?? 0) % 2 === 0;
}

export const contentItemSchema = rawContentItemSchema.superRefine((item, context) => {
  if (new Set(item.tags).size !== item.tags.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tags"],
      message: "Теги не должны повторяться",
    });
  }

  if (!hasBalancedCodeFences(item.prompt) || !hasBalancedCodeFences(item.explanation)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["prompt"],
      message: "Markdown code fences должны быть парными",
    });
  }

  if ("options" in item) {
    const optionIds = item.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "id вариантов ответа не должны повторяться",
      });
    }

    for (const correctId of item.correctOptionIds) {
      if (!optionIds.includes(correctId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctOptionIds"],
          message: `Не найден правильный вариант ${correctId}`,
        });
      }
    }
  }

  if ("code" in item && item.code && !("language" in item && item.language)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["language"],
      message: "Для блока кода нужно указать language",
    });
  }
});

export const contentCollectionSchema = z
  .array(contentItemSchema)
  .min(1)
  .superRefine((items, context) => {
    const seenIds = new Set<string>();
    const allIds = new Set(items.map((item) => item.id));

    items.forEach((item, index) => {
      if (seenIds.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Дублирующийся id ${item.id}`,
        });
      }
      seenIds.add(item.id);

      item.relatedIds?.forEach((relatedId) => {
        if (relatedId === item.id || !allIds.has(relatedId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "relatedIds"],
            message: `Некорректная связь ${relatedId}`,
          });
        }
      });
    });
  });

export const theoryReferenceSchema = z
  .object({
    label: z.string().trim().min(3).max(160),
    url: z.string().url(),
    kind: z.enum(["topic-source", "primary"]),
  })
  .strict();

export const theoryExampleSchema = z
  .object({
    title: z.string().trim().min(4).max(160),
    language: codeLanguageSchema,
    code: z.string().trim().min(12).max(8_000),
    explanation: z.string().trim().min(24).max(2_000),
  })
  .strict();

export const theorySectionSchema = z
  .object({
    heading: z.string().trim().min(4).max(160),
    paragraphs: z.array(z.string().trim().min(40).max(2_000)).min(1).max(5),
    example: theoryExampleSchema.optional(),
  })
  .strict();

export const theoryArticleIdSchema = z
  .string()
  .regex(/^theory-(js|ts|react|browser|node|css)-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const theoryProgressStatusSchema = z.enum(["new", "reading", "completed"]);

export const updateTheoryStateRequestSchema = z
  .object({
    status: z.enum(["reading", "completed"]).optional(),
    bookmarked: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.bookmarked !== undefined, {
    message: "Theory state update must change status or bookmark",
  });

export const theoryUserStateSchema = z
  .object({
    articleId: theoryArticleIdSchema,
    status: theoryProgressStatusSchema,
    bookmarked: z.boolean(),
    lastOpenedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();

export const theoryArticleSchema = z
  .object({
    id: theoryArticleIdSchema,
    version: z.number().int().positive(),
    topic: topicSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(8).max(180),
    summary: z.string().trim().min(60).max(800),
    estimatedMinutes: z.number().int().min(2).max(30),
    relatedContentIds: z.array(contentIdSchema).min(1).max(10),
    sections: z.array(theorySectionSchema).min(2).max(10),
    keyPoints: z.array(z.string().trim().min(20).max(400)).min(3).max(10),
    sourceIds: z
      .array(z.string().regex(/^hackfrontend:[a-z0-9-/]+$/))
      .min(1)
      .max(8),
    references: z.array(theoryReferenceSchema).min(2).max(10),
  })
  .strict()
  .superRefine((article, context) => {
    if (!article.references.some((reference) => reference.kind === "primary")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["references"],
        message: "Theory article requires a primary technical reference",
      });
    }
    if (new Set(article.sourceIds).size !== article.sourceIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceIds"],
        message: "Theory source IDs must be unique",
      });
    }
    if (new Set(article.relatedContentIds).size !== article.relatedContentIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relatedContentIds"],
        message: "Related theory content IDs must be unique",
      });
    }
  });

export const theoryCollectionSchema = z
  .array(theoryArticleSchema)
  .min(1)
  .superRefine((articles, context) => {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    articles.forEach((article, index) => {
      if (ids.has(article.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Duplicate theory id ${article.id}`,
        });
      }
      if (slugs.has(article.slug)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "slug"],
          message: `Duplicate theory slug ${article.slug}`,
        });
      }
      ids.add(article.id);
      slugs.add(article.slug);
    });
  });

export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentItemInput = z.input<typeof contentItemSchema>;
export type ContentCollection = z.infer<typeof contentCollectionSchema>;
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;
export type SingleChoiceItem = Extract<ContentItem, { type: "single_choice" }>;
export type TheoryReference = z.infer<typeof theoryReferenceSchema>;
export type TheoryExample = z.infer<typeof theoryExampleSchema>;
export type TheorySection = z.infer<typeof theorySectionSchema>;
export type TheoryArticle = z.infer<typeof theoryArticleSchema>;
export type TheoryCollection = z.infer<typeof theoryCollectionSchema>;
export type TheoryProgressStatus = z.infer<typeof theoryProgressStatusSchema>;
export type TheoryUserState = z.infer<typeof theoryUserStateSchema>;
export type UpdateTheoryStateRequest = z.infer<typeof updateTheoryStateRequestSchema>;

export function validateContentCollection(input: unknown): ContentCollection {
  return contentCollectionSchema.parse(input);
}

export function validateTheoryCollection(input: unknown): TheoryCollection {
  return theoryCollectionSchema.parse(input);
}

export type HealthResponse = {
  status: "ok" | "error";
  version: string;
  database: "ok" | "error";
  timestamp: string;
};
