const authScreen = document.getElementById('auth-screen');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit');
const authDescription = document.getElementById('auth-description');
const authHint = document.getElementById('auth-hint');
const availabilityBox = document.getElementById('availability-box');
const availabilityStatus = document.getElementById('availability-status');
const usernameSuggestions = document.getElementById('username-suggestions');
const currentUserDisplay = document.getElementById('current-user-display');
const appScreen = document.getElementById('app-screen');
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const quitBtn = document.getElementById('quit-btn');
const shareRoomBtn = document.getElementById('share-room-btn');
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
const onlineRoomMode = document.getElementById('online-room-mode');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInput = document.getElementById('room-input');
const p1Display = document.getElementById('p1-name-display');
const p2Display = document.getElementById('p2-name-display');
const p1ScoreDisplay = document.getElementById('p1-score');
const p2ScoreDisplay = document.getElementById('p2-score');
const ruleNote = document.getElementById('rule-note');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatConnectionStatus = document.getElementById('chat-connection-status');
const globalChatTab = document.getElementById('global-chat-tab');
const roomChatTab = document.getElementById('room-chat-tab');
const chatTitlePrefix = document.getElementById('chat-title-prefix');

const SOCKET_SERVER_URL =
  window.location.protocol.startsWith('http') && window.location.port === '3000'
    ? window.location.origin
    : 'http://127.0.0.1:3000';
const SESSION_STORAGE_KEY = 'tic-tac-toe-session';

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
  action: 'create',
  roomPlayerCount: 0,
};

let socketClientLoader = null;
let authMode = 'login';
let session = {
  token: '',
  user: null,
};
let usernameCheckTimer = null;
let activeChatScope = 'global';
let globalChatHistory = [];
let roomChatHistory = [];

