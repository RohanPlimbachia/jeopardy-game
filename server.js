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
    state.gameId = gameId;
    state.gameName = g.name;
    state.categories = g.categories.map(c => ({
      name: c.name,
      clues: c.clues.map(cl => ({ ...cl, used: false })),
    }));
    state.currentClue = null;
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
    broadcastState();
  });

  socket.on('player:buzz', () => {
    const playerId = playerSockets.get(socket.id);
    const c = state.currentClue;
    if (!playerId || !c || !c.buzzerOpen || c.buzzedPlayerId || c.locked.has(playerId)) return;
    c.buzzedPlayerId = playerId;
    c.buzzerOpen = false;
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
