import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type TheoryArticleResponse } from "./api";
import { ProgressRing, QueryState, TheoryArticlePage, TheoryCatalogPage } from "./App";

describe("shared application states", () => {
  it("exposes progress as an accessible progressbar", () => {
    const markup = renderToStaticMarkup(<ProgressRing label="Изучено" value={42} />);

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain('aria-label="Изучено"');
    expect(markup).toContain("42%");
  });

  it("announces loading without presenting it as an error", () => {
    const markup = renderToStaticMarkup(<QueryState loadingTitle="Восстанавливаем тренировку" />);

    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('role="alert"');
    expect(markup).toContain("Восстанавливаем тренировку");
  });

  it("announces a typed API error and renders recovery actions", () => {
    const markup = renderToStaticMarkup(
      <QueryState
        error={new ApiError("PRACTICE_SESSION_NOT_FOUND", 404)}
        errorTitle="Не удалось восстановить тренировку"
        onReset={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Не удалось восстановить тренировку");
    expect(markup).toContain("API вернул ошибку PRACTICE_SESSION_NOT_FOUND.");
    expect(markup).toContain("К наборам");
    expect(markup).toContain("Повторить");
  });

  it("renders searchable theory summaries without exposing full chapters", () => {
    const markup = renderToStaticMarkup(
      <TheoryCatalogPage
        catalog={{
          total: 1,
          summary: { started: 0, completed: 0, completionPercent: 0, bookmarked: 0 },
          items: [
            {
              id: "theory-js-closures",
              topic: "javascript",
              slug: "javascript-closures",
              title: "Замыкания и лексическое окружение",
              summary: "Функция сохраняет доступ к переменным своего лексического окружения.",
              estimatedMinutes: 7,
              state: {
                articleId: "theory-js-closures",
                status: "new",
                bookmarked: false,
                lastOpenedAt: null,
                completedAt: null,
              },
            },
          ],
        }}
        onOpen={vi.fn()}
      />,
    );

    expect(markup).toContain("Теория без воды");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain('aria-label="Найти теоретическую тему"');
    expect(markup).toContain("Замыкания и лексическое окружение");
    expect(markup).not.toContain("createRequestCounter");
  });

  it("renders a full theory chapter as text and code with attributed references", () => {
    const article: TheoryArticleResponse = {
      id: "theory-js-closures",
      version: 1,
      topic: "javascript",
      slug: "javascript-closures",
      title: "Замыкания и лексическое окружение",
      summary:
        "Замыкание позволяет функции продолжать обращаться к переменным из места своего создания.",
      estimatedMinutes: 7,
      relatedContentIds: ["js-closure-scope-001", "js-var-loop-006"],
      sections: [
        {
          heading: "Что сохраняет функция",
          paragraphs: [
            "Функция получает связь с окружающим лексическим окружением и использует её позже.",
          ],
          example: {
            title: "Счётчик запросов",
            language: "javascript",
            code: "const createRequestCounter = () => 1;",
            explanation: "Каждый вызов фабрики создаёт своё независимое состояние счётчика.",
          },
        },
        {
          heading: "Время жизни окружения",
          paragraphs: [
            "Окружение остаётся доступным, пока существует функция, которая на него ссылается.",
          ],
        },
      ],
      keyPoints: [
        "Область поиска определяется местом объявления функции.",
        "Функции могут разделять одну изменяемую привязку.",
        "Замыкание может продлевать время жизни объектов.",
      ],
      sourceIds: ["hackfrontend:javascript/closures"],
      references: [
        {
          label: "MDN JavaScript Guide — Closures",
          url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures",
          kind: "primary",
        },
        {
          label: "Hack Frontend — замыкания",
          url: "https://www.hackfrontend.com/ru/docs/javascript/closures",
          kind: "topic-source",
        },
      ],
      state: {
        articleId: "theory-js-closures",
        status: "reading",
        bookmarked: false,
        lastOpenedAt: "2026-07-17T10:00:00.000Z",
        completedAt: null,
      },
    };
    const markup = renderToStaticMarkup(<TheoryArticlePage article={article} onBack={vi.fn()} />);

    expect(markup).toContain("Что сохраняет функция");
    expect(markup).toContain("createRequestCounter");
    expect(markup).toContain("MDN JavaScript Guide — Closures");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain("Добавить в закладки");
    expect(markup).toContain("Отметить прочитанным");
    expect(markup).toContain("Тренировать тему · 2");
  });
});
