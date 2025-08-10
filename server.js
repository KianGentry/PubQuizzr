const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let game = {
  pin: null,
  players: [],
  answers: {}, // { roundNum: { questionNum: { username: answer } } }
  currentRound: 1,
  currentQuestion: 1
};

function createPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on("connection", (socket) => {
  console.log("Client connected");

  // Admin creates game
  socket.on("createGame", () => {
    game.pin = createPin();
    game.players = [];
    game.answers = {};
    game.currentRound = 1;
    game.currentQuestion = 1;
    io.emit("gameCreated", game.pin);
  });

  // Player joins
  socket.on("joinGame", ({ pin, username }) => {
    if (pin === game.pin && !game.players.includes(username)) {
      game.players.push(username);
      socket.username = username;
      socket.emit("joined", { success: true, round: game.currentRound, question: game.currentQuestion });
      io.emit("playerList", game.players);
    } else {
      socket.emit("joined", { success: false });
    }
  });

  // Player answers
  socket.on("submitAnswer", (answer) => {
    const { currentRound, currentQuestion, pin } = game;
    if (!game.answers[currentRound]) {
      game.answers[currentRound] = {};
    }
    if (!game.answers[currentRound][currentQuestion]) {
      game.answers[currentRound][currentQuestion] = {};
    }
    game.answers[currentRound][currentQuestion][socket.username] = answer;
    io.emit("answersUpdated", game.answers);
  });

  // Admin moves to next question
  socket.on("nextQuestion", () => {
    const { currentRound, currentQuestion, players, answers } = game;

    // Fill in NO ANSWER for missing players
    if (!answers[currentRound]) answers[currentRound] = {};
    if (!answers[currentRound][currentQuestion]) answers[currentRound][currentQuestion] = {};
    players.forEach(player => {
      if (!answers[currentRound][currentQuestion][player]) {
        answers[currentRound][currentQuestion][player] = "NO ANSWER";
      }
    });

    game.currentQuestion++;
    io.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion
    });
    io.emit("answersUpdated", game.answers);
    // Emit newQuestion event to users
    io.emit("newQuestion", {
      round: game.currentRound,
      question: game.currentQuestion
    });
  });

  // Admin moves to next round
  socket.on("nextRound", () => {
    const { currentRound, currentQuestion, players, answers } = game;

    // Fill NO ANSWER for current question before moving on
    if (!answers[currentRound]) answers[currentRound] = {};
    if (!answers[currentRound][currentQuestion]) answers[currentRound][currentQuestion] = {};
    players.forEach(player => {
      if (!answers[currentRound][currentQuestion][player]) {
        answers[currentRound][currentQuestion][player] = "NO ANSWER";
      }
    });

    game.currentRound++;
    game.currentQuestion = 1;
    io.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion
    });
    io.emit("answersUpdated", game.answers);
    // Emit newQuestion event to users
    io.emit("newQuestion", {
      round: game.currentRound,
      question: game.currentQuestion
    });
  });

  socket.on("getGameState", () => {
    socket.emit("answersUpdated", game.answers);
    socket.emit("gameProgress", {
      round: game.currentRound,
      question: game.currentQuestion,
      pin: game.pin
    });
    socket.emit("playerList", game.players);
  });
});

server.listen(3011, () => {
  console.log("Server running on port 3011");
});
