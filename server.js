const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // optimize for many connections
  pingTimeout: 60000,
  pingInterval: 25000,
  // reduce bandwidth usage
  compression: true,
  // limit concurrent connections per IP
  maxHttpBufferSize: 1e6
});

app.use(express.static("public"));

// Redirect root to user.html
app.get("/", (req, res) => {
  res.redirect("/user.html");
});

// Add CORS for load testing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Debug endpoint to check game state
app.get("/debug", (req, res) => {
  res.json({
    gamePin: game.pin,
    currentRound: game.currentRound,
    currentQuestion: game.currentQuestion,
    players: game.players.length,
    answers: game.answers,
    userIdToUsername: userIdToUsername
  });
});

let game = {
  pin: null,
  players: [],
  answers: {}, // { roundNum: { questionNum: { username: answer } } }
  currentRound: 1,
  currentQuestion: 1
};

let userIdToUsername = {}; // userId -> username

// Add points and started flag to the game state
game.points = {}; // { roundNum: { questionNum: { username: points } } }
game.started = false;
game.currentQuestionText = ''; // Current question text to display to users

// throttling for server updates
let lastBroadcastTime = 0;
const broadcastThrottleMs = 50; // minimum 50ms between broadcasts

function createPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// throttled broadcast function
function throttledBroadcast(event, data) {
  const now = Date.now();
  if (now - lastBroadcastTime >= broadcastThrottleMs) {
    io.emit(event, data);
    lastBroadcastTime = now;
  } else {
    setTimeout(() => {
      io.emit(event, data);
    }, broadcastThrottleMs - (now - lastBroadcastTime));
  }
}

// function to calculate and broadcast updated results
function broadcastUpdatedResults() {
  if (!game.pin) { // only if game is finished
    // Calculate total points per username
    const totals = {};
    Object.keys(game.points).forEach(roundNum => {
      Object.keys(game.points[roundNum]).forEach(questionNum => {
        Object.entries(game.points[roundNum][questionNum]).forEach(([username, pts]) => {
          if (!totals[username]) totals[username] = 0;
          totals[username] += Number(pts) || 0;
        });
      });
    });
    
    // Include all players, even those with 0 points
    Object.values(userIdToUsername).forEach(username => {
      if (!totals[username]) {
        totals[username] = 0;
      }
    });
    
    // Prepare sorted results
    const results = Object.entries(totals)
      .map(([username, points]) => ({ username, points }))
      .sort((a, b) => b.points - a.points);
    
    console.log("Broadcasting updated results:", results);
    io.emit("gameResults", results);
  }
}

// Automatically create a game on server start
function resetGame() {
  game.pin = createPin();
  game.players = [];
  game.answers = {};
  game.points = {}; // reset all points
  game.currentRound = 1;
  game.currentQuestion = 1;
  game.started = false;
  game.currentQuestionText = ''; // reset question text
  userIdToUsername = {}; // reset user mappings
  console.log("Game reset - all scores and data cleared");
}
resetGame();

