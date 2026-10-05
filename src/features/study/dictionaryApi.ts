/**
 * Бесплатные словарные API (без ключей, вызов прямо из браузера):
 *  — dictionaryapi.dev — определение английского слова;
 *  — MyMemory — перевод на язык интерфейса.
 */

export interface WordInfo {
  word: string;
  definition: string;
  translation: string;
  phonetic: string;
}

export async function lookupWord(word: string, targetLang: string): Promise<WordInfo> {
  const w = word.trim().toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '');
  const [definition, translation, phonetic] = await Promise.all([
    fetchDefinition(w),
    fetchTranslation(w, targetLang),
    fetchPhonetic(w),
  ]);
  return { word: w, definition, translation, phonetic };
}

async function fetchDefinition(word: string): Promise<string> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return '';
    const data = (await res.json()) as Array<{
      meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>;
    }>;
    const first = data[0]?.meanings?.[0];
    if (!first?.definitions?.[0]?.definition) return '';
    const pos = first.partOfSpeech ? `[${first.partOfSpeech}] ` : '';
    return pos + first.definitions[0].definition;
  } catch {
    return '';
  }
}

async function fetchPhonetic(word: string): Promise<string> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return '';
    const data = (await res.json()) as Array<{ phonetic?: string; phonetics?: Array<{ text?: string }> }>;
    return data[0]?.phonetic || data[0]?.phonetics?.find((p) => p.text)?.text || '';
  } catch {
    return '';
  }
}

async function fetchTranslation(word: string, targetLang: string): Promise<string> {
  try {
    const langPair = `en|${targetLang === 'ru' ? 'ru' : targetLang}`;
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${langPair}`,
    );
    if (!res.ok) return '';
    const data = (await res.json()) as { responseData?: { translatedText?: string } };
    const tr = data.responseData?.translatedText ?? '';
    // MyMemory иногда возвращает ошибку текстом
    return /INVALID|QUERY LENGTH|MYMEMORY WARNING/i.test(tr) ? '' : tr;
  } catch {
    return '';
  }
}
