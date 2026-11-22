// Game rules and state, with no networking. server.js wires these methods to
// Socket.IO events; tests call them directly.
//
// Each action returns the sound effect to play (or null when nothing
// changed), and the server only broadcasts state when an action returns
// something truthy.

const crypto = require('crypto');

class Game {
  constructor(games = {}) {
    this.games = games; // id -> { name, categories }
    this.reset({ keepBoard: false });
  }

  reset({ keepBoard = true } = {}) {
    const board = keepBoard && this.gameId ? this.games[this.gameId] : null;
    this.phase = 'lobby'; // lobby | board | clue | results
    this.gameId = board ? this.gameId : null;
    this.gameName = board ? board.name : null;
    this.categories = board ? freshCategories(board) : [];
    this.players = {}; // playerId -> { id, name, score }
    this.currentClue = null;
    return 'reset';
  }

  addGame(id, game) {
    this.games[id] = { name: game.name || id, categories: game.categories };
  }

  // Returns the player's id. Passing a known playerId (kept in the browser's
  // localStorage) lets a refreshed player rejoin with their score.
  join({ name, playerId } = {}) {
    const cleanName = String(name || '').trim().slice(0, 20) || 'Player';
    const id = playerId && this.players[playerId] ? playerId : crypto.randomUUID();
    if (this.players[id]) this.players[id].name = cleanName;
    else this.players[id] = { id, name: cleanName, score: 0 };
    return id;
  }

  // Allowed from the lobby (first load) or from the board (moving to the next
  // round, e.g. Round 1 -> Double Jeopardy -> Final). Scores carry over.
  loadGame(gameId) {
    if (this.phase !== 'lobby' && this.phase !== 'board') return null;
    const board = this.games[gameId];
    if (!board) return null;
    const isNextRound = this.phase === 'board';
    this.gameId = gameId;
    this.gameName = board.name;
    this.categories = freshCategories(board);
    this.currentClue = null;
    return isNextRound ? 'roundEnd' : 'loaded';
  }

  start() {
    if (this.phase !== 'lobby' || !this.gameId) return null;
    this.phase = 'board';
    return 'started';
  }

  selectClue(catIdx, clueIdx) {
    if (this.phase !== 'board') return null;
    const clue = this.categories[catIdx]?.clues?.[clueIdx];
    if (!clue || clue.used) return null;
    this.currentClue = {
      catIdx,
      clueIdx,
      category: this.categories[catIdx].name,
      value: clue.value,
      question: clue.question,
      answer: clue.answer,
      buzzedPlayerId: null,
      locked: new Set(), // players who already answered wrong on this clue
      buzzerOpen: true,
    };
    this.phase = 'clue';
    return 'select';
  }

  // Node handles one event at a time, so the first buzz to arrive wins.
  buzz(playerId) {
    const c = this.currentClue;
    if (!this.players[playerId] || !c || !c.buzzerOpen || c.buzzedPlayerId || c.locked.has(playerId)) return null;
    c.buzzedPlayerId = playerId;
    c.buzzerOpen = false;
    return 'buzz';
  }

  resolve(correct) {
    const c = this.currentClue;
    if (!c || !c.buzzedPlayerId) return null;
    const clue = this.categories[c.catIdx].clues[c.clueIdx];
    const player = this.players[c.buzzedPlayerId];

    if (correct) {
      player.score += clue.value;
      this.closeClue();
      return 'correct';
    }

    player.score -= clue.value;
    c.locked.add(c.buzzedPlayerId);
    c.buzzedPlayerId = null;
    const everyoneLocked = Object.keys(this.players).every(id => c.locked.has(id));
    if (everyoneLocked) this.closeClue();
    else c.buzzerOpen = true;
    return 'wrong';
  }

  skipClue() {
    if (this.phase !== 'clue' || !this.currentClue) return null;
    this.closeClue();
    return 'skipped';
  }

  showResults() {
    if (this.phase !== 'board') return null;
    this.phase = 'results';
    this.currentClue = null;
    return 'gameEnd';
  }

  closeClue() {
    const c = this.currentClue;
    this.categories[c.catIdx].clues[c.clueIdx].used = true;
    this.currentClue = null;
    this.phase = 'board';
  }

  // The current clue's answer is the only secret in the game, so only the
  // host's copy of the state includes it.
  viewFor(isHost) {
    const c = this.currentClue;
    const clue = c && {
      category: c.category,
      value: c.value,
      question: c.question,
      buzzedPlayerId: c.buzzedPlayerId,
      buzzerOpen: c.buzzerOpen,
      lockedPlayerIds: Array.from(c.locked),
      ...(isHost ? { answer: c.answer } : {}),
    };
    return {
      phase: this.phase,
      gameId: this.gameId,
      gameName: this.gameName,
      categories: this.categories.map(cat => ({
        name: cat.name,
        clues: cat.clues.map(cl => ({ value: cl.value, used: cl.used })),
      })),
      players: Object.values(this.players).map(({ id, name, score }) => ({ id, name, score })),
      currentClue: clue || null,
    };
  }
}

function freshCategories(board) {
  return board.categories.map(c => ({
    name: c.name,
    clues: c.clues.map(cl => ({ ...cl, used: false })),
  }));
}

// Checks a board loaded from disk or returned by the AI before it is used.
function validateBoard(board) {
  if (!board || !Array.isArray(board.categories) || board.categories.length === 0) {
    throw new Error('missing "categories" array');
  }
  board.categories.forEach((cat, i) => {
    if (!cat.name) throw new Error(`category ${i + 1} has no name`);
    if (!Array.isArray(cat.clues) || cat.clues.length === 0) throw new Error(`category "${cat.name}" has no clues`);
    cat.clues.forEach((cl, j) => {
      if (!Number.isInteger(cl.value) || !cl.question || !cl.answer) {
        throw new Error(`clue ${j + 1} in "${cat.name}" needs a whole-number value, a question and an answer`);
      }
    });
  });
  return board;
}

module.exports = { Game, validateBoard };
