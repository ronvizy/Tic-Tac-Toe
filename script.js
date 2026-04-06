const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const quitBtn = document.getElementById('quit-btn');
const pvpBtn = document.getElementById('pvp-btn');
const cpuBtn = document.getElementById('cpu-btn');
const onlineBtn = document.getElementById('online-btn');
const classicBtn = document.getElementById('classic-btn');
const survivalBtn = document.getElementById('survival-btn');
const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status-text');
const setupDescription = document.getElementById('setup-description');
const setupHint = document.getElementById('setup-hint');
const roomBanner = document.getElementById('room-banner');
const p1NameInput = document.getElementById('p1-input');
const p2NameInput = document.getElementById('p2-input');
const roomInput = document.getElementById('room-input');
const p1Display = document.getElementById('p1-name-display');
const p2Display = document.getElementById('p2-name-display');
const p1ScoreDisplay = document.getElementById('p1-score');
const p2ScoreDisplay = document.getElementById('p2-score');
const ruleNote = document.getElementById('rule-note');

const SOCKET_SERVER_URL =
  window.location.protocol.startsWith('http') && window.location.port === '3000'
    ? window.location.origin
    : 'http://127.0.0.1:3000';

const winningConditions = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let playerMode = 'pvp';
let gameType = 'classic';
let player1Name = 'Player 1';
let player2Name = 'Player 2';
let p1Score = 0;
let p2Score = 0;
let currentPlayer = 'X';
let gameActive = false;
let gameState = Array(9).fill('');
let moveHistory = { X: [], O: [] };
let isResolvingRound = false;
let pendingComputerMove = null;
let pendingResultReveal = null;
let onlinePreviousRoundStatus = 'idle';

const onlineState = {
  socket: null,
  roomCode: '',
  myMark: '',
  connected: false,
};

let socketClientLoader = null;

function isVsComputer() {
  return playerMode === 'cpu';
}

function isOnlineGame() {
  return playerMode === 'online';
}

function useThreeMoveMode() {
  return gameType === 'three-move';
}

function clearPendingTimers() {
  if (pendingComputerMove) {
    window.clearTimeout(pendingComputerMove);
    pendingComputerMove = null;
  }

  if (pendingResultReveal) {
    window.clearTimeout(pendingResultReveal);
    pendingResultReveal = null;
  }
}

function clearWinningHighlights() {
  cells.forEach((cell) => cell.classList.remove('winning'));
}

function clearOldestHighlights() {
  cells.forEach((cell) => cell.classList.remove('oldest'));
}

function resetBoardClasses() {
  cells.forEach((cell) => {
    cell.classList.remove('x', 'o', 'disabled', 'oldest', 'winning');
    cell.innerText = '';
  });
}

function renderBoard() {
  cells.forEach((cell, index) => {
    const mark = gameState[index];
    cell.innerText = mark;
    cell.classList.toggle('x', mark === 'X');
    cell.classList.toggle('o', mark === 'O');
    cell.classList.remove('winning');
  });
}

function setStatusResult(message, winnerMark = '') {
  statusText.innerText = message;
  statusText.classList.add('result');
  statusText.classList.toggle('x', winnerMark === 'X');
  statusText.classList.toggle('o', winnerMark === 'O');
}

function getNameForMark(mark) {
  return mark === 'X' ? player1Name : player2Name;
}

function getRoomBannerText() {
  if (!isOnlineGame() || !onlineState.roomCode) {
    return '';
  }

  return `Room ${onlineState.roomCode}`;
}

function updateRoomBanner() {
  const text = getRoomBannerText();
  roomBanner.innerText = text;
  roomBanner.classList.toggle('hidden', !text);
}

function highlightOldestMove() {
  clearOldestHighlights();

  if (!useThreeMoveMode() || !gameActive) {
    return;
  }

  const oldestMove = moveHistory[currentPlayer][0];
  if (moveHistory[currentPlayer].length === 3 && oldestMove !== undefined) {
    const cell = document.querySelector(`.cell[data-index="${oldestMove}"]`);
    if (cell) {
      cell.classList.add('oldest');
    }
  }
}

function setBoardDisabled(disabled) {
  cells.forEach((cell) => cell.classList.toggle('disabled', disabled));
}

function updateScoreboard() {
  p1Display.innerText = player1Name;
  p2Display.innerText = player2Name;
  p1ScoreDisplay.innerText = String(p1Score);
  p2ScoreDisplay.innerText = String(p2Score);
  document.getElementById('p1-card').classList.toggle('active', currentPlayer === 'X' && gameActive);
  document.getElementById('p2-card').classList.toggle('active', currentPlayer === 'O' && gameActive);
}