function saveSession() {
  if (session.token && session.user) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function loadSession() {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    session = {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      user: parsed.user && typeof parsed.user.username === 'string' ? parsed.user : null,
    };
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${SOCKET_SERVER_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Request failed.');
  }

  return payload;
}

function renderAuthMode() {
  const isSignup = authMode === 'signup';
  loginTab.classList.toggle('active', !isSignup);
  signupTab.classList.toggle('active', isSignup);
  authSubmitBtn.innerText = isSignup ? 'SIGN UP' : 'LOGIN';
  authDescription.innerText = isSignup
    ? 'Create a username and password to continue'
    : 'Login with your username and password';
  availabilityBox.classList.toggle('hidden', !isSignup);
  authPasswordInput.autocomplete = isSignup ? 'new-password' : 'current-password';

  if (!isSignup) {
    availabilityStatus.innerText = '';
    availabilityStatus.className = 'availability-status';
    usernameSuggestions.innerHTML = '';
  }
}

function renderAuthenticatedState() {
  const loggedIn = Boolean(session.token && session.user);
  authScreen.classList.toggle('hidden', loggedIn);
  appScreen.classList.toggle('hidden', !loggedIn);
  currentUserDisplay.innerText = session.user?.username || 'player';

  if (session.user) {
    p1NameInput.value = session.user.username;
  }
}

async function restoreSession() {
  loadSession();
  if (!session.token) {
    renderAuthenticatedState();
    return;
  }

  try {
    const user = await apiRequest('/api/auth/me');
    session.user = user;
    saveSession();
  } catch {
    session = { token: '', user: null };
    saveSession();
  }

  renderAuthenticatedState();
  if (session.token) {
    void ensureSocket();
  }
}

function setAuthHint(message, isError = false) {
  authHint.innerText = message;
  authHint.style.color = isError ? '#fda4af' : '#cbd5e1';
}

function setChatConnectionStatus(message, isError = false) {
  chatConnectionStatus.innerText = message;
  chatConnectionStatus.style.color = isError ? '#fda4af' : '#cbd5e1';
}

function renderChatHistory(messages) {
  chatMessages.innerHTML = '';

  if (!messages.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'chat-empty';
    emptyState.innerText = 'No messages yet. Start the conversation.';
    chatMessages.appendChild(emptyState);
    return;
  }

  messages.forEach((message) => appendChatMessage(message, false));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getActiveChatMessages() {
  return activeChatScope === 'room' ? roomChatHistory : globalChatHistory;
}

function renderActiveChat() {
  chatTitlePrefix.innerText = activeChatScope === 'room' ? 'ROOM' : 'GLOBAL';
  chatInput.placeholder =
    activeChatScope === 'room'
      ? (onlineState.roomCode ? `Message room ${onlineState.roomCode}` : 'Join a room to chat here')
      : 'Message the lobby';
  chatInput.disabled = activeChatScope === 'room' && !onlineState.roomCode;
  chatSendBtn.disabled = activeChatScope === 'room' && !onlineState.roomCode;
  roomChatTab.disabled = !onlineState.roomCode;
  renderChatHistory(getActiveChatMessages());
}

function setActiveChatScope(scope) {
  if (scope === 'room' && !onlineState.roomCode) {
    return;
  }

  activeChatScope = scope;
  globalChatTab.classList.toggle('active', scope === 'global');
  roomChatTab.classList.toggle('active', scope === 'room');
  renderActiveChat();
}

function appendChatMessage(message, scroll = true) {
  const emptyState = chatMessages.querySelector('.chat-empty');
  if (emptyState) {
    emptyState.remove();
  }

  const item = document.createElement('div');
  item.className = 'chat-message';
  if (message.username === session.user?.username) {
    item.classList.add('mine');
  }

  const meta = document.createElement('div');
  meta.className = 'chat-meta';
  meta.innerHTML = `<strong>${message.username}</strong><span>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;

  const text = document.createElement('p');
  text.className = 'chat-text';
  text.innerText = message.text;

  item.appendChild(meta);
  item.appendChild(text);

  if (message.sharedRoomId) {
    const shareCard = document.createElement('div');
    shareCard.className = 'shared-room-card';

    const shareLabel = document.createElement('p');
    shareLabel.className = 'shared-room-label';
    shareLabel.innerText = `Room ${message.sharedRoomId}`;

    const joinButton = document.createElement('button');
    joinButton.type = 'button';
    joinButton.className = 'join-room-chip';
    joinButton.innerText = 'Join';
    joinButton.addEventListener('click', () => {
      void joinSharedRoomFromChat(message.sharedRoomId);
    });

    shareCard.appendChild(shareLabel);
    shareCard.appendChild(joinButton);
    item.appendChild(shareCard);
  }

  chatMessages.appendChild(item);

  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  if (scroll) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function pushGlobalChatMessage(message) {
  globalChatHistory = [...globalChatHistory, message].slice(-100);
  if (activeChatScope === 'global') {
    appendChatMessage(message);
  }
}

function pushRoomChatMessage(message) {
  roomChatHistory = [...roomChatHistory, message].slice(-50);
  if (activeChatScope === 'room') {
    appendChatMessage(message);
  }
}

async function checkUsernameAvailability() {
  if (authMode !== 'signup') {
    return;
  }

  const username = authUsernameInput.value.trim();
  if (username.length < 3) {
    availabilityStatus.className = 'availability-status bad';
    availabilityStatus.innerText = 'Username must be at least 3 characters.';
    usernameSuggestions.innerHTML = '';
    return;
  }

  try {
    const result = await apiRequest(`/api/auth/availability?username=${encodeURIComponent(username)}`);
    availabilityStatus.className = `availability-status ${result.available ? 'good' : 'bad'}`;
    availabilityStatus.innerText = result.available
      ? `"${result.normalizedUsername}" is available.`
      : `"${result.normalizedUsername}" is already taken.`;
    usernameSuggestions.innerHTML = '';

    result.suggestions.forEach((suggestion) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion-chip';
      button.innerText = suggestion;
      button.addEventListener('click', () => {
        authUsernameInput.value = suggestion;
        void checkUsernameAvailability();
      });
      usernameSuggestions.appendChild(button);
    });
  } catch (error) {
    availabilityStatus.className = 'availability-status bad';
    availabilityStatus.innerText = error instanceof Error ? error.message : 'Could not check username.';
    usernameSuggestions.innerHTML = '';
  }
}

function scheduleUsernameCheck() {
  if (usernameCheckTimer) {
    window.clearTimeout(usernameCheckTimer);
  }

  usernameCheckTimer = window.setTimeout(() => {
    void checkUsernameAvailability();
  }, 250);
}

async function handleAuthSubmit() {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username || !password) {
    setAuthHint('Enter both username and password.', true);
    return;
  }

  setAuthHint(authMode === 'signup' ? 'Creating account...' : 'Logging in...');

  try {
    const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    session = {
      token: result.token,
      user: result.user,
    };
    saveSession();
    authPasswordInput.value = '';
    setAuthHint('Authenticated successfully.');
    renderAuthenticatedState();
    void ensureSocket();
  } catch (error) {
    setAuthHint(error instanceof Error ? error.message : 'Authentication failed.', true);
  }
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

function getRoomBannerText() {
  if (!isOnlineGame() || !onlineState.roomCode) {
    return '';
  }

  return `Room ${onlineState.roomCode}`;
}

function setOnlineRoomAction(action) {
  onlineState.action = action;
  createRoomBtn.classList.toggle('active', action === 'create');
  joinRoomBtn.classList.toggle('active', action === 'join');
  roomInput.classList.toggle('hidden', action !== 'join');
  roomInput.placeholder = action === 'join' ? 'Enter Room Code' : 'Room code will be generated';

  if (isOnlineGame()) {
    setupHint.innerText =
      action === 'create'
        ? 'Create a fresh room and share the room code with a friend.'
        : 'Enter an existing room code to join your friend.';
    startBtn.innerText = action === 'create' ? 'Create Room' : 'Join Room';
  }
}

function updateRoomBanner() {
  const text = getRoomBannerText();
  roomBanner.innerText = text;
  roomBanner.classList.toggle('hidden', !text);
  shareRoomBtn.classList.toggle('hidden', !text || onlineState.roomPlayerCount >= 2);
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
  onlineRoomMode.classList.toggle('hidden', !onlineMode);
  roomInput.classList.toggle('hidden', !onlineMode || onlineState.action !== 'join');
  p2NameInput.disabled = cpuMode;

  if (cpuMode) {
    p2NameInput.value = 'Computer';
    setupDescription.innerText = 'Play locally against the computer';
    setupHint.innerText = 'You are X. The computer will play as O.';
    startBtn.innerText = 'Start Game';
  } else if (onlineMode) {
    p2NameInput.value = '';
    setupDescription.innerText = 'Create or join a room to play across the server';
    setupHint.innerText =
      onlineState.action === 'create'
        ? 'Create a fresh room and share the room code with a friend.'
        : 'Enter an existing room code to join your friend.';
    startBtn.innerText = onlineState.action === 'create' ? 'Create Room' : 'Join Room';
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
  player1Name = p1NameInput.value.trim() || session.user?.username || 'Player 1';
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
  if (onlineState.socket || !session.token) {
    return;
  }

  const socketFactory = await loadSocketClient();
  onlineState.socket = socketFactory(SOCKET_SERVER_URL, {
    auth: {
      token: session.token,
    },
    transports: ['websocket', 'polling'],
  });

  onlineState.socket.on('connect', () => {
    onlineState.connected = true;
    setChatConnectionStatus('Connected to lobby');
    if (isOnlineGame()) {
      setupHint.innerText = 'Connected. Join a room to start playing.';
    }
  });

  onlineState.socket.on('disconnect', () => {
    onlineState.connected = false;
    setChatConnectionStatus('Disconnected from lobby', true);
    if (isOnlineGame()) {
      gameActive = false;
      isResolvingRound = false;
      setBoardDisabled(true);
      setStatusResult('Disconnected from server');
    }
  });

  onlineState.socket.on('connect_error', () => {
    onlineState.connected = false;
    setChatConnectionStatus('Could not connect to lobby', true);
    setupHint.innerText = `Couldn't reach the game server. Start it with "npm start" and open ${SOCKET_SERVER_URL}.`;
  });

  onlineState.socket.on('room:error', ({ message }) => {
    setupHint.innerText = message;
  });

  onlineState.socket.on('chat:history', (messages) => {
    globalChatHistory = messages;
    if (activeChatScope === 'global') {
      renderActiveChat();
    }
  });

  onlineState.socket.on('chat:message', (message) => {
    pushGlobalChatMessage(message);
  });

  onlineState.socket.on('room:chat:history', ({ roomCode, messages }) => {
    if (!roomCode) {
      roomChatHistory = [];
      setActiveChatScope('global');
      return;
    }

    onlineState.roomCode = roomCode;
    roomChatHistory = messages;
    setActiveChatScope('room');
  });

  onlineState.socket.on('room:chat:message', (message) => {
    if (message.roomCode === onlineState.roomCode) {
      pushRoomChatMessage(message);
    }
  });

  onlineState.socket.on('room:joined', ({ roomCode, playerMark }) => {
    onlineState.roomCode = roomCode;
    onlineState.myMark = playerMark;
    setupHint.innerText = `Joined room ${roomCode}.`;
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updateRoomBanner();
    renderActiveChat();
  });

  onlineState.socket.on('room:update', (snapshot) => {
    if (!isOnlineGame()) {
      return;
    }

    applyOnlineSnapshot(snapshot);
  });
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !onlineState.socket || !onlineState.connected) {
    return;
  }

  if (activeChatScope === 'room') {
    if (!onlineState.roomCode) {
      return;
    }

    onlineState.socket.emit('room:chat:send', {
      roomCode: onlineState.roomCode,
      text,
    });
  } else {
    onlineState.socket.emit('chat:send', { text });
  }

  chatInput.value = '';
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
  onlineState.roomPlayerCount = snapshot.players.length;

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
  const playerName = p1NameInput.value.trim() || session.user?.username || 'Player';
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

  if (onlineState.action === 'join' && !roomCode) {
    setupHint.innerText = 'Enter a room code before trying to join.';
    return;
  }

  setupHint.innerText = onlineState.action === 'create' ? 'Creating room...' : 'Joining room...';
  onlineState.socket.emit('room:join', {
    action: onlineState.action,
    playerName,
    roomCode: onlineState.action === 'join' ? roomCode : '',
    gameType,
  });
}

