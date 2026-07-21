import type { Topic } from "@mentor/shared";
import { z } from "zod";

import { hackFrontendSourceSnapshot } from "./hackfrontend.generated.js";

const knowledgeSourceSchema = z
  .object({
    id: z.string().regex(/^hackfrontend:[a-z0-9-/]+$/),
    section: z.string().regex(/^[a-z0-9-]+$/),
    slug: z
      .string()
      .max(500)
      .refine((value) => !value.startsWith("/") && !value.includes(".."), "Invalid source slug"),
    url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.origin === "https://www.hackfrontend.com" && url.pathname.startsWith("/ru/docs/")
        );
      }, "Source must be a public Russian Hack Frontend docs URL"),
  })
  .strict();

const knowledgeSourceSnapshotSchema = z
  .object({
    provider: z.literal("Hack Frontend"),
    homepage: z.literal("https://www.hackfrontend.com/ru/docs/introduction"),
    sitemap: z.literal("https://www.hackfrontend.com/sitemap.xml"),
    syncedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    usage: z.literal("reference-only"),
    items: z.array(knowledgeSourceSchema).min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const ids = new Set<string>();
    const urls = new Set<string>();
    snapshot.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "id"],
          message: `Duplicate source id ${item.id}`,
        });
      }
      if (urls.has(item.url)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "url"],
          message: `Duplicate source URL ${item.url}`,
        });
      }
      ids.add(item.id);
      urls.add(item.url);
    });
  });

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type KnowledgeSourceSnapshot = z.infer<typeof knowledgeSourceSnapshotSchema>;

export function validateKnowledgeSourceSnapshot(input: unknown): KnowledgeSourceSnapshot {
  return knowledgeSourceSnapshotSchema.parse(input);
}

export const hackFrontendKnowledgeBase = validateKnowledgeSourceSnapshot(
  hackFrontendSourceSnapshot,
);

export function getKnowledgeSourceStats(snapshot = hackFrontendKnowledgeBase) {
  const bySection = snapshot.items.reduce<Record<string, number>>((stats, source) => {
    stats[source.section] = (stats[source.section] ?? 0) + 1;
    return stats;
  }, {});
  return { total: snapshot.items.length, bySection };
}

const topicSections: Record<Topic, readonly string[]> = {
  javascript: ["javascript"],
  typescript: ["typescript"],
  react: ["react"],
  browser: ["general-questions", "html-and-css", "javascript"],
  node: ["javascript", "general-questions"],
  css: ["html-and-css"],
};

const ignoredSearchTerms = new Set([
  "and",
  "between",
  "difference",
  "for",
  "from",
  "how",
  "into",
  "the",
  "what",
  "with",
]);

function searchTerms(value: string): string[] {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !ignoredSearchTerms.has(term));
}

export function searchKnowledgeSources(
  query: string,
  options: { topic?: Topic; sections?: string[]; limit?: number } = {},
): KnowledgeSource[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const allowedSections = new Set(
    options.sections ?? (options.topic ? topicSections[options.topic] : []),
  );
  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));

  return hackFrontendKnowledgeBase.items
    .filter((source) => !allowedSections.size || allowedSections.has(source.section))
    .map((source) => {
      const slugTerms = searchTerms(source.slug);
      const score = terms.reduce((total, term) => {
        if (slugTerms.includes(term)) return total + 4;
        if (source.slug.includes(term)) return total + 1;
        return total;
      }, 0);
      return { source, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.source.slug.length - right.source.slug.length,
    )
    .slice(0, limit)
    .map((entry) => entry.source);
}
