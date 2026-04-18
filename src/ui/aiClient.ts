const STORAGE_KEY = 'google-api-key';
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

let cachedKey: string | null = null;

export async function getApiKey(): Promise<string | null> {
  if (cachedKey !== null) return cachedKey;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg && msg.type === 'api-key-response') {
        cachedKey = msg.data.key;
        window.removeEventListener('message', handler);
        resolve(cachedKey);
      }
    };
    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'get-api-key' } }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 5000);
  });
}

export function clearCachedKey() {
  cachedKey = null;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  content: string;
}

export async function callGemini(
  messages: GeminiMessage[],
  systemPrompt?: string,
  maxTokens: number = 1024
): Promise<string> {
  const key = await getApiKey();
  if (!key) {
    throw new Error('API-ключ не найден. Введите ключ в Настройках.');
  }

  const contents = messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const body: any = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const resp = await fetch(ENDPOINT + '?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Gemini API error: ' + resp.status + ' — ' + errText);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Некорректный ответ от Gemini API');
  }
  return text;
}
