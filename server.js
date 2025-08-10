const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let game = null; // Single game object

// Create a new game
app.post("/create-game", (req, res) => {
  if (game) {
    return res.json(game); // Game already exists
  }
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  game = {
    pin,
    round: 1,
    question: 1,
    answers: {} // { 'round1-question1': [ { username, answer } ] }
  };
  res.json(game);
});

// Get current game state
app.get("/game-state", (req, res) => {
  if (!game) return res.status(404).json({ error: "No game active" });
  res.json(game);
});

// Join game (user)
app.post("/join-game", (req, res) => {
  const { pin, username } = req.body;
  if (!game || game.pin !== pin) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.json({ success: true });
});

// WebSocket logic
io.on("connection", (socket) => {
  socket.on("admin-join", () => {
    if (game) {
      socket.join("admin");
      socket.emit("answers-update", {
        round: game.round,
        question: game.question,
        answers: getAnswersForCurrentQ()
      });
    }
  });

  socket.on("player-join", ({ username }) => {
    socket.join("players");
  });

  socket.on("next-question", () => {
    if (game) {
      game.question += 1;
      io.to("players").emit("question-update", {
        round: game.round,
        question: game.question
      });
    }
  });

  socket.on("next-round", () => {
    if (game) {
      game.round += 1;
      game.question = 1;
      io.to("players").emit("question-update", {
        round: game.round,
        question: game.question
      });
    }
  });

  socket.on("submit-answer", ({ username, answer }) => {
    if (!game) return;
    const key = `round${game.round}-question${game.question}`;
    if (!game.answers[key]) game.answers[key] = [];
    game.answers[key].push({ username, answer });

    io.to("admin").emit("answers-update", {
      round: game.round,
      question: game.question,
      answers: getAnswersForCurrentQ()
    });
  });
});

function getAnswersForCurrentQ() {
  const key = `round${game.round}-question${game.question}`;
  return game.answers[key] || [];
}

server.listen(3011, () => {
  console.log("Server running on port 3011");
});
