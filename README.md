# Battleships — Team Wars

Multiplayer 12x12 Battleships with randomly generated island obstacles on each team's board with five ships per team, simultaneous majority-vote placement and untimed majority-vote attacks. Live anonymous vote counts are displayed on the grid.

## Deploy

Connect this repository to a Render Web Service. Build: `npm install`. Start: `npm start`. Configure a private `HOST_KEY` environment variable. Players use `/`, Game Master uses `/host.html`.

Game state is in memory and resets on server restart. Test multiplayer gameplay before using for an event.
