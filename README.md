# Battleships — Team Wars

Multiplayer 12x12 Battleships with randomly generated island obstacles on each team's board with five ships per team, automatic server-side random fleet placement and untimed majority-vote attacks. Live anonymous attack-vote counts are displayed on the enemy grid. The latest incoming enemy attack is outlined on each team's own grid.

## Deploy

Connect this repository to a Render Web Service. Build: `npm install`. Start: `npm start`. Configure a private `HOST_KEY` environment variable. Players use `/`, Game Master uses `/host.html`.

Game state is in memory and resets on server restart. Test multiplayer gameplay before using for an event.

## Game Master player controls

The authenticated Game Master screen includes a **Kick** button beside each player, **Clear disconnected**, and **Remove all players**.

- **Kick** removes the selected player and their outstanding vote, invalidates their session token, disconnects their active connection, and recalculates the current voting majority if needed. A removed player can join again in the lobby with their own chosen name; they cannot silently resume the removed session.
- **Clear disconnected** removes all currently offline registrations without interrupting connected players or resetting a game.
- **Remove all players** clears all registrations and disconnects everyone, and is permitted **only in the lobby**. Use the existing **Reset game** control first if you intend to discard an in-progress or finished game.
- On a normal browser reconnect, players now use a token-only resume instead of registering as `Returning player`. Expired tokens are cleared locally, allowing a fresh named join.

These controls are server-authorized using the existing `HOST_KEY`. Player IDs used by Kick are visible only in the authenticated Game Master view.
