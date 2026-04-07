const authPanel = document.getElementById('auth-panel');
const experience = document.getElementById('experience');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const authForm = document.getElementById('auth-form');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authMessage = document.getElementById('auth-message');
const availabilityPanel = document.getElementById('availability-panel');
const availabilityStatus = document.getElementById('availability-status');
const suggestions = document.getElementById('suggestions');
const currentUsername = document.getElementById('current-username');
const logoutBtn = document.getElementById('logout-btn');
const connectionPill = document.getElementById('connection-pill');
const chatStatus = document.getElementById('chat-status');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSubmit = document.getElementById('chat-submit');
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
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const onlineControls = document.getElementById('online-controls');
const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status-text');
const setupDescription = document.getElementById('setup-description');
const setupHint = document.getElementById('setup-hint');
const roomBanner = document.getElementById('room-banner');
const p1NameInput = document.getElementById('p1-input');
const p2NameInput = document.getElementById('p2-input');
const p2Field = document.getElementById('p2-field');
const roomInput = document.getElementById('room-input');
const p1Display = document.getElementById('p1-name-display');
const p2Display = document.getElementById('p2-name-display');
const p1ScoreDisplay = document.getElementById('p1-score');
const p2ScoreDisplay = document.getElementById('p2-score');
const ruleNote = document.getElementById('rule-note');

const API_BASE_URL =
  window.location.protocol.startsWith('http') && window.location.port === '3000'
    ? window.location.origin
    : 'http://127.0.0.1:3000';

const STORAGE_KEY = 'tic-tac-toe-session';
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

const authState = {
  mode: 'login',
  token: '',
  user: null,
};

const onlineState = {
  socket: null,
  connected: false,
  roomCode: '',
  myMark: '',
  action: 'create',
};

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
let onlinePreviousRoundStatus = 'idle';
let socketClientLoader = null;
let pendingComputerMove = null;
let pendingResultReveal = null;
let availabilityTimer = null;

function createEmptyBoard() {
  return Array(9).fill('');
}

function saveSession() {
  const value = authState.token && authState.user ? JSON.stringify({
    token: authState.token,
    user: authState.user,
  }) : '';

  if (value) {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
}

function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    authState.token = parsed.token || '';
    authState.user = parsed.user || null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authState.token ? { Authorization: `Bearer ${authState.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || 'Request failed.');
  }

  return payload;
}

function setAuthMode(mode) {
  authState.mode = mode;
  loginTab.classList.toggle('active', mode === 'login');
  signupTab.classList.toggle('active', mode === 'signup');
  authSubmit.innerText = mode === 'login' ? 'Login' : 'Create Account';
  authPasswordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  authMessage.innerText =
    mode === 'login'
      ? 'Use your account for online rooms and global chat.'
      : 'Choose a unique username. We will suggest nearby available names if yours is taken.';
  availabilityPanel.classList.toggle('hidden', mode !== 'signup');
  if (mode !== 'signup') {
    availabilityStatus.innerText = '';
    suggestions.innerHTML = '';
  }
}

function renderAuthenticatedUI() {
  const isLoggedIn = Boolean(authState.token && authState.user);
  authPanel.classList.toggle('hidden', isLoggedIn);
  experience.classList.toggle('hidden', !isLoggedIn);
  currentUsername.innerText = authState.user?.username || 'player';
  updateConnectionStatus();
  renderChatMessages([]);
}

function showAuthMessage(message, isError = false) {
  authMessage.innerText = message;
  authMessage.style.color = isError ? '#fda4af' : '';
}

async function restoreSession() {
  loadSession();
  if (!authState.token) {
    renderAuthenticatedUI();
    return;
  }

  try {
    const user = await apiRequest('/api/auth/me');
    authState.user = user;
    saveSession();
    renderAuthenticatedUI();
    await ensureSocket();
  } catch {
    authState.token = '';
    authState.user = null;
    saveSession();
    renderAuthenticatedUI();
  }
}

function normalizeRoomInput() {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

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

function updateRoomBanner() {
  const text = isOnlineGame() && onlineState.roomCode ? `Room ${onlineState.roomCode}` : '';
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
      statusText.innerText = `Your turn (${currentPlayer})`;
    } else {
      statusText.innerText = `${getNameForMark(currentPlayer)}'s turn`;
    }
  } else {
    statusText.innerText = `${getNameForMark(currentPlayer)}'s turn`;
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
      ? 'In 3-move mode, each player can keep only 3 marks. The oldest mark disappears on the fourth move.'
      : 'Classic mode fills the board normally and can end in a draw.';

  if (!syncOnly && isOnlineGame()) {
    setupHint.innerText = 'Classic or 3-move mode will apply when the room is created.';
  }
}

