/**
 * ИИ-функции через Anthropic API (Claude).
 * Ключ вводит пользователь в настройках и хранится только локально.
 * Запрос идёт напрямую из браузера с заголовком
 * anthropic-dangerous-direct-browser-access (официальная поддержка CORS).
 */

export async function askAnthropic(
  apiKey: string,
  prompt: string,
  system = 'Ты — помощник читателя. Отвечай кратко и по-русски, без лишних вступлений.',
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return data.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? '';
}

/** «Кратко о главе» */
export function summaryPrompt(chapterText: string, title: string): string {
  return `Книга: «${title}». Вот фрагмент главы:\n\n${chapterText}\n\nСделай краткое резюме главы (3–6 тезисов) на русском языке.`;
}

/** «Объясни проще» */
export function explainPrompt(text: string): string {
  return `Объясни следующий фрагмент простыми словами (как человеку, который плохо разбирается в теме), на русском языке, 2–4 предложения:\n\n${text}`;
}
