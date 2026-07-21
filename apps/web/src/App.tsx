import type {
  AnswerSubmission,
  LearningCatalogItem,
  LearningCatalogResponse,
  LearningProgressStatus,
  MockInterviewAnalytics,
  MockInterviewCatalogResponse,
  MockInterviewDuration,
  MockInterviewHistoryResponse,
  MockInterviewReportResponse,
  MockInterviewSessionResponse,
  ReviewRating,
  StatsResponse,
  Topic,
  UpdateTheoryStateRequest,
  UpdateSettingsRequest,
  UserSettings,
} from "@mentor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BookMarked,
  BookOpen,
  CalendarDays,
  Check,
  CircleHelp,
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  ExternalLink,
  Gauge,
  LoaderCircle,
  Lock,
  Mic,
  Search,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  ApiError,
  advanceMockInterview,
  completeMockInterview,
  createMockInterviewPractice,
  loadMockInterviewHistory,
  loadMockInterviews,
  loadMockInterviewReport,
  loadMockInterviewSession,
  loadPracticeSession,
  loadSettings,
  loadLearning,
  loadStats,
  loadTheoryArticle,
  loadTheoryCatalog,
  loadToday,
  revealMockInterview,
  saveSettings,
  createTelegramLinkCode,
  createPracticeSession,
  startMockInterview,
  submitAnswer,
  updateTheoryState,
  type DailyItem,
  type DailySession,
  type SubmitAnswerResponse,
  type TheoryArticleResponse,
  type TheoryCatalogResponse,
} from "./api";

type Section = "today" | "learning" | "theory" | "interview" | "stats" | "settings";
type Mode = "dashboard" | "question" | "result";

const todayQueryKey = ["study", "today"] as const;
const settingsQueryKey = ["user", "settings"] as const;
const statsQueryKey = ["user", "stats"] as const;
const learningQueryKey = ["learning", "catalog"] as const;
const theoryCatalogQueryKey = ["theory", "catalog"] as const;
const theoryArticleQueryKey = (articleId: string) => ["theory", "article", articleId] as const;
const mockInterviewCatalogQueryKey = ["mock-interviews", "catalog"] as const;
const mockInterviewHistoryQueryKey = ["mock-interviews", "history"] as const;
const mockInterviewSessionStorageKey = "frontend-mentor-mock-interview-session";
const practiceSessionStorageKey = "frontend-mentor-practice-session";
const mockInterviewSessionQueryKey = (sessionId: string) =>
  ["mock-interviews", "session", sessionId] as const;
const mockInterviewReportQueryKey = (sessionId: string) =>
  ["mock-interviews", "report", sessionId] as const;
const practiceSessionQueryKey = (sessionId: string) => ["learning", "practice", sessionId] as const;

const navItems = [
  { id: "today", label: "Сегодня", icon: CalendarDays },
  { id: "learning", label: "Обучение", icon: BookOpen },
  { id: "theory", label: "Теория", icon: BookMarked },
  { id: "interview", label: "Интервью", icon: Mic },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "settings", label: "Настройки", icon: Settings },
] as const;

const topicLabels: Record<Topic, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  browser: "Browser",
  node: "Node.js",
  css: "CSS",
};

const difficultyLabels = {
  junior: "Начальный",
  middle: "Средний",
  senior: "Продвинутый",
} as const;

const typeLabels = {
  term: "Термин",
  flashcard: "Карточка",
  single_choice: "Один вариант",
  multiple_choice: "Несколько вариантов",
  code_output: "Вывод кода",
  find_bug: "Поиск ошибки",
  interview_question: "Интервью-вопрос",
} as const;

const learningStatusLabels: Record<LearningProgressStatus, string> = {
  new: "Новое",
  learning: "В работе",
  due: "Повторить",
  mastered: "Освоено",
};

const ratingOptions: { value: ReviewRating; label: string; hint: string }[] = [
  { value: "again", label: "Не вспомнил", hint: "Повторить скорее" },
  { value: "hard", label: "Трудно", hint: "Было много сомнений" },
  { value: "good", label: "Хорошо", hint: "Ответил по существу" },
  { value: "easy", label: "Легко", hint: "Ответ был уверенным" },
];

const topicDescriptions: Record<Topic, string> = {
  javascript: "Язык, асинхронность и структуры данных",
  typescript: "Типизация и проектирование контрактов",
  react: "Компоненты, состояние и производительность",
  browser: "DOM, сеть, безопасность и event loop",
  node: "Runtime, модули и серверный JavaScript",
  css: "Layout, каскад и адаптивный интерфейс",
};

const mockInterviewTrackLabels: Record<
  MockInterviewCatalogResponse["sets"][number]["track"],
  string
> = {
  frontend_core: "Frontend",
  react: "React",
  javascript_deep_dive: "JavaScript",
  browser: "Browser",
  node_basics: "Node.js",
  react_native: "React Native",
};

const mockInterviewDurations: MockInterviewDuration[] = [15, 30, 45];
const mockInterviewCompletionLabels: Record<
  MockInterviewHistoryResponse["sessions"][number]["completionReason"],
  string
> = {
  finished: "Все вопросы пройдены",
  timeout: "Время закончилось",
  manual: "Завершено досрочно",
};

function Sidebar({
  active,
  answered,
  total,
  onChange,
}: {
  active: Section;
  answered: number;
  total: number;
  onChange: (section: Section) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="Frontend Mentor">
        <strong>
          FM<span>.</span>
        </strong>
        <small>MENTOR</small>
      </div>
      <nav className="nav" aria-label="Основная навигация">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            className={active === id ? "nav-item active" : "nav-item"}
            key={id}
            onClick={() => onChange(id)}
            type="button"
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="streak-card">
        <Flame aria-hidden="true" />
        <span>Сегодня</span>
        <strong>
          {answered}/{total || "—"}
        </strong>
        <small>{answered === total && total > 0 ? "Цель выполнена" : "Продолжайте сессию"}</small>
      </div>
    </aside>
  );
}

function Header({ answered, total }: { answered: number; total: number }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? "Доброй ночи"
      : hour < 12
        ? "Доброе утро"
        : hour < 18
          ? "Добрый день"
          : "Добрый вечер";

  return (
    <header className="page-header">
      <div>
        <h1>{greeting}</h1>
        <p className="subtitle">Готовимся к собеседованиям уровня Middle</p>
      </div>
      <div className="week-streak" aria-label={`Сегодня выполнено ${answered} из ${total}`}>
        <div className="streak-total">
          <Target /> <strong>{total ? `${answered}/${total}` : "—"}</strong> <span>сегодня</span>
        </div>
        <div className="session-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <i className={index < answered ? "done" : ""} key={index} />
          ))}
        </div>
      </div>
    </header>
  );
}

