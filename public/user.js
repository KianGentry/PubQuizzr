const socket = io();

const joinForm = document.getElementById('joinForm');
const gameArea = document.getElementById('gameArea');
const questionTitle = document.getElementById('questionTitle');
const answerForm = document.getElementById('answerForm');

let currentPin = '';
let username = '';

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  currentPin = document.getElementById('pin').value.trim();
  username = document.getElementById('username').value.trim();
  if (!currentPin || !username) return;

  socket.emit('joinGame', { pin: currentPin, username });
});

socket.on('joinedGame', (data) => {
  if (data.success) {
    joinForm.style.display = 'none';
    gameArea.style.display = 'block';
  } else {
    alert(data.message);
  }
});

answerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const answer = document.getElementById('answer').value.trim();
  if (!answer) return;
  socket.emit('submitAnswer', { pin: currentPin, username, answer });
  document.getElementById('answer').value = '';
});
