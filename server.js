const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_DIR = path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;

function loadGames() {
  const games = {};
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json')) continue;
    const id = path.basename(file, '.json');
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      if (!Array.isArray(raw.categories)) throw new Error('missing "categories" array');
      games[id] = { name: raw.name || id, categories: raw.categories };
    } catch (e) {
      console.error(`Skipping ${file}: ${e.message}`);
    }
  }
  return games;
}

const games = loadGames();
const hostSockets = new Set();
const playerSockets = new Map(); // socket.id -> playerId

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GAME_SCHEMA = {
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

// SFW = safe for a mixed crowd. NSFW = dark/adult humor for a college house
// party, not an excuse to generate slurs, real-person attacks, or explicit
// sexual content — the prompt draws that line explicitly since the model has
// no other guardrail here.
function buildGamePrompt({ topic, round }) {
  const ladder = round === 2 ? '400, 800, 1200, 1600, 2000' : '200, 400, 600, 800, 1000';
  const tone = round === 2
    ? `This is Round 2 ("Double Jeopardy"), played at a college house party among adult friends. Make it DARK and NSFW: crude humor, profanity, taboo/edgy jokes, roasting pop culture and college-life stereotypes (hangovers, bad exes, student debt, dating apps, etc.) is all encouraged. Do NOT include slurs, hate speech targeting real protected groups, sexual content involving minors, or content that targets/humiliates a specific real private person. Keep it "raunchy comedy club", not genuinely hateful or illegal.`
    : `This is Round 1, played first. Keep it SFW and fun for a general audience — pop culture, general knowledge, wordplay, silly-but-clean humor is great. No profanity or adult content.`;
  const topicLine = topic ? `Theme/topic to lean into: ${topic}.` : 'Mix of pop culture, general knowledge, and party-game fun categories.';

  return `Generate a Jeopardy-style trivia board as JSON matching the given schema.

${tone}
${topicLine}

Rules:
- Exactly 5 categories, each with exactly 5 clues.
- Clue values within each category, cheapest to most expensive, must be exactly: ${ladder}.
- Harder/more obscure clues at higher values, easier ones at lower values.
- Category names short (1-2 words), ALL CAPS.
- "question" is the clue shown to players (a statement, Jeopardy-style). "answer" is phrased as a question ("What is...?", "Who is...?").
- Keep every clue and answer factually correct or, if a joke clue, clearly and unambiguously "gettable".
- "name" is a short punchy title for this board.`;
}

async function generateGame({ topic, round }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on the server');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildGamePrompt({ topic, round }) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GAME_SCHEMA,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  const game = JSON.parse(text);
  if (!Array.isArray(game.categories)) throw new Error('Gemini response missing "categories"');
  return game;
}

// single shared game state (local-network party game, no multi-room support)
let state = {
  phase: 'lobby', // lobby | board | clue | results
  gameId: null,
  gameName: null,
  categories: [], // [{ name, clues: [{ value, question, answer, used }] }]
  players: {}, // playerId -> { id, name, score }
  currentClue: null, // { catIdx, clueIdx, category, value, question, answer, buzzedPlayerId, locked: Set, buzzerOpen }
};

function publicClue() {
  const c = state.currentClue;
  if (!c) return null;
  return {
    category: c.category,
    value: c.value,
    question: c.question,
    buzzedPlayerId: c.buzzedPlayerId,
    buzzerOpen: c.buzzerOpen,
    lockedPlayerIds: Array.from(c.locked),
  };
}

// isHost gates the only secret in the game: the current clue's answer.
function stateFor(isHost) {
  return {
    phase: state.phase,
    gameId: state.gameId,
    gameName: state.gameName,
    categories: state.categories.map(c => ({
      name: c.name,
      clues: c.clues.map(cl => ({ value: cl.value, used: cl.used })),
    })),
    players: Object.values(state.players).map(p => ({ id: p.id, name: p.name, score: p.score })),
    currentClue: isHost && state.currentClue ? { ...publicClue(), answer: state.currentClue.answer } : publicClue(),
  };
}

function broadcastState() {
  for (const [id, socket] of io.of('/').sockets) {
    socket.emit('state', stateFor(hostSockets.has(id)));
  }
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/api/games', (req, res) => {
  res.json(Object.entries(games).map(([id, g]) => ({ id, name: g.name })));
});