io.on("connection", (socket) => {
  console.log("Client connected");

  // Immediately send the current PIN to admin and users on connect
  socket.emit("gameCreated", game.pin);

  // Send current points on connect
  socket.emit("pointsUpdated", game.points);

  // Admin creates game (reset)
  socket.on("createGame", () => {
    console.log("Admin requested new game");
    resetGame();
    console.log("New game created with PIN:", game.pin);
    io.emit("gameCreated", game.pin);
    io.emit("playerList", []);
    io.emit("answersUpdated", {});
    io.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion,
      pin: game.pin
    });
  });

  // Player joins
  socket.on("joinGame", ({ pin, username, userId }) => {
    console.log(`Join attempt: pin=${pin}, username=${username}, userId=${userId}, game.pin=${game.pin}`);
    
    // Check if username is already taken by a different userId
    const usernameTaken = Object.entries(userIdToUsername).some(
      ([uid, uname]) => uname === username && uid !== userId
    );
    if (usernameTaken) {
      console.log(`Username ${username} already taken`);
      socket.emit("joined", { success: false, message: "Username already taken." });
      return;
    }
    // Only allow join if userId is present and matches username (or is new)
    if (
      pin === game.pin &&
      userId &&
      (
        (userIdToUsername[userId] === undefined) || // new userId
        (userIdToUsername[userId] === username)     // or matches username
      )
    ) {
      userIdToUsername[userId] = username;
      if (!game.players.includes(userId)) {
        game.players.push(userId);
      }
      socket.userId = userId;
      socket.username = username;
      console.log(`Player ${username} joined successfully with userId ${userId}`);
      socket.emit("joined", { success: true, round: game.currentRound, question: game.currentQuestion });
      // Send player list as usernames
      io.emit("playerList", Object.values(userIdToUsername));
    } else {
      console.log(`Join failed: pin match=${pin === game.pin}, userId=${userId}, userIdToUsername[userId]=${userIdToUsername[userId]}`);
      socket.emit("joined", { success: false, message: "Invalid join attempt." });
    }
  });

  // Player answers
  socket.on("submitAnswer", (data) => {
    const { currentRound, currentQuestion } = game;
    const { userId, answer, username } = data;
    // Only accept if userId is present and matches username
    if (
      typeof userId === "string" &&
      userIdToUsername[userId] === username &&
      answer !== undefined
    ) {
      if (!game.answers[currentRound]) {
        game.answers[currentRound] = {};
      }
      if (!game.answers[currentRound][currentQuestion]) {
        game.answers[currentRound][currentQuestion] = {};
      }
      // Prevent duplicate answers
      if (game.answers[currentRound][currentQuestion][username] === undefined) {
        game.answers[currentRound][currentQuestion][username] = answer;
        throttledBroadcast("answersUpdated", game.answers);
      }
      // else: ignore duplicate submissions
    }
    // else: ignore invalid/forged submissions
  });

  // Mark answer with points
  socket.on("markAnswer", ({ round, question, username, points }) => {
    if (
      typeof round === "number" &&
      typeof question === "number" &&
      typeof username === "string"
    ) {
      if (!game.points[round]) game.points[round] = {};
      if (!game.points[round][question]) game.points[round][question] = {};
      game.points[round][question][username] = points;
      throttledBroadcast("pointsUpdated", game.points);
      
      // if game is finished, also broadcast updated results
      broadcastUpdatedResults();
    }
  });

  // Admin starts the game
  socket.on("startGame", () => {
    game.started = true;
    io.emit("gameStarted");
    // Send first question to users
    io.emit("newQuestion", {
      round: game.currentRound,
      question: game.currentQuestion
    });
  });

  // Admin updates current question text
  socket.on("updateCurrentQuestion", ({ question }) => {
    game.currentQuestionText = question || '';
    io.emit("currentQuestionUpdated", { question: game.currentQuestionText });
  });

  // Admin moves to next question
  socket.on("nextQuestion", () => {
    if (!game.pin || !game.started) return;
    const { currentRound, currentQuestion, players, answers } = game;

    // Fill in NO ANSWER for missing players
    if (!answers[currentRound]) answers[currentRound] = {};
    if (!answers[currentRound][currentQuestion]) answers[currentRound][currentQuestion] = {};
    players.forEach(userId => {
      const username = userIdToUsername[userId];
      if (username && !answers[currentRound][currentQuestion][username]) {
        answers[currentRound][currentQuestion][username] = "NO ANSWER";
      }
    });

    game.currentQuestion++;
    game.currentQuestionText = ''; // Clear question text for new question
    io.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion
    });
    io.emit("answersUpdated", game.answers);
    io.emit("newQuestion", {
      round: game.currentRound,
      question: game.currentQuestion
    });
    io.emit("currentQuestionUpdated", { question: '' }); // Clear question on all clients
  });

  // Admin moves to next round
  socket.on("nextRound", () => {
    if (!game.pin || !game.started) return;
    const { currentRound, currentQuestion, players, answers } = game;

    // Fill NO ANSWER for current question before moving on
    if (!answers[currentRound]) answers[currentRound] = {};
    if (!answers[currentRound][currentQuestion]) answers[currentRound][currentQuestion] = {};
    players.forEach(userId => {
      const username = userIdToUsername[userId];
      if (username && !answers[currentRound][currentQuestion][username]) {
        answers[currentRound][currentQuestion][username] = "NO ANSWER";
      }
    });

    game.currentRound++;
    game.currentQuestion = 1;
    game.currentQuestionText = ''; // Clear question text for new round
    io.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion
    });
    io.emit("answersUpdated", game.answers);
    io.emit("newQuestion", {
      round: game.currentRound,
      question: game.currentQuestion
    });
    io.emit("currentQuestionUpdated", { question: '' }); // Clear question on all clients
  });

  // Finish game and send results
  socket.on("finishGame", () => {
    console.log("Finishing game, calculating results...");
    console.log("Game points:", game.points);
    
    // Calculate total points per username
    const totals = {};
    Object.keys(game.points).forEach(roundNum => {
      Object.keys(game.points[roundNum]).forEach(questionNum => {
        Object.entries(game.points[roundNum][questionNum]).forEach(([username, pts]) => {
          if (!totals[username]) totals[username] = 0;
          totals[username] += Number(pts) || 0;
        });
      });
    });
    
    // Include all players, even those with 0 points
    Object.values(userIdToUsername).forEach(username => {
      if (!totals[username]) {
        totals[username] = 0;
      }
    });
    
    console.log("Calculated totals:", totals);
    
    // Prepare sorted results
    const results = Object.entries(totals)
      .map(([username, points]) => ({ username, points }))
      .sort((a, b) => b.points - a.points);
    
    console.log("Final results:", results);
    
    game.pin = null; // Clear the PIN to mark game as finished
    io.emit("gameResults", results);
    io.emit("gameCreated", null); // Notify clients PIN is cleared
  });

  socket.on("getGameState", () => {
    socket.emit("answersUpdated", game.answers);
    socket.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion,
      pin: game.pin
    });
    socket.emit("playerList", Object.values(userIdToUsername));
    socket.emit("pointsUpdated", game.points);
    
    // Send comprehensive game state for refresh recovery
    socket.emit("gameStateRestore", {
      gameStarted: game.started,
      currentRound: game.currentRound,
      currentQuestion: game.currentQuestion,
      pin: game.pin,
      answers: game.answers,
      points: game.points,
      currentQuestionText: game.currentQuestionText
    });
  });

  // Optionally: handle disconnects and cleanup
});

server.listen(3011, () => {
  console.log("Server running on port 3011");
});
