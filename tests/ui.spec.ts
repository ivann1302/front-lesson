import { expect, test } from "@playwright/test";

test("daily session works from dashboard to explanation", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Настроим ежедневную практику" })).toBeVisible();
  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-onboarding-desktop.png"
        : "/tmp/frontend-mentor-onboarding-mobile.png",
  });
  await page.getByRole("button", { name: "Начать обучение" }).click();
  await expect(page.getByRole("heading", { name: /^Добр/ })).toBeVisible();
  await expect(page.getByText("0 из 5 заданий")).toBeVisible();

  if (testInfo.project.name === "desktop-chromium") {
    await page.screenshot({ path: "/tmp/frontend-mentor-desktop.png" });
  } else {
    await page.screenshot({ path: "/tmp/frontend-mentor-mobile.png" });
  }

  await page.getByRole("button", { name: "Начать" }).click();
  await expect(
    page.getByRole("heading", { name: "Что такое замыкание в JavaScript?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Хорошо/ }).click();
  await page.getByRole("button", { name: "Показать разбор" }).click();
  await expect(page.getByText("Самооценка сохранена")).toBeVisible();
  await page.getByRole("button", { name: /Следующее/ }).click();

  await expect(
    page.getByRole("heading", { name: "Чем microtask отличается от обычной task?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Хорошо/ }).click();
  await page.getByRole("button", { name: "Показать разбор" }).click();
  await page.getByRole("button", { name: /Следующее/ }).click();

  await expect(page.getByRole("heading", { name: "Что выведет код в консоль?" })).toBeVisible();
  await page.getByRole("button", { name: /A \[1, 2, 3\]/ }).click();
  await page.getByRole("button", { name: "Проверить ответ" }).click();
  await expect(page.getByText("Верно — механизм понятен")).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    await page.screenshot({ path: "/tmp/frontend-mentor-result.png" });
  }

  await page.getByRole("button", { name: /Следующее/ }).click();
  await page.getByText("Назад к сессии", { exact: true }).click();
  await expect(page.getByText("3 из 5 заданий")).toBeVisible();

  await page.reload();
  await expect(page.getByText("3 из 5 заданий")).toBeVisible();

  const navigation =
    testInfo.project.name === "desktop-chromium"
      ? page.locator(".sidebar")
      : page.locator(".mobile-nav");
  await navigation.getByRole("button", { name: "Статистика" }).click();
  await expect(page.getByRole("heading", { name: "Статистика", exact: true })).toBeVisible();
  await expect(page.getByText("100% правильных")).toBeVisible();
  await expect(page.locator(".metric-card.blue strong")).toHaveText("3");
  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-stats-desktop.png"
        : "/tmp/frontend-mentor-stats-mobile.png",
  });

  await navigation.getByRole("button", { name: "Настройки" }).click();
  await expect(page.getByRole("heading", { name: "Настройки", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Получить код" }).click();
  await expect(page.locator(".telegram-link-copy code")).toHaveText(/^[A-HJ-NP-Z2-9]{8}$/);
  await page.locator(".limit-picker").getByRole("button", { name: "3" }).click();
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();

  await page.reload();
  await navigation.getByRole("button", { name: "Настройки" }).click();
  await expect(page.locator(".limit-picker").getByRole("button", { name: "3" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("learning catalog filters materials and starts a practice session", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Настроим ежедневную практику" })).toBeVisible();
  await page.getByRole("button", { name: "Начать обучение" }).click();

  const navigation =
    testInfo.project.name === "desktop-chromium"
      ? page.locator(".sidebar")
      : page.locator(".mobile-nav");
  await navigation.getByRole("button", { name: "Обучение" }).click();

  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  await expect(page.getByText("60 материалов", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /React 10/ }).click();
  await expect(page.getByText("10 найдено", { exact: true })).toBeVisible();

  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-learning-desktop.png"
        : "/tmp/frontend-mentor-learning-mobile.png",
  });

  await page.getByRole("button", { name: /Что React называет reconciliation/ }).click();
  const detail = page.locator(".learning-detail");
  await expect(
    detail.getByRole("heading", { name: "Что React называет reconciliation?" }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Тренировать материал" }).click();

  await expect(
    page.getByRole("heading", { name: "Что React называет reconciliation?" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Продолжить тренировку/ }).click();
  await expect(
    page.getByRole("heading", { name: "Что React называет reconciliation?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Хорошо/ }).click();
  await page.getByRole("button", { name: "Показать разбор" }).click();
  await expect(page.getByText("Самооценка сохранена")).toBeVisible();
  await page.getByRole("button", { name: "Завершить" }).click();

  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  await expect(page.locator(".learning-progress-copy > strong")).toContainText("1 / 60");
  await page.getByRole("searchbox", { name: "Найти тему, тег или вопрос" }).fill("reconciliation");
  await expect(page.getByText("1 найдено", { exact: true })).toBeVisible();
});

test("theory catalog filters chapters and opens the full attributed article", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Настроим ежедневную практику" })).toBeVisible();
  await page.getByRole("button", { name: "Начать обучение" }).click();

  const navigation =
    testInfo.project.name === "desktop-chromium"
      ? page.locator(".sidebar")
      : page.locator(".mobile-nav");
  await navigation.getByRole("button", { name: "Теория" }).click();

  await expect(page.getByRole("heading", { name: "Теория без воды" })).toBeVisible();
  await expect(page.locator(".theory-card")).toHaveCount(18);
  await expect(page.getByRole("progressbar", { name: "Прочитано 0 из 18" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await page.getByRole("button", { name: /TypeScript 3/ }).click();
  await page.getByRole("searchbox", { name: "Найти теоретическую тему" }).fill("generics");
  await expect(page.getByText("1 найдено", { exact: true })).toBeVisible();
  await expect(page.locator(".theory-card")).toHaveCount(1);

  await page.locator(".theory-card").click();
  await expect(
    page.getByRole("heading", { name: "Generics без потери информации о типе" }),
  ).toBeVisible();
  await expect(page.locator(".theory-example code")).toContainText("indexById");
  await expect(page.getByRole("link", { name: /TypeScript Handbook/ })).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.getByRole("button", { name: "Добавить в закладки" }).click();
  await expect(page.getByRole("button", { name: "Убрать из закладок" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Отметить прочитанным" }).click();
  await expect(page.getByRole("button", { name: "Прочитано" })).toBeDisabled();

  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-theory-desktop.png"
        : "/tmp/frontend-mentor-theory-mobile.png",
  });

  await page.getByRole("button", { name: "К базе знаний" }).click();
  await expect(page.getByRole("progressbar", { name: "Прочитано 1 из 18" })).toHaveAttribute(
    "aria-valuenow",
    "6",
  );
  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-theory-catalog-desktop.png"
        : "/tmp/frontend-mentor-theory-catalog-mobile.png",
  });
  await page.getByRole("button", { name: /Закладки 1/ }).click();
  await expect(page.locator(".theory-card")).toHaveCount(1);
  await expect(page.getByText("Generics без потери информации о типе")).toBeVisible();

  await page.reload();
  await navigation.getByRole("button", { name: "Теория" }).click();
  await page.getByRole("button", { name: /Закладки 1/ }).click();
  await expect(page.locator(".theory-card")).toHaveCount(1);
  await expect(page.getByText("Generics без потери информации о типе")).toBeVisible();

  await page.getByRole("button", { name: /Все 18/ }).click();
  await page.getByRole("button", { name: "Все главы" }).click();
  await page.getByRole("searchbox", { name: "Найти теоретическую тему" }).fill("cors");
  await expect(page.locator(".theory-card")).toHaveCount(1);
  await expect(page.getByText("CORS как протокол разрешения cross-origin запросов")).toBeVisible();

  await page.getByRole("searchbox", { name: "Найти теоретическую тему" }).fill("conditional types");
  await expect(page.locator(".theory-card")).toHaveCount(1);
  await page.locator(".theory-card").click();
  await expect(
    page.getByRole("heading", { name: "Conditional types и извлечение связанного типа" }),
  ).toBeVisible();
  await expect(page.locator(".theory-example code")).toContainText("EndpointMap");
  await page.getByRole("button", { name: "Тренировать тему · 2" }).click();
  await expect(page.getByText("Задание 1 из 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Какой тип получится у Result?" })).toBeVisible();
});

test("mock interview saves notes, reveals the rubric and schedules weak topics", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Настроим ежедневную практику" })).toBeVisible();
  await page.getByRole("button", { name: "Начать обучение" }).click();

  const navigation =
    testInfo.project.name === "desktop-chromium"
      ? page.locator(".sidebar")
      : page.locator(".mobile-nav");
  await navigation.getByRole("button", { name: "Интервью" }).click();

  await expect(page.getByRole("heading", { name: "Mock-интервью" })).toBeVisible();
  await expect(page.locator(".interview-set-card")).toHaveCount(6);
  await page.getByRole("button", { name: "15 мин" }).click();
  await expect(page.getByRole("button", { name: "15 мин" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const reactSet = page.locator(".interview-set-card").filter({
    has: page.getByRole("heading", { name: "React", exact: true }),
  });
  await reactSet.getByRole("button", { name: "Начать интервью" }).click();

  await expect(page.getByText("Вопрос 1 из 5", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Объясните reconciliation в React и почему стабильный key важнее уникального индекса массива.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("timer").locator("strong")).toHaveText(/^(15:00|14:\d{2})$/);
  await expect(page.getByText("Подсказки и эталон скрыты")).toBeVisible();
  await expect(
    page.getByText("React сопоставляет элементы одинакового уровня", { exact: false }),
  ).toHaveCount(0);

  const notes = page.getByRole("textbox", { name: "Тезисы ответа" });
  await notes.fill("React сравнивает элементы по типу и стабильному key.");

  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-interview-desktop.png"
        : "/tmp/frontend-mentor-interview-mobile.png",
  });

  await page.getByRole("button", { name: "Показать разбор" }).click();
  await expect(page.getByRole("heading", { name: "Сверьте ответ с эталоном" })).toBeVisible();
  await expect(
    page.getByText("React сопоставляет элементы одинакового уровня", { exact: false }),
  ).toBeVisible();
  await expect(notes).toBeDisabled();
  await expect(notes).toHaveValue("React сравнивает элементы по типу и стабильному key.");

  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-interview-review-desktop.png"
        : "/tmp/frontend-mentor-interview-review-mobile.png",
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Сверьте ответ с эталоном" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Тезисы ответа" })).toHaveValue(
    "React сравнивает элементы по типу и стабильному key.",
  );

  await page.getByRole("button", { name: /^Трудно/ }).click();
  await expect(page.getByText("Вопрос 2 из 5", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Вопрос 2 из 5", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Как организовать загрузку данных в effect без устаревших ответов, утечек и неверных dependencies?",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(page.getByText("Сессия завершена", { exact: true })).toBeVisible();
  await expect(page.getByText("слабых ответов в повторении", { exact: true })).toBeVisible();
  await expect(
    page.locator(".interview-complete-stats span").filter({
      hasText: "слабых ответов в повторении",
    }),
  ).toContainText("1");
  await page.getByRole("button", { name: "Посмотреть разбор" }).click();
  await expect(page.getByRole("heading", { name: "Разбор интервью: React" })).toBeVisible();
  await expect(
    page.getByText("React сравнивает элементы по типу и стабильному key.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Трудно", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Связанные материалы добавлены в повторение", { exact: true }),
  ).toBeVisible();

  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-interview-report-desktop.png"
        : "/tmp/frontend-mentor-interview-report-mobile.png",
  });

  await page.getByRole("button", { name: "К истории" }).click();
  await expect(page.getByRole("heading", { name: "Mock-интервью" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Динамика интервью" })).toBeVisible();
  await expect(
    page.locator(".interview-analytics-summary").getByText("0%", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("#react", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Прошлые интервью" })).toBeVisible();
  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "/tmp/frontend-mentor-interview-history-desktop.png"
        : "/tmp/frontend-mentor-interview-history-mobile.png",
    fullPage: true,
  });
  const historyCard = page.locator(".interview-history-card").filter({ hasText: "React" });
  await expect(historyCard).toContainText("1 слабых");
  await historyCard.click();
  await expect(page.getByRole("heading", { name: "Разбор интервью: React" })).toBeVisible();
  await page.getByRole("button", { name: "Тренировать слабые темы" }).click();
  await expect(page.getByText("Задание 1 из 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Что React называет reconciliation?" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Продолжить тренировку/ }).click();
  await expect(page.getByText("Задание 1 из 2", { exact: true })).toBeVisible();
});