function updateTurnUI() {
  statusText.classList.remove('result', 'x', 'o');

  if (isOnlineGame()) {
    if (!gameActive) {
      statusText.innerText = 'Waiting for opponent...';
    } else if (currentPlayer === onlineState.myMark) {
      statusText.innerText = `Your Turn (${currentPlayer})`;
    } else {
      statusText.innerText = `${getNameForMark(currentPlayer)}'s Turn`;
    }
  } else {
    statusText.innerText = `${getNameForMark(currentPlayer)}'s Turn`;
  }

  const shouldDisable =
    !gameActive ||
    isResolvingRound ||
    (isVsComputer() && currentPlayer === 'O') ||
    (isOnlineGame() && currentPlayer !== onlineState.myMark);

  setBoardDisabled(shouldDisable);
  updateScoreboard();
  updateRoomBanner();
  highlightOldestMove();
}

function setGameType(type, syncOnly = false) {
  gameType = type;
  classicBtn.classList.toggle('active', type === 'classic');
  survivalBtn.classList.toggle('active', type === 'three-move');
  ruleNote.innerText =
    type === 'three-move'
      ? 'In 3-move mode, each player keeps only 3 marks. The oldest mark disappears on the 4th move.'
      : 'Classic mode fills the board normally and can end in a draw.';

  if (!syncOnly && isOnlineGame()) {
    setupHint.innerText = 'Game type will apply to the room you create first.';
  }
}

function setPlayerMode(mode) {
  playerMode = mode;
  pvpBtn.classList.toggle('active', mode === 'pvp');
  cpuBtn.classList.toggle('active', mode === 'cpu');
  onlineBtn.classList.toggle('active', mode === 'online');

  const onlineMode = mode === 'online';
  const cpuMode = mode === 'cpu';

  p2NameInput.classList.toggle('hidden', onlineMode);
  roomInput.classList.toggle('hidden', !onlineMode);
  p2NameInput.disabled = cpuMode;

  if (cpuMode) {
    p2NameInput.value = 'Computer';
    setupDescription.innerText = 'Play locally against the computer';
    setupHint.innerText = 'You are X. The computer will play as O.';
    startBtn.innerText = 'Start Game';
  } else if (onlineMode) {
    p2NameInput.value = '';
    setupDescription.innerText = 'Create or join a room to play across the server';
    setupHint.innerText = 'Share the room code with a friend, or leave it blank to create one.';
    startBtn.innerText = 'Join Room';
  } else {
    p2NameInput.value = '';
    setupDescription.innerText = 'Enter player names to start the battle';
    setupHint.innerText = 'Choose a mode and start playing.';
    startBtn.innerText = 'Start Game';
  }

  p2NameInput.placeholder = cpuMode ? 'Computer (O)' : 'Player 2 (O)';
}

function createEmptyBoard() {
  return Array(9).fill('');
}

function getLocalAvailableMoves() {
  return gameState
    .map((value, index) => (value === '' ? index : null))
    .filter((index) => index !== null);
}

function getSimulatedBoard(player, moveIndex) {
  const simulatedBoard = [...gameState];

  if (useThreeMoveMode() && moveHistory[player].length === 3) {
    simulatedBoard[moveHistory[player][0]] = '';
  }

  simulatedBoard[moveIndex] = player;
  return simulatedBoard;
}

function hasWinningLine(board, player) {
  return winningConditions.some(([a, b, c]) => board[a] === player && board[b] === player && board[c] === player);
}

function findWinningMove(player) {
  const availableMoves = getLocalAvailableMoves();
  return availableMoves.find((move) => hasWinningLine(getSimulatedBoard(player, move), player));
}

function removeMoveFromBoard(index) {
  gameState[index] = '';
}

function makeLocalMove(index) {
  if (useThreeMoveMode() && moveHistory[currentPlayer].length === 3) {
    const oldestMove = moveHistory[currentPlayer].shift();
    if (oldestMove !== undefined) {
      removeMoveFromBoard(oldestMove);
    }
  }

  gameState[index] = currentPlayer;
  if (useThreeMoveMode()) {
    moveHistory[currentPlayer].push(index);
  }

  renderBoard();
  checkLocalResult();
}

function getComputerMove() {
  const availableMoves = getLocalAvailableMoves();
  const winningMove = findWinningMove('O');
  if (winningMove !== undefined) {
    return winningMove;
  }

  const blockingMove = findWinningMove('X');
  if (blockingMove !== undefined) {
    return blockingMove;
  }

  if (availableMoves.includes(4)) {
    return 4;
  }

  const corners = [0, 2, 6, 8].filter((index) => availableMoves.includes(index));
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  return availableMoves[Math.floor(Math.random() * availableMoves.length)];
}