export function ProgressRing({ value, label = "прогресс" }: { value: number; label?: string }) {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      className="progress-ring"
      role="progressbar"
      style={{ "--progress": `${value * 3.6}deg` } as CSSProperties}
    >
      <div>
        <strong>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Dashboard({ session, onContinue }: { session: DailySession; onContinue: () => void }) {
  const { answered, total } = session.session;
  const progress = total ? Math.round((answered / total) * 100) : 0;
  const isComplete = total > 0 && answered >= total;
  const nextItem = session.items.find((item) => item.status !== "answered");
  const remaining = Math.max(total - answered, 0);
  const estimatedMinutes = Math.max(
    1,
    Math.ceil(
      session.items
        .filter((item) => item.status !== "answered")
        .reduce((sum, item) => sum + item.estimatedSeconds, 0) / 60,
    ),
  );
  const topicProgress = Object.entries(
    session.items.reduce<Partial<Record<Topic, { answered: number; total: number }>>>(
      (result, item) => {
        const current = result[item.topic] ?? { answered: 0, total: 0 };
        result[item.topic] = {
          answered: current.answered + (item.status === "answered" ? 1 : 0),
          total: current.total + 1,
        };
        return result;
      },
      {},
    ),
  ) as [Topic, { answered: number; total: number }][];

  return (
    <>
      <Header answered={answered} total={total} />
      <div className="dashboard-grid">
        <section className="session-panel">
          <h2>Сессия на сегодня</h2>
          <div className="session-summary">
            <ProgressRing value={progress} />
            <div className="session-copy">
              <strong>
                {answered} из {total} заданий
              </strong>
              <p>
                {isComplete
                  ? "Сессия завершена. Новые повторы появятся по расписанию."
                  : total
                    ? "Продолжите, чтобы завершить сессию и укрепить знания."
                    : "На сегодня заданий нет. Загляните завтра."}
              </p>
              {isComplete ? (
                <div className="complete-label">
                  <Check size={20} /> Дневная цель выполнена
                </div>
              ) : nextItem ? (
                <button className="primary-button" onClick={onContinue} type="button">
                  <Play size={19} fill="currentColor" /> {answered ? "Продолжить" : "Начать"}
                </button>
              ) : null}
            </div>
            <div className="session-meta">
              <span>
                <Clock3 /> <b>~{estimatedMinutes} мин</b>
                <small>осталось сегодня</small>
              </span>
              <span>
                <Code2 /> <b>{total} заданий</b>
                <small>смешанные темы</small>
              </span>
              <span>
                <Target /> <b>{remaining} осталось</b>
                <small>прогресс сохранён</small>
              </span>
            </div>
          </div>

          <div className="next-heading">
            <h3>Далее в сессии</h3>
            <span>{remaining} осталось</span>
          </div>
          {isComplete || !nextItem ? (
            <div className="session-complete">
              <Check />
              <span>
                <strong>{isComplete ? "Все задания выполнены" : "Очередь пуста"}</strong>
                <small>Новые материалы появятся по расписанию.</small>
              </span>
            </div>
          ) : (
            <button className="question-preview" onClick={onContinue} type="button">
              <span className="question-number">{answered + 1}</span>
              <span className="question-preview-copy">
                <small>
                  <b>{topicLabels[nextItem.topic]}</b> · {difficultyLabels[nextItem.difficulty]}{" "}
                  <em>{nextItem.subtopic}</em>
                </small>
                <strong>{nextItem.prompt}</strong>
                {"code" in nextItem && nextItem.code && <code>{nextItem.code}</code>}
              </span>
              <span className="preview-action">
                Открыть <ArrowRight />
              </span>
            </button>
          )}
        </section>

        <aside className="context-column">
          <section className="context-card">
            <div className="card-title">
              <h2>Очередь сегодня</h2>
              <span>{total} заданий</span>
            </div>
            <div className="review-list">
              {session.items.slice(0, 5).map((item) => (
                <div className="queue-item" key={item.id}>
                  <i className={item.status === "answered" ? "green" : "blue"} />
                  <span>
                    <b>{topicLabels[item.topic]}</b>
                    <small>{item.subtopic}</small>
                  </span>
                  <em>{item.status === "answered" ? "готово" : "в очереди"}</em>
                  {item.status === "answered" && <Check />}
                </div>
              ))}
            </div>
          </section>

          <section className="context-card progress-card">
            <div className="card-title">
              <h2>Прогресс по темам</h2>
              <span>сегодня</span>
            </div>
            {topicProgress.map(([topic, value]) => {
              const percent = Math.round((value.answered / value.total) * 100);
              return (
                <div className="topic-row" key={topic}>
                  <span>
                    <b>{topicLabels[topic]}</b>
                    <em>{percent}%</em>
                  </span>
                  <div>
                    <i style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </section>
        </aside>
      </div>
    </>
  );
}

function FeedbackDetails({ feedback }: { feedback: SubmitAnswerResponse["feedback"] }) {
  return (
    <>
      {feedback.definition && (
        <p className="reference-answer">
          <b>Определение:</b> {feedback.definition}
        </p>
      )}
      {feedback.answer && (
        <p className="reference-answer">
          <b>Ответ:</b> {feedback.answer}
        </p>
      )}
      {feedback.solution && (
        <pre className="solution-code">
          <code>{feedback.solution}</code>
        </pre>
      )}
      {feedback.referencePoints && (
        <div className="reference-points">
          <b>Опорные тезисы</b>
          <ul>
            {feedback.referencePoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.rubric && <p className="rubric-note">Критерии: {feedback.rubric.join(" · ")}</p>}
    </>
  );
}

function QuestionFlow({
  answered,
  item,
  mode,
  position,
  sessionId,
  total,
  onBack,
  onAnswered,
  onNext,
}: {
  answered: number;
  item: DailyItem;
  mode: Mode;
  position: number;
  sessionId: string;
  total: number;
  onBack: () => void;
  onAnswered: (response: SubmitAnswerResponse) => void;
  onNext: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [rating, setRating] = useState<ReviewRating | null>(null);
  const [clientAnswerId] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => Date.now());
  const mutation = useMutation({ mutationFn: submitAnswer, onSuccess: onAnswered });
  const result = mutation.data;
  const isChoice = item.type === "single_choice" || item.type === "multiple_choice";
  const isCodeOutput = item.type === "code_output";
  const isSelfAssessment = !isChoice && !isCodeOutput;
  const canSubmit = isChoice
    ? selectedIds.length > 0
    : isCodeOutput
      ? text.trim().length > 0
      : rating !== null;
  const correctIds = result?.feedback.correctOptionIds ?? [];

  const toggleOption = (optionId: string) => {
    if (item.type === "single_choice") {
      setSelectedIds([optionId]);
      return;
    }
    setSelectedIds((current) =>
      current.includes(optionId)
        ? current.filter((selectedId) => selectedId !== optionId)
        : [...current, optionId],
    );
  };

  const handleSubmit = () => {
    let answer: AnswerSubmission;
    if (isChoice) {
      answer = { kind: "selection", selectedOptionIds: selectedIds };
    } else if (isCodeOutput) {
      answer = { kind: "text", text: text.trim() };
    } else {
      answer = {
        kind: "self_assessment",
        rating: rating!,
        ...(text.trim() ? { text: text.trim() } : {}),
      };
    }
    mutation.mutate({
      clientAnswerId,
      sessionId,
      contentId: item.id,
      answer,
      latencyMs: Math.min(Date.now() - startedAt, 3_600_000),
    });
  };

  const resultTitle =
    result?.answer.isCorrect === true
      ? "Верно — механизм понятен"
      : result?.answer.isCorrect === false
        ? "Почти. Разберём механизм"
        : result?.answer.rating === "again"
          ? "Добавили в ближайшее повторение"
          : "Самооценка сохранена";

  return (
    <main className="study-page">
      <header className="study-header">
        <button className="icon-button" onClick={onBack} type="button" aria-label="Назад к сессии">
          <ArrowLeft />
        </button>
        <div>
          <span>
            Задание {position} из {total}
          </span>
          <div className="study-progress">
            <i style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
          </div>
        </div>
        <span className="topic-chip">{topicLabels[item.topic]}</span>
      </header>

      <section className="question-card">
        <div className="question-kicker">
          <CircleHelp /> {typeLabels[item.type]} · примерно {item.estimatedSeconds} сек.
        </div>
        <h1>{item.prompt}</h1>
        {"code" in item && item.code && (
          <pre>
            <code>{item.code}</code>
          </pre>
        )}

        {isChoice && (
          <div className="answer-list">
            {item.options.map((option, index) => {
              const selected = selectedIds.includes(option.id);
              const revealCorrect = mode === "result" && correctIds.includes(option.id);
              const wrong = mode === "result" && selected && !revealCorrect;
              return (
                <button
                  aria-pressed={selected}
                  className={`answer ${selected ? "selected" : ""} ${wrong ? "wrong" : ""} ${revealCorrect ? "correct" : ""}`}
                  disabled={mode === "result" || mutation.isPending}
                  key={option.id}
                  onClick={() => toggleOption(option.id)}
                  type="button"
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  <b>{option.text}</b>
                  {mode === "result" && (revealCorrect ? <Check /> : wrong ? <X /> : null)}
                </button>
              );
            })}
          </div>
        )}

        {(isCodeOutput || isSelfAssessment) && mode !== "result" && (
          <label className="written-answer">
            <span>
              {isCodeOutput ? "Ваш вывод" : "Кратко сформулируйте ответ — это поле необязательно"}
            </span>
            <textarea
              disabled={mutation.isPending}
              onChange={(event) => setText(event.target.value)}
              placeholder={isCodeOutput ? "Например: [1, 2, 3]" : "Основные тезисы ответа…"}
              rows={isCodeOutput ? 3 : 5}
              value={text}
            />
          </label>
        )}

        {isSelfAssessment && mode !== "result" && (
          <fieldset className="rating-fieldset">
            <legend>Как вы оцениваете свой ответ?</legend>
            <div className="rating-grid">
              {ratingOptions.map((option) => (
                <button
                  aria-pressed={rating === option.value}
                  className={
                    rating === option.value
                      ? `rating-option selected ${option.value}`
                      : `rating-option ${option.value}`
                  }
                  disabled={mutation.isPending}
                  key={option.value}
                  onClick={() => setRating(option.value)}
                  type="button"
                >
                  <b>{option.label}</b>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {mode === "result" && result && (
          <div
            role="status"
            className={
              result.answer.isCorrect === false || result.answer.rating === "again"
                ? "explanation"
                : "explanation correct"
            }
          >
            <strong>{resultTitle}</strong>
            <p>{result.feedback.explanation}</p>
            <FeedbackDetails feedback={result.feedback} />
            <small className="next-review">
              Следующее повторение: через {result.review.intervalDays} д.
            </small>
          </div>
        )}

        {mutation.isError && (
          <div className="inline-error" role="alert">
            Не удалось сохранить ответ. Проверьте соединение и попробуйте ещё раз — повтор не
            создаст дубль.
          </div>
        )}

        <div className="question-actions">
          <button className="secondary-button" onClick={onBack} type="button">
            Назад к сессии
          </button>
          {mode === "question" ? (
            <button
              className="primary-button"
              disabled={!canSubmit || mutation.isPending}
              onClick={handleSubmit}
              type="button"
            >
              {mutation.isPending && <LoaderCircle className="spin" />}
              {mutation.isPending
                ? "Сохраняем…"
                : isSelfAssessment
                  ? "Показать разбор"
                  : "Проверить ответ"}
            </button>
          ) : (
            <button className="primary-button" onClick={onNext} type="button">
              {result?.session.status === "completed" ? "Завершить" : "Следующее"} <ArrowRight />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function answerCount(value: number): string {
  const lastTwo = value % 100;
  const last = value % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 14
      ? "ответов"
      : last === 1
        ? "ответ"
        : last >= 2 && last <= 4
          ? "ответа"
          : "ответов";
  return `${value} ${suffix}`;
}

function StatsPage({ stats }: { stats: StatsResponse }) {
  const maxAnswers = Math.max(1, ...stats.activity.map((day) => day.answers));
  const sortedTopics = [...stats.topics].sort((left, right) => {
    if (left.accuracy === null && right.accuracy === null) return right.attempts - left.attempts;
    if (left.accuracy === null) return 1;
    if (right.accuracy === null) return -1;
    return left.accuracy - right.accuracy;
  });
  const focusTopic = sortedTopics.find((topic) => topic.accuracy !== null && topic.accuracy < 80);
  const accuracyValue = stats.summary.accuracy ?? 0;
  const nextReview = stats.summary.nextReviewAt
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
        new Date(stats.summary.nextReviewAt),
      )
    : "—";

  return (
    <main className="stats-page">
      <header className="stats-header">
        <div>
          <span className="eyebrow">Ваш прогресс</span>
          <h1>Статистика</h1>
          <p>Только реальные ответы и завершённые сессии — без демонстрационных значений.</p>
        </div>
        <div className="stats-period">
          <CalendarDays /> Последние 7 дней
        </div>
      </header>

      <section className="stats-overview">
        <article className="accuracy-card">
          <ProgressRing label="точность" value={accuracyValue} />
          <div>
            <span>Объективные задания</span>
            <h2>
              {stats.summary.accuracy === null
                ? "Пока нет оценки"
                : `${stats.summary.accuracy}% правильных`}
            </h2>
            <p>
              {stats.summary.objectiveAnswers
                ? `${stats.summary.correctAnswers} из ${answerCount(stats.summary.objectiveAnswers)} проверены как верные.`
                : "Точность появится после задания с вариантами или выводом кода."}
            </p>
          </div>
        </article>

        <div className="metric-grid">
          <article className="metric-card coral">
            <span>
              <Trophy /> Текущая серия
            </span>
            <strong>{stats.summary.currentStreak}</strong>
            <small>дн. подряд</small>
          </article>
          <article className="metric-card blue">
            <span>
              <Gauge /> Всего ответов
            </span>
            <strong>{stats.summary.totalAnswers}</strong>
            <small>за всё время</small>
          </article>
          <article className="metric-card amber">
            <span>
              <RotateCcw /> Повторы
            </span>
            <strong>{stats.summary.dueReviews}</strong>
            <small>следующий: {nextReview}</small>
          </article>
        </div>
      </section>

      <div className="stats-content-grid">
        <section className="stats-panel activity-panel">
          <div className="stats-panel-title">
            <div>
              <h2>Активность</h2>
              <p>Ответы за последние семь локальных дней</p>
            </div>
            <strong>{stats.activity.filter((day) => day.completed).length} сессий</strong>
          </div>
          <div className="activity-chart" aria-label="Ответы по дням">
            {stats.activity.map((day) => (
              <div className="activity-day" key={day.localDate} title={answerCount(day.answers)}>
                <span>{day.answers || ""}</span>
                <div>
                  <i
                    className={day.completed ? "completed" : ""}
                    style={{
                      height: day.answers
                        ? `${Math.max(8, (day.answers / maxAnswers) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
                <small>{shortDate(day.localDate)}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-panel focus-panel">
          <div className="stats-panel-title">
            <div>
              <h2>Фокус повторения</h2>
              <p>Тема с самой низкой измеренной точностью</p>
            </div>
          </div>
          {focusTopic ? (
            <div className="focus-topic">
              <span>{topicLabels[focusTopic.topic]}</span>
              <strong>{focusTopic.accuracy}%</strong>
              <div>
                <i style={{ width: `${focusTopic.accuracy}%` }} />
              </div>
              <p>
                {answerCount(focusTopic.attempts)} · {answerCount(focusTopic.objectiveAttempts)}
                {" проверено · "}
                {focusTopic.dueReviews} повторов ожидают
              </p>
            </div>
          ) : (
            <div className="stats-empty">
              <BarChart3 />
              <p>
                {stats.summary.objectiveAnswers
                  ? "Слабых тем пока не видно. Продолжайте практику для точной оценки."
                  : "Ответьте на объективное задание, чтобы определить тему для фокуса."}
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="stats-panel topic-stats-panel">
        <div className="stats-panel-title">
          <div>
            <h2>Темы</h2>
            <p>Точность считается только там, где ответ проверяет сервер</p>
          </div>
          <span>{stats.topics.length} направлений</span>
        </div>
        <div className="topic-stats-list">
          {stats.topics.map((topic) => (
            <article className="topic-stat" key={topic.topic}>
              <div className="topic-stat-name">
                <span>{topicLabels[topic.topic].slice(0, 2)}</span>
                <div>
                  <b>{topicLabels[topic.topic]}</b>
                  <small>{answerCount(topic.attempts)}</small>
                </div>
              </div>
              <div className="topic-stat-bar">
                <i style={{ width: `${topic.accuracy ?? 0}%` }} />
              </div>
              <strong>{topic.accuracy === null ? "—" : `${topic.accuracy}%`}</strong>
              <small>{topic.dueReviews ? `${topic.dueReviews} повтор.` : "нет просроченных"}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SettingsForm({
  initial,
  onboarding,
  onSaved,
}: {
  initial: UserSettings;
  onboarding: boolean;
  onSaved: (settings: UserSettings) => void;
}) {
  const [topics, setTopics] = useState<Topic[]>(initial.topics);
  const [dailyLimit, setDailyLimit] = useState(initial.dailyLimit);
  const [localTime, setLocalTime] = useState(initial.localTime);
  const [timezone, setTimezone] = useState(initial.timezone);
  const mutation = useMutation({ mutationFn: saveSettings, onSuccess: onSaved });
  const telegramMutation = useMutation({ mutationFn: createTelegramLinkCode });
  const telegramBotUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "")
    .trim()
    .replace(/^@/, "");
  const telegramDeepLink =
    telegramMutation.data && telegramBotUsername
      ? `https://t.me/${telegramBotUsername}?start=${telegramMutation.data.code}`
      : undefined;
  const timezoneOptions = Array.from(
    new Set([
      initial.timezone,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "Europe/Moscow",
      "Europe/Berlin",
      "Asia/Almaty",
      "Asia/Tbilisi",
      "UTC",
    ]),
  ).filter(Boolean);

  const toggleTopic = (topic: Topic) => {
    setTopics((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!topics.length) return;
    const input: UpdateSettingsRequest = { topics, dailyLimit, localTime, timezone };
    mutation.mutate(input);
  };

  return (
    <main className={onboarding ? "onboarding-page" : "settings-page"}>
      <div className="settings-intro">
        <span className="eyebrow">{onboarding ? "Первый шаг" : "Учебный план"}</span>
        <h1>{onboarding ? "Настроим ежедневную практику" : "Настройки"}</h1>
        <p>
          {onboarding
            ? "Выберите направления и удобный ритм. Эти параметры можно изменить в любой момент."
            : "Темы влияют на новые задания. Уже созданная очередь на сегодня останется стабильной."}
        </p>
      </div>

      <form className="settings-form" onSubmit={handleSubmit}>
        <section className="settings-section">
          <div className="settings-section-title">
            <span>1</span>
            <div>
              <h2>Темы подготовки</h2>
              <p>Выберите хотя бы одно направление.</p>
            </div>
          </div>
          <div className="topic-picker">
            {(Object.keys(topicLabels) as Topic[]).map((topic) => {
              const selected = topics.includes(topic);
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? "topic-option selected" : "topic-option"}
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  type="button"
                >
                  <span>{selected ? <Check /> : <Code2 />}</span>
                  <b>{topicLabels[topic]}</b>
                  <small>{topicDescriptions[topic]}</small>
                </button>
              );
            })}
          </div>
          {!topics.length && <p className="field-error">Выберите хотя бы одну тему.</p>}
        </section>

        <section className="settings-section settings-rhythm">
          <div className="settings-section-title">
            <span>2</span>
            <div>
              <h2>Ритм занятий</h2>
              <p>Короткая сессия должна помещаться в обычный день.</p>
            </div>
          </div>
          <div className="settings-controls">
            <fieldset>
              <legend>Заданий в день</legend>
              <div className="limit-picker">
                {[1, 2, 3, 4, 5].map((limit) => (
                  <button
                    aria-pressed={dailyLimit === limit}
                    className={dailyLimit === limit ? "selected" : ""}
                    key={limit}
                    onClick={() => setDailyLimit(limit)}
                    type="button"
                  >
                    {limit}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              <span>Время напоминания</span>
              <input
                onChange={(event) => setLocalTime(event.target.value)}
                required
                type="time"
                value={localTime}
              />
            </label>
            <label>
              <span>Часовой пояс</span>
              <select onChange={(event) => setTimezone(event.target.value)} value={timezone}>
                {timezoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {!onboarding && (
          <section className="settings-section telegram-link-section">
            <div className="settings-section-title">
              <span>3</span>
              <div>
                <h2>Telegram</h2>
                <p>Свяжите аккаунт, чтобы бот видел тот же учебный профиль.</p>
              </div>
            </div>
            <div className="telegram-link-card" aria-live="polite">
              <div className="telegram-link-icon">
                <Send aria-hidden="true" />
              </div>
              <div className="telegram-link-copy">
                {telegramMutation.data ? (
                  <>
                    <span>Одноразовый код</span>
                    <code>{telegramMutation.data.code}</code>
                    <p>
                      Отправьте боту команду <b>/start {telegramMutation.data.code}</b>. Код
                      действует до {new Date(telegramMutation.data.expiresAt).toLocaleTimeString()}.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Подключить Telegram-бота</strong>
                    <p>Создадим код на 10 минут. Бот подтвердит успешную привязку в чате.</p>
                  </>
                )}
                {telegramMutation.isError && (
                  <p className="telegram-link-error" role="alert">
                    Не удалось создать код. Проверьте соединение и повторите попытку.
                  </p>
                )}
              </div>
              <div className="telegram-link-actions">
                {telegramDeepLink && (
                  <a
                    className="primary-button"
                    href={telegramDeepLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Открыть бота
                  </a>
                )}
                <button
                  className="secondary-button"
                  disabled={telegramMutation.isPending}
                  onClick={() => telegramMutation.mutate()}
                  type="button"
                >
                  {telegramMutation.isPending
                    ? "Создаём…"
                    : telegramMutation.data
                      ? "Новый код"
                      : "Получить код"}
                </button>
              </div>
            </div>
          </section>
        )}

        {mutation.isError && (
          <div className="inline-error" role="alert">
            Не удалось сохранить настройки. Проверьте соединение и повторите попытку.
          </div>
        )}
        {mutation.isSuccess && !onboarding && (
          <div className="settings-saved" role="status">
            <Check /> Настройки сохранены
          </div>
        )}

        <div className="settings-actions">
          <p>Расписание хранится на сервере и будет общим для сайта и будущего приложения.</p>
          <button
            className="primary-button"
            disabled={!topics.length || mutation.isPending}
            type="submit"
          >
            {mutation.isPending && <LoaderCircle className="spin" />}
            {mutation.isPending
              ? "Сохраняем…"
              : onboarding
                ? "Начать обучение"
                : "Сохранить настройки"}
          </button>
        </div>
      </form>
    </main>
  );
}

type LearningFilter = LearningProgressStatus | "all";

function LearningPage({
  catalog,
  practice,
  isStarting,
  startError,
  onStart,
  onResume,
}: {
  catalog: LearningCatalogResponse;
  practice: DailySession | null;
  isStarting: boolean;
  startError: boolean;
  onStart: (contentIds: string[]) => void;
  onResume: () => void;
}) {
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [status, setStatus] = useState<LearningFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(catalog.items[0]?.id ?? null);
  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const visibleItems = catalog.items.filter((item) => {
    if (topic !== "all" && item.topic !== topic) return false;
    if (status !== "all" && item.progressStatus !== status) return false;
    if (!normalizedSearch) return true;
    return [item.prompt, item.subtopic, topicLabels[item.topic], ...item.tags]
      .join(" ")
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedSearch);
  });
  const selectedItem =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const practiceItems = visibleItems.slice(0, 5).map((item) => item.id);
  const progress = catalog.summary.total
    ? Math.round((catalog.summary.seen / catalog.summary.total) * 100)
    : 0;
  const remainingPractice =
    practice?.items.filter((item) => item.status !== "answered").length ?? 0;
  const selectMaterial = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 760px)").matches) {
      window.requestAnimationFrame(() =>
        document.querySelector("#learning-detail")?.scrollIntoView({ behavior: "smooth" }),
      );
    }
  };

  return (
    <main className="learning-page">
      <header className="learning-header">
        <div>
          <span className="eyebrow">Библиотека навыков</span>
          <h1>Обучение</h1>
          <p>Выберите тему, найдите пробел и соберите отдельную тренировку.</p>
        </div>
        <span className="learning-count">{catalog.summary.total} материалов</span>
      </header>

      <section className="learning-overview">
        <div className="learning-progress-copy">
          <span>Общий прогресс</span>
          <strong>
            {catalog.summary.seen}
            <small> / {catalog.summary.total}</small>
          </strong>
          <p>Материалы переходят в работу после первого ответа и обновляются по расписанию.</p>
          <div className="learning-progress-bar" aria-label={`Изучено ${progress}%`}>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="learning-summary">
          <span>
            <small>В работе</small>
            <b>{catalog.summary.seen - catalog.summary.mastered}</b>
          </span>
          <span>
            <small>Повторить</small>
            <b>{catalog.summary.due}</b>
          </span>
          <span>
            <small>Освоено</small>
            <b>{catalog.summary.mastered}</b>
          </span>
        </div>
        <button
          className="primary-button learning-primary-action"
          disabled={isStarting || (!practice && !practiceItems.length)}
          onClick={() => (practice ? onResume() : onStart(practiceItems))}
          type="button"
        >
          {isStarting ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}
          {isStarting
            ? "Собираем…"
            : practice
              ? `Продолжить тренировку · ${remainingPractice}`
              : `Тренировать ${Math.min(practiceItems.length, 5)}`}
        </button>
      </section>

      <section className="learning-controls" aria-label="Фильтры каталога">
        <label className="learning-search">
          <Search />
          <input
            aria-label="Найти тему, тег или вопрос"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти тему, тег или вопрос"
            type="search"
            value={search}
          />
        </label>
        <div className="learning-status-filter">
          {(["all", "new", "learning", "due", "mastered"] as LearningFilter[]).map((value) => (
            <button
              aria-pressed={status === value}
              className={status === value ? "active" : ""}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {value === "all" ? "Все" : learningStatusLabels[value]}
            </button>
          ))}
        </div>
      </section>

      <div className="learning-topics" aria-label="Темы">
        <button
          aria-pressed={topic === "all"}
          className={topic === "all" ? "active" : ""}
          onClick={() => setTopic("all")}
          type="button"
        >
          <b>Все темы</b>
          <span>{catalog.summary.total}</span>
        </button>
        {catalog.topics.map((item) => (
          <button
            aria-pressed={topic === item.topic}
            className={topic === item.topic ? "active" : ""}
            key={item.topic}
            onClick={() => setTopic(item.topic)}
            type="button"
          >
            <b>{topicLabels[item.topic]}</b>
            <span>{item.total}</span>
          </button>
        ))}
      </div>

      {startError && (
        <div className="inline-error" role="alert">
          Не удалось собрать тренировку. Повторите попытку — дневная очередь не изменится.
        </div>
      )}

      <div className="learning-layout">
        <section className="learning-list-panel">
          <div className="learning-list-heading">
            <div>
              <h2>Материалы</h2>
              <p>{visibleItems.length} найдено</p>
            </div>
            <span>Нажмите, чтобы посмотреть детали</span>
          </div>
          {visibleItems.length ? (
            <div className="learning-list">
              {visibleItems.map((item, index) => (
                <button
                  className={
                    selectedItem?.id === item.id ? "learning-item active" : "learning-item"
                  }
                  key={item.id}
                  onClick={() => selectMaterial(item.id)}
                  type="button"
                >
                  <span className="learning-item-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="learning-item-copy">
                    <small>
                      {topicLabels[item.topic]} · {item.subtopic}
                    </small>
                    <b>{item.prompt}</b>
                  </span>
                  <span className={`learning-status ${item.progressStatus}`}>
                    {learningStatusLabels[item.progressStatus]}
                  </span>
                  <ArrowRight />
                </button>
              ))}
            </div>
          ) : (
            <div className="learning-empty">
              <Search />
              <h3>Ничего не найдено</h3>
              <p>Попробуйте убрать часть фильтров или изменить запрос.</p>
            </div>
          )}
        </section>

        <LearningDetail item={selectedItem} isStarting={isStarting} onStart={onStart} />
      </div>
    </main>
  );
}

function LearningDetail({
  item,
  isStarting,
  onStart,
}: {
  item: LearningCatalogItem | null;
  isStarting: boolean;
  onStart: (contentIds: string[]) => void;
}) {
  if (!item) {
    return (
      <aside className="learning-detail empty">
        <Search />
        <p>Выберите материал слева, чтобы увидеть подробности.</p>
      </aside>
    );
  }

  return (
    <aside className="learning-detail" id="learning-detail">
      <div className="learning-detail-topline">
        <span>{topicLabels[item.topic]}</span>
        <span className={`learning-status ${item.progressStatus}`}>
          {learningStatusLabels[item.progressStatus]}
        </span>
      </div>
      <small className="learning-detail-type">{typeLabels[item.type]}</small>
      <h2>{item.prompt}</h2>
      <p>
        Подтема <b>{item.subtopic}</b>. Материал попадёт в отдельную тренировку и не изменит
        стабильную очередь на сегодня.
      </p>
      <div className="learning-detail-meta">
        <span>
          <small>Уровень</small>
          <b>{difficultyLabels[item.difficulty]}</b>
        </span>
        <span>
          <small>Время</small>
          <b>~{Math.max(1, Math.ceil(item.estimatedSeconds / 60))} мин</b>
        </span>
        <span>
          <small>Серия</small>
          <b>{item.streak}</b>
        </span>
      </div>
      <div className="learning-tags">
        {item.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <button
        className="primary-button"
        disabled={isStarting}
        onClick={() => onStart([item.id])}
        type="button"
      >
        {isStarting ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}
        {isStarting ? "Собираем…" : "Тренировать материал"}
      </button>
    </aside>
  );
}

type TheoryFilter = "all" | "reading" | "completed" | "bookmarked";

const theoryFilterLabels: Record<TheoryFilter, string> = {
  all: "Все главы",
  reading: "Читаю",
  completed: "Прочитано",
  bookmarked: "Закладки",
};

const theoryStatusLabels = {
  new: "Новое",
  reading: "Читаю",
  completed: "Прочитано",
} as const;

export function TheoryCatalogPage({
  catalog,
  onOpen,
}: {
  catalog: TheoryCatalogResponse;
  onOpen: (articleId: string) => void;
}) {
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [progress, setProgress] = useState<TheoryFilter>("all");
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const topicCounts = catalog.items.reduce<Partial<Record<Topic, number>>>((counts, article) => {
    counts[article.topic] = (counts[article.topic] ?? 0) + 1;
    return counts;
  }, {});
  const availableTopics = (Object.keys(topicLabels) as Topic[]).filter(
    (candidate) => (topicCounts[candidate] ?? 0) > 0,
  );
  const visibleArticles = catalog.items.filter((article) => {
    if (topic !== "all" && article.topic !== topic) return false;
    if (progress === "bookmarked" && !article.state.bookmarked) return false;
    if (progress !== "all" && progress !== "bookmarked" && article.state.status !== progress) {
      return false;
    }
    if (!normalizedSearch) return true;
    return [article.title, article.summary, topicLabels[article.topic], article.slug]
      .join(" ")
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedSearch);
  });

  return (
    <main className="theory-page">
      <header className="theory-hero">
        <div>
          <p className="eyebrow">База знаний</p>
          <h1>Теория без воды</h1>
          <p>
            Разбирайте механизм, запускайте пример и возвращайтесь к ключевым тезисам перед
            собеседованием.
          </p>
        </div>
        <div className="theory-hero-stats" aria-label="Объём базы знаний">
          <span>
            <strong>{catalog.total}</strong>
            <small>глав</small>
          </span>
          <span
            aria-label={`Прочитано ${catalog.summary.completed} из ${catalog.total}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={catalog.summary.completionPercent}
            className="theory-completion"
            role="progressbar"
            style={
              {
                "--theory-completion": `${catalog.summary.completionPercent}%`,
              } as CSSProperties
            }
          >
            <strong>{catalog.summary.completionPercent}%</strong>
            <small>
              {catalog.summary.completed} из {catalog.total}
            </small>
            <i aria-hidden="true" />
          </span>
          <span>
            <strong>{catalog.summary.bookmarked}</strong>
            <small>в закладках</small>
          </span>
        </div>
      </header>

      <section className="theory-controls" aria-label="Фильтры теории">
        <label className="theory-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Найти теоретическую тему"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Замыкания, CORS, generics…"
            type="search"
            value={search}
          />
        </label>
        <div className="theory-topic-filter">
          <button
            aria-pressed={topic === "all"}
            className={topic === "all" ? "active" : ""}
            onClick={() => setTopic("all")}
            type="button"
          >
            Все <span>{catalog.total}</span>
          </button>
          {availableTopics.map((candidate) => (
            <button
              aria-pressed={topic === candidate}
              className={topic === candidate ? "active" : ""}
              key={candidate}
              onClick={() => setTopic(candidate)}
              type="button"
            >
              {topicLabels[candidate]} <span>{topicCounts[candidate]}</span>
            </button>
          ))}
        </div>
        <div className="theory-state-filter" aria-label="Прогресс чтения">
          {(Object.keys(theoryFilterLabels) as TheoryFilter[]).map((value) => (
            <button
              aria-pressed={progress === value}
              className={progress === value ? "active" : ""}
              key={value}
              onClick={() => setProgress(value)}
              type="button"
            >
              {value === "bookmarked" && <Bookmark aria-hidden="true" />}
              {theoryFilterLabels[value]}
              {value === "reading" && (
                <span>{catalog.summary.started - catalog.summary.completed}</span>
              )}
              {value === "completed" && <span>{catalog.summary.completed}</span>}
              {value === "bookmarked" && <span>{catalog.summary.bookmarked}</span>}
            </button>
          ))}
        </div>
      </section>

      <div className="theory-results-heading">
        <div>
          <span className="eyebrow">Каталог</span>
          <h2>Выберите разбор</h2>
        </div>
        <span>{visibleArticles.length} найдено</span>
      </div>

      {visibleArticles.length ? (
        <section className="theory-grid" aria-label="Теоретические главы">
          {visibleArticles.map((article, index) => (
            <button
              className="theory-card"
              key={article.id}
              onClick={() => onOpen(article.id)}
              type="button"
            >
              <span className="theory-card-topline">
                <small>{topicLabels[article.topic]}</small>
                <span className="theory-card-state">
                  {article.state.bookmarked && (
                    <Bookmark aria-label="В закладках" fill="currentColor" />
                  )}
                  <i className={article.state.status}>{theoryStatusLabels[article.state.status]}</i>
                  <em>{String(index + 1).padStart(2, "0")}</em>
                </span>
              </span>
              <strong>{article.title}</strong>
              <span className="theory-card-summary">{article.summary}</span>
              <span className="theory-card-footer">
                <small>
                  <Clock3 aria-hidden="true" /> {article.estimatedMinutes} мин
                </small>
                <b>
                  Читать <ArrowRight aria-hidden="true" />
                </b>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="theory-empty">
          <Search aria-hidden="true" />
          <h2>Главы не найдены</h2>
          <p>Измените запрос или выберите все темы.</p>
        </section>
      )}
    </main>
  );
}

export function TheoryArticlePage({
  article,
  isSaving = false,
  isStarting = false,
  stateError = false,
  practiceError = false,
  onBack,
  onPractice = () => undefined,
  onStateChange = () => undefined,
}: {
  article: TheoryArticleResponse;
  isSaving?: boolean;
  isStarting?: boolean;
  stateError?: boolean;
  practiceError?: boolean;
  onBack: () => void;
  onPractice?: (contentIds: string[]) => void;
  onStateChange?: (state: UpdateTheoryStateRequest) => void;
}) {
  return (
    <main className="theory-reader">
      <button className="theory-back" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" /> К базе знаний
      </button>

      <header className="theory-article-header">
        <div className="theory-article-toolbar">
          <div className="theory-article-meta">
            <span>{topicLabels[article.topic]}</span>
            <span>
              <Clock3 aria-hidden="true" /> {article.estimatedMinutes} мин
            </span>
            <span>Версия {article.version}</span>
          </div>
          <div className="theory-reader-actions">
            <button
              className="practice"
              disabled={isStarting}
              onClick={() => onPractice(article.relatedContentIds)}
              type="button"
            >
              {isStarting ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}
              {isStarting ? "Собираем…" : `Тренировать тему · ${article.relatedContentIds.length}`}
            </button>
            <button
              aria-label={article.state.bookmarked ? "Убрать из закладок" : "Добавить в закладки"}
              aria-pressed={article.state.bookmarked}
              className={article.state.bookmarked ? "active" : ""}
              disabled={isSaving}
              onClick={() => onStateChange({ bookmarked: !article.state.bookmarked })}
              type="button"
            >
              <Bookmark
                aria-hidden="true"
                fill={article.state.bookmarked ? "currentColor" : "none"}
              />
              {article.state.bookmarked ? "В закладках" : "В закладки"}
            </button>
            <button
              className={article.state.status === "completed" ? "completed" : ""}
              disabled={isSaving || article.state.status === "completed"}
              onClick={() => onStateChange({ status: "completed" })}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" />
              {article.state.status === "completed" ? "Прочитано" : "Отметить прочитанным"}
            </button>
          </div>
        </div>
        <h1>{article.title}</h1>
        <p>{article.summary}</p>
        {stateError && (
          <div className="theory-state-error" role="alert">
            Не удалось сохранить прогресс. Проверьте соединение и повторите действие.
          </div>
        )}
        {practiceError && (
          <div className="theory-state-error" role="alert">
            Не удалось начать тренировку. Проверьте соединение и повторите действие.
          </div>
        )}
      </header>

      <div className="theory-reader-layout">
        <article className="theory-article">
          {article.sections.map((section, sectionIndex) => (
            <section id={`theory-section-${sectionIndex}`} key={section.heading}>
              <span className="theory-section-number">
                {String(sectionIndex + 1).padStart(2, "0")}
              </span>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${section.heading}:${paragraphIndex}`}>{paragraph}</p>
              ))}
              {section.example && (
                <div className="theory-example">
                  <div className="theory-example-heading">
                    <span>
                      <Code2 aria-hidden="true" /> {section.example.title}
                    </span>
                    <small>{section.example.language}</small>
                  </div>
                  <pre>
                    <code>{section.example.code}</code>
                  </pre>
                  <p>{section.example.explanation}</p>
                </div>
              )}
            </section>
          ))}
        </article>

        <aside className="theory-article-aside">
          <section>
            <span className="eyebrow">В этой главе</span>
            <nav aria-label="Содержание главы">
              {article.sections.map((section, index) => (
                <a href={`#theory-section-${index}`} key={section.heading}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.heading}
                </a>
              ))}
            </nav>
          </section>

          <section className="theory-key-points">
            <span className="eyebrow">Запомнить</span>
            <ul>
              {article.keyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="theory-references">
            <span className="eyebrow">Источники</span>
            {article.references.map((reference) => (
              <a href={reference.url} key={reference.url} rel="noreferrer" target="_blank">
                <span>
                  <small>{reference.kind === "primary" ? "Документация" : "Тема"}</small>
                  {reference.label}
                </span>
                <ExternalLink aria-hidden="true" />
              </a>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}

function InterviewCatalogPage({
  catalog,
  duration,
  history,
  historyError,
  historyLoading,
  isStarting,
  startError,
  onDurationChange,
  onHistoryRetry,
  onOpenHistory,
  onStart,
}: {
  catalog: MockInterviewCatalogResponse;
  duration: MockInterviewDuration;
  history: MockInterviewHistoryResponse | undefined;
  historyError: boolean;
  historyLoading: boolean;
  isStarting: boolean;
  startError: boolean;
  onDurationChange: (duration: MockInterviewDuration) => void;
  onHistoryRetry: () => void;
  onOpenHistory: (sessionId: string) => void;
  onStart: (setId: string) => void;
}) {
  return (
    <main className="interview-page">
      <header className="interview-intro">
        <div>
          <p className="eyebrow">Режим собеседования</p>
          <h1>Mock-интервью</h1>
          <p>
            Отвечайте вслух, как на настоящей встрече. Вопросы идут по порядку, а подсказки остаются
            закрыты до завершения.
          </p>
        </div>
        <div className="interview-intro-mark" aria-hidden="true">
          <Mic />
          <span>LIVE</span>
        </div>
      </header>

      <section className="interview-duration" aria-labelledby="interview-duration-title">
        <div>
          <Timer />
          <span>
            <strong id="interview-duration-title">Длительность</strong>
            <small>Таймер запускается вместе с первым вопросом</small>
          </span>
        </div>
        <div className="interview-duration-options">
          {mockInterviewDurations.map((value) => (
            <button
              aria-pressed={duration === value}
              className={duration === value ? "active" : ""}
              key={value}
              onClick={() => onDurationChange(value)}
              type="button"
            >
              {value} мин
            </button>
          ))}
        </div>
      </section>

      {startError && (
        <div className="inline-error" role="alert">
          Не удалось начать интервью. Попробуйте ещё раз — новая сессия не была создана.
        </div>
      )}

      <section className="interview-set-grid" aria-label="Наборы вопросов">
        {catalog.sets.map((set, index) => (
          <article className="interview-set-card" key={set.id}>
            <div className="interview-set-topline">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <small>{mockInterviewTrackLabels[set.track]}</small>
            </div>
            <h2>{set.title}</h2>
            <p>{set.description}</p>
            <div className="interview-set-meta">
              <span>
                <CircleHelp /> {set.questionCount} вопросов
              </span>
              <span>
                <Clock3 /> рекомендуется {set.recommendedDurationMinutes} мин
              </span>
            </div>
            <button
              className="primary-button"
              disabled={isStarting}
              onClick={() => onStart(set.id)}
              type="button"
            >
              {isStarting ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}
              {isStarting ? "Запускаем…" : "Начать интервью"}
            </button>
          </article>
        ))}
      </section>

      {history && history.analytics.summary.sessions > 0 && (
        <InterviewAnalytics analytics={history.analytics} />
      )}

      <section className="interview-history" aria-labelledby="interview-history-title">
        <header>
          <div>
            <p className="eyebrow">Ваш прогресс</p>
            <h2 id="interview-history-title">Прошлые интервью</h2>
          </div>
          <small>Последние 20 завершённых сессий</small>
        </header>
        {historyLoading && <p className="interview-history-state">Загружаем историю…</p>}
        {historyError && (
          <div className="interview-history-state" role="alert">
            <span>Не удалось загрузить прошлые интервью.</span>
            <button className="secondary-button" onClick={onHistoryRetry} type="button">
              <RefreshCw /> Повторить
            </button>
          </div>
        )}
        {history && history.sessions.length === 0 && (
          <p className="interview-history-state">
            Здесь появятся тезисы и разборы после первого завершённого интервью.
          </p>
        )}
        {history && history.sessions.length > 0 && (
          <div className="interview-history-list">
            {history.sessions.map((session) => (
              <button
                className="interview-history-card"
                key={session.id}
                onClick={() => onOpenHistory(session.id)}
                type="button"
              >
                <span>
                  <small>{formatInterviewDate(session.completedAt)}</small>
                  <strong>{session.title}</strong>
                  <em>{mockInterviewCompletionLabels[session.completionReason]}</em>
                </span>
                <span className="interview-history-metrics">
                  <small>
                    <b>{session.assessedQuestions}</b> оценено
                  </small>
                  <small className={session.weakQuestions > 0 ? "weak" : ""}>
                    <b>{session.weakQuestions}</b> слабых
                  </small>
                  <ArrowRight aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatInterviewDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInterviewShortDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function InterviewAnalytics({ analytics }: { analytics: MockInterviewAnalytics }) {
  return (
    <section className="interview-analytics" aria-labelledby="interview-analytics-title">
      <header>
        <div>
          <p className="eyebrow">Самооценка</p>
          <h2 id="interview-analytics-title">Динамика интервью</h2>
        </div>
        <small>Анализ последних {analytics.summary.sessions} сессий · максимум 20</small>
      </header>

      <div className="interview-analytics-summary">
        <span>
          <strong>{analytics.summary.sessions}</strong>
          <small>интервью</small>
        </span>
        <span>
          <strong>{analytics.summary.assessedQuestions}</strong>
          <small>ответов оценено · {analytics.summary.weakQuestions} слабых</small>
        </span>
        <span>
          <strong>
            {analytics.summary.confidencePercent === null
              ? "—"
              : `${analytics.summary.confidencePercent}%`}
          </strong>
          <small>уверенных ответов</small>
        </span>
      </div>

      <div className="interview-analytics-grid">
        <section className="interview-trend" aria-labelledby="interview-trend-title">
          <div>
            <h3 id="interview-trend-title">Уверенность по сессиям</h3>
            <small>Доля оценок «Хорошо» и «Легко»</small>
          </div>
          <div
            className="interview-trend-chart"
            style={{
              gridTemplateColumns: `repeat(${analytics.trend.length}, minmax(42px, 1fr))`,
            }}
          >
            {analytics.trend.map((point) => {
              const confidence = point.confidencePercent;
              return (
                <div
                  aria-label={`${point.title}, ${formatInterviewDate(point.completedAt)}: ${confidence === null ? "нет оценок" : `${confidence}% уверенных ответов`}`}
                  className="interview-trend-point"
                  key={point.sessionId}
                >
                  <div>
                    <i
                      className={confidence === null ? "empty" : ""}
                      style={{ height: `${confidence === null ? 4 : Math.max(confidence, 4)}%` }}
                    />
                  </div>
                  <strong>{confidence === null ? "—" : `${confidence}%`}</strong>
                  <small>{formatInterviewShortDate(point.completedAt)}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="interview-weak-topics" aria-labelledby="interview-weak-topics-title">
          <div>
            <h3 id="interview-weak-topics-title">Частые слабые темы</h3>
            <small>Теги ответов «Не вспомнил» и «Трудно»</small>
          </div>
          {analytics.weakTopics.length > 0 ? (
            <div>
              {analytics.weakTopics.map((topic) => (
                <span key={topic.tag}>
                  <b>#{topic.tag}</b>
                  <small>{topic.count}</small>
                </span>
              ))}
            </div>
          ) : (
            <p>Слабых тем пока нет — все оценённые ответы были уверенными.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function InterviewReportPage({
  report,
  isStartingPractice,
  practiceError,
  onBack,
  onPractice,
}: {
  report: MockInterviewReportResponse;
  isStartingPractice: boolean;
  practiceError: boolean;
  onBack: () => void;
  onPractice: () => void;
}) {
  return (
    <main className="interview-report">
      <button className="interview-exit" onClick={onBack} type="button">
        <ArrowLeft /> К истории
      </button>
      <header className="interview-report-header">
        <div>
          <p className="eyebrow">Отчёт за {formatInterviewDate(report.session.completedAt)}</p>
          <h1>Разбор интервью: {report.session.title}</h1>
          <p>{mockInterviewCompletionLabels[report.session.completionReason]}</p>
        </div>
        <Trophy aria-hidden="true" />
      </header>

      <div className="interview-report-stats">
        <span>
          <strong>{report.session.assessedQuestions}</strong>
          <small>ответов оценено</small>
        </span>
        <span>
          <strong>{report.session.weakQuestions}</strong>
          <small>слабых ответов</small>
        </span>
        <span>
          <strong>{report.session.durationMinutes}</strong>
          <small>минут в сессии</small>
        </span>
      </div>

      {report.session.weakQuestions > 0 && (
        <section className="interview-report-practice">
          <span>
            <Target aria-hidden="true" />
            <span>
              <strong>Закрепить слабые темы</strong>
              <small>
                Создадим отдельную тренировку только из материалов, связанных со сложными ответами.
              </small>
            </span>
          </span>
          <button
            className="primary-button"
            disabled={isStartingPractice}
            onClick={onPractice}
            type="button"
          >
            {isStartingPractice ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}
            {isStartingPractice ? "Собираем тренировку…" : "Тренировать слабые темы"}
          </button>
        </section>
      )}
      {practiceError && (
        <div className="inline-error" role="alert">
          Не удалось создать тренировку. Отчёт сохранён — попробуйте ещё раз.
        </div>
      )}

      {report.questions.length === 0 ? (
        <section className="interview-report-empty">
          <h2>Нет сохранённых ответов</h2>
          <p>Сессия завершилась до открытия первого разбора.</p>
        </section>
      ) : (
        <section className="interview-report-questions" aria-label="Ответы интервью">
          {report.questions.map((question) => {
            const rating = question.rating
              ? ratingOptions.find((option) => option.value === question.rating)
              : undefined;
            return (
              <article
                className={
                  question.scheduledForReview
                    ? "interview-report-card weak"
                    : "interview-report-card"
                }
                key={question.id}
              >
                <div className="interview-report-card-topline">
                  <span>Вопрос {String(question.position).padStart(2, "0")}</span>
                  <strong className={question.rating ?? "unrated"}>
                    {rating?.label ?? "Без оценки"}
                  </strong>
                </div>
                <h2>{question.prompt}</h2>
                <div className="interview-question-tags">
                  {question.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                <div className="interview-report-answer">
                  <section>
                    <h3>Ваши тезисы</h3>
                    <p>{question.notes || "Тезисы не были сохранены."}</p>
                  </section>
                  <section>
                    <h3>Эталон ответа</h3>
                    <ul>
                      {question.referencePoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </section>
                </div>
                {question.scheduledForReview && (
                  <p className="interview-report-review-note">
                    <RotateCcw aria-hidden="true" /> Связанные материалы добавлены в повторение
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function formatInterviewTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function InterviewSessionPage({
  data,
  isAdvancing,
  isCompleting,
  isRevealing,
  actionError,
  onComplete,
  onTimeout,
  onExit,
  onRate,
  onReview,
  onReveal,
}: {
  data: MockInterviewSessionResponse;
  isAdvancing: boolean;
  isCompleting: boolean;
  isRevealing: boolean;
  actionError: boolean;
  onComplete: () => void;
  onTimeout: () => void;
  onExit: () => void;
  onRate: (rating: ReviewRating) => void;
  onReview: () => void;
  onReveal: (notes: string) => void;
}) {
  const calculateRemaining = () =>
    Math.max(0, Math.ceil((new Date(data.session.endsAt).getTime() - Date.now()) / 1_000));
  const [remainingSeconds, setRemainingSeconds] = useState(calculateRemaining);
  const [notes, setNotes] = useState(data.question?.notes ?? "");
  const timeoutHandlerRef = useRef(onTimeout);
  timeoutHandlerRef.current = onTimeout;

  useEffect(() => {
    let timeoutRequested = false;
    const updateTimer = () => {
      const nextRemaining = calculateRemaining();
      setRemainingSeconds(nextRemaining);
      if (nextRemaining === 0 && data.session.status === "active" && !timeoutRequested) {
        timeoutRequested = true;
        timeoutHandlerRef.current();
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1_000);
    return () => window.clearInterval(timerId);
  }, [data.session.endsAt, data.session.status]);

  useEffect(() => {
    setNotes(data.question?.notes ?? "");
  }, [data.question?.id, data.question?.notes]);

  if (data.session.status === "completed") {
    const resultCopy =
      data.session.completionReason === "finished"
        ? "Вы прошли все вопросы и оценили ответы. Слабые темы уже добавлены в повторение."
        : data.session.completionReason === "timeout"
          ? "Время закончилось. Сохранённые тезисы и оценки остались в истории сессии."
          : "Интервью завершено досрочно. Можно выбрать набор и попробовать ещё раз.";

    return (
      <main className="interview-session interview-complete">
        <div className="interview-complete-icon">
          <Check />
        </div>
        <p className="eyebrow">Сессия завершена</p>
        <h1>{data.session.title}</h1>
        <p>{resultCopy}</p>
        <div className="interview-complete-stats">
          <span>
            <strong>{Math.min(data.session.currentQuestionIndex, data.session.total)}</strong>
            <small>вопросов пройдено</small>
          </span>
          <span>
            <strong>{data.session.durationMinutes}</strong>
            <small>минут в сессии</small>
          </span>
          <span>
            <strong>{data.session.weakQuestions}</strong>
            <small>слабых ответов в повторении</small>
          </span>
        </div>
        <div className="interview-complete-actions">
          <button className="secondary-button" onClick={onExit} type="button">
            <ArrowLeft /> К наборам
          </button>
          <button className="primary-button" onClick={onReview} type="button">
            <BookOpen /> Посмотреть разбор
          </button>
        </div>
      </main>
    );
  }

  const question = data.question;
  if (!question) {
    return (
      <main className="query-state" role="alert">
        <div className="state-icon error">
          <AlertTriangle />
        </div>
        <h1>Вопрос не найден</h1>
        <p>Сессия осталась сохранена. Вернитесь к наборам и запустите её заново.</p>
        <button className="primary-button" onClick={onExit} type="button">
          <ArrowLeft /> К наборам
        </button>
      </main>
    );
  }

  const isBusy = isAdvancing || isCompleting || isRevealing;
  const progress = (question.position / question.total) * 100;

  return (
    <main className="interview-session">
      <header className="interview-session-header">
        <button className="interview-exit" disabled={isBusy} onClick={onComplete} type="button">
          <X /> Завершить
        </button>
        <div>
          <small>{data.session.title}</small>
          <strong>
            Вопрос {question.position} из {question.total}
          </strong>
        </div>
        <div
          className={remainingSeconds <= 60 ? "interview-timer urgent" : "interview-timer"}
          role="timer"
        >
          <Timer />
          <span>
            <small>Осталось</small>
            <strong>{formatInterviewTime(remainingSeconds)}</strong>
          </span>
        </div>
      </header>

      <div
        className="interview-progress"
        aria-label={`Пройдено ${question.position} из ${question.total}`}
      >
        <i style={{ width: `${progress}%` }} />
      </div>

      <article className="interview-question">
        <div className="interview-question-kicker">
          <span>Вопрос {String(question.position).padStart(2, "0")}</span>
          <small>~{Math.ceil(question.estimatedSeconds / 60)} мин на ответ</small>
        </div>
        <h1>{question.prompt}</h1>
        <div className="interview-question-tags">
          {question.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        <label className="interview-notes">
          <span>Тезисы ответа</span>
          <textarea
            aria-label="Тезисы ответа"
            disabled={question.revealed || isBusy}
            maxLength={5_000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Коротко зафиксируйте структуру ответа — поле можно оставить пустым"
            rows={5}
            value={notes}
          />
          <small>{notes.length} / 5000</small>
        </label>
        {question.revealed ? (
          <section className="interview-rubric" aria-labelledby="interview-rubric-title">
            <span className="eyebrow">Разбор открыт</span>
            <h2 id="interview-rubric-title">Сверьте ответ с эталоном</h2>
            <ul>
              {(question.referencePoints ?? []).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="interview-lock-note">
            <Lock />
            <span>
              <strong>Подсказки и эталон скрыты</strong>
              <small>Сформулируйте ответ вслух или тезисами, затем откройте разбор.</small>
            </span>
          </div>
        )}
      </article>

      {actionError && (
        <div className="inline-error" role="alert">
          Не удалось сохранить действие. Проверьте соединение и повторите попытку.
        </div>
      )}

      <div className="interview-actions">
        {question.revealed ? (
          <>
            <p>
              Оцените ответ после сверки. «Не вспомнил» и «Трудно» добавят связанные материалы в
              ближайшее повторение.
            </p>
            <div className="interview-rating-grid" aria-label="Самооценка ответа">
              {ratingOptions.map((option) => (
                <button
                  className={`interview-rating ${option.value}`}
                  disabled={isBusy}
                  key={option.value}
                  onClick={() => onRate(option.value)}
                  type="button"
                >
                  <b>{option.label}</b>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Тезисы сохранятся на сервере и восстановятся после перезагрузки страницы.</p>
            <button
              className="primary-button"
              disabled={isBusy}
              onClick={() => onReveal(notes)}
              type="button"
            >
              {isBusy ? <LoaderCircle className="spin" /> : <BookOpen />}
              {isBusy ? "Сохраняем…" : "Показать разбор"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export function QueryState({
  error,
  loadingTitle = "Готовим задания на сегодня",
  errorTitle = "Не удалось открыть сессию",
  onRetry,
  onReset,
  resetLabel = "К наборам",
}: {
  error?: Error;
  loadingTitle?: string;
  errorTitle?: string;
  onRetry?: () => void;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <main className="query-state" role={error ? "alert" : "status"}>
      <div className={error ? "state-icon error" : "state-icon"}>
        {error ? <AlertTriangle /> : <LoaderCircle className="spin" />}
      </div>
      <h1>{error ? errorTitle : loadingTitle}</h1>
      <p>
        {error instanceof ApiError
          ? `API вернул ошибку ${error.code}.`
          : error
            ? "Проверьте, что API запущен, и повторите запрос."
            : "Создаём гостевой профиль и загружаем ваш прогресс."}
      </p>
      {(onRetry || onReset) && (
        <div className="query-state-actions">
          {onReset && (
            <button className="secondary-button" onClick={onReset} type="button">
              <ArrowLeft /> {resetLabel}
            </button>
          )}
          {onRetry && (
            <button className="primary-button" onClick={onRetry} type="button">
              <RefreshCw /> Повторить
            </button>
          )}
        </div>
      )}
    </main>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const automaticallyOpenedTheoryIds = useRef(new Set<string>());
  const [section, setSection] = useState<Section>(() => {
    if (window.localStorage.getItem(mockInterviewSessionStorageKey)) return "interview";
    if (window.localStorage.getItem(practiceSessionStorageKey)) return "learning";
    return "today";
  });
  const [mode, setMode] = useState<Mode>("dashboard");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [theoryArticleId, setTheoryArticleId] = useState<string | null>(null);
  const [practiceSession, setPracticeSession] = useState<DailySession | null>(null);
  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(() =>
    window.localStorage.getItem(practiceSessionStorageKey),
  );
  const [mockInterviewDuration, setMockInterviewDuration] = useState<MockInterviewDuration>(30);
  const [mockInterviewSessionId, setMockInterviewSessionId] = useState<string | null>(() =>
    window.localStorage.getItem(mockInterviewSessionStorageKey),
  );
  const [mockInterviewReportId, setMockInterviewReportId] = useState<string | null>(null);
  const settingsQuery = useQuery({ queryKey: settingsQueryKey, queryFn: loadSettings, retry: 1 });
  const onboardingCompleted = settingsQuery.data?.onboardingCompleted === true;
  const todayQuery = useQuery({
    queryKey: todayQueryKey,
    queryFn: loadToday,
    enabled: onboardingCompleted,
    retry: 1,
  });
  const statsQuery = useQuery({
    queryKey: statsQueryKey,
    queryFn: loadStats,
    enabled: onboardingCompleted && section === "stats",
    retry: 1,
  });
  const learningQuery = useQuery({
    queryKey: learningQueryKey,
    queryFn: loadLearning,
    enabled: onboardingCompleted && section === "learning",
    retry: 1,
  });
  const theoryCatalogQuery = useQuery({
    queryKey: theoryCatalogQueryKey,
    queryFn: loadTheoryCatalog,
    enabled: onboardingCompleted && section === "theory" && theoryArticleId === null,
    retry: 1,
  });
  const theoryArticleQuery = useQuery({
    queryKey: theoryArticleQueryKey(theoryArticleId ?? "none"),
    queryFn: () => loadTheoryArticle(theoryArticleId ?? ""),
    enabled: onboardingCompleted && section === "theory" && theoryArticleId !== null,
    retry: 1,
  });
  const theoryStateMutation = useMutation({
    mutationFn: updateTheoryState,
    onSuccess: (state, input) => {
      queryClient.setQueryData<TheoryArticleResponse>(
        theoryArticleQueryKey(input.articleId),
        (current) => (current ? { ...current, state } : current),
      );
      queryClient.setQueryData<TheoryCatalogResponse>(theoryCatalogQueryKey, (current) => {
        if (!current) return current;
        const items = current.items.map((item) =>
          item.id === input.articleId ? { ...item, state } : item,
        );
        const completed = items.filter((item) => item.state.status === "completed").length;
        return {
          ...current,
          summary: {
            started: items.filter((item) => item.state.status !== "new").length,
            completed,
            completionPercent: Math.round((completed / current.total) * 100),
            bookmarked: items.filter((item) => item.state.bookmarked).length,
          },
          items,
        };
      });
    },
  });
  const practiceSessionQuery = useQuery({
    queryKey: practiceSessionQueryKey(practiceSessionId ?? "none"),
    queryFn: () => loadPracticeSession(practiceSessionId ?? ""),
    enabled: onboardingCompleted && practiceSessionId !== null,
    retry: 1,
  });
  const mockInterviewCatalogQuery = useQuery({
    queryKey: mockInterviewCatalogQueryKey,
    queryFn: loadMockInterviews,
    enabled: onboardingCompleted && section === "interview" && mockInterviewSessionId === null,
    retry: 1,
  });
  const mockInterviewHistoryQuery = useQuery({
    queryKey: mockInterviewHistoryQueryKey,
    queryFn: loadMockInterviewHistory,
    enabled: onboardingCompleted && section === "interview" && mockInterviewSessionId === null,
    retry: 1,
  });
  const mockInterviewReportQuery = useQuery({
    queryKey: mockInterviewReportQueryKey(mockInterviewReportId ?? "none"),
    queryFn: () => loadMockInterviewReport(mockInterviewReportId ?? ""),
    enabled:
      onboardingCompleted &&
      section === "interview" &&
      mockInterviewSessionId === null &&
      mockInterviewReportId !== null,
    retry: 1,
  });
  const mockInterviewSessionQuery = useQuery({
    queryKey: mockInterviewSessionQueryKey(mockInterviewSessionId ?? "none"),
    queryFn: () => loadMockInterviewSession(mockInterviewSessionId ?? ""),
    enabled: onboardingCompleted && section === "interview" && mockInterviewSessionId !== null,
    retry: 1,
  });
  const enterPracticeSession = (created: DailySession) => {
    queryClient.setQueryData(practiceSessionQueryKey(created.session.id), created);
    window.localStorage.setItem(practiceSessionStorageKey, created.session.id);
    setPracticeSessionId(created.session.id);
    setPracticeSession(created);
    setActiveItemId(created.items[0]?.id ?? null);
    setTheoryArticleId(null);
    setMockInterviewReportId(null);
    setSection("learning");
    setMode("question");
  };
  const practiceMutation = useMutation({
    mutationFn: createPracticeSession,
    onSuccess: enterPracticeSession,
  });
  const mockInterviewPracticeMutation = useMutation({
    mutationFn: createMockInterviewPractice,
    onSuccess: enterPracticeSession,
  });

  useEffect(() => {
    const article = theoryArticleQuery.data;
    if (
      !article ||
      article.state.status !== "new" ||
      automaticallyOpenedTheoryIds.current.has(article.id)
    ) {
      return;
    }
    automaticallyOpenedTheoryIds.current.add(article.id);
    theoryStateMutation.mutate({ articleId: article.id, state: { status: "reading" } });
  }, [theoryArticleQuery.data, theoryStateMutation]);

  useEffect(() => {
    const restored = practiceSessionQuery.data;
    if (!restored) return;
    if (restored.session.status === "completed") {
      window.localStorage.removeItem(practiceSessionStorageKey);
      queryClient.removeQueries({ queryKey: practiceSessionQueryKey(restored.session.id) });
      setPracticeSessionId(null);
      setPracticeSession(null);
      return;
    }
    setPracticeSession(restored);
  }, [practiceSessionQuery.data, queryClient]);
  const startMockInterviewMutation = useMutation({
    mutationFn: startMockInterview,
    onSuccess: (created) => {
      queryClient.setQueryData(mockInterviewSessionQueryKey(created.session.id), created);
      window.localStorage.setItem(mockInterviewSessionStorageKey, created.session.id);
      setMockInterviewReportId(null);
      setMockInterviewSessionId(created.session.id);
    },
  });
  const revealMockInterviewMutation = useMutation({
    mutationFn: revealMockInterview,
    onSuccess: (updated) => {
      queryClient.setQueryData(mockInterviewSessionQueryKey(updated.session.id), updated);
    },
  });
  const advanceMockInterviewMutation = useMutation({
    mutationFn: advanceMockInterview,
    onSuccess: (updated) => {
      queryClient.setQueryData(mockInterviewSessionQueryKey(updated.session.id), updated);
      if (updated.session.status === "completed") {
        void queryClient.invalidateQueries({ queryKey: mockInterviewHistoryQueryKey });
      }
    },
  });
  const completeMockInterviewMutation = useMutation({
    mutationFn: completeMockInterview,
    onSuccess: (updated) => {
      queryClient.setQueryData(mockInterviewSessionQueryKey(updated.session.id), updated);
      void queryClient.invalidateQueries({ queryKey: mockInterviewHistoryQueryKey });
    },
  });
  const session = todayQuery.data;
  const currentSession = section === "learning" ? practiceSession : session;
  const activeItem =
    currentSession?.items.find((item) => item.id === activeItemId) ??
    currentSession?.items.find((item) => item.status !== "answered");
  const activePosition =
    activeItem && currentSession
      ? currentSession.items.findIndex((item) => item.id === activeItem.id) + 1
      : 1;

  const changeSection = (next: Section) => {
    if (next !== "interview") {
      setMockInterviewReportId(null);
      mockInterviewPracticeMutation.reset();
    }
    setSection(next);
    setMode("dashboard");
  };

  const openSession = () => {
    const next = session?.items.find((item) => item.status !== "answered");
    if (!next) return;
    setActiveItemId(next.id);
    setMode("question");
  };

  const handleAnswered = (response: SubmitAnswerResponse) => {
    if (section === "learning") {
      setPracticeSession((current) =>
        current
          ? {
              ...current,
              session: { ...current.session, ...response.session },
              items: current.items.map((item) =>
                item.id === response.answer.contentId ? { ...item, status: "answered" } : item,
              ),
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: learningQueryKey });
      void queryClient.invalidateQueries({ queryKey: statsQueryKey });
      setMode("result");
      return;
    }

    queryClient.setQueryData<DailySession>(todayQueryKey, (current) =>
      current
        ? {
            ...current,
            session: { ...current.session, ...response.session },
            items: current.items.map((item) =>
              item.id === response.answer.contentId ? { ...item, status: "answered" } : item,
            ),
          }
        : current,
    );
    void queryClient.invalidateQueries({ queryKey: statsQueryKey });
    setMode("result");
  };

  const openNext = () => {
    const current =
      section === "learning"
        ? practiceSession
        : queryClient.getQueryData<DailySession>(todayQueryKey);
    if (!current || current.session.status === "completed") {
      if (section === "learning") {
        if (practiceSessionId) {
          queryClient.removeQueries({ queryKey: practiceSessionQueryKey(practiceSessionId) });
        }
        window.localStorage.removeItem(practiceSessionStorageKey);
        setPracticeSessionId(null);
        setPracticeSession(null);
        void queryClient.invalidateQueries({ queryKey: learningQueryKey });
      }
      setMode("dashboard");
      return;
    }
    const currentIndex = current.items.findIndex((item) => item.id === activeItem?.id);
    const next =
      current.items.slice(currentIndex + 1).find((item) => item.status !== "answered") ??
      current.items.find((item) => item.status !== "answered");
    if (!next) {
      setMode("dashboard");
      return;
    }
    setActiveItemId(next.id);
    setMode("question");
  };

  const resumePractice = () => {
    const next = practiceSession?.items.find((item) => item.status !== "answered");
    if (!next) {
      if (practiceSessionId) {
        queryClient.removeQueries({ queryKey: practiceSessionQueryKey(practiceSessionId) });
      }
      window.localStorage.removeItem(practiceSessionStorageKey);
      setPracticeSessionId(null);
      setPracticeSession(null);
      return;
    }
    setActiveItemId(next.id);
    setMode("question");
  };

  const closePracticeSession = () => {
    if (practiceSessionId) {
      queryClient.removeQueries({ queryKey: practiceSessionQueryKey(practiceSessionId) });
    }
    window.localStorage.removeItem(practiceSessionStorageKey);
    setPracticeSessionId(null);
    setPracticeSession(null);
    practiceMutation.reset();
  };

  const cacheSettings = (settings: UserSettings) => {
    queryClient.setQueryData(settingsQueryKey, settings);
  };

  const completeOnboarding = (settings: UserSettings) => {
    cacheSettings(settings);
    setSection("today");
    setMode("dashboard");
  };

  const closeMockInterview = () => {
    if (mockInterviewSessionId) {
      queryClient.removeQueries({ queryKey: mockInterviewSessionQueryKey(mockInterviewSessionId) });
    }
    window.localStorage.removeItem(mockInterviewSessionStorageKey);
    setMockInterviewSessionId(null);
    startMockInterviewMutation.reset();
    revealMockInterviewMutation.reset();
    advanceMockInterviewMutation.reset();
    completeMockInterviewMutation.reset();
    mockInterviewPracticeMutation.reset();
  };

  const openCompletedMockInterviewReport = () => {
    if (!mockInterviewSessionId) return;
    const sessionId = mockInterviewSessionId;
    queryClient.removeQueries({ queryKey: mockInterviewSessionQueryKey(sessionId) });
    window.localStorage.removeItem(mockInterviewSessionStorageKey);
    setMockInterviewSessionId(null);
    setMockInterviewReportId(sessionId);
    startMockInterviewMutation.reset();
    revealMockInterviewMutation.reset();
    advanceMockInterviewMutation.reset();
    completeMockInterviewMutation.reset();
    mockInterviewPracticeMutation.reset();
  };

  if (settingsQuery.isPending) {
    return (
      <div className="onboarding-shell">
        <QueryState />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="onboarding-shell">
        <QueryState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />
      </div>
    );
  }

  if (settingsQuery.data && !settingsQuery.data.onboardingCompleted) {
    return (
      <div className="onboarding-shell">
        <SettingsForm initial={settingsQuery.data} onboarding onSaved={completeOnboarding} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={section}
        answered={session?.session.answered ?? 0}
        total={session?.session.total ?? 0}
        onChange={changeSection}
      />
      <div className="app-content">
        {section === "today" && todayQuery.isPending && <QueryState />}
        {section === "today" && todayQuery.isError && (
          <QueryState error={todayQuery.error} onRetry={() => void todayQuery.refetch()} />
        )}
        {section === "today" && session && mode === "dashboard" && (
          <Dashboard session={session} onContinue={openSession} />
        )}
        {section === "today" && session && activeItem && mode !== "dashboard" && (
          <QuestionFlow
            answered={session.session.answered}
            item={activeItem}
            key={activeItem.id}
            mode={mode}
            position={activePosition}
            sessionId={session.session.id}
            total={session.session.total}
            onAnswered={handleAnswered}
            onBack={() => setMode("dashboard")}
            onNext={openNext}
          />
        )}
        {section === "learning" && practiceSession && activeItem && mode !== "dashboard" && (
          <QuestionFlow
            answered={practiceSession.session.answered}
            item={activeItem}
            key={`${practiceSession.session.id}:${activeItem.id}`}
            mode={mode}
            position={activePosition}
            sessionId={practiceSession.session.id}
            total={practiceSession.session.total}
            onAnswered={handleAnswered}
            onBack={() => setMode("dashboard")}
            onNext={openNext}
          />
        )}
        {section === "settings" && settingsQuery.data && (
          <SettingsForm initial={settingsQuery.data} onboarding={false} onSaved={cacheSettings} />
        )}
        {section === "stats" && statsQuery.isPending && (
          <QueryState loadingTitle="Собираем статистику" />
        )}
        {section === "stats" && statsQuery.isError && (
          <QueryState
            error={statsQuery.error}
            errorTitle="Не удалось загрузить статистику"
            onRetry={() => void statsQuery.refetch()}
          />
        )}
        {section === "stats" && statsQuery.data && <StatsPage stats={statsQuery.data} />}
        {section === "theory" && theoryArticleId === null && theoryCatalogQuery.isPending && (
          <QueryState loadingTitle="Открываем базу знаний" />
        )}
        {section === "theory" && theoryArticleId === null && theoryCatalogQuery.isError && (
          <QueryState
            error={theoryCatalogQuery.error}
            errorTitle="Не удалось загрузить теорию"
            onRetry={() => void theoryCatalogQuery.refetch()}
          />
        )}
        {section === "theory" && theoryArticleId === null && theoryCatalogQuery.data && (
          <TheoryCatalogPage catalog={theoryCatalogQuery.data} onOpen={setTheoryArticleId} />
        )}
        {section === "theory" && theoryArticleId !== null && theoryArticleQuery.isPending && (
          <QueryState loadingTitle="Открываем главу" />
        )}
        {section === "theory" && theoryArticleId !== null && theoryArticleQuery.isError && (
          <QueryState
            error={theoryArticleQuery.error}
            errorTitle="Не удалось открыть главу"
            onReset={() => setTheoryArticleId(null)}
            onRetry={() => void theoryArticleQuery.refetch()}
            resetLabel="К каталогу"
          />
        )}
        {section === "theory" && theoryArticleId !== null && theoryArticleQuery.data && (
          <TheoryArticlePage
            article={theoryArticleQuery.data}
            isSaving={theoryStateMutation.isPending}
            isStarting={practiceMutation.isPending}
            onBack={() => setTheoryArticleId(null)}
            onPractice={(contentIds) => practiceMutation.mutate(contentIds)}
            onStateChange={(state) =>
              theoryStateMutation.mutate({ articleId: theoryArticleId, state })
            }
            practiceError={practiceMutation.isError}
            stateError={theoryStateMutation.isError}
          />
        )}
        {section === "learning" &&
          mode === "dashboard" &&
          practiceSessionId !== null &&
          (practiceSessionQuery.isPending ||
            (practiceSessionQuery.isSuccess && practiceSession === null)) && (
            <QueryState loadingTitle="Восстанавливаем тренировку" />
          )}
        {section === "learning" &&
          mode === "dashboard" &&
          practiceSessionId !== null &&
          practiceSessionQuery.isError && (
            <QueryState
              error={practiceSessionQuery.error}
              errorTitle="Не удалось восстановить тренировку"
              onReset={closePracticeSession}
              onRetry={() => void practiceSessionQuery.refetch()}
            />
          )}
        {section === "learning" &&
          mode === "dashboard" &&
          practiceSessionId === null &&
          learningQuery.isPending && <QueryState loadingTitle="Открываем библиотеку" />}
        {section === "learning" &&
          mode === "dashboard" &&
          practiceSessionId === null &&
          learningQuery.isError && (
            <QueryState
              error={learningQuery.error}
              errorTitle="Не удалось загрузить материалы"
              onRetry={() => void learningQuery.refetch()}
            />
          )}
        {section === "learning" &&
          mode === "dashboard" &&
          (practiceSessionId === null || practiceSession !== null) &&
          learningQuery.data && (
            <LearningPage
              catalog={learningQuery.data}
              isStarting={practiceMutation.isPending}
              practice={practiceSession}
              startError={practiceMutation.isError}
              onResume={resumePractice}
              onStart={(contentIds) => practiceMutation.mutate(contentIds)}
            />
          )}
        {section === "interview" &&
          mockInterviewSessionId === null &&
          mockInterviewReportId === null &&
          mockInterviewCatalogQuery.isPending && (
            <QueryState loadingTitle="Готовим наборы для интервью" />
          )}
        {section === "interview" &&
          mockInterviewSessionId === null &&
          mockInterviewReportId === null &&
          mockInterviewCatalogQuery.isError && (
            <QueryState
              error={mockInterviewCatalogQuery.error}
              errorTitle="Не удалось загрузить mock-интервью"
              onRetry={() => void mockInterviewCatalogQuery.refetch()}
            />
          )}
        {section === "interview" &&
          mockInterviewSessionId === null &&
          mockInterviewReportId === null &&
          mockInterviewCatalogQuery.data && (
            <InterviewCatalogPage
              catalog={mockInterviewCatalogQuery.data}
              duration={mockInterviewDuration}
              history={mockInterviewHistoryQuery.data}
              historyError={mockInterviewHistoryQuery.isError}
              historyLoading={mockInterviewHistoryQuery.isPending}
              isStarting={startMockInterviewMutation.isPending}
              startError={startMockInterviewMutation.isError}
              onDurationChange={setMockInterviewDuration}
              onHistoryRetry={() => void mockInterviewHistoryQuery.refetch()}
              onOpenHistory={(sessionId) => {
                mockInterviewPracticeMutation.reset();
                setMockInterviewReportId(sessionId);
              }}
              onStart={(setId) =>
                startMockInterviewMutation.mutate({
                  setId,
                  durationMinutes: mockInterviewDuration,
                })
              }
            />
          )}
        {section === "interview" &&
          mockInterviewSessionId === null &&
          mockInterviewReportId !== null &&
          mockInterviewReportQuery.isPending && (
            <QueryState loadingTitle="Собираем отчёт интервью" />
          )}
        {section === "interview" &&
          mockInterviewSessionId === null &&
          mockInterviewReportId !== null &&
          mockInterviewReportQuery.isError && (
            <QueryState
              error={mockInterviewReportQuery.error}
              errorTitle="Не удалось открыть отчёт"
              onReset={() => {
                mockInterviewPracticeMutation.reset();
                setMockInterviewReportId(null);
              }}
              onRetry={() => void mockInterviewReportQuery.refetch()}
              resetLabel="К истории"
            />
          )}
        {section === "interview" &&
          mockInterviewSessionId === null &&
          mockInterviewReportId !== null &&
          mockInterviewReportQuery.data && (
            <InterviewReportPage
              isStartingPractice={mockInterviewPracticeMutation.isPending}
              practiceError={mockInterviewPracticeMutation.isError}
              report={mockInterviewReportQuery.data}
              onBack={() => {
                mockInterviewPracticeMutation.reset();
                setMockInterviewReportId(null);
              }}
              onPractice={() => {
                if (!mockInterviewPracticeMutation.isPending) {
                  mockInterviewPracticeMutation.mutate(mockInterviewReportId);
                }
              }}
            />
          )}
        {section === "interview" &&
          mockInterviewSessionId !== null &&
          mockInterviewSessionQuery.isPending && (
            <QueryState loadingTitle="Восстанавливаем интервью" />
          )}
        {section === "interview" &&
          mockInterviewSessionId !== null &&
          mockInterviewSessionQuery.isError && (
            <QueryState
              error={mockInterviewSessionQuery.error}
              errorTitle="Не удалось восстановить интервью"
              onReset={closeMockInterview}
              onRetry={() => void mockInterviewSessionQuery.refetch()}
            />
          )}
        {section === "interview" &&
          mockInterviewSessionId !== null &&
          mockInterviewSessionQuery.data && (
            <InterviewSessionPage
              actionError={
                revealMockInterviewMutation.isError ||
                advanceMockInterviewMutation.isError ||
                completeMockInterviewMutation.isError
              }
              data={mockInterviewSessionQuery.data}
              isAdvancing={advanceMockInterviewMutation.isPending}
              isCompleting={completeMockInterviewMutation.isPending}
              isRevealing={revealMockInterviewMutation.isPending}
              onComplete={() => {
                if (!completeMockInterviewMutation.isPending) {
                  completeMockInterviewMutation.mutate(mockInterviewSessionId);
                }
              }}
              onExit={closeMockInterview}
              onRate={(rating) => {
                const question = mockInterviewSessionQuery.data.question;
                if (question && !advanceMockInterviewMutation.isPending) {
                  advanceMockInterviewMutation.mutate({
                    sessionId: mockInterviewSessionId,
                    questionId: question.id,
                    rating,
                  });
                }
              }}
              onReview={openCompletedMockInterviewReport}
              onReveal={(notes) => {
                const question = mockInterviewSessionQuery.data.question;
                if (question && !revealMockInterviewMutation.isPending) {
                  revealMockInterviewMutation.mutate({
                    sessionId: mockInterviewSessionId,
                    questionId: question.id,
                    notes,
                  });
                }
              }}
              onTimeout={() => {
                if (!completeMockInterviewMutation.isPending) {
                  completeMockInterviewMutation.mutate(mockInterviewSessionId);
                }
              }}
            />
          )}
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            className={section === id ? "active" : ""}
            key={id}
            onClick={() => changeSection(id)}
            type="button"
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
