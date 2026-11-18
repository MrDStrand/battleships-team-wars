# Battleships — Team Wars

Multiplayer 12x12 Battleships with randomly generated island obstacles on each team's board with five ships per team, automatic server-side random fleet placement and untimed majority-vote attacks. Live anonymous attack-vote counts are displayed on the enemy grid. The latest incoming enemy attack is outlined on each team's own grid.

## Deploy

Connect this repository to a Render Web Service. Build: `npm install`. Start: `npm start`. Configure a private `HOST_KEY` environment variable. Players use `/`, Game Master uses `/host.html`.

Game state is in memory and resets on server restart. Test multiplayer gameplay before using for an event.
