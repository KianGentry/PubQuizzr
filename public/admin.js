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
              li.textContent = `${username}: ${typeof answer === 'object' ? JSON.stringify(answer) : answer}`;

              if (answer === "NO ANSWER") {
                li.style.color = "red";
              }

              // Add points input and button
              const pointsInput = document.createElement("input");
              pointsInput.type = "number";
              pointsInput.min = "0";
              pointsInput.style.width = "50px";
              pointsInput.placeholder = "Points";
              pointsInput.value = ""; // Will be filled if points exist

              // If points already exist, show them
              if (
                window.latestPoints &&
                window.latestPoints[roundNum] &&
                window.latestPoints[roundNum][questionNum] &&
                window.latestPoints[roundNum][questionNum][username] !== undefined
              ) {
                pointsInput.value = window.latestPoints[roundNum][questionNum][username];
              }

              const markBtn = document.createElement("button");
              markBtn.textContent = "Set Points";
              markBtn.type = "button";
              markBtn.onclick = () => {
                const pts = Number(pointsInput.value);
                socket.emit("markAnswer", {
                  round: Number(roundNum),
                  question: Number(questionNum),
                  username,
                  points: isNaN(pts) ? 0 : pts
                });
              };

              li.appendChild(document.createTextNode(" "));
              li.appendChild(pointsInput);
              li.appendChild(markBtn);

              ul.appendChild(li);
            });

          questionDiv.appendChild(ul);
          roundDiv.appendChild(questionDiv);
        });

      answersContainer.appendChild(roundDiv);
    });
});

// Listen for pointsUpdated to update points UI
socket.on("pointsUpdated", (points) => {
  window.latestPoints = points;
  // Re-render answers to update points inputs
  socket.emit("getGameState");
});

socket.emit("getGameState"); // Ask for latest state when page loads
