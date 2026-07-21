import type { CodeLanguage, ContentItem, Topic } from "@mentor/shared";

type ItemMeta = {
  id: string;
  version: number;
  topic: Topic;
  subtopic: string;
  difficulty: "middle";
  tags: string[];
  prompt: string;
  explanation: string;
  estimatedSeconds: number;
};

type TermItem = Extract<ContentItem, { type: "term" }>;
type FlashcardItem = Extract<ContentItem, { type: "flashcard" }>;
type SingleChoiceItem = Extract<ContentItem, { type: "single_choice" }>;
type MultipleChoiceItem = Extract<ContentItem, { type: "multiple_choice" }>;
type CodeOutputItem = Extract<ContentItem, { type: "code_output" }>;
type FindBugItem = Extract<ContentItem, { type: "find_bug" }>;
type InterviewQuestionItem = Extract<ContentItem, { type: "interview_question" }>;

export function meta(
  id: string,
  topic: Topic,
  subtopic: string,
  tags: string[],
  prompt: string,
  explanation: string,
  estimatedSeconds = 60,
): ItemMeta {
  return {
    id,
    version: 1,
    topic,
    subtopic,
    difficulty: "middle",
    tags,
    prompt,
    explanation,
    estimatedSeconds,
  };
}

export function term(item: ItemMeta, value: string, definition: string): TermItem {
  return { ...item, type: "term", term: value, definition };
}

export function flashcard(item: ItemMeta, answer: string): FlashcardItem {
  return { ...item, type: "flashcard", answer };
}

function options(values: string[]) {
  return values.map((text, index) => ({ id: String.fromCharCode(97 + index), text }));
}

export function singleChoice(
  item: ItemMeta,
  values: string[],
  correctIndex: number,
  code?: string,
  language?: CodeLanguage,
): SingleChoiceItem {
  return {
    ...item,
    type: "single_choice",
    options: options(values),
    correctOptionIds: [String.fromCharCode(97 + correctIndex)],
    ...(code ? { code, language: language ?? "javascript" } : {}),
  };
}

export function multipleChoice(
  item: ItemMeta,
  values: string[],
  correctIndexes: number[],
  code?: string,
  language?: CodeLanguage,
): MultipleChoiceItem {
  return {
    ...item,
    type: "multiple_choice",
    options: options(values),
    correctOptionIds: correctIndexes.map((index) => String.fromCharCode(97 + index)),
    ...(code ? { code, language: language ?? "javascript" } : {}),
  };
}

export function codeOutput(
  item: ItemMeta,
  code: string,
  answer: string,
  language: CodeLanguage,
): CodeOutputItem {
  return { ...item, type: "code_output", code, answer, language };
}

export function findBug(
  item: ItemMeta,
  code: string,
  answer: string,
  solution: string,
  language: CodeLanguage,
): FindBugItem {
  return { ...item, type: "find_bug", code, answer, solution, language };
}

export function interviewQuestion(
  item: ItemMeta,
  rubric: string[],
  referencePoints: string[],
): InterviewQuestionItem {
  return { ...item, type: "interview_question", rubric, referencePoints };
}
