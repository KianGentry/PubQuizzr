const socket = io();

const joinForm = document.getElementById('joinForm');
const gameArea = document.getElementById('gameArea');
const questionTitle = document.getElementById('questionTitle');
const currentQuestionDisplay = document.getElementById('currentQuestionDisplay');
const answerForm = document.getElementById('answerForm');
const answerInput = document.getElementById('answer');
const answerButton = answerForm.querySelector('button');

// connection state tracking
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// throttling to prevent ui overload
let lastUpdateTime = 0;
const updateThrottleMs = 100; // minimum 100ms between ui updates
let pendingUpdates = new Set();

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
// but only if we have a valid PIN format (4 digits)
if (currentPin && username && /^\d{4}$/.test(currentPin)) {
  socket.emit('joinGame', { pin: currentPin, username, userId });
  // Do NOT show game area yet; wait for server confirmation
} else if (currentPin && username) {
  // Clear invalid cookies if PIN format is wrong
  clearUserCookies();
  currentPin = '';
  username = '';
  document.getElementById('pin').value = '';
  document.getElementById('username').value = '';
}

// Listen for join result and handle invalid userId
socket.on('joined', (data) => {
  if (data.success) {
    joinForm.style.display = 'none';
    gameArea.style.display = 'block';
    // Remove the 'Join Game' heading
    const joinHeading = document.getElementById('joinHeading');
    if (joinHeading) joinHeading.style.display = 'none';
    if (!gameStarted) {
      questionTitle.textContent = "Waiting for host to start the game...";
      answerForm.style.display = 'none';
    }
  } else {
    gameArea.style.display = 'none';
    joinForm.style.display = 'block';
    // If we tried to auto-join and failed, clear cookies only if it's a username conflict
    if (data.message && data.message.includes("Username already taken")) {
      clearUserCookies();
      userId = generateUserId();
      setCookie('userId', userId);
      document.getElementById('pin').value = '';
      document.getElementById('username').value = '';
    }
    // Don't show alert for auto-join failures, just show the form
    if (!currentPin || !username) {
      alert(data.message || "Failed to join game.");
    }
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
let gameStarted = false;

// connection event handlers
socket.on('connect', () => {
  isConnected = true;
  reconnectAttempts = 0;
  console.log('connected to server');
  // request current game state on reconnect
  if (currentPin && username) {
    socket.emit('getGameState');
    // if we have a game area visible, try to rejoin
    if (gameArea.style.display === 'block') {
      socket.emit('joinGame', { pin: currentPin, username, userId });
    }
  }
});

socket.on('disconnect', () => {
  isConnected = false;
  console.log('disconnected from server');
  // show connection status but keep form visible if game was active
  if (gameArea.style.display === 'block') {
    questionTitle.textContent = 'connection lost - attempting to reconnect...';
    // don't hide the form, just show connection status
  }
});

socket.on('connect_error', (error) => {
  console.log('connection error:', error);
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    setTimeout(() => {
      socket.connect();
    }, 1000 * reconnectAttempts);
  }
});

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

// throttled ui update function
function throttledUpdate(updateType, updateFn) {
  const now = Date.now();
  pendingUpdates.add(updateType);
  
  if (now - lastUpdateTime >= updateThrottleMs) {
    // process all pending updates
    pendingUpdates.forEach(type => {
      if (type === 'answerForm') ensureAnswerFormVisible();
      if (type === 'questionTitle') updateQuestionTitle();
      if (type === 'answerState') updateAnswerInputState();
    });
    pendingUpdates.clear();
    lastUpdateTime = now;
  } else {
    // schedule update for later
    setTimeout(() => {
      if (pendingUpdates.has(updateType)) {
        updateFn();
        pendingUpdates.delete(updateType);
      }
    }, updateThrottleMs - (now - lastUpdateTime));
  }
}

// ensure answer form is visible when game is active
function ensureAnswerFormVisible() {
  // show form if we have game state, even if not fully connected yet
  if (gameStarted && currentRoundNum && currentQuestionNum) {
    answerForm.style.display = '';
    updateAnswerInputState();
    
    // if not connected, show connection status but keep form visible
    if (!isConnected) {
      questionTitle.textContent = `Round ${currentRoundNum} - Question ${currentQuestionNum} (reconnecting...)`;
    } else {
      questionTitle.textContent = `Round ${currentRoundNum} - Question ${currentQuestionNum}`;
    }
  }
}

// update question title helper
function updateQuestionTitle() {
  if (currentRoundNum && currentQuestionNum) {
    questionTitle.textContent = `Round ${currentRoundNum} - Question ${currentQuestionNum}`;
  }
}

// Listen for new question event to re-enable answer input/button
socket.on('newQuestion', (data) => {
  currentRoundNum = data.round;
  currentQuestionNum = data.question;
  throttledUpdate('questionTitle', () => {
    questionTitle.textContent = `Round ${data.round} - Question ${data.question}`;
  });
  throttledUpdate('answerForm', ensureAnswerFormVisible);
});

// Hide answer form if game not started
if (!gameStarted) {
  answerForm.style.display = 'none';
}

// This handler is now defined below to avoid duplication

// Listen for answersUpdated to check if user already answered
socket.on('answersUpdated', (answers) => {
  console.log('User received answersUpdated:', answers);
  latestAnswers = answers;
  window.latestAnswers = answers; // Make sure it's available globally
  throttledUpdate('answerState', updateAnswerInputState);
});

// Listen for pointsUpdated to update the answers table
socket.on('pointsUpdated', (points) => {
  window.latestPoints = points;
  // If game is finished and we have results displayed, update the table
  const resultsContainer = document.querySelector('.game-results-container');
  if (resultsContainer && window.latestAnswers) {
    // Re-render the answers section with updated points
    const existingAnswers = resultsContainer.querySelector('div[style*="background: white"]');
    if (existingAnswers) {
      const newAnswersDiv = showAllAnswers(window.latestAnswers);
      existingAnswers.parentNode.replaceChild(newAnswersDiv, existingAnswers);
    }
  }
});

// This handler is now defined below to avoid duplication

// add periodic state check to prevent ui from getting stuck
setInterval(() => {
  if (isConnected && gameStarted && currentRoundNum && currentQuestionNum) {
    ensureAnswerFormVisible();
  }
}, 2000);

// Listen for game results to show scoreboard (handles both initial and real-time updates)
socket.on('gameResults', (results) => {
  console.log('User received game results:', results);
  console.log('User latestAnswers:', window.latestAnswers);
  
  // Hide the answer form and show results
  answerForm.style.display = 'none';
  
  // Clear any existing results display
  const existingResults = document.querySelector('.game-results-container');
  if (existingResults) {
    existingResults.remove();
  }
  
  // Create main results container
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'game-results-container';
  resultsContainer.style.cssText = `
    width: 100%;
    max-width: 100%;
  `;
  
  // Create scoreboard display
  const scoreboardDiv = document.createElement('div');
  scoreboardDiv.style.cssText = `
    background: linear-gradient(90deg, #2563eb 60%, #06b6d4 100%);
    color: white;
    border-radius: 10px;
    padding: 20px;
    margin: 20px 0;
    text-align: center;
  `;
  
  scoreboardDiv.innerHTML = '<h2 style="margin-top: 0; font-size: 2rem;">Final Results</h2>';
  
  const resultsList = document.createElement('ol');
  resultsList.style.cssText = `
    padding-left: 0;
    list-style: none;
    margin: 0;
  `;
  
  results.forEach(({ username, points }, idx) => {
    const li = document.createElement('li');
    li.style.cssText = `
      font-size: 1.4rem;
      font-weight: bold;
      margin-bottom: 8px;
      padding: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 6px;
    `;
    
    // Add medal colors
    if (idx === 0) li.style.color = '#ffd700'; // gold
    else if (idx === 1) li.style.color = '#c0c0c0'; // silver  
    else if (idx === 2) li.style.color = '#cd7f32'; // bronze
    
    li.textContent = `${idx + 1}. ${username}: ${points} point${points === 1 ? '' : 's'}`;
    resultsList.appendChild(li);
  });
  
  scoreboardDiv.appendChild(resultsList);
  resultsContainer.appendChild(scoreboardDiv);
  
  // Show all answers below the scoreboard
  if (window.latestAnswers && Object.keys(window.latestAnswers).length > 0) {
    const answersDiv = showAllAnswers(window.latestAnswers);
    resultsContainer.appendChild(answersDiv);
  } else {
    // If no answers available, show a message
    const noAnswersDiv = document.createElement('div');
    noAnswersDiv.style.cssText = `
      background: white;
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      color: #666;
    `;
    noAnswersDiv.innerHTML = '<h3 style="color: #2563eb; margin-top: 0;">No answers available</h3><p>Answers will appear here once the game is finished.</p>';
    resultsContainer.appendChild(noAnswersDiv);
  }
  
  // Replace the entire game area content with results
  gameArea.innerHTML = '';
  gameArea.appendChild(resultsContainer);
});

// Function to show all answers to users (exact copy of admin format)
function showAllAnswers(answers) {
  const answersDiv = document.createElement('div');
  answersDiv.style.cssText = `
    margin-bottom: 40px;
    margin-left: 18px;
  `;
  
  answersDiv.innerHTML = '<h2 style="margin-left: 18px; margin-top: 0; margin-bottom: 8px;">Answers</h2>';
  
  Object.keys(answers)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(roundNum => {
      const roundDiv = document.createElement('div');
      roundDiv.className = 'round-block';
      roundDiv.style.cssText = `
        background: #fff;
        border: 1px solid #e5e7eb;
        margin: 4px 0;
        padding: 6px;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(30,41,59,0.03);
      `;
      roundDiv.innerHTML = `<h3>Round ${roundNum}</h3>`;
      
      Object.keys(answers[roundNum])
        .sort((a, b) => Number(a) - Number(b))
        .forEach(questionNum => {
          const questionDiv = document.createElement('div');
          questionDiv.className = 'question-block';
          questionDiv.style.cssText = `
            margin-left: 10px;
            padding: 2px;
          `;
          questionDiv.innerHTML = `<h4>Question ${questionNum}</h4>`;
          
          // Create table exactly like admin
          const table = document.createElement('table');
          table.style.cssText = `
            border-collapse: collapse;
            width: 100%;
          `;
          
          // Table header
          const thead = document.createElement('thead');
          const headerRow = document.createElement('tr');
          ['Username', 'Answer', 'Points'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.cssText = `
              text-align: center;
              padding: 8px;
              border: 1px solid #ccc;
              background: #f8f9fa;
              font-weight: bold;
            `;
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);
          
          // Table body
          const tbody = document.createElement('tbody');
          
          Object.entries(answers[roundNum][questionNum])
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
            .forEach(([username, answer]) => {
              const row = document.createElement('tr');
              row.style.cssText = `
                margin: 2px 0 4px 14px;
                padding: 2px;
                font-size: 18px;
                border: 1px solid #ccccccff;
              `;
              
              // Username cell
              const userCell = document.createElement('td');
              userCell.textContent = username;
              userCell.style.cssText = `
                text-align: left;
                vertical-align: middle;
                padding: 8px;
                border: 1px solid #ccc;
              `;
              row.appendChild(userCell);
              
              // Answer cell
              const answerCell = document.createElement('td');
              answerCell.className = 'answer-cell';
              answerCell.textContent = typeof answer === 'object' ? JSON.stringify(answer) : answer;
              answerCell.style.cssText = `
                text-align: left;
                vertical-align: middle;
                padding: 12px 8px;
                border: 1px solid #ccc;
                min-width: 200px;
              `;
              if (answer === "NO ANSWER") {
                answerCell.style.color = "red";
              }
              row.appendChild(answerCell);
              
              // Points cell (read-only for users)
              let points = 0;
              if (
                window.latestPoints &&
                window.latestPoints[roundNum] &&
                window.latestPoints[roundNum][questionNum] &&
                window.latestPoints[roundNum][questionNum][username] !== undefined
              ) {
                points = window.latestPoints[roundNum][questionNum][username];
              }
              const pointsCell = document.createElement('td');
              pointsCell.textContent = points;
              pointsCell.style.cssText = `
                text-align: left;
                vertical-align: middle;
                padding: 8px;
                border: 1px solid #ccc;
              `;
              row.appendChild(pointsCell);
              
              tbody.appendChild(row);
            });
          
          table.appendChild(tbody);
          questionDiv.appendChild(table);
          roundDiv.appendChild(questionDiv);
        });
      
      answersDiv.appendChild(roundDiv);
    });
  
  return answersDiv;
}

// Listen for new game creation to clear cached data
socket.on('gameCreated', (pin) => {
  if (pin) {
    // New game started - clear any cached data
    window.latestAnswers = null;
    currentRoundNum = null;
    currentQuestionNum = null;
    gameStarted = false;
  }
});

// On auto-join, also request latest state to sync UI
if (currentPin && username) {
  socket.emit('getGameState');
}

// Listen for game state updates to restore UI after refresh
socket.on('gameProgress', (data) => {
  if (data.round && data.question) {
    currentRoundNum = data.round;
    currentQuestionNum = data.question;
    throttledUpdate('questionTitle', () => {
      questionTitle.textContent = `Round ${data.round} - Question ${data.question}`;
    });
    throttledUpdate('answerForm', ensureAnswerFormVisible);
  }
});

// Listen for game state to restore UI after refresh
socket.on('gameStarted', () => {
  gameStarted = true;
  // If already joined, show game area if not visible
  if (gameArea.style.display !== 'block') {
    joinForm.style.display = 'none';
    gameArea.style.display = 'block';
    const joinHeading = document.getElementById('joinHeading');
    if (joinHeading) joinHeading.style.display = 'none';
  }
  throttledUpdate('answerForm', ensureAnswerFormVisible);
});

// Listen for current question updates
socket.on('currentQuestionUpdated', (data) => {
  if (data.question && data.question.trim()) {
    currentQuestionDisplay.textContent = data.question;
    currentQuestionDisplay.style.display = 'block';
  } else {
    currentQuestionDisplay.style.display = 'none';
  }
});

// Add a handler to restore UI when we get game state after refresh
socket.on('gameStateRestore', (data) => {
  console.log('Received game state restore:', data);
  if (data && data.gameStarted && data.currentRound && data.currentQuestion) {
    gameStarted = data.gameStarted;
    currentRoundNum = data.currentRound;
    currentQuestionNum = data.currentQuestion;
    
    // Show game area and form
    joinForm.style.display = 'none';
    gameArea.style.display = 'block';
    const joinHeading = document.getElementById('joinHeading');
    if (joinHeading) joinHeading.style.display = 'none';
    
    questionTitle.textContent = `Round ${data.currentRound} - Question ${data.currentQuestion}`;
    
    // Restore current question text if available
    if (data.currentQuestionText && data.currentQuestionText.trim()) {
      currentQuestionDisplay.textContent = data.currentQuestionText;
      currentQuestionDisplay.style.display = 'block';
    } else {
      currentQuestionDisplay.style.display = 'none';
    }
    
    ensureAnswerFormVisible();
  }
});
