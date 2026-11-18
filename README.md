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

## Team target locks and sunk ships

- On **Enemy waters**, any registered player can **right-click a legal, unshot water square** to lock it for their entire team. A second right-click by any teammate unlocks it.
- Locked squares appear **grey with 🔒**, synchronize instantly to all teammates, and are not offered as valid targets or accepted as votes by the server. Locking a square clears outstanding votes on that square without triggering an attack.
- Locks are private to each team, may be changed during battle or pause (even when it is not that team's turn), and are cleared on game reset. Previously attacked squares and islands cannot be locked.
- For touchscreens or devices without right-click, use the **Lock mode** button above Enemy waters and tap a square to lock/unlock; turn the mode off to vote normally.
- When every square of an enemy ship has been hit, **all its segments become a connected crimson hull** on the enemy board. The server reveals only fully sunk ships, not undiscovered ship positions. Hover a sunk segment to see the ship name.
