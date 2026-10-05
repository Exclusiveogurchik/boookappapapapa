import { db } from '../../db/database';
import { gradeVocabWord as grade } from '../../db/repositories';

/** Мелкие действия словаря (переэкспорт для страницы). */
export const gradeVocabWord = grade;

export async function removeVocabFallback(id: string): Promise<void> {
  await db.vocabulary.delete(id);
}
