window.ADMIN_PIN = typeof ADMIN_PIN !== "undefined" ? ADMIN_PIN : undefined;

console.log("ADMIN_PIN =", ADMIN_PIN);
console.log("window.ADMIN_PIN =", window.ADMIN_PIN);


const socket = io();
const answersContainer = document.getElementById("answers");
const pinDisplay = document.getElementById("pin");
const playerList = document.getElementById("players");
const roundDisplay = document.getElementById("round");
const questionDisplay = document.getElementById("question");

// New Game confirmation
document.getElementById("createGame").textContent = "New Game";
document.getElementById("createGame").addEventListener("click", () => {
  if (confirm("Are you sure you want to start a new game? This will erase all players and answers.")) {
    socket.emit("createGame");
  }
});

document.getElementById("nextQuestion").addEventListener("click", () => {
  socket.emit("nextQuestion");
});

document.getElementById("nextRound").addEventListener("click", () => {
  socket.emit("nextRound");
});

// Finish Game confirmation
document.getElementById("finishGame").addEventListener("click", () => {
  if (confirm("Are you sure you want to finish the game and show the results?")) {
    socket.emit("finishGame");
  }
});

socket.on("gameCreated", (pin) => {
  if (pin) {
    pinDisplay.textContent = `Game PIN: ${pin}`;
    // Only clear everything when a new game is started
    playerList.innerHTML = "";
    answersContainer.innerHTML = "";
    roundDisplay.textContent = "";
    questionDisplay.textContent = "";
  } else {
    pinDisplay.textContent = "Game PIN: (Game Finished)";
    // Do NOT clear answersContainer or results here
    roundDisplay.textContent = "";
    questionDisplay.textContent = "";
    playerList.innerHTML = "";
    // answersContainer is left untouched to preserve answers/results
  }
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

function renderAnswers(answers) {
  answersContainer.innerHTML = ""; // Clear before re-render

  Object.keys(answers)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(roundNum => {
      const roundDiv = document.createElement("div");
      roundDiv.className = "round-block";
      roundDiv.innerHTML = `<h3>Round ${roundNum}</h3>`;

      Object.keys(answers[roundNum])
        .sort((a, b) => Number(a) - Number(b))
        .forEach(questionNum => {
          const questionDiv = document.createElement("div");
          questionDiv.className = "question-block";
          questionDiv.innerHTML = `<h4>Question ${questionNum}</h4>`;

          // Create table
          const table = document.createElement("table");
          table.style.borderCollapse = "collapse";
          table.style.width = "100%";

          // Table header
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");
          ["Username", "Answer", "Points", "Set Points"].forEach(text => {
            const th = document.createElement("th");
            th.textContent = text;
            //th.style.border = "1px solid #ccc";
            //th.style.padding = "2px";
            //th.style.fontSize = "22px"; // Adjust font size
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);

          // Table body
          const tbody = document.createElement("tbody");

          Object.entries(answers[roundNum][questionNum])
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
            .forEach(([username, answer]) => {
              const row = document.createElement("tr");

              // Username cell
              const userCell = document.createElement("td");
              userCell.textContent = username;
              //userCell.style.border = "1px solid #ccc";
              //userCell.style.padding = "0px";
              //userCell.style.fontSize = "22px"; // Adjust font size
              row.appendChild(userCell);

              // Answer cell
              const answerCell = document.createElement("td");
              answerCell.textContent = typeof answer === 'object' ? JSON.stringify(answer) : answer;
              if (answer === "NO ANSWER") {
                answerCell.style.color = "red";
              }
              //answerCell.style.border = "1px solid #ccccccff";
              //answerCell.style.padding = "4px";
              row.appendChild(answerCell);

              // Points cell
              let points = 0;
              if (
                window.latestPoints &&
                window.latestPoints[roundNum] &&
                window.latestPoints[roundNum][questionNum] &&
                window.latestPoints[roundNum][questionNum][username] !== undefined
              ) {
                points = window.latestPoints[roundNum][questionNum][username];
              }
              const pointsCell = document.createElement("td");
              pointsCell.textContent = points;
              //pointsCell.style.border = "1px solid #ccc";
              //pointsCell.style.padding = "4px";
              row.appendChild(pointsCell);

              // Controls cell
              const controlsCell = document.createElement("td");
              //controlsCell.style.border = "1px solid #ccc";
              //controlsCell.style.padding = "4px";

              const incBtn = document.createElement("button");
              incBtn.textContent = "+";
              incBtn.type = "button";
              incBtn.onclick = () => {
                socket.emit("markAnswer", {
                  round: Number(roundNum),
                  question: Number(questionNum),
                  username,
                  points: points + 1
                });
              };

              const decBtn = document.createElement("button");
              decBtn.textContent = "−";
              decBtn.type = "button";
              decBtn.onclick = () => {
                socket.emit("markAnswer", {
                  round: Number(roundNum),
                  question: Number(questionNum),
                  username,
                  points: Math.max(0, points - 1)
                });
              };

              controlsCell.appendChild(incBtn);
              controlsCell.appendChild(decBtn);
              row.appendChild(controlsCell);

              tbody.appendChild(row);
            });

          table.appendChild(tbody);
          questionDiv.appendChild(table);
          roundDiv.appendChild(questionDiv);
        });

      answersContainer.appendChild(roundDiv);
    });
}



// Show results when game is finished
socket.on("gameResults", (results) => {
  // results: [{ username, points }]
  // Do not clear answersContainer, just append results at the top
  const resultsDiv = document.createElement("div");
  resultsDiv.className = "final-results";
  resultsDiv.innerHTML = "<h2>Final Results</h2>";
  const ol = document.createElement("ol");
  results.forEach(({ username, points }, idx) => {
    const li = document.createElement("li");
    li.textContent = `${username}: ${points} point${points === 1 ? "" : "s"}`;
    if (idx === 0) li.classList.add("gold");
    else if (idx === 1) li.classList.add("silver");
    else if (idx === 2) li.classList.add("bronze");
    ol.appendChild(li);
  });
  resultsDiv.appendChild(ol);

  // Insert results above the answers
  answersContainer.prepend(resultsDiv);
});

// Listen for answersUpdated to render answers with latest points
socket.on("answersUpdated", (answers) => {
  window.latestAnswers = answers;
  renderAnswers(answers);
});

// Listen for pointsUpdated to update points and re-render answers
socket.on("pointsUpdated", (points) => {
  window.latestPoints = points;
  // Re-render answers with updated points
  if (window.latestAnswers) renderAnswers(window.latestAnswers);
});

// Add Start Game button logic
const startGameBtn = document.createElement("button");
startGameBtn.id = "startGame";
startGameBtn.textContent = "Start Game";
startGameBtn.style.marginRight = "8px";
document.getElementById("createGame").insertAdjacentElement("afterend", startGameBtn);

startGameBtn.addEventListener("click", () => {
  if (confirm("Start the game now? Players will be able to answer questions.")) {
    socket.emit("startGame");
    startGameBtn.disabled = true;
  }
});

socket.on("gameStarted", () => {
  startGameBtn.disabled = true;
});

// Enable Start Game button on new game
socket.on("gameCreated", (pin) => {
  if (pin) {
    pinDisplay.textContent = `Game PIN: ${pin}`;
    // Only clear everything when a new game is started
    playerList.innerHTML = "";
    answersContainer.innerHTML = "";
    roundDisplay.textContent = "";
    questionDisplay.textContent = "";
  } else {
    pinDisplay.textContent = "Game PIN: (Game Finished)";
    // Do NOT clear answersContainer or results here
    roundDisplay.textContent = "";
    questionDisplay.textContent = "";
    playerList.innerHTML = "";
    // answersContainer is left untouched to preserve answers/results
  }
  startGameBtn.disabled = false;
});

// Only call getGameState once on page load
socket.emit("getGameState"); // Ask for latest state when page loads
// Re-render answers with updated points
if (window.latestAnswers) renderAnswers(window.latestAnswers);

socket.emit("getGameState"); // Ask for latest state when page loads
socket.emit("getGameState"); // Ask for latest state when page loads