app.use(express.json());
app.post('/api/generate', async (req, res) => {
  const round = req.body?.round === 2 ? 2 : 1;
  const topic = String(req.body?.topic || '').trim().slice(0, 100);
  try {
    const game = await generateGame({ topic, round });
    const slug = (topic || 'ai-game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `${slug}-round${round}-${Date.now().toString(36)}`;
    fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(game, null, 2));
    games[id] = { name: game.name || id, categories: game.categories };
    res.json({ id, name: games[id].name });
  } catch (e) {
    console.error('Generate failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

io.on('connection', socket => {
  socket.emit('state', stateFor(false));

  socket.on('host:join', () => {
    hostSockets.add(socket.id);
    socket.emit('state', stateFor(true));
  });

  // playerId (from the client's localStorage) lets a refreshed/reconnected
  // player rejoin as themself instead of starting a new player with score 0.
  socket.on('player:join', ({ name, playerId } = {}, ack) => {
    name = String(name || '').trim().slice(0, 20) || 'Player';
    const id = playerId || crypto.randomUUID();
    if (!state.players[id]) {
      state.players[id] = { id, name, score: 0 };
    } else {
      state.players[id].name = name;
    }
    playerSockets.set(socket.id, id);
    if (typeof ack === 'function') ack({ playerId: id });
    broadcastState();
  });

  // Allowed from the lobby (first load) or from the board (switching to the
  // next round mid-game, e.g. Round 1 -> Double Jeopardy -> Final). Scores
  // are untouched either way — only the board/clues change.
  socket.on('host:loadGame', gameId => {
    if (state.phase !== 'lobby' && state.phase !== 'board') return;
    const g = games[gameId];
    if (!g) return;
    const isNextRound = state.phase === 'board';
    state.gameId = gameId;
    state.gameName = g.name;
    state.categories = g.categories.map(c => ({
      name: c.name,
      clues: c.clues.map(cl => ({ ...cl, used: false })),
    }));
    state.currentClue = null;
    if (isNextRound) io.emit('sfx', 'roundEnd');
    broadcastState();
  });

  socket.on('host:startGame', () => {
    if (state.phase !== 'lobby' || !state.gameId) return;
    state.phase = 'board';
    broadcastState();
  });

  socket.on('host:selectClue', ({ catIdx, clueIdx }) => {
    if (state.phase !== 'board') return;
    const clue = state.categories?.[catIdx]?.clues?.[clueIdx];
    if (!clue || clue.used) return;
    state.currentClue = {
      catIdx,
      clueIdx,
      category: state.categories[catIdx].name,
      value: clue.value,
      question: clue.question,
      answer: clue.answer,
      buzzedPlayerId: null,
      locked: new Set(),
      buzzerOpen: true,
    };
    state.phase = 'clue';
    io.emit('sfx', 'select');
    broadcastState();
  });

  socket.on('player:buzz', () => {
    const playerId = playerSockets.get(socket.id);
    const c = state.currentClue;
    if (!playerId || !c || !c.buzzerOpen || c.buzzedPlayerId || c.locked.has(playerId)) return;
    c.buzzedPlayerId = playerId;
    c.buzzerOpen = false;
    io.emit('sfx', 'buzz');
    broadcastState();
  });

  socket.on('host:resolve', ({ correct }) => {
    const c = state.currentClue;
    if (!c || !c.buzzedPlayerId) return;
    const clue = state.categories[c.catIdx].clues[c.clueIdx];
    const player = state.players[c.buzzedPlayerId];
    if (correct) {
      player.score += clue.value;
      clue.used = true;
      state.currentClue = null;
      state.phase = 'board';
      io.emit('sfx', 'correct');
    } else {
      player.score -= clue.value;
      c.locked.add(c.buzzedPlayerId);
      c.buzzedPlayerId = null;
      const everyoneLocked = Object.keys(state.players).every(id => c.locked.has(id));
      if (everyoneLocked) {
        clue.used = true;
        state.currentClue = null;
        state.phase = 'board';
      } else {
        c.buzzerOpen = true;
      }
      io.emit('sfx', 'wrong');
    }
    broadcastState();
  });

  socket.on('host:skipClue', () => {
    if (state.phase !== 'clue' || !state.currentClue) return;
    const c = state.currentClue;
    state.categories[c.catIdx].clues[c.clueIdx].used = true;
    state.currentClue = null;
    state.phase = 'board';
    broadcastState();
  });

  socket.on('host:showResults', () => {
    if (state.phase !== 'board') return;
    state.phase = 'results';
    state.currentClue = null;
    io.emit('sfx', 'gameEnd');
    broadcastState();
  });

  socket.on('host:resetGame', () => {
    const g = state.gameId ? games[state.gameId] : null;
    state.phase = 'lobby';
    state.players = {};
    state.currentClue = null;
    state.categories = g ? g.categories.map(c => ({ name: c.name, clues: c.clues.map(cl => ({ ...cl, used: false })) })) : [];
    broadcastState();
  });

  socket.on('disconnect', () => {
    hostSockets.delete(socket.id);
    playerSockets.delete(socket.id);
    // players are kept in state so a refresh/reconnect restores their score
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = Object.values(nets)
    .flat()
    .filter(net => net.family === 'IPv4' && !net.internal)
    .map(net => net.address);

  console.log('Jeopardy server running:');
  console.log(`  Host controls:  http://localhost:${PORT}/host`);
  console.log(`  Shared display: http://localhost:${PORT}/display`);
  if (ips.length) {
    ips.forEach(ip => console.log(`  Players join:   http://${ip}:${PORT}/`));
  } else {
    console.log(`  Players join:   http://localhost:${PORT}/`);
  }
});
