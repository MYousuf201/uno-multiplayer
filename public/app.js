const BACKEND_URL = (window.UNO_CONFIG && window.UNO_CONFIG.backendUrl) || window.location.origin;
const socket = BACKEND_URL ? io(BACKEND_URL, { transports: ['websocket', 'polling'] }) : io();

// Build tag — useful for confirming the deployed version
window.__UNO_BUILD__ = 'rematch-fix-v2';

const COLORS_HEX = [
  '#e63946', '#3a86ff', '#06d6a0', '#ffb703',
  '#9d4edd', '#ff7e5f', '#2a9d8f', '#ff5d8f'
];
const COLOR_NAMES = ['Crimson','Azure','Emerald','Saffron','Violet','Coral','Teal','Rose'];

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  room: null,
  you: -1,
  pendingDrawn: null
};

let suppressNextColorPicker = false;

const SVG_CACHE = {};

function svgFor(type, value) {
  if (type === 'number') return numberSVG(value);
  if (type === 'skip') return symbolSVG('no-entry');
  if (type === 'reverse') return symbolSVG('arrows');
  if (type === 'draw2') return symbolSVG('plus2');
  if (type === 'wild') return symbolSVG('star');
  if (type === 'wild4') return symbolSVG('plus4');
  return '';
}

function numberSVG(n) {
  return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="70" rx="36" ry="48" fill="#fff"/>
    <text x="50" y="92" text-anchor="middle" font-family="Playfair Display" font-weight="800" font-size="80" fill="#1c1c1c">${n}</text>
  </svg>`;
}

function symbolSVG(kind) {
  const svgs = {
    'no-entry': `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="70" rx="38" ry="50" fill="#fff"/>
      <circle cx="50" cy="70" r="26" fill="none" stroke="#1c1c1c" stroke-width="6"/>
      <line x1="32" y1="88" x2="68" y2="52" stroke="#1c1c1c" stroke-width="6" stroke-linecap="round"/>
    </svg>`,
    'arrows': `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="70" rx="38" ry="50" fill="#fff"/>
      <path d="M30 60 L60 30 L60 45 L78 45 L78 75 L60 75 L60 90 Z" fill="#1c1c1c" transform="rotate(-30 50 70)"/>
      <path d="M70 80 L40 110 L40 95 L22 95 L22 65 L40 65 L40 50 Z" fill="#1c1c1c" transform="rotate(-30 50 70)"/>
    </svg>`,
    'plus2': `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="70" rx="38" ry="50" fill="#fff"/>
      <text x="50" y="78" text-anchor="middle" font-family="Playfair Display" font-weight="800" font-size="38" fill="#1c1c1c">+2</text>
    </svg>`,
    'star': `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="70" rx="38" ry="50" fill="#fff"/>
      <path d="M50 30 L60 55 L86 58 L66 75 L72 100 L50 86 L28 100 L34 75 L14 58 L40 55 Z" fill="#1c1c1c"/>
    </svg>`,
    'plus4': `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="70" rx="38" ry="50" fill="#fff"/>
      <text x="50" y="78" text-anchor="middle" font-family="Playfair Display" font-weight="800" font-size="38" fill="#1c1c1c">+4</text>
    </svg>`
  };
  return svgs[kind];
}

function renderCard(card, opts = {}) {
  const cls = ['uno-card'];
  if (opts.large) cls.push('large');
  if (opts.entering) cls.push('entering');
  if (card.color === 'wild') {
    cls.push('wild');
    if (opts.wildRotate) cls.push('wild-rotate');
    // Override background with a four-quadrant solid color split via inline style
  } else {
    cls.push(card.color);
  }
  const corner = card.type === 'number' ? card.value
    : card.type === 'skip' ? '⊘'
    : card.type === 'reverse' ? '⇄'
    : card.type === 'draw2' ? '+2'
    : card.type === 'wild' ? 'W'
    : '+4';
  const isWild = card.color === 'wild';
  const center = isWild && (card.type === 'wild' || card.type === 'wild4')
    ? `<div class="wild-logo">${card.chosenColor ? card.chosenColor[0].toUpperCase() : 'W'}</div>`
    : `<div class="center-icon">${svgFor(card.type, card.value)}</div>`;
  let wildBgStyle = '';
  if (card.color === 'wild') {
    // Solid four-color quadrants (no gradients, no transparency)
    wildBgStyle = `background:
      linear-gradient(90deg, var(--red) 50%, var(--blue) 50%) 0 0/100% 50% no-repeat,
      linear-gradient(90deg, var(--yellow) 50%, var(--green) 50%) 0 100%/100% 50% no-repeat;
      background-color: var(--red);`;
  }
  return `<div class="${cls.join(' ')}" data-card-id="${card.id}" style="${wildBgStyle}">
    <div class="corner-tl">${corner}</div>
    <div class="corner-br">${corner}</div>
    <div class="uno-card-inner">${center}</div>
  </div>`;
}

function renderBack() {
  return `<div class="uno-card" style="background:#1c1c1c;">
    <div class="corner-tl" style="color:#fff;opacity:0.6;">UNO</div>
    <div class="uno-card-inner">
      <div class="wild-logo" style="background:var(--gold-1); color:#1c1c1c; font-size:14px;">UNO</div>
    </div>
  </div>`;
}

function showToast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#${name}`).classList.add('active');
}

