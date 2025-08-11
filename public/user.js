const socket = io();

const joinForm = document.getElementById('joinForm');
const gameArea = document.getElementById('gameArea');
const questionTitle = document.getElementById('questionTitle');
const answerForm = document.getElementById('answerForm');
const answerInput = document.getElementById('answer');
const answerButton = answerForm.querySelector('button');

// Helper functions for cookies
function setCookie(name, value, days = 7) {
  const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}
function generateUserId() {
  return 'u_' + Math.random().toString(36).substr(2, 12);
}

// User identity
let userId = getCookie('userId');
function clearUserCookies() {
  setCookie('userId', '', -1);
  setCookie('pin', '', -1);
  setCookie('username', '', -1);
}
if (!userId) {
  userId = generateUserId();
  setCookie('userId', userId);
}

// Try to restore PIN and username from cookies
let currentPin = getCookie('pin') || '';
let username = getCookie('username') || '';

// Auto-fill join form if cookies exist
document.getElementById('pin').value = currentPin;
document.getElementById('username').value = username;

// If both PIN and username exist, auto-join the game
if (currentPin && username) {
  socket.emit('joinGame', { pin: currentPin, username, userId });
  // Do NOT show game area yet; wait for server confirmation
}

// Listen for join result and handle invalid userId
socket.on('joined', (data) => {
  if (data.success) {
    joinForm.style.display = 'none';
    gameArea.style.display = 'block';
    // Remove the 'Join Game' heading
    const joinHeading = document.getElementById('joinHeading');
    if (joinHeading) joinHeading.style.display = 'none';
    // ...existing code...
  } else {
    gameArea.style.display = 'none';
    joinForm.style.display = 'block';
    // If we tried to auto-join and failed, clear cookies (invalid userId)
    if (userId) {
      clearUserCookies();
      userId = generateUserId();
      setCookie('userId', userId);
      document.getElementById('pin').value = '';
      document.getElementById('username').value = '';
    }
    alert(data.message || "Failed to join game.");
  }
});

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  currentPin = document.getElementById('pin').value.trim();
  username = document.getElementById('username').value.trim();
  if (!currentPin || !username) return;

  setCookie('pin', currentPin);
  setCookie('username', username);

  socket.emit('joinGame', { pin: currentPin, username, userId });

  // Do NOT show game area yet; wait for server confirmation
});

answerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const answer = answerInput.value.trim();
  if (!answer) return;
  socket.emit('submitAnswer', { pin: currentPin, username, userId, answer });
  answerInput.value = '';
  // Disable input and button after submitting
  answerInput.disabled = true;
  answerButton.disabled = true;
});

let currentRoundNum = null;
let currentQuestionNum = null;
let latestAnswers = null;

// Helper to check if user has already answered and update UI
function updateAnswerInputState() {
  if (!latestAnswers || !currentRoundNum || !currentQuestionNum) return;
  const round = latestAnswers[currentRoundNum];
  const question = round && round[currentQuestionNum];
  if (question && question[username] !== undefined) {
    answerInput.disabled = true;
    answerButton.disabled = true;
    answerInput.value = '';
  } else {
    answerInput.disabled = false;
    answerButton.disabled = false;
  }
}

// Listen for new question event to re-enable answer input/button
socket.on('newQuestion', (data) => {
  currentRoundNum = data.round;
  currentQuestionNum = data.question;
  questionTitle.textContent = `Round ${data.round} - Question ${data.question}`;
  updateAnswerInputState();
});

// Always update question title on gameProgress as well
socket.on('gameProgress', (data) => {
  if (data.round && data.question) {
    currentRoundNum = data.round;
    currentQuestionNum = data.question;
    questionTitle.textContent = `Round ${data.round} - Question ${data.question}`;
    updateAnswerInputState();
  }
});

// Listen for answersUpdated to check if user already answered
socket.on('answersUpdated', (answers) => {
  latestAnswers = answers;
  updateAnswerInputState();
});

// On auto-join, also request latest state to sync UI
if (currentPin && username) {
  socket.emit('getGameState');
}
