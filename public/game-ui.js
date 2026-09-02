// Shared rendering helpers for the play/display/host screens.
window.GameUI = (() => {
  function fmtMoney(v) {
    return `$${v}`;
  }

  function renderBoard(container, categories, { onSelect } = {}) {
    container.innerHTML = '';
    if (!categories.length) return;
    container.style.gridTemplateColumns = `repeat(${categories.length}, 1fr)`;

    categories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'category label-caps';
      el.textContent = cat.name;
      container.appendChild(el);
    });

    const maxClues = Math.max(...categories.map(c => c.clues.length));
    for (let i = 0; i < maxClues; i++) {
      categories.forEach((cat, catIdx) => {
        const clue = cat.clues[i];
        const tile = document.createElement('div');
        tile.className = 'tile tile-value' + (clue?.used ? ' used' : '') + (onSelect ? '' : ' static');
        tile.textContent = clue ? fmtMoney(clue.value) : '';
        if (onSelect && clue && !clue.used) {
          tile.addEventListener('click', () => onSelect(catIdx, i));
        }
        container.appendChild(tile);
      });
    }
  }

  function renderScoreboard(container, players, { buzzedId, rank } = {}) {
    container.innerHTML = '';
    const list = rank ? [...players].sort((a, b) => b.score - a.score) : players;
    list.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card' + (buzzedId === p.id ? ' buzzed' : '');
      card.innerHTML = `<div class="name label-caps">${p.name}</div><div class="score">${p.score}</div>`;
      container.appendChild(card);
    });
  }

  // Synthesized beeps via Web Audio — no audio files to source/host.
  // ponytail: AudioContext is created lazily on the first click/touch because
  // browsers block audio until a user gesture; on display.html (no buttons)
  // that means the very first tap on the page, not the individual event.
  let audioCtx = null;
  ['click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, () => {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true });
  });

  function tone(freq, dur, { type = 'sine', delay = 0, gain = 0.2 } = {}) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    select: () => tone(440, 0.15),
    buzz: () => tone(880, 0.12, { type: 'square' }),
    correct: () => {
      tone(523.25, 0.12, { delay: 0 });
      tone(659.25, 0.12, { delay: 0.1 });
      tone(783.99, 0.2, { delay: 0.2 });
    },
    wrong: () => tone(180, 0.35, { type: 'sawtooth', gain: 0.15 }),
    roundEnd: () => {
      tone(392, 0.15, { delay: 0 });
      tone(523.25, 0.3, { delay: 0.15 });
    },
    gameEnd: () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, { delay: i * 0.15 }));
    },
  };

  function playSound(name) {
    SOUNDS[name]?.();
  }

  return { fmtMoney, renderBoard, renderScoreboard, playSound };
})();
