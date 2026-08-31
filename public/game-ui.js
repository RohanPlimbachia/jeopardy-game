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

  return { fmtMoney, renderBoard, renderScoreboard };
})();