function setPlayerMode(mode) {
  playerMode = mode;
  pvpBtn.classList.toggle('active', mode === 'pvp');
  cpuBtn.classList.toggle('active', mode === 'cpu');
  onlineBtn.classList.toggle('active', mode === 'online');

  const onlineMode = mode === 'online';
  const cpuMode = mode === 'cpu';

  p2Field.classList.toggle('hidden', onlineMode);
  onlineControls.classList.toggle('hidden', !onlineMode);
  p2NameInput.disabled = cpuMode;

  if (cpuMode) {
    p2NameInput.value = 'Computer';
    setupDescription.innerText = 'Play locally against the computer on the same device.';
    setupHint.innerText = 'You are X. The computer will respond as O.';
    startBtn.innerText = 'Start Offline Match';
  } else if (onlineMode) {
    p2NameInput.value = '';
    p1NameInput.value = authState.user?.username || '';
    setupDescription.innerText = 'Create a room or join one with a room ID.';
    setupHint.innerText = onlineState.connected
      ? 'Create a private room or enter a room code to join your friend.'
      : 'Chat and online rooms connect after your socket is live.';
    startBtn.innerText = onlineState.action === 'create' ? 'Create Online Room' : 'Join Online Room';
  } else {
    p2NameInput.value = '';
    setupDescription.innerText = 'Play locally with two people on the same device.';
    setupHint.innerText = 'Offline mode starts instantly and does not need another player.';
    startBtn.innerText = 'Start Offline Match';
  }
}

function setOnlineAction(action) {
  onlineState.action = action;
  createRoomBtn.classList.toggle('active', action === 'create');
  joinRoomBtn.classList.toggle('active', action === 'join');
  roomInput.disabled = action !== 'join';
  roomInput.placeholder = action === 'join' ? 'Enter room code' : 'Room code will be generated';
  startBtn.innerText = action === 'create' ? 'Create Online Room' : 'Join Online Room';
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
  return getLocalAvailableMoves().find((move) => hasWinningLine(getSimulatedBoard(player, move), player));
}

function makeLocalMove(index) {
  if (useThreeMoveMode() && moveHistory[currentPlayer].length === 3) {
    const oldestMove = moveHistory[currentPlayer].shift();
    if (oldestMove !== undefined) {
      gameState[oldestMove] = '';
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
      setStatusResult("It's a draw.");
    }, 400);
    return;
  }

  winningLine.forEach((index) => {
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    if (cell) {
      cell.classList.add('winning');
    }
  });

  if (winnerMark === 'X') {
    p1Score += 1;
  } else if (winnerMark === 'O') {
    p2Score += 1;
  }
  updateScoreboard();

  pendingResultReveal = window.setTimeout(() => {
    isResolvingRound = false;
    setStatusResult(`${getNameForMark(winnerMark)} wins.`, winnerMark);
  }, 550);
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
    }, 450);
  }
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

function initLocalGame() {
  clearPendingTimers();
  player1Name = p1NameInput.value.trim() || authState.user?.username || 'Player 1';
  player2Name = isVsComputer() ? 'Computer' : (p2NameInput.value.trim() || 'Player 2');
  p1Score = 0;
  p2Score = 0;
  startLocalRound();
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
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
    script.src = `${API_BASE_URL}/socket.io/socket.io.js`;
    script.onload = () => {
      if (typeof io === 'undefined') {
        reject(new Error('Socket.IO client was loaded but not initialized.'));
        return;
      }

      resolve(io);
    };
    script.onerror = () => reject(new Error('Unable to load the realtime client.'));
    document.head.appendChild(script);
  });

  return socketClientLoader;
}

function updateConnectionStatus() {
  const text = onlineState.connected ? 'Chat live' : 'Realtime disconnected';
  connectionPill.innerText = text;
  chatStatus.innerText = text;
  chatInput.disabled = !onlineState.connected;
  chatSubmit.disabled = !onlineState.connected;
}