function finishRound(draw = false, winningLine = [], winnerMark = '') {
  gameActive = false;
  isResolvingRound = true;
  clearPendingTimers();
  clearOldestHighlights();
  setBoardDisabled(true);

  if (draw) {
    pendingResultReveal = window.setTimeout(() => {
      isResolvingRound = false;
      setStatusResult("It's a Draw!");
    }, 500);
    return;
  }

  winningLine.forEach((index) => {
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    if (cell) {
      cell.classList.add('winning');
    }
  });

  const winnerName = getNameForMark(winnerMark);
  if (winnerMark === 'X') {
    p1Score += 1;
  } else if (winnerMark === 'O') {
    p2Score += 1;
  }
  updateScoreboard();

  pendingResultReveal = window.setTimeout(() => {
    isResolvingRound = false;
    setStatusResult(`${winnerName} Wins!`, winnerMark);
  }, 700);
}

function checkLocalResult() {
  for (const [a, b, c] of winningConditions) {
    if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
      finishRound(false, [a, b, c], currentPlayer);
      return;
    }
  }

  if (!useThreeMoveMode() && !gameState.includes('')) {
    finishRound(true);
    return;
  }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateTurnUI();

  if (isVsComputer() && currentPlayer === 'O') {
    pendingComputerMove = window.setTimeout(() => {
      pendingComputerMove = null;
      const move = getComputerMove();
      if (move !== undefined) {
        makeLocalMove(move);
      }
    }, 500);
  }
}

function initLocalGame() {
  clearPendingTimers();
  isResolvingRound = false;
  player1Name = p1NameInput.value.trim() || 'Player 1';
  player2Name = isVsComputer() ? 'Computer' : (p2NameInput.value.trim() || 'Player 2');
  p1Score = 0;
  p2Score = 0;
  startLocalRound();
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
}

function startLocalRound() {
  clearPendingTimers();
  isResolvingRound = false;
  currentPlayer = 'X';
  gameActive = true;
  gameState = createEmptyBoard();
  moveHistory = { X: [], O: [] };
  resetBoardClasses();
  updateTurnUI();
}

function loadSocketClient() {
  if (typeof io !== 'undefined') {
    return Promise.resolve(io);
  }

  if (socketClientLoader) {
    return socketClientLoader;
  }

  socketClientLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${SOCKET_SERVER_URL}/socket.io/socket.io.js`;
    script.onload = () => {
      if (typeof io === 'undefined') {
        reject(new Error('Socket.IO client loaded but io is unavailable.'));
        return;
      }

      resolve(io);
    };
    script.onerror = () => {
      reject(new Error('Unable to load the Socket.IO client from the Nest server.'));
    };
    document.head.appendChild(script);
  });

  return socketClientLoader;
}

async function ensureSocket() {
  if (onlineState.socket) {
    return;
  }

  const socketFactory = await loadSocketClient();
  onlineState.socket = socketFactory(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling'],
  });

  onlineState.socket.on('connect', () => {
    onlineState.connected = true;
    if (isOnlineGame()) {
      setupHint.innerText = 'Connected. Join a room to start playing.';
    }
  });

  onlineState.socket.on('disconnect', () => {
    onlineState.connected = false;
    if (isOnlineGame()) {
      gameActive = false;
      isResolvingRound = false;
      setBoardDisabled(true);
      setStatusResult('Disconnected from server');
    }
  });

  onlineState.socket.on('connect_error', () => {
    onlineState.connected = false;
    setupHint.innerText = `Couldn't reach the game server. Start it with "npm start" and open ${SOCKET_SERVER_URL}.`;
  });

  onlineState.socket.on('room:error', ({ message }) => {
    setupHint.innerText = message;
  });

  onlineState.socket.on('room:joined', ({ roomCode, playerMark }) => {
    onlineState.roomCode = roomCode;
    onlineState.myMark = playerMark;
    setupHint.innerText = `Joined room ${roomCode}.`;
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updateRoomBanner();
  });

  onlineState.socket.on('room:update', (snapshot) => {
    if (!isOnlineGame()) {
      return;
    }

    applyOnlineSnapshot(snapshot);
  });
}

