import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

const COLORS = [
  { name: 'Crimson', hex: '#e63946', light: '#ff6b7a', soft: 'rgba(230,57,70,0.18)' },
  { name: 'Azure',   hex: '#3a86ff', light: '#7eb0ff', soft: 'rgba(58,134,255,0.18)' },
  { name: 'Emerald', hex: '#06d6a0', light: '#6ef0c5', soft: 'rgba(6,214,160,0.18)' },
  { name: 'Saffron', hex: '#ffb703', light: '#ffd166', soft: 'rgba(255,183,3,0.18)' },
  { name: 'Violet',  hex: '#9d4edd', light: '#c39bff', soft: 'rgba(157,78,221,0.18)' },
  { name: 'Coral',   hex: '#ff7e5f', light: '#ffb199', soft: 'rgba(255,126,95,0.18)' },
  { name: 'Teal',    hex: '#2a9d8f', light: '#7fc8be', soft: 'rgba(42,157,143,0.18)' },
  { name: 'Rose',    hex: '#ff5d8f', light: '#ff96b6', soft: 'rgba(255,93,143,0.18)' }
];

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function buildDeck() {
  const colors = ['red', 'yellow', 'green', 'blue'];
  const deck = [];
  let id = 0;
  for (const color of colors) {
    deck.push({ id: `c${id++}`, type: 'number', color, value: 0 });
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: `c${id++}`, type: 'number', color, value: n });
      deck.push({ id: `c${id++}`, type: 'number', color, value: n });
    }
    for (let i = 0; i < 2; i++) {
      deck.push({ id: `c${id++}`, type: 'skip', color });
      deck.push({ id: `c${id++}`, type: 'reverse', color });
      deck.push({ id: `c${id++}`, type: 'draw2', color });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `c${id++}`, type: 'wild', color: 'wild' });
    deck.push({ id: `c${id++}`, type: 'wild4', color: 'wild' });
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createRoom(hostSocketId, hostName) {
  const code = makeCode();
  const room = {
    code,
    hostId: hostSocketId,
    players: [{
      id: hostSocketId,
      name: hostName,
      colorIdx: 0,
      hand: [],
      calledUno: false
    }],
    started: false,
    direction: 1,
    currentPlayer: 0,
    drawPile: [],
    discardPile: [],
    pendingDraw: 0,
    pendingDrawType: null,
    log: [],
    winner: null,
    colorPicker: null,
    finishedOrder: [],
    rules: {
      stackDraw4OnDraw2: false,
      sevenSwap: false,
      zeroRotate: false
    },
    pendingAction: null
  };
  rooms.set(code, room);
  return room;
}

function publicState(room, forSocketId) {
  return {
    code: room.code,
    started: room.started,
    direction: room.direction,
    currentPlayer: room.currentPlayer,
    drawPileCount: room.drawPile.length,
    discardPile: room.discardPile,
    log: room.log.slice(-30),
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      colorIdx: p.colorIdx,
      handCount: p.hand.length,
      hand: p.id === forSocketId ? p.hand : null,
      calledUno: p.calledUno,
      finished: p.finished || null
    })),
    hostId: room.hostId,
    winner: room.winner,
    pendingDraw: room.pendingDraw,
    pendingDrawType: room.pendingDrawType,
    colorPicker: room.colorPicker,
    unoAtRisk: room.unoAtRisk || null,
    rules: room.rules,
    pendingAction: room.pendingAction || null,
    you: room.players.find(p => p.id === forSocketId) ? room.players.findIndex(p => p.id === forSocketId) : -1
  };
}

function isPlayable(card, topCard, currentColor) {
  if (card.type === 'wild' || card.type === 'wild4') return true;
  if (topCard.type === 'wild' || topCard.type === 'wild4') {
    return card.color === currentColor;
  }
  if (card.color === topCard.color) return true;
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
  if (card.type !== 'number' && card.type === topCard.type) return true;
  return false;
}

function startGame(room) {
  const deck = shuffle(buildDeck());
  room.drawPile = deck;
  room.discardPile = [];
  room.players.forEach(p => {
    p.hand = [];
    p.calledUno = false;
    p.finished = null;
  });
  for (let i = 0; i < 7; i++) {
    for (const p of room.players) {
      p.hand.push(room.drawPile.shift());
    }
  }
  let first;
  do {
    first = room.drawPile.shift();
  } while (first.type !== 'number');
  room.discardPile.push(first);
  room.currentColor = first.color;
  room.started = true;
  room.currentPlayer = 0;
  room.direction = 1;
  room.pendingDraw = 0;
  room.pendingDrawType = null;
  room.winner = null;
  room.colorPicker = null;
  room.unoAtRisk = null;
  room.pendingAction = null;
  room.finishedOrder = [];
  room.winner = null;
  room.log.push({ text: 'Game started. First card: ' + first.color + ' ' + first.value, kind: 'system' });
}

