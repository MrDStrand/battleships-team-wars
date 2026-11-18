# Battleships — Team Wars

Multiplayer 10x10 Battleships with randomly generated island obstacles on each team's board with five ships per team, automatic server-side random fleet placement and untimed majority-vote attacks. Live anonymous attack-vote counts are displayed on the enemy grid. The latest incoming enemy attack is outlined on each team's own grid.

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

- On **Enemy waters**, any registered player can **Shift-click or right-click a legal, unshot water square** to lock it for their entire team. Any teammate can unlock it using the same interaction. Locking and unlocking is also available through the Lock mode button (click/tap).
- Locked squares appear **grey with 🔒**, synchronize instantly to all teammates, and are not offered as valid targets or accepted as votes by the server. Locking a square clears outstanding votes on that square without triggering an attack.
- Locks are private to each team, may be changed during battle or pause (even when it is not that team's turn), and are cleared on game reset. Previously attacked squares and islands cannot be locked.
- **Recommended method:** click the two-position **VOTE / LOCK** switch above Enemy waters to enable **LOCK MODE ON**. Click or tap any unshot non-island square to lock/unlock, including during the other team's turn. Flip the switch back to VOTE to return to voting. A normal click votes only in Vote mode and only on your team's turn. Shift-click/right-click remain optional shortcuts.
- The grid uses persistent delegated event handlers rather than attaching a handler to each square after every redraw, and the frontend assets have versioned URLs to prevent stale cached scripts.
- When every square of an enemy ship has been hit, **all its segments become a connected crimson hull** on the enemy board. The server reveals only fully sunk ships, not undiscovered ship positions. Hover a sunk segment to see the ship name.
