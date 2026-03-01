// api/index.js — Vercel serverless function
// OpenAI-совместимый адаптер для YandexGPT с поддержкой CORS

export default async function handler(req, res) {

  // ✅ CORS — разрешаем все источники (нужно для работы с localhost и GitHub Pages)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // ✅ Preflight (OPTIONS) — браузер сначала спрашивает разрешение
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Корневой маршрут — проверка работоспособности
  if (req.url === '/' || req.url === '') {
    return res.status(200).json({ status: 'Hello from Foundational Models Team...' });
  }

  // Основной маршрут чата
  if (req.method === 'POST' && req.url.includes('/v1/chat/completions')) {
    try {
      const { messages, model = 'yandexgpt-lite', max_tokens = 600, temperature = 0.3 } = req.body;

      const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
      const FOLDER_ID      = process.env.FOLDER_ID;

      if (!YANDEX_API_KEY || !FOLDER_ID) {
        return res.status(500).json({ error: 'Missing YANDEX_API_KEY or FOLDER_ID env variables' });
      }

      // Маппинг model → URI YandexGPT
      const modelUri = model === 'yandexgpt'
        ? `gpt://${FOLDER_ID}/yandexgpt/latest`
        : `gpt://${FOLDER_ID}/yandexgpt-lite/latest`;

      // Формируем тело запроса к YandexGPT API
      const yandexBody = {
        modelUri,
        completionOptions: {
          stream: false,
          temperature,
          maxTokens: String(max_tokens)
        },
        messages: messages.map(m => ({
          role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
          text: m.content
        }))
      };

      const yandexResponse = await fetch(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Api-Key ${YANDEX_API_KEY}`,
            'x-folder-id': FOLDER_ID
          },
          body: JSON.stringify(yandexBody)
        }
      );

      if (!yandexResponse.ok) {
        const errText = await yandexResponse.text();
        return res.status(yandexResponse.status).json({ error: errText });
      }

      const yandexData = await yandexResponse.json();
      const text = yandexData.result?.alternatives?.[0]?.message?.text || '';

      // Возвращаем ответ в формате OpenAI
      return res.status(200).json({
        id: 'chatcmpl-yandex',
        object: 'chat.completion',
        model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