async function joinSharedRoomFromChat(roomCode) {
  if (!roomCode) {
    return;
  }

  setPlayerMode('online');
  setOnlineRoomAction('join');
  roomInput.value = roomCode;

  if (isOnlineGame() && onlineState.roomCode && onlineState.roomCode !== roomCode) {
    leaveOnlineRoom();
  }

  await startOnlineGame();
}

function shareCurrentRoomToGlobalChat() {
  if (!onlineState.socket || !onlineState.roomCode) {
    return;
  }

  onlineState.socket.emit('chat:send', {
    text: `Join my room ${onlineState.roomCode}`,
    sharedRoomId: onlineState.roomCode,
  });
  setActiveChatScope('global');
}

function leaveOnlineRoom() {
  clearPendingTimers();

  if (onlineState.socket) {
    onlineState.socket.emit('room:leave');
  }

  onlineState.roomCode = '';
  onlineState.myMark = '';
  onlineState.roomPlayerCount = 0;
  onlinePreviousRoundStatus = 'idle';
  roomChatHistory = [];
  setActiveChatScope('global');
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
shareRoomBtn.addEventListener('click', shareCurrentRoomToGlobalChat);
pvpBtn.addEventListener('click', () => setPlayerMode('pvp'));
cpuBtn.addEventListener('click', () => setPlayerMode('cpu'));
onlineBtn.addEventListener('click', () => setPlayerMode('online'));
classicBtn.addEventListener('click', () => setGameType('classic'));
survivalBtn.addEventListener('click', () => setGameType('three-move'));
createRoomBtn.addEventListener('click', () => setOnlineRoomAction('create'));
joinRoomBtn.addEventListener('click', () => setOnlineRoomAction('join'));
roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});

setOnlineRoomAction('create');
setPlayerMode('pvp');
setGameType('classic');
updateScoreboard();
setBoardDisabled(true);
updateRoomBanner();
renderAuthMode();
renderActiveChat();
void restoreSession();

loginTab.addEventListener('click', () => {
  authMode = 'login';
  renderAuthMode();
  setAuthHint('Use your username and password to continue.');
});

signupTab.addEventListener('click', () => {
  authMode = 'signup';
  renderAuthMode();
  setAuthHint('Create a username and password to continue.');
  void checkUsernameAvailability();
});

authSubmitBtn.addEventListener('click', () => {
  void handleAuthSubmit();
});

authPasswordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void handleAuthSubmit();
  }
});

authUsernameInput.addEventListener('input', () => {
  if (authMode === 'signup') {
    scheduleUsernameCheck();
  }
});

chatSendBtn.addEventListener('click', sendChatMessage);
globalChatTab.addEventListener('click', () => setActiveChatScope('global'));
roomChatTab.addEventListener('click', () => setActiveChatScope('room'));
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
});