/* ===== Lobby ===== */
$('#nameInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 16);
});
$('#codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
});

function getName() {
  return $('#nameInput').value.trim() || 'Player';
}

$('#createBtn').addEventListener('click', () => {
  $('#lobbyError').textContent = '';
  socket.emit('createRoom', { name: getName() });
});
$('#joinBtn').addEventListener('click', () => {
  $('#lobbyError').textContent = '';
  const code = $('#codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { $('#lobbyError').textContent = 'Enter a 4-letter code'; return; }
  socket.emit('joinRoom', { code, name: getName() });
});
$('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });

socket.on('errorMsg', ({ text }) => {
  $('#lobbyError').textContent = text;
  showToast(text);
});

socket.on('joined', ({ code, you }) => {
  state.you = you;
  showScreen('game');
  $('#roomCode').textContent = code;
  $('#bigCode').textContent = code;
});

/* ===== Top bar ===== */
$('#copyCode').addEventListener('click', () => {
  const code = $('#roomCode').textContent;
  navigator.clipboard?.writeText(code);
  showToast(`Code ${code} copied`);
});
$('#leaveBtn').addEventListener('click', () => {
  socket.emit('leaveRoom');
  state.room = null;
  setTimeout(() => location.reload(), 300);
});

/* ===== Waiting room ===== */
$('#startBtn').addEventListener('click', () => socket.emit('startGame'));

function renderWaiting(state) {
  $('#waitingPanel').classList.remove('hidden');
  $('#playPanel').classList.add('hidden');
  $('#bigCode').textContent = state.code;
  const you = state.players[state.you];
  const isHost = state.hostId === socket.id;
  $('#startBtn').disabled = !(isHost && state.players.length >= 2);
  if (isHost && state.players.length < 2) $('#startBtn').textContent = 'Need 2+ players';
  else if (isHost) $('#startBtn').textContent = 'Start game';
  else $('#startBtn').textContent = 'Waiting for host...';

  const grid = $('#waitingPlayers');
  grid.innerHTML = '';
  state.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'waiting-player' + (i === 0 ? ' host' : '');
    div.innerHTML = `<div class="waiting-avatar" style="background:${COLORS_HEX[p.colorIdx]};">${p.name[0].toUpperCase()}</div>
      <span>${p.name}</span>`;
    grid.appendChild(div);
  });

  // Rules section
  renderRules(state, isHost);
}

function renderRules(state, isHost) {
  const r = state.rules || {};
  const stack = $('#ruleStack4on2');
  const seven = $('#rule7Swap');
  const zero = $('#rule0Rotate');
  const rand = $('#ruleRandomizeOrder');
  const lock = $('#rulesLocked');
  const canEdit = isHost && !state.started;
  [stack, seven, zero, rand].forEach(input => { input.disabled = !canEdit; });
  stack.checked = !!r.stackDraw4OnDraw2;
  seven.checked = !!r.sevenSwap;
  zero.checked = !!r.zeroRotate;
  rand.checked = !!r.randomizeOrder;
  if (canEdit) {
    lock.textContent = 'host only';
    lock.classList.remove('active');
  } else if (!isHost) {
    lock.textContent = 'host only';
    lock.classList.remove('active');
  } else {
    lock.textContent = 'locked';
    lock.classList.add('active');
  }
}

