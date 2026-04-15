const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// Получение API-ключа из Figma clientStorage через postMessage
let cachedKey: string | null = null;

export async function getApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg && msg.type === 'api-key-response') {
        window.removeEventListener('message', handler);
        cachedKey = msg.data.key || null;
        resolve(cachedKey);
      }
    };
    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'get-api-key' } }, '*');

    // Таймаут 5 секунд
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 5000);
  });
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function callClaude(
  messages: AiMessage[],
  systemPrompt?: string,
  maxTokens?: number,
): Promise<AiResponse | null> {
  const key = await getApiKey();
  if (!key) return null;

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens || 1024,
    messages: messages,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    return await resp.json() as AiResponse;
  } catch (e) {
    console.error('AI request failed:', e);
    return null;
  }
}
