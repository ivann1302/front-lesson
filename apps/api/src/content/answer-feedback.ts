import type { ContentItem } from "@mentor/shared";

export function toAnswerFeedback(item: ContentItem) {
  const base = { explanation: item.explanation };

  switch (item.type) {
    case "term":
      return { ...base, definition: item.definition };
    case "flashcard":
      return { ...base, answer: item.answer };
    case "single_choice":
    case "multiple_choice":
      return { ...base, correctOptionIds: item.correctOptionIds };
    case "code_output":
      return { ...base, answer: item.answer };
    case "find_bug":
      return { ...base, answer: item.answer, solution: item.solution };
    case "interview_question":
      return { ...base, rubric: item.rubric, referencePoints: item.referencePoints };
  }
}
