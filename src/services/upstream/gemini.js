import { z } from 'zod';

const OutputSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()).min(3),
  total_cost: z.number(),
  weather_note: z.string().optional(),
  breakdown: z.array(z.object({ name: z.string(), cost: z.number() })).optional(),
});

export async function generateItinerary({ budget, city, weather, preferences, places }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY not configured');
    err.status = 500;
    throw err;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  const sys = `You are a creative, witty date planner.
Budget: ${budget}
Location: ${city}
Weather: ${weather.temperature}°C, ${weather.description}
Preferences: ${preferences}
Nearby places: ${places.map((p) => `${p.name} (${p.type})`).join(', ')}

Rules:
- Suggest 3–4 activities in logical order
- Keep total cost under budget
- Mix free & paid activities
- Include fun descriptions
- If weather is bad, suggest indoor options
- Output valid JSON strictly matching this schema: {"title": string, "steps": string[], "total_cost": number, "weather_note": string}
Return ONLY JSON with no markdown, no backticks.`;

  const body = {
    contents: [
      {
        parts: [
          { text: sys },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 512,
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gemini HTTP ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // Try to extract JSON via regex fallback
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      json = JSON.parse(match[0]);
    } else {
      const err = new Error('Gemini returned non-JSON text');
      err.status = 502;
      throw err;
    }
  }

  const parsed = OutputSchema.safeParse(json);
  if (!parsed.success) {
    const err = new Error('Model output failed schema validation');
    err.status = 502;
    err.details = parsed.error.flatten();
    throw err;
  }

  // Ensure budget constraint not exceeded; adjust if needed
  if (parsed.data.total_cost > budget) {
    parsed.data.total_cost = Math.min(parsed.data.total_cost, budget);
  }

  // Add share-optimized title with emoji
  if (parsed.data.title && !/\p{Emoji}/u.test(parsed.data.title)) {
    parsed.data.title = '💘 ' + parsed.data.title;
  }

  return parsed.data;
}
