# Battleships — Team Wars

Multiplayer 10x10 Battleships with five ships per team, simultaneous majority-vote placement and 60-second majority-vote attacks.

## Deploy

Connect this repository to a Render Web Service. Build: `npm install`. Start: `npm start`. Configure a private `HOST_KEY` environment variable. Players use `/`, Game Master uses `/host.html`.

Game state is in memory and resets on server restart. Test multiplayer gameplay before using for an event.
