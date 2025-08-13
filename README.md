# PubQuizzr
Open source pub quiz app. Inspired by Kahoot and similar apps, but made for pub style quizes. Fully browser based.

This app does not deal with questions, it is used to submit and score users' answers. Marking is done by the admin for each answer and is fully manual. Think of it as a digital replacement for traditional answer sheets.

__Note:__ This app is still in development. Please report any bugs or issues.

## How to Use
1. Log into the admin page at ``/admin.html`` using the PIN from the ``docker-compose.yml`` file.
2. Provide users the game PIN from the admin page and wait for them to join on the homepage.
3. Click 'Start Game' once all users are joined.
4. Read the question, then click 'Next Question' and 'Next Round' as appropriate.
5. Scoring can be done either while the game is going or at the end.
6. Click 'Finish Game' and the scores will be calculated and the leaderboard displayed. If the score is changed, the 'Finish Game' button can be used to recalculate.
7. Click 'New Game' to start a new game.

## Deployment
Change the __ADMIN PIN__ in the compose file before building. 
> __Note:__ this PIN is currently not stored securely.

Use ``docker compose up --build -d`` to run. Access is on port __3011__ over __HTTP__.