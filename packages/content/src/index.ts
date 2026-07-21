import {
  mockInterviewCatalogSchema,
  validateTheoryCollection,
  validateContentCollection,
  type ContentItem,
  type MockInterviewCatalog,
  type SingleChoiceItem,
  type TheoryArticle,
  type Topic,
} from "@mentor/shared";

import { rawContentItems } from "./catalog.js";
import { rawMockInterviewCatalog } from "./interview-catalog.js";
import { hackFrontendKnowledgeBase } from "./sources/index.js";
import { rawTheoryArticles } from "./theory-catalog.js";

export {
  getKnowledgeSourceStats,
  hackFrontendKnowledgeBase,
  searchKnowledgeSources,
  validateKnowledgeSourceSnapshot,
  type KnowledgeSource,
  type KnowledgeSourceSnapshot,
} from "./sources/index.js";

export const contentItems = validateContentCollection(rawContentItems);

export function validateTheoryContent(input: unknown): TheoryArticle[] {
  const articles = validateTheoryCollection(input);
  const sourceIds = new Set(hackFrontendKnowledgeBase.items.map((source) => source.id));
  const contentTopicById = new Map(contentItems.map((item) => [item.id, item.topic]));
  for (const article of articles) {
    for (const sourceId of article.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(`Теория ${article.id} ссылается на отсутствующий источник ${sourceId}`);
      }
    }
    for (const contentId of article.relatedContentIds) {
      if (!contentTopicById.has(contentId)) {
        throw new Error(`Теория ${article.id} связана с отсутствующим заданием ${contentId}`);
      }
    }
    if (
      !article.relatedContentIds.some(
        (contentId) => contentTopicById.get(contentId) === article.topic,
      )
    ) {
      throw new Error(`Теория ${article.id} должна содержать задание своей темы ${article.topic}`);
    }
  }
  return articles;
}

export const theoryArticles = validateTheoryContent(rawTheoryArticles);

export function validateMockInterviewContent(
  input: unknown,
  items: ContentItem[] = contentItems,
): MockInterviewCatalog {
  const catalog = mockInterviewCatalogSchema.parse(input);
  const contentIds = new Set(items.map((item) => item.id));
  for (const question of catalog.questions) {
    for (const contentId of question.relatedContentIds) {
      if (!contentIds.has(contentId)) {
        throw new Error(`Вопрос ${question.id} связан с отсутствующим материалом ${contentId}`);
      }
    }
  }
  return catalog;
}

export const mockInterviewCatalog = validateMockInterviewContent(rawMockInterviewCatalog);

const starterIds = ["js-array-map-003", "react-effect-deps-003"];

export const starterItems: SingleChoiceItem[] = starterIds.map((id) => {
  const item = contentItems.find((candidate) => candidate.id === id);
  if (!item || item.type !== "single_choice") {
    throw new Error(`Starter item ${id} должен существовать и иметь тип single_choice`);
  }
  return item;
});

export function getContentStats(items: ContentItem[] = contentItems) {
  const byTopic = Object.fromEntries(
    (["javascript", "typescript", "react", "browser", "node", "css"] satisfies Topic[]).map(
      (topic) => [topic, items.filter((item) => item.topic === topic).length],
    ),
  ) as Record<Topic, number>;

  const byType = items.reduce<Record<string, number>>((stats, item) => {
    stats[item.type] = (stats[item.type] ?? 0) + 1;
    return stats;
  }, {});

  return { total: items.length, byTopic, byType };
}

export function getMockInterviewStats(catalog: MockInterviewCatalog = mockInterviewCatalog) {
  return {
    sets: catalog.sets.length,
    questions: catalog.questions.length,
    tracks: catalog.sets.map((set) => set.track),
  };
}

export function getTheoryStats(articles: TheoryArticle[] = theoryArticles) {
  const byTopic = Object.fromEntries(
    (["javascript", "typescript", "react", "browser", "node", "css"] satisfies Topic[]).map(
      (topic) => [topic, articles.filter((article) => article.topic === topic).length],
    ),
  ) as Record<Topic, number>;
  return { total: articles.length, byTopic };
}

export { rawContentItems } from "./catalog.js";
export { rawMockInterviewCatalog } from "./interview-catalog.js";
export { rawTheoryArticles } from "./theory-catalog.js";
