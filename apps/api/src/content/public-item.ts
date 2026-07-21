import type { ContentItem } from "@mentor/shared";

const publicBase = (item: ContentItem) => ({
  id: item.id,
  version: item.version,
  type: item.type,
  topic: item.topic,
  subtopic: item.subtopic,
  difficulty: item.difficulty,
  tags: item.tags,
  prompt: item.prompt,
  estimatedSeconds: item.estimatedSeconds,
});

export function toPublicContentItem(item: ContentItem) {
  const base = publicBase(item);

  switch (item.type) {
    case "term":
      return { ...base, term: item.term };
    case "flashcard":
      return base;
    case "single_choice":
    case "multiple_choice":
      return {
        ...base,
        options: item.options,
        ...(item.code ? { code: item.code, language: item.language } : {}),
      };
    case "code_output":
    case "find_bug":
      return { ...base, code: item.code, language: item.language };
    case "interview_question":
      return base;
  }
}