function refillFromDiscard(room) {
  if (room.drawPile.length === 0) {
    const top = room.discardPile.pop();
    room.drawPile = shuffle(room.discardPile);
    room.discardPile = [top];
  }
}

function nextIndex(room, steps) {
  const n = room.players.length;
  return ((room.currentPlayer + steps * room.direction) % n + n) % n;
}

function advance(room, steps) {
  room.currentPlayer = nextIndex(room, steps);
}

function applyCardEffects(room, card, playedByIdx) {
  room.currentColor = card.color === 'wild' ? (card.chosenColor || 'red') : card.color;
  // Note: wild/wild4 only reach here after a color has been chosen.
  if (card.type === 'skip') {
    advance(room, 2);
    room.log.push({ text: `${room.players[playedByIdx].name} skipped the next player`, kind: 'action', color: room.players[playedByIdx].colorIdx });
  } else if (card.type === 'reverse') {
    room.direction *= -1;
    if (room.players.length === 2) {
      advance(room, 2);
    } else {
      advance(room, 1);
    }
    room.log.push({ text: `${room.players[playedByIdx].name} reversed direction`, kind: 'action', color: room.players[playedByIdx].colorIdx });
  } else if (card.type === 'draw2') {
    const target = nextIndex(room, 1);
    room.pendingDraw += 2;
    room.pendingDrawType = 'draw2';
    advance(room, 1);
    room.log.push({ text: `${room.players[playedByIdx].name} stacked +2 on ${room.players[target].name}`, kind: 'action', color: room.players[playedByIdx].colorIdx });
  } else if (card.type === 'wild4') {
    const target = nextIndex(room, 1);
    room.pendingDraw += 4;
    room.pendingDrawType = 'wild4';
    advance(room, 1);
    room.log.push({ text: `${room.players[playedByIdx].name} stacked +4 on ${room.players[target].name}`, kind: 'action', color: room.players[playedByIdx].colorIdx });
  } else if (card.type === 'number' && card.value === 7 && room.rules.sevenSwap) {
    const candidates = room.players.map((p, i) => ({ idx: i, name: p.name, colorIdx: p.colorIdx })).filter(c => c.idx !== playedByIdx);
    room.pendingAction = { kind: 'sevenSwap', playerId: room.players[playedByIdx].id };
    room.log.push({ text: `${room.players[playedByIdx].name} plays a 7 — choose a player to swap hands with`, kind: 'action', color: room.players[playedByIdx].colorIdx });
  } else if (card.type === 'number' && card.value === 0 && room.rules.zeroRotate) {
    const dir = room.direction;
    const n = room.players.length;
    const hands = room.players.map(p => p.hand);
    for (let i = 0; i < n; i++) {
      room.players[i].hand = hands[(i - dir + n) % n];
    }
    room.log.push({ text: `${room.players[playedByIdx].name} plays a 0 — all hands rotate ${dir > 0 ? 'forward' : 'backward'}`, kind: 'action', color: room.players[playedByIdx].colorIdx });
    advance(room, 1);
  } else {
    advance(room, 1);
  }
}

function broadcast(room) {
  for (const p of room.players) {
    io.to(p.id).emit('state', publicState(room, p.id));
  }
}

function applyUnoPenaltyIfDue(room, playerIdx) {
  if (!room.unoAtRisk) return;
  if (room.unoAtRisk.playerId !== room.players[playerIdx].id) return;
  const p = room.players[playerIdx];
  for (let i = 0; i < 2; i++) {
    if (room.drawPile.length === 0) refillFromDiscard(room);
    if (room.drawPile.length > 0) p.hand.push(room.drawPile.shift());
  }
  p.calledUno = false;
  room.unoAtRisk = null;
  room.log.push({ text: `${p.name} forgot to call UNO — draws 2`, kind: 'action', color: p.colorIdx });
}