function emitRules() {
  socket.emit('setRules', {
    rules: {
      stackDraw4OnDraw2: $('#ruleStack4on2').checked,
      sevenSwap: $('#rule7Swap').checked,
      zeroRotate: $('#rule0Rotate').checked,
      randomizeOrder: $('#ruleRandomizeOrder').checked
    }
  });
}
['ruleStack4on2', 'rule7Swap', 'rule0Rotate', 'ruleRandomizeOrder'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', emitRules);
});

/* ===== Game state ===== */
function isCardPlayable(card, top, currentColor) {
  if (!top) return true;
  if (card.type === 'wild' || card.type === 'wild4') return true;
  if (top.type === 'wild' || top.type === 'wild4') return card.color === currentColor;
  if (card.color === top.color) return true;
  if (card.type === 'number' && top.type === 'number' && card.value === top.value) return true;
  if (card.type !== 'number' && card.type === top.type) return true;
  return false;
}

function renderPlay(state) {
  $('#waitingPanel').classList.add('hidden');
  $('#playPanel').classList.remove('hidden');

  // Server-driven color picker (wild/wild4 just played)
  if (state.colorPicker && state.colorPicker.playerId === socket.id) {
    if (suppressNextColorPicker) {
      suppressNextColorPicker = false;
    } else if ($('#colorModal').classList.contains('hidden')) {
      openServerColorModal();
    }
  } else {
    if (!$('#colorModal').classList.contains('hidden') && $('#colorModal').dataset.cardId === '__server__') {
      closeColorModal();
    }
  }

  // Server-driven swap target picker (7 card)
  if (state.pendingAction && state.pendingAction.kind === 'sevenSwap' && state.pendingAction.playerId === socket.id) {
    openSwapModal(state);
  } else {
    if (!$('#swapModal').classList.contains('hidden')) closeSwapModal();
  }

  // Turn banner
  const cur = state.players[state.currentPlayer];
  const isMyTurn = state.currentPlayer === state.you;
  $('#turnDot').style.background = COLORS_HEX[cur.colorIdx];
  if (state.winner) {
    $('#turnText').textContent = 'Game over';
  } else if (state.colorPicker && state.colorPicker.playerId === socket.id) {
    $('#turnText').textContent = `${cur.name} — pick a color`;
  } else if (isMyTurn) {
    $('#turnText').textContent = `${cur.name} — your turn`;
  } else {
    $('#turnText').textContent = `${cur.name}'s turn`;
  }

  // Color indicator
  const top = state.discardPile[state.discardPile.length - 1];
  if (top) {
    const c = (top.color === 'wild' ? (top.chosenColor || 'red') : top.color);
    $('#colorPill').style.background = c === 'wild' ? '#888' : c;
  }

  // Deck count
  $('#deckCount').textContent = `${state.drawPileCount} cards`;
  $('#drawBtn').disabled = !isMyTurn || !!state.winner;

  // Discard
  const dp = $('#discardPile');
  dp.innerHTML = '';
  if (top) {
    const html = renderCard(top, { large: true, wildRotate: top.color === 'wild' && (top.type === 'wild' || top.type === 'wild4') });
    dp.innerHTML = `<div class="discard-card">${html}</div>`;
  } else {
    dp.innerHTML = renderBack();
  }

  // Opponents
  const ops = $('#opponents');
  ops.innerHTML = '';
  state.players.forEach((p, i) => {
    if (i === state.you) return;
    const isCur = i === state.currentPlayer;
    const atRisk = state.unoAtRisk && state.unoAtRisk.playerId === p.id;
    const div = document.createElement('div');
    div.className = 'opponent' + (isCur ? ' active' : '') + (p.finished ? ' finished' : '') + (atRisk ? ' at-risk' : '');
    const cardsHTML = Array(Math.min(p.handCount, 8)).fill(0).map(() =>
      `<div class="mini-card"></div>`
    ).join('');
    const extra = p.handCount > 8 ? `<span class="opponent-count">+${p.handCount - 8}</span>` : '';
    const unoFlag = p.calledUno ? `<div class="uno-flag">UNO!</div>` : '';
    const finishedTag = p.finished ? `<div class="uno-flag" style="background:var(--gold-2);color:#2a1f04;">OUT</div>` : '';
    const catchBtn = atRisk ? `<button class="catch-btn" data-pid="${p.id}">CATCH! +2</button>` : '';
    div.innerHTML = `
      <div class="opponent-header">
        <div class="opponent-avatar" style="background:${COLORS_HEX[p.colorIdx]};">${p.name[0].toUpperCase()}</div>
        <div class="opponent-name">${p.name}</div>
        ${isCur ? '<div class="opponent-turn-dot"></div>' : ''}
      </div>
      <div style="display:flex; align-items:center;">
        <div class="opponent-cards">${cardsHTML}</div>
        ${extra}
      </div>
      ${catchBtn}${unoFlag}${finishedTag}
    `;
    ops.appendChild(div);
  });
  $$('.catch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      socket.emit('catchUno');
    });
  });

  // My hand
  const hand = $('#hand');
  const you = state.players[state.you];
  const myCards = you && you.hand ? you.hand : [];
  $('#handCount').textContent = `${myCards.length} card${myCards.length === 1 ? '' : 's'}`;
  hand.innerHTML = '';
  myCards.forEach((card, idx) => {
    const playable = isMyTurn && !state.winner && isCardPlayable(card, top, top && top.color === 'wild' ? top.chosenColor : (top ? top.color : 'red'));
    const wrap = document.createElement('div');
    wrap.style.display = 'inline-block';
    wrap.innerHTML = renderCard(card, { entering: idx === myCards.length - 1 && state._lastDeal });
    const el = wrap.firstElementChild;
    if (playable) el.classList.add('playable');
    else el.classList.add('not-playable');
    el.addEventListener('click', () => onCardClick(card));
    hand.appendChild(el);
  });
  state._lastDeal = false;

  // UNO button — call when you're at 1 card (and you haven't called yet).
  const unoBtn = $('#unoBtn');
  const meAtRisk = state.unoAtRisk && state.unoAtRisk.playerId === socket.id;
  const alreadyCalled = you && you.calledUno;
  const canCallUno = myCards.length === 1 && !alreadyCalled;
  unoBtn.disabled = !canCallUno || state.winner;
  unoBtn.classList.toggle('active', canCallUno && !state.winner);
  unoBtn.classList.toggle('urgent', meAtRisk && !alreadyCalled);

  // Pending draw stacks
  if (state.pendingDraw > 0) {
    const target = state.players[state.currentPlayer];
    if (state.currentPlayer === state.you) {
      $('#turnText').textContent = `You must draw ${state.pendingDraw} cards (or stack)`;
    } else {
      $('#turnText').textContent = `${target.name} must draw ${state.pendingDraw}`;
    }
  }

  // Log
  renderLog(state.log);

  // Winner
  if (state.winner) {
    showWinner(state.winner, state);
  } else {
    $('#winnerModal').classList.add('hidden');
  }
}