async function ensureSocket() {
  if (!authState.token) {
    return;
  }

  if (onlineState.socket) {
    return;
  }

  const socketFactory = await loadSocketClient();
  onlineState.socket = socketFactory(API_BASE_URL, {
    auth: {
      token: authState.token,
    },
    transports: ['websocket', 'polling'],
  });

  onlineState.socket.on('connect', () => {
    onlineState.connected = true;
    updateConnectionStatus();
    if (isOnlineGame()) {
      setupHint.innerText = 'Connected. You can create a room or join one with a code.';
    }
  });

  onlineState.socket.on('disconnect', () => {
    onlineState.connected = false;
    updateConnectionStatus();
    if (isOnlineGame()) {
      gameActive = false;
      isResolvingRound = false;
      setBoardDisabled(true);
      setStatusResult('Disconnected from the live server');
    }
  });

  onlineState.socket.on('connect_error', () => {
    onlineState.connected = false;
    updateConnectionStatus();
    setupHint.innerText = 'Realtime server is unavailable. Start the Nest app and refresh.';
  });

  onlineState.socket.on('room:error', ({ message }) => {
    setupHint.innerText = message;
  });

  onlineState.socket.on('room:joined', ({ roomCode, playerMark }) => {
    onlineState.roomCode = roomCode;
    onlineState.myMark = playerMark;
    setupHint.innerText = `You are in room ${roomCode}.`;
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updateRoomBanner();
  });

  onlineState.socket.on('room:update', (snapshot) => {
    if (isOnlineGame()) {
      applyOnlineSnapshot(snapshot);
    }
  });

  onlineState.socket.on('chat:history', (messages) => {
    renderChatMessages(messages);
  });

  onlineState.socket.on('chat:message', (message) => {
    appendChatMessage(message);
  });
}