function handleDrawnCard(room, player, meIdx, card) {
  player.hand.pop();
  const played = { ...card };
  room.discardPile.push(played);

  if (player.hand.length > 1) {
    player.calledUno = false;
  }
  if (player.hand.length === 1 && !player.calledUno) {
    room.unoAtRisk = { playerId: player.id, since: Date.now() };
  } else if (player.hand.length !== 1) {
    room.unoAtRisk = null;
  }
  if (player.hand.length === 0) {
    player.calledUno = true;
    room.unoAtRisk = null;
  }

  room.log.push({ text: `${player.name} played ${cardLabel(played)}`, kind: 'play', color: player.colorIdx });
  if (card.type === 'wild' || card.type === 'wild4') {
    room.colorPicker = { playerId: player.id, cardId: card.id };
    broadcast(room);
    return;
  }
  applyCardEffects(room, played, meIdx);
  broadcast(room);
}

io.on('connection', (socket) => {
  let myRoomCode = null;

  socket.on('createRoom', ({ name }) => {
    const cleanName = (name || 'Player').toString().slice(0, 16) || 'Player';
    const room = createRoom(socket.id, cleanName);
    myRoomCode = room.code;
    socket.join(room.code);
    socket.emit('joined', { code: room.code, you: 0 });
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, name }) => {
    const c = (code || '').toString().toUpperCase().trim();
    const room = rooms.get(c);
    if (!room) { socket.emit('errorMsg', { text: 'Room not found' }); return; }
    if (room.started) { socket.emit('errorMsg', { text: 'Game already started' }); return; }
    if (room.players.length >= 8) { socket.emit('errorMsg', { text: 'Room is full' }); return; }
    const cleanName = (name || 'Player').toString().slice(0, 16) || 'Player';
    const usedColors = new Set(room.players.map(p => p.colorIdx));
    let colorIdx = 0;
    for (let i = 0; i < COLORS.length; i++) {
      if (!usedColors.has(i)) { colorIdx = i; break; }
    }
    room.players.push({ id: socket.id, name: cleanName, colorIdx, hand: [], calledUno: false });
    socket.join(c);
    myRoomCode = c;
    const youIdx = room.players.findIndex(p => p.id === socket.id);
    socket.emit('joined', { code: c, you: youIdx });
    room.log.push({ text: `${cleanName} joined the table`, kind: 'system' });
    broadcast(room);
  });

  socket.on('leaveRoom', () => {
    handleLeave();
  });

  socket.on('startGame', () => {
    const room = rooms.get(myRoomCode);
    if (!room) return;
    if (socket.id !== room.hostId) { socket.emit('errorMsg', { text: 'Only the host can start' }); return; }
    if (room.players.length < 2) { socket.emit('errorMsg', { text: 'Need at least 2 players' }); return; }
    startGame(room);
    broadcast(room);
  });

  socket.on('rematch', () => {
    const room = rooms.get(myRoomCode);
    if (!room) return;
    if (socket.id !== room.hostId) { socket.emit('errorMsg', { text: 'Only the host can rematch' }); return; }
    if (room.players.length < 2) { socket.emit('errorMsg', { text: 'Need at least 2 players' }); return; }
    startGame(room);
    room.log.push({ text: 'Rematch! House rules and players kept.', kind: 'system' });
    broadcast(room);
  });

  socket.on('setRules', ({ rules }) => {
    const room = rooms.get(myRoomCode);
    if (!room) return;
    if (socket.id !== room.hostId) { socket.emit('errorMsg', { text: 'Only the host can change rules' }); return; }
    if (room.started) { socket.emit('errorMsg', { text: 'Rules are locked once the game starts' }); return; }
    if (!rules || typeof rules !== 'object') return;
    room.rules = {
      stackDraw4OnDraw2: !!rules.stackDraw4OnDraw2,
      sevenSwap: !!rules.sevenSwap,
      zeroRotate: !!rules.zeroRotate
    };
    broadcast(room);
  });

  socket.on('playCard', ({ cardId, chosenColor }) => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    if (meIdx !== room.currentPlayer) { socket.emit('errorMsg', { text: 'Not your turn' }); return; }
    applyUnoPenaltyIfDue(room, meIdx);
    const player = room.players[meIdx];
    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return;
    const card = player.hand[cardIdx];
    const top = room.discardPile[room.discardPile.length - 1];
    if (!isPlayable(card, top, room.currentColor)) { socket.emit('errorMsg', { text: 'Illegal play' }); return; }

    if (room.pendingDraw > 0 && room.pendingDrawType === 'draw2' && card.type !== 'draw2' && !(room.rules.stackDraw4OnDraw2 && card.type === 'wild4')) {
      socket.emit('errorMsg', { text: 'You must draw or stack +2' }); return;
    }
    if (room.pendingDraw > 0 && room.pendingDrawType === 'wild4' && card.type !== 'wild4') {
      socket.emit('errorMsg', { text: 'You must draw or stack +4' }); return;
    }

    if (room.pendingDraw > 0 && (card.type === 'draw2' || card.type === 'wild4')) {
      room.log.push({ text: `${player.name} stacked onto the pile!`, kind: 'action', color: player.colorIdx });
    }

    player.hand.splice(cardIdx, 1);
    const playedCard = { ...card };
    room.discardPile.push(playedCard);

    // Reset UNO flag if they still hold more than one card.
    if (player.hand.length > 1) {
      player.calledUno = false;
    }

    // Going down to 1 card: enter the UNO call window. If they don't call
    // before the next player's turn ends (and isn't caught), they draw 2.
    if (player.hand.length === 1 && !player.calledUno) {
      room.unoAtRisk = { playerId: player.id, since: Date.now() };
    } else if (player.hand.length !== 1) {
      room.unoAtRisk = null;
    }
    // Going to 0: their UNO call is satisfied (they just won).
    if (player.hand.length === 0) {
      player.calledUno = true;
      room.unoAtRisk = null;
    }

    const isWin = player.hand.length === 0;
    if (isWin) {
      player.finished = Date.now();
      room.finishedOrder.push(meIdx);
      room.log.push({ text: `${player.name} played their last card!`, kind: 'win', color: player.colorIdx });
    } else {
      room.log.push({ text: `${player.name} played ${cardLabel(playedCard, chosenColor)}`, kind: 'play', color: player.colorIdx });
    }

    if (isWin) {
      const remaining = room.players.length - room.finishedOrder.length;
      if (remaining <= 1) {
        // 2 players: first to empty wins outright.
        // 3+ players: only the last player with cards remains — they get 0 pts.
        if (room.players.length > 2) {
          const last = room.players.findIndex((p, i) => !room.finishedOrder.includes(i));
          room.finishedOrder.push(last);
        }
        const scoreboard = room.finishedOrder.map((idx, pos) => {
          let score = 0;
          if (pos < room.finishedOrder.length - 1) {
            for (const c of room.players[idx].hand) {
              if (c.type === 'number') score += c.value;
              else if (c.type === 'skip' || c.type === 'reverse' || c.type === 'draw2') score += 20;
              else score += 50;
            }
          }
          return { name: room.players[idx].name, colorIdx: room.players[idx].colorIdx, score, pos };
        });
        const winner = room.players[room.finishedOrder[0]];
        room.winner = { name: winner.name, colorIdx: winner.colorIdx, scoreboard };
        room.log.push({ text: `🏆 ${winner.name} wins!`, kind: 'win', color: winner.colorIdx });
        broadcast(room);
        return;
      }
      advance(room, 1);
      broadcast(room);
      return;
    }

    if (card.type === 'wild' || card.type === 'wild4') {
      if (chosenColor && ['red','yellow','green','blue'].includes(chosenColor)) {
        // Player already chose a color in the hand-initiated flow.
        // Set it on the card and apply effects immediately.
        playedCard.chosenColor = chosenColor;
        room.currentColor = chosenColor;
        applyCardEffects(room, playedCard, meIdx);
        broadcast(room);
        return;
      }
      room.colorPicker = { playerId: player.id, cardId: card.id };
      broadcast(room);
      return;
    }

    applyCardEffects(room, playedCard, meIdx);
    broadcast(room);
  });

  socket.on('drawCard', () => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    if (meIdx !== room.currentPlayer) { socket.emit('errorMsg', { text: 'Not your turn' }); return; }
    applyUnoPenaltyIfDue(room, meIdx);
    const player = room.players[meIdx];

    if (room.pendingDraw > 0) {
      const total = room.pendingDraw;
      for (let i = 0; i < total; i++) {
        refillFromDiscard(room);
        if (room.drawPile.length > 0) player.hand.push(room.drawPile.shift());
      }
      room.log.push({ text: `${player.name} drew ${total} cards`, kind: 'action', color: player.colorIdx });
      room.pendingDraw = 0;
      room.pendingDrawType = null;
      advance(room, 1);
    } else {
      refillFromDiscard(room);
      const drawn = room.drawPile.shift();
      if (drawn) {
        player.hand.push(drawn);
        room.log.push({ text: `${player.name} drew a card`, kind: 'action', color: player.colorIdx });
        const top = room.discardPile[room.discardPile.length - 1];
        if (isPlayable(drawn, top, room.currentColor)) {
          broadcast(room);
          socket.emit('canPlayDrawn', { card: drawn });
          return;
        }
      }
      advance(room, 1);
    }
    broadcast(room);
  });

  socket.on('keepDrawn', () => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    broadcast(room);
  });

  socket.on('callUno', () => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    if (meIdx === -1) return;
    const player = room.players[meIdx];
    if (player.hand.length === 1) {
      player.calledUno = true;
      if (room.unoAtRisk && room.unoAtRisk.playerId === player.id) {
        room.unoAtRisk = null;
      }
      room.log.push({ text: `${player.name} called UNO!`, kind: 'action', color: player.colorIdx });
      broadcast(room);
    }
  });

  socket.on('catchUno', () => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    if (!room.unoAtRisk) return;
    const catcherIdx = room.players.findIndex(p => p.id === socket.id);
    if (catcherIdx === -1) return;
    if (room.unoAtRisk.playerId === socket.id) return;
    const target = room.players.find(p => p.id === room.unoAtRisk.playerId);
    if (!target) return;
    target.calledUno = false;
    for (let i = 0; i < 2; i++) {
      if (room.drawPile.length === 0) refillFromDiscard(room);
      if (room.drawPile.length > 0) target.hand.push(room.drawPile.shift());
    }
    room.unoAtRisk = null;
    room.log.push({ text: `${room.players[catcherIdx].name} caught ${target.name} not calling UNO — ${target.name} draws 2`, kind: 'action', color: catcherIdx });
    broadcast(room);
  });

  socket.on('playDrawn', () => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    if (meIdx !== room.currentPlayer) return;
    const player = room.players[meIdx];
    const last = player.hand[player.hand.length - 1];
    if (!last) return;
    const top = room.discardPile[room.discardPile.length - 1];
    if (!isPlayable(last, top, room.currentColor)) { socket.emit('errorMsg', { text: "Can't play that" }); return; }
    handleDrawnCard(room, player, meIdx, last);
  });

  socket.on('confirmPlayDrawn', () => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    if (meIdx !== room.currentPlayer) return;
    const player = room.players[meIdx];
    const card = player.hand[player.hand.length - 1];
    if (!card) return;
    handleDrawnCard(room, player, meIdx, card);
  });

  socket.on('chooseColor', ({ color }) => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    if (!room.colorPicker || room.colorPicker.playerId !== socket.id) return;
    const valid = ['red', 'yellow', 'green', 'blue'];
    if (!valid.includes(color)) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    const player = room.players[meIdx];
    const top = room.discardPile[room.discardPile.length - 1];
    top.chosenColor = color;
    room.currentColor = color;
    room.colorPicker = null;
    room.log.push({ text: `${player.name} chose ${color}`, kind: 'action', color: player.colorIdx });
    applyCardEffects(room, top, meIdx);
    broadcast(room);
  });

  socket.on('chooseSwapTarget', ({ targetId }) => {
    const room = rooms.get(myRoomCode);
    if (!room || !room.started) return;
    if (!room.pendingAction || room.pendingAction.kind !== 'sevenSwap') return;
    if (room.pendingAction.playerId !== socket.id) return;
    const meIdx = room.players.findIndex(p => p.id === socket.id);
    const targetIdx = room.players.findIndex(p => p.id === targetId);
    if (meIdx === -1 || targetIdx === -1 || meIdx === targetIdx) return;
    const me = room.players[meIdx];
    const target = room.players[targetIdx];
    const tmp = me.hand;
    me.hand = target.hand;
    target.hand = tmp;
    room.pendingAction = null;
    room.log.push({ text: `${me.name} swaps hands with ${target.name}`, kind: 'action', color: me.colorIdx });
    advance(room, 1);
    broadcast(room);
  });

  socket.on('disconnect', () => {
    handleLeave();
  });

  function handleLeave() {
    if (!myRoomCode) return;
    const room = rooms.get(myRoomCode);
    if (!room) { myRoomCode = null; return; }
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) { myRoomCode = null; return; }
    const leaving = room.players[idx];
    room.players.splice(idx, 1);
    room.log.push({ text: `${leaving.name} left the game`, kind: 'system' });
    if (room.currentPlayer >= room.players.length) room.currentPlayer = 0;
    if (room.players.length === 0) {
      rooms.delete(myRoomCode);
    } else {
      if (room.hostId === socket.id) room.hostId = room.players[0].id;
      broadcast(room);
    }
    myRoomCode = null;
  }
});

function cardLabel(card, chosenColor) {
  if (card.type === 'wild') return 'Wild';
  if (card.type === 'wild4') return 'Wild +4';
  if (card.type === 'skip') return 'Skip';
  if (card.type === 'reverse') return 'Reverse';
  if (card.type === 'draw2') return '+2';
  return String(card.value);
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`UNO server running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
