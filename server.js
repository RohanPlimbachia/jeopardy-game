const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Server } = require('socket.io');
const { Game, validateBoard } = require('./game');
const { generateBoard } = require('./ai');

const DATA_DIR = path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;
// Optional. When set, the host screen asks for this PIN before it can see
// answers or control the game.
const HOST_PIN = process.env.HOST_PIN || '';

function loadGames() {
  const games = {};
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json')) continue;
    const id = path.basename(file, '.json');
    try {
      const board = validateBoard(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')));
      games[id] = { name: board.name || id, categories: board.categories };
    } catch (e) {
      console.error(`Skipping ${file}: ${e.message}`);
    }
  }
  return games;
}

const game = new Game(loadGames());
const hostSockets = new Set();
const playerSockets = new Map(); // socket.id -> playerId

const app = express();
const server = http.createServer(app);
const io = new Server(server);

function broadcastState() {
  for (const [id, socket] of io.of('/').sockets) {
    socket.emit('state', game.viewFor(hostSockets.has(id)));
  }
}

const SOUND_EVENTS = new Set(['select', 'buzz', 'correct', 'wrong', 'roundEnd', 'gameEnd']);

// Runs a game action; if it changed anything, plays its sound and pushes the
// new state to every screen.
function apply(result) {
  if (!result) return;
  if (SOUND_EVENTS.has(result)) io.emit('sfx', result);
  broadcastState();
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));

app.get('/api/games', (req, res) => {
  res.json(Object.entries(game.games).map(([id, g]) => ({ id, name: g.name })));
});

app.use(express.json());
app.post('/api/generate', async (req, res) => {
  if (HOST_PIN && req.get('x-host-pin') !== HOST_PIN) return res.status(403).json({ error: 'Host PIN required' });
  const round = req.body?.round === 2 ? 2 : 1;
  const topic = String(req.body?.topic || '').trim().slice(0, 100);
  try {
    const board = validateBoard(await generateBoard({ topic, round }));
    const slug = (topic || 'ai-game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const id = `${slug || 'ai-game'}-round${round}-${Date.now().toString(36)}`;
    fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(board, null, 2));
    game.addGame(id, board);
    res.json({ id, name: game.games[id].name });
  } catch (e) {
    console.error('Generate failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

io.on('connection', socket => {
  socket.emit('state', game.viewFor(false));

  // Host-only events are ignored unless this socket joined as host.
  const hostOnly = handler => (...args) => {
    if (hostSockets.has(socket.id)) handler(...args);
  };

  socket.on('host:join', ({ pin } = {}, ack) => {
    const ok = !HOST_PIN || pin === HOST_PIN;
    if (ok) {
      hostSockets.add(socket.id);
      socket.emit('state', game.viewFor(true));
    }
    if (typeof ack === 'function') ack({ ok, pinRequired: Boolean(HOST_PIN) });
  });

  socket.on('player:join', (info = {}, ack) => {
    const playerId = game.join(info);
    playerSockets.set(socket.id, playerId);
    if (typeof ack === 'function') ack({ playerId });
    broadcastState();
  });

  socket.on('player:buzz', () => apply(game.buzz(playerSockets.get(socket.id))));

  socket.on('host:loadGame', hostOnly(gameId => apply(game.loadGame(gameId))));
  socket.on('host:startGame', hostOnly(() => apply(game.start())));
  socket.on('host:selectClue', hostOnly(({ catIdx, clueIdx } = {}) => apply(game.selectClue(catIdx, clueIdx))));
  socket.on('host:resolve', hostOnly(({ correct } = {}) => apply(game.resolve(Boolean(correct)))));
  socket.on('host:skipClue', hostOnly(() => apply(game.skipClue())));
  socket.on('host:showResults', hostOnly(() => apply(game.showResults())));
  socket.on('host:resetGame', hostOnly(() => apply(game.reset())));

  socket.on('disconnect', () => {
    hostSockets.delete(socket.id);
    playerSockets.delete(socket.id);
    // Players stay in the game so a refresh or reconnect keeps their score.
  });
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(net => net.family === 'IPv4' && !net.internal)
    .map(net => net.address);

  console.log('Jeopardy server running:');
  console.log(`  Host controls:  http://localhost:${PORT}/host${HOST_PIN ? '  (PIN required)' : ''}`);
  console.log(`  Shared display: http://localhost:${PORT}/display`);
  (ips.length ? ips : ['localhost']).forEach(ip => console.log(`  Players join:   http://${ip}:${PORT}/`));
});