function renderChatMessages(messages) {
  chatMessages.innerHTML = '';

  if (!messages.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'chat-empty';
    emptyState.innerText = 'No messages yet. Start the lobby conversation.';
    chatMessages.appendChild(emptyState);
    return;
  }

  messages.forEach((message) => appendChatMessage(message, false));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendChatMessage(message, scroll = true) {
  const emptyNode = chatMessages.querySelector('.chat-empty');
  if (emptyNode) {
    emptyNode.remove();
  }

  const wrapper = document.createElement('article');
  wrapper.className = 'chat-message';
  if (message.username === authState.user?.username) {
    wrapper.classList.add('mine');
  }

  const meta = document.createElement('div');
  meta.className = 'chat-meta';
  meta.innerHTML = `<strong>${message.username}</strong><span>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;

  const text = document.createElement('p');
  text.className = 'chat-text';
  text.innerText = message.text;

  wrapper.appendChild(meta);
  wrapper.appendChild(text);
  chatMessages.appendChild(wrapper);

  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  if (scroll) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
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
    statusText.innerText = `Room ${snapshot.roomCode} is waiting for another player`;
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

    const reveal = () => {
      isResolvingRound = false;
      setStatusResult(`${getNameForMark(snapshot.winnerMark)} wins.`, snapshot.winnerMark);
    };

    if (onlinePreviousRoundStatus !== 'won') {
      pendingResultReveal = window.setTimeout(reveal, 600);
    } else {
      reveal();
    }

    onlinePreviousRoundStatus = 'won';
    return;
  }

  const revealDraw = () => {
    isResolvingRound = false;
    setStatusResult("It's a draw.");
  };

  if (onlinePreviousRoundStatus !== 'draw') {
    pendingResultReveal = window.setTimeout(revealDraw, 420);
  } else {
    revealDraw();
  }

  onlinePreviousRoundStatus = 'draw';
}

async function startOnlineGame() {
  if (!onlineState.connected || !onlineState.socket) {
    setupHint.innerText = 'Realtime connection is not ready yet.';
    return;
  }

  const roomCode = roomInput.value.trim().toUpperCase();
  if (onlineState.action === 'join' && !roomCode) {
    setupHint.innerText = 'Enter a room code before joining.';
    return;
  }

  player1Name = authState.user?.username || 'Player';
  p1Score = 0;
  p2Score = 0;
  onlinePreviousRoundStatus = 'idle';
  resetBoardClasses();

  setupHint.innerText = onlineState.action === 'create' ? 'Creating room...' : 'Joining room...';
  onlineState.socket.emit('room:join', {
    action: onlineState.action,
    roomCode: onlineState.action === 'join' ? roomCode : '',
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
  const clickedIndex = Number.parseInt(event.currentTarget.getAttribute('data-index'), 10);
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
  player1Name = authState.user?.username || 'Player 1';
  player2Name = 'Player 2';
  currentPlayer = 'X';
  gameState = createEmptyBoard();
  moveHistory = { X: [], O: [] };
  resetBoardClasses();
  updateScoreboard();
  updateRoomBanner();
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  setPlayerMode(playerMode);
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username || !password) {
    showAuthMessage('Enter both username and password.', true);
    return;
  }

  showAuthMessage(authState.mode === 'login' ? 'Logging in...' : 'Creating your account...');

  try {
    const endpoint = authState.mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    authState.token = result.token;
    authState.user = result.user;
    saveSession();
    renderAuthenticatedUI();
    p1NameInput.value = result.user.username;
    setPlayerMode(playerMode);
    await resetSocket();
    await ensureSocket();
  } catch (error) {
    showAuthMessage(error instanceof Error ? error.message : 'Authentication failed.', true);
  }
}

async function checkUsernameAvailability() {
  const username = authUsernameInput.value.trim();
  if (authState.mode !== 'signup') {
    return;
  }

  if (username.length < 3) {
    availabilityStatus.className = 'availability-status bad';
    availabilityStatus.innerText = 'Username must be at least 3 characters.';
    suggestions.innerHTML = '';
    return;
  }

  try {
    const result = await apiRequest(`/api/auth/availability?username=${encodeURIComponent(username)}`);
    availabilityStatus.className = `availability-status ${result.available ? 'good' : 'bad'}`;
    availabilityStatus.innerText = result.available
      ? `"${result.normalizedUsername}" is available.`
      : `"${result.normalizedUsername}" is taken. Try one of these available usernames.`;

    suggestions.innerHTML = '';
    result.suggestions.forEach((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion-chip';
      button.innerText = name;
      button.addEventListener('click', () => {
        authUsernameInput.value = name;
        checkUsernameAvailability();
      });
      suggestions.appendChild(button);
    });
  } catch (error) {
    availabilityStatus.className = 'availability-status bad';
    availabilityStatus.innerText = error instanceof Error ? error.message : 'Could not check username.';
    suggestions.innerHTML = '';
  }
}

function resetGameStateForLogout() {
  handleQuit();
  setPlayerMode('pvp');
  setGameType('classic');
  renderChatMessages([]);
}

async function resetSocket() {
  if (onlineState.socket) {
    onlineState.socket.removeAllListeners();
    onlineState.socket.disconnect();
  }

  onlineState.socket = null;
  onlineState.connected = false;
  onlineState.roomCode = '';
  onlineState.myMark = '';
  updateConnectionStatus();
}

async function handleLogout() {
  await resetSocket();
  authState.token = '';
  authState.user = null;
  saveSession();
  resetGameStateForLogout();
  renderAuthenticatedUI();
  authPasswordInput.value = '';
  showAuthMessage('Use your account for online rooms and global chat.');
}

function handleAvailabilityInput() {
  if (availabilityTimer) {
    window.clearTimeout(availabilityTimer);
  }

  availabilityTimer = window.setTimeout(checkUsernameAvailability, 250);
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (!text || !onlineState.socket || !onlineState.connected) {
    return;
  }

  onlineState.socket.emit('chat:send', { text });
  chatInput.value = '';
}

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));
loginTab.addEventListener('click', () => setAuthMode('login'));
signupTab.addEventListener('click', () => setAuthMode('signup'));
authForm.addEventListener('submit', handleAuthSubmit);
authUsernameInput.addEventListener('input', handleAvailabilityInput);
logoutBtn.addEventListener('click', handleLogout);
chatForm.addEventListener('submit', handleChatSubmit);
startBtn.addEventListener('click', handleStart);
resetBtn.addEventListener('click', handleReset);
quitBtn.addEventListener('click', handleQuit);
pvpBtn.addEventListener('click', () => setPlayerMode('pvp'));
cpuBtn.addEventListener('click', () => setPlayerMode('cpu'));
onlineBtn.addEventListener('click', () => setPlayerMode('online'));
classicBtn.addEventListener('click', () => setGameType('classic'));
survivalBtn.addEventListener('click', () => setGameType('three-move'));
createRoomBtn.addEventListener('click', () => setOnlineAction('create'));
joinRoomBtn.addEventListener('click', () => setOnlineAction('join'));
roomInput.addEventListener('input', normalizeRoomInput);

setAuthMode('login');
setOnlineAction('create');
setPlayerMode('pvp');
setGameType('classic');
updateScoreboard();
setBoardDisabled(true);
updateRoomBanner();
updateConnectionStatus();
restoreSession();
