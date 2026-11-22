// Generates a Jeopardy board with the Gemini API, using a JSON schema so the
// response always has the shape the game expects.

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// Off by default. Set PARTY_MODE=true in .env for an adults-only Round 2.
const PARTY_MODE = process.env.PARTY_MODE === 'true';

const BOARD_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short category title, one or two words, ALL CAPS' },
          clues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: { type: 'integer' },
                question: { type: 'string' },
                answer: { type: 'string', description: 'Phrased as a question, e.g. "What is X?"' },
              },
              required: ['value', 'question', 'answer'],
            },
          },
        },
        required: ['name', 'clues'],
      },
    },
  },
  required: ['name', 'categories'],
};

function buildPrompt({ topic, round }) {
  const ladder = round === 2 ? '400, 800, 1200, 1600, 2000' : '200, 400, 600, 800, 1000';

  let tone;
  if (round === 2 && PARTY_MODE) {
    tone = 'This is Round 2 ("Double Jeopardy") for a party of adult friends. Edgy, irreverent humor is welcome. '
      + 'Never include slurs, hate speech, sexual content, or anything targeting a real private person.';
  } else if (round === 2) {
    tone = 'This is Round 2 ("Double Jeopardy"). Make the clues noticeably harder than Round 1. Keep it suitable for a general audience.';
  } else {
    tone = 'This is Round 1. Keep it fun and suitable for a general audience: pop culture, general knowledge and wordplay.';
  }
  const topicLine = topic
    ? `Theme to lean into: ${topic}.`
    : 'Mix pop culture, general knowledge and party-game categories.';

  return `Generate a Jeopardy-style trivia board as JSON matching the given schema.

${tone}
${topicLine}

Rules:
- Exactly 5 categories, each with exactly 5 clues.
- Clue values within each category, cheapest to most expensive, must be exactly: ${ladder}.
- Harder or more obscure clues at higher values.
- Category names short (1-2 words), ALL CAPS.
- "question" is the clue shown to players (a statement, Jeopardy-style). "answer" is phrased as a question ("What is...?", "Who is...?").
- Every clue and answer must be factually correct and unambiguous.
- "name" is a short, punchy title for this board.`;
}

async function generateBoard({ topic, round }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on the server (see .env.example)');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt({ topic, round }) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: BOARD_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 500)}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  return JSON.parse(text);
}

module.exports = { generateBoard, buildPrompt };