function applyOnlineSnapshot(snapshot) {
  clearPendingTimers();
  gameType = snapshot.gameType;
  setGameType(snapshot.gameType, true);
  gameState = [...snapshot.board];
  moveHistory = {
    X: [...snapshot.moveHistory.X],
    O: [...snapshot.moveHistory.O],
  };
  currentPlayer = snapshot.currentPlayer;
  p1Score = snapshot.scores.X;
  p2Score = snapshot.scores.O;
  player1Name = snapshot.players.find((player) => player.mark === 'X')?.name || 'Player X';
  player2Name = snapshot.players.find((player) => player.mark === 'O')?.name || 'Waiting...';
  onlineState.roomCode = snapshot.roomCode;

  renderBoard();
  updateScoreboard();
  updateRoomBanner();

  if (snapshot.roundStatus === 'waiting') {
    onlinePreviousRoundStatus = 'waiting';
    gameActive = false;
    isResolvingRound = false;
    clearWinningHighlights();
    clearOldestHighlights();
    setBoardDisabled(true);
    statusText.classList.remove('result', 'x', 'o');
    statusText.innerText = `Room ${snapshot.roomCode}: waiting for opponent...`;
    return;
  }

  if (snapshot.roundStatus === 'active') {
    onlinePreviousRoundStatus = 'active';
    gameActive = true;
    isResolvingRound = false;
    clearWinningHighlights();
    updateTurnUI();
    return;
  }

  gameActive = false;
  isResolvingRound = true;
  clearOldestHighlights();
  setBoardDisabled(true);

  if (snapshot.roundStatus === 'won') {
    clearWinningHighlights();
    snapshot.winningLine.forEach((index) => {
      const cell = document.querySelector(`.cell[data-index="${index}"]`);
      if (cell) {
        cell.classList.add('winning');
      }
    });

    const winnerName = getNameForMark(snapshot.winnerMark);
    const reveal = () => {
      isResolvingRound = false;
      setStatusResult(`${winnerName} Wins!`, snapshot.winnerMark);
    };

    if (onlinePreviousRoundStatus !== 'won') {
      pendingResultReveal = window.setTimeout(reveal, 700);
    } else {
      reveal();
    }

    onlinePreviousRoundStatus = 'won';
    return;
  }

  clearWinningHighlights();
  const revealDraw = () => {
    isResolvingRound = false;
    setStatusResult("It's a Draw!");
  };

  if (onlinePreviousRoundStatus !== 'draw') {
    pendingResultReveal = window.setTimeout(revealDraw, 500);
  } else {
    revealDraw();
  }

  onlinePreviousRoundStatus = 'draw';
}

async function startOnlineGame() {
  const playerName = p1NameInput.value.trim() || 'Player';
  const roomCode = roomInput.value.trim().toUpperCase();
  try {
    await ensureSocket();
  } catch (error) {
    setupHint.innerText =
      error instanceof Error
        ? `${error.message} Start the Nest server with "npm start".`
        : 'Socket setup failed.';
    return;
  }

  if (!onlineState.socket) {
    return;
  }

  setupHint.innerText = 'Joining room...';
  onlineState.socket.emit('room:join', {
    playerName,
    roomCode,
    gameType,
  });
}

function leaveOnlineRoom() {
  clearPendingTimers();

  if (onlineState.socket) {
    onlineState.socket.emit('room:leave');
  }

  onlineState.roomCode = '';
  onlineState.myMark = '';
  onlinePreviousRoundStatus = 'idle';
}

function handleCellClick(event) {
  const clickedIndex = Number.parseInt(event.target.getAttribute('data-index'), 10);
  if (Number.isNaN(clickedIndex)) {
    return;
  }

  if (isOnlineGame()) {
    if (!gameActive || isResolvingRound || currentPlayer !== onlineState.myMark || gameState[clickedIndex] !== '') {
      return;
    }

    onlineState.socket?.emit('game:move', {
      roomCode: onlineState.roomCode,
      index: clickedIndex,
    });
    return;
  }

  if (!gameActive || isResolvingRound || (isVsComputer() && currentPlayer === 'O') || gameState[clickedIndex] !== '') {
    return;
  }

  makeLocalMove(clickedIndex);
}

function handleStart() {
  if (isOnlineGame()) {
    startOnlineGame();
    return;
  }

  initLocalGame();
}

function handleReset() {
  if (isOnlineGame()) {
    onlineState.socket?.emit('game:restart', { roomCode: onlineState.roomCode });
    return;
  }

  startLocalRound();
}

function handleQuit() {
  clearPendingTimers();

  if (isOnlineGame()) {
    leaveOnlineRoom();
  }

  gameActive = false;
  isResolvingRound = false;
  p1Score = 0;
  p2Score = 0;
  player1Name = 'Player 1';
  player2Name = 'Player 2';
  currentPlayer = 'X';
  gameState = createEmptyBoard();
  moveHistory = { X: [], O: [] };
  resetBoardClasses();
  updateScoreboard();
  updateRoomBanner();
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
}

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));
startBtn.addEventListener('click', handleStart);
resetBtn.addEventListener('click', handleReset);
quitBtn.addEventListener('click', handleQuit);
pvpBtn.addEventListener('click', () => setPlayerMode('pvp'));
cpuBtn.addEventListener('click', () => setPlayerMode('cpu'));
onlineBtn.addEventListener('click', () => setPlayerMode('online'));
classicBtn.addEventListener('click', () => setGameType('classic'));
survivalBtn.addEventListener('click', () => setGameType('three-move'));
roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});

setPlayerMode('pvp');
setGameType('classic');
updateScoreboard();
setBoardDisabled(true);
updateRoomBanner();
