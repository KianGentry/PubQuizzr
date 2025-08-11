const socket = io();
const answersContainer = document.getElementById("answers");
const pinDisplay = document.getElementById("pin");
const playerList = document.getElementById("players");
const roundDisplay = document.getElementById("round");
const questionDisplay = document.getElementById("question");

document.getElementById("createGame").addEventListener("click", () => {
  socket.emit("createGame");
});

document.getElementById("nextQuestion").addEventListener("click", () => {
  socket.emit("nextQuestion");
});

document.getElementById("nextRound").addEventListener("click", () => {
  socket.emit("nextRound");
});

socket.on("gameCreated", (pin) => {
  pinDisplay.textContent = `Game PIN: ${pin}`;
  // Optionally clear player list and answers on reset
  playerList.innerHTML = "";
  answersContainer.innerHTML = "";
  roundDisplay.textContent = "";
  questionDisplay.textContent = "";
});

socket.on("playerList", (players) => {
  playerList.innerHTML = "";
  players.sort().forEach(player => {
    const li = document.createElement("li");
    li.textContent = player;
    playerList.appendChild(li);
  });
});

socket.on("gameProgress", ({ round, question, pin }) => {
  if (pin) pinDisplay.textContent = `Game PIN: ${pin}`;
  roundDisplay.textContent = `Round: ${round}`;
  questionDisplay.textContent = `Question: ${question}`;
});

socket.on("answersUpdated", (answers) => {
  answersContainer.innerHTML = ""; // Clear before re-render

  Object.keys(answers)
    .sort((a, b) => Number(a) - Number(b)) // sort rounds numerically
    .forEach(roundNum => {
      const roundDiv = document.createElement("div");
      roundDiv.className = "round-block";
      roundDiv.innerHTML = `<h3>Round ${roundNum}</h3>`;

      Object.keys(answers[roundNum])
        .sort((a, b) => Number(a) - Number(b)) // sort questions numerically
        .forEach(questionNum => {
          const questionDiv = document.createElement("div");
          questionDiv.className = "question-block";
          questionDiv.innerHTML = `<h4>Question ${questionNum}</h4>`;

          const ul = document.createElement("ul");

          Object.entries(answers[roundNum][questionNum])
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB)) // sort alphabetically
            .forEach(([username, answer]) => {
              const li = document.createElement("li");
              // Fix: display answer as string, not [object Object]
              li.textContent = `${username}: ${typeof answer === 'object' ? JSON.stringify(answer) : answer}`;
              if (answer === "NO ANSWER") {
                li.style.color = "red"; // highlight no answers
              }
              ul.appendChild(li);
            });

          questionDiv.appendChild(ul);
          roundDiv.appendChild(questionDiv);
        });

      answersContainer.appendChild(roundDiv);
    });
});

socket.emit("getGameState"); // Ask for latest state when page loads
