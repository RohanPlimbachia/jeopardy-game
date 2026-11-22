const { Game, validateBoard } = require('../game');

const board = {
  name: 'Test Board',
  categories: [
    { name: 'A', clues: [{ value: 200, question: 'Q1', answer: 'What is 1?' }, { value: 400, question: 'Q2', answer: 'What is 2?' }] },
    { name: 'B', clues: [{ value: 200, question: 'Q3', answer: 'What is 3?' }, { value: 400, question: 'Q4', answer: 'What is 4?' }] },
  ],
};
const round2 = { name: 'Round 2', categories: [{ name: 'C', clues: [{ value: 800, question: 'Q5', answer: 'What is 5?' }] }] };

// A game on the board screen with two players, ready for a clue.
function startedGame() {
  const game = new Game({ test: board, r2: round2 });
  const alice = game.join({ name: 'Alice' });
  const bob = game.join({ name: 'Bob' });
  game.loadGame('test');
  game.start();
  return { game, alice, bob };
}

describe('joining', () => {
  test('trims and caps names, and falls back to "Player"', () => {
    const game = new Game();
    const id = game.join({ name: '  ' + 'x'.repeat(30) + '  ' });
    expect(game.players[id].name).toHaveLength(20);
    expect(game.players[game.join({ name: '   ' })].name).toBe('Player');
  });

  test('a returning player keeps their score', () => {
    const { game, alice } = startedGame();
    game.players[alice].score = 600;
    expect(game.join({ name: 'Alice 2', playerId: alice })).toBe(alice);
    expect(game.players[alice]).toMatchObject({ name: 'Alice 2', score: 600 });
  });

  test('an unknown player id gets a fresh player', () => {
    const game = new Game();
    const id = game.join({ name: 'Eve', playerId: 'made-up-id' });
    expect(id).not.toBe('made-up-id');
  });
});

describe('buzzing and scoring', () => {
  test('first buzz wins and locks out everyone else', () => {
    const { game, alice, bob } = startedGame();
    game.selectClue(0, 0);
    expect(game.buzz(alice)).toBe('buzz');
    expect(game.buzz(bob)).toBeNull();
    expect(game.currentClue.buzzedPlayerId).toBe(alice);
  });

  test('a correct answer adds the value and closes the clue', () => {
    const { game, alice } = startedGame();
    game.selectClue(0, 1);
    game.buzz(alice);
    expect(game.resolve(true)).toBe('correct');
    expect(game.players[alice].score).toBe(400);
    expect(game.phase).toBe('board');
    expect(game.categories[0].clues[1].used).toBe(true);
  });

  test('a wrong answer subtracts the value and reopens the buzzer for others only', () => {
    const { game, alice, bob } = startedGame();
    game.selectClue(0, 0);
    game.buzz(alice);
    expect(game.resolve(false)).toBe('wrong');
    expect(game.players[alice].score).toBe(-200);
    expect(game.phase).toBe('clue');
    expect(game.buzz(alice)).toBeNull(); // already answered this clue
    expect(game.buzz(bob)).toBe('buzz');
  });

  test('the clue closes once every player has answered wrong', () => {
    const { game, alice, bob } = startedGame();
    game.selectClue(1, 0);
    game.buzz(alice);
    game.resolve(false);
    game.buzz(bob);
    game.resolve(false);
    expect(game.phase).toBe('board');
    expect(game.categories[1].clues[0].used).toBe(true);
  });

  test('a used clue cannot be picked again', () => {
    const { game } = startedGame();
    game.selectClue(0, 0);
    game.skipClue();
    expect(game.selectClue(0, 0)).toBeNull();
  });

  test('buzzes from unknown players and out-of-turn actions are ignored', () => {
    const { game } = startedGame();
    expect(game.buzz('stranger')).toBeNull();
    expect(game.resolve(true)).toBeNull(); // no clue open
    expect(game.selectClue(9, 9)).toBeNull(); // no such clue
  });
});

describe('rounds and results', () => {
  test('loading the next round keeps scores and resets the board', () => {
    const { game, alice } = startedGame();
    game.selectClue(0, 0);
    game.buzz(alice);
    game.resolve(true);
    expect(game.loadGame('r2')).toBe('roundEnd');
    expect(game.players[alice].score).toBe(200);
    expect(game.categories[0].clues[0].used).toBe(false);
  });

  test('a new round cannot be loaded while a clue is open', () => {
    const { game } = startedGame();
    game.selectClue(0, 0);
    expect(game.loadGame('r2')).toBeNull();
  });

  test('reset clears players but keeps the loaded board', () => {
    const { game } = startedGame();
    game.reset();
    expect(game.phase).toBe('lobby');
    expect(game.players).toEqual({});
    expect(game.gameId).toBe('test');
  });
});

describe('what each screen can see', () => {
  test('only the host sees the answer', () => {
    const { game } = startedGame();
    game.selectClue(0, 0);
    expect(game.viewFor(true).currentClue.answer).toBe('What is 1?');
    expect(game.viewFor(false).currentClue).not.toHaveProperty('answer');
  });

  test('the board never exposes unplayed questions or answers', () => {
    const { game } = startedGame();
    const json = JSON.stringify(game.viewFor(true));
    expect(json).not.toContain('Q2');
    expect(json).not.toContain('What is 2?');
  });
});

describe('validateBoard', () => {
  test('accepts every board shipped in data/', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'data');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      expect(() => validateBoard(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))).not.toThrow();
    }
  });

  test('rejects boards with missing pieces', () => {
    expect(() => validateBoard({})).toThrow('categories');
    expect(() => validateBoard({ categories: [{ name: 'X', clues: [] }] })).toThrow('no clues');
    expect(() => validateBoard({ categories: [{ name: 'X', clues: [{ value: '200', question: 'q', answer: 'a' }] }] })).toThrow('whole-number');
  });
});
