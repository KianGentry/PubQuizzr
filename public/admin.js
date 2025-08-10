const socket = io();
const gamePinInput = document.getElementById("gamePin");
const createGameBtn = document.getElementById("createGame");
const nextQuestionBtn = document.getElementById("nextQuestion");
const nextRoundBtn = document.getElementById("nextRound");
const answersDiv = document.getElementById("answers");

let currentPin = null;

async function loadGameState() {
  const res = await fetch("/game-state");
  if (res.ok) {
    const data = await res.json();
    currentPin = data.pin;
    gamePinInput.value = currentPin;
    socket.emit("admin-join");
  }
}

// Load game state on page load
loadGameState();

createGameBtn.addEventListener("click", async () => {
  const res = await fetch("/create-game", { method: "POST" });
  const data = await res.json();
  currentPin = data.pin;
  gamePinInput.value = currentPin;
  socket.emit("admin-join");
});

nextQuestionBtn.addEventListener("click", () => {
  socket.emit("next-question");
});

nextRoundBtn.addEventListener("click", () => {
  socket.emit("next-round");
});

socket.on("answers-update", ({ round, question, answers }) => {
  answersDiv.innerHTML = `<h3>Round ${round} - Question ${question}</h3>`;
  answers.forEach(a => {
    const p = document.createElement("p");
    p.textContent = `${a.username}: ${a.answer}`;
    answersDiv.appendChild(p);
  });
});
