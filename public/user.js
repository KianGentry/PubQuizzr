const socket = io();

const joinSection = document.getElementById("joinSection");
const quizSection = document.getElementById("quizSection");
const pinInput = document.getElementById("pin");
const usernameInput = document.getElementById("username");
const joinGameBtn = document.getElementById("joinGame");

const questionHeader = document.getElementById("questionHeader");
const answerInput = document.getElementById("answerInput");
const submitAnswerBtn = document.getElementById("submitAnswer");

let currentPin = null;
let currentUsername = null;

joinGameBtn.addEventListener("click", async () => {
  currentPin = pinInput.value.trim();
  currentUsername = usernameInput.value.trim();

  const res = await fetch("/joingame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: currentPin, username: currentUsername })
  });

  if (res.ok) {
    joinSection.style.display = "none";
    quizSection.style.display = "block";
    socket.emit("player-join", { pin: currentPin, username: currentUsername });
  } else {
    alert("Game not found");
  }
});

submitAnswerBtn.addEventListener("click", () => {
  const answer = answerInput.value.trim();
  if (answer) {
    socket.emit("submit-answer", {
      pin: currentPin,
      username: currentUsername,
      answer
    });
    answerInput.value = "";
  }
});

socket.on("question-update", ({ round, question }) => {
  questionHeader.textContent = `Round ${round} - Question ${question}`;
});