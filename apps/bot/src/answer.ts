import type { BotAnswerResponse } from "@mentor/shared";

import { BotApiError } from "./api.js";

export type AnswerCallbackResult = {
  text: string;
  showNextButton: boolean;
  showAppButton: boolean;
};

export type SubmitAnswer = (
  telegramUserId: string,
  callbackData: string,
) => Promise<BotAnswerResponse>;

export async function processAnswerCallback(
  telegramUserId: string,
  callbackData: string,
  submitAnswer: SubmitAnswer,
): Promise<AnswerCallbackResult> {
  try {
    const result = await submitAnswer(telegramUserId, callbackData);
    const completed = result.session.status === "completed";
    return {
      showNextButton: !completed,
      showAppButton: true,
      text: [
        result.answer.isCorrect ? "✅ Верно" : "❌ Пока неверно",
        result.feedback.explanation,
        completed
          ? `Сессия завершена: ${result.session.answered} из ${result.session.total}.`
          : `Прогресс: ${result.session.answered} из ${result.session.total}.`,
      ].join("\n\n"),
    };
  } catch (error) {
    if (error instanceof BotApiError) {
      if (error.code === "CALLBACK_EXPIRED") {
        return {
          showNextButton: true,
          showAppButton: true,
          text: "Кнопка устарела. Запросите актуальный вопрос.",
        };
      }
      if (error.code === "ALREADY_ANSWERED" || error.code === "SESSION_COMPLETED") {
        return {
          showNextButton: true,
          showAppButton: true,
          text: "На этот вопрос уже сохранён ответ. Перейдите к актуальному заданию.",
        };
      }
      if (error.code === "CALLBACK_NOT_FOUND") {
        return {
          showNextButton: false,
          showAppButton: false,
          text: "Эта кнопка недоступна для текущего профиля.",
        };
      }
    }

    return {
      showNextButton: true,
      showAppButton: true,
      text: "Не удалось сохранить ответ. Попробуйте ещё раз или откройте сессию на сайте.",
    };
  }
}