function renderLog(log) {
  const el = $('#log');
  el.innerHTML = '';
  log.slice().reverse().forEach(entry => {
    const div = document.createElement('div');
    let cls = 'log-entry';
    if (entry.kind === 'system') cls += ' system';
    else if (entry.kind === 'win') cls += ' win';
    else if (entry.kind === 'action') cls += ' action';
    const color = entry.color != null ? COLORS_HEX[entry.color] : 'rgba(232,200,105,0.5)';
    div.className = cls;
    div.innerHTML = `<span class="log-dot" style="background:${color};"></span><span>${entry.text}</span>`;
    el.appendChild(div);
  });
}

function showWinner(winner, state) {
  $('#winnerModal').classList.remove('hidden');
  $('#winnerTitle').textContent = `${winner.name} wins!`;
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  winner.scoreboard.forEach(row => {
    const div = document.createElement('div');
    div.className = 'scoreboard-row' + (row.pos === 0 ? ' first' : '');
    div.innerHTML = `
      <div class="scoreboard-rank">${row.pos + 1}</div>
      <div class="waiting-avatar" style="background:${COLORS_HEX[row.colorIdx]}; width:22px; height:22px; font-size:11px;">${row.name[0].toUpperCase()}</div>
      <div class="scoreboard-name">${row.name}</div>
      <div class="scoreboard-pts">${row.score} pts</div>
    `;
    sb.appendChild(div);
  });
  const isHost = state && state.hostId === socket.id;
  const rematchBtn = $('#rematchBtn');
  const hint = $('#rematchHint');
  if (isHost) {
    rematchBtn.disabled = false;
    rematchBtn.textContent = 'Rematch';
    hint.textContent = 'You can start a new game with the same players and rules.';
  } else {
    rematchBtn.disabled = true;
    rematchBtn.textContent = 'Waiting for host...';
    hint.textContent = 'Only the host can start a rematch.';
  }
}
$('#rematchBtn').addEventListener('click', () => {
  socket.emit('rematch');
});
$('#returnHomeBtn').addEventListener('click', () => {
  socket.emit('leaveRoom');
  state.room = null;
  setTimeout(() => location.reload(), 200);
});

