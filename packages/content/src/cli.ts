import { ZodError } from "zod";

import {
  contentItems,
  getContentStats,
  getMockInterviewStats,
  getKnowledgeSourceStats,
  getTheoryStats,
  mockInterviewCatalog,
} from "./index.js";

try {
  const stats = getContentStats(contentItems);
  console.log(`✓ Контент валиден: ${stats.total} материалов`);
  console.log(
    Object.entries(stats.byTopic)
      .map(([topic, count]) => `  ${topic}: ${count}`)
      .join("\n"),
  );
  console.log(`  типы: ${Object.keys(stats.byType).length}/7`);
  const interviewStats = getMockInterviewStats(mockInterviewCatalog);
  console.log(
    `✓ Mock-интервью валидны: ${interviewStats.sets} наборов, ${interviewStats.questions} вопросов`,
  );
  const sourceStats = getKnowledgeSourceStats();
  console.log(
    `✓ Внешняя база источников валидна: ${sourceStats.total} ссылок, ${Object.keys(sourceStats.bySection).length} разделов`,
  );
  const theoryStats = getTheoryStats();
  console.log(`✓ Теоретическая база валидна: ${theoryStats.total} оригинальных глав`);
} catch (error) {
  if (error instanceof ZodError) {
    console.error("Контент не прошёл проверку:");
    error.issues.forEach((issue) => console.error(`- ${issue.path.join(".")}: ${issue.message}`));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