/* ===== Card click handler ===== */
function onCardClick(card) {
  if (!state.room || state.room.winner) return;
  if (state.room.currentPlayer !== state.you) {
    showToast("Not your turn");
    return;
  }
  if (state.room.colorPicker && state.room.colorPicker.playerId === socket.id) {
    showToast("Pick a color first");
    return;
  }
  if (card.type === 'wild' || card.type === 'wild4') {
    openColorModal(card);
  } else {
    socket.emit('playCard', { cardId: card.id });
  }
}

function openColorModal(card) {
  const modal = $('#colorModal');
  modal.classList.remove('hidden');
  modal.dataset.cardId = card.id;
}
$$('.color-choice').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = $('#colorModal');
    const cardId = modal.dataset.cardId;
    const color = btn.dataset.color;
    modal.classList.add('hidden');
    modal.dataset.cardId = '';
    if (cardId === '__server__') {
      socket.emit('chooseColor', { color });
    } else {
      // Hand-initiated wild: tell server to ignore the auto colorPicker this turn.
      suppressNextColorPicker = true;
      socket.emit('playCard', { cardId, chosenColor: color });
    }
  });
});

function openServerColorModal() {
  const modal = $('#colorModal');
  modal.classList.remove('hidden');
  modal.dataset.cardId = '__server__';
}
function closeColorModal() {
  const modal = $('#colorModal');
  modal.classList.add('hidden');
  modal.dataset.cardId = '';
}

function openSwapModal(state) {
  const modal = $('#swapModal');
  if (!modal.classList.contains('hidden')) return;
  const wrap = $('#swapChoices');
  wrap.innerHTML = '';
  state.players.forEach((p) => {
    if (p.id === socket.id) return;
    const btn = document.createElement('button');
    btn.className = 'swap-choice';
    btn.innerHTML = `<div class="swap-choice-avatar" style="background:${COLORS_HEX[p.colorIdx]};">${p.name[0].toUpperCase()}</div>
      <span>${p.name}</span>
      <span class="swap-choice-count">${p.handCount} cards</span>`;
    btn.addEventListener('click', () => {
      socket.emit('chooseSwapTarget', { targetId: p.id });
      closeSwapModal();
    });
    wrap.appendChild(btn);
  });
  modal.classList.remove('hidden');
}
function closeSwapModal() {
  $('#swapModal').classList.add('hidden');
}

/* ===== Draw / UNO ===== */
$('#drawBtn').addEventListener('click', () => {
  if (state.room.currentPlayer !== state.you) {
    showToast("Not your turn"); return;
  }
  socket.emit('drawCard');
});
$('#unoBtn').addEventListener('click', () => {
  socket.emit('callUno');
});

/* ===== Stack modal ===== */
$('#stackPlay').addEventListener('click', () => {
  $('#stackModal').classList.add('hidden');
  socket.emit('confirmPlayDrawn');
});
$('#stackKeep').addEventListener('click', () => {
  $('#stackModal').classList.add('hidden');
  socket.emit('keepDrawn');
});

/* ===== Server state ===== */
socket.on('state', (s) => {
  const prevHandCount = state.room && state.room.players[state.you]?.hand?.length;
  state.room = s;
  if (!s.started) {
    renderWaiting(s);
  } else {
    const cur = s.players[s.currentPlayer];
    const myHand = s.players[s.you]?.hand;
    if (prevHandCount != null && myHand && myHand.length > prevHandCount) {
      s._lastDeal = true;
    }
    renderPlay(s);
  }
});

socket.on('canPlayDrawn', ({ card }) => {
  const modal = $('#stackModal');
  modal.classList.remove('hidden');
  $('#stackTitle').textContent = 'Play or keep?';
  if (card.type === 'wild' || card.type === 'wild4') {
    $('#stackDesc').textContent = 'You drew a wild card — you can play it now (and pick a color) or keep it.';
  } else {
    $('#stackDesc').textContent = 'You can play this card right now or keep it and pass the turn.';
  }
});
