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

## Coordinates, turn status and endgame screens

- All 10x10 boards use chess-style **external-only** coordinate labels: letters **A–J** increase left to right; numbers **10–1** descend from top to bottom. The top-left square is **A10**, the bottom-right is **J1**. Empty grid squares contain no coordinate text; their coordinates remain available to screen readers and on hover. Attack logs follow the same convention.
- The redundant yellow **Vote for attack target** text was removed so it cannot push the Enemy Waters grid sideways. Voting status now stays under that grid.
- Players see **YOU / ENEMY** battle status and a prominent **YOUR TURN / ENEMY TURN** banner rather than Blue/Red battle labels. Blue and Red remain internal identifiers and remain visible on the GM screen for team administration.
- At game end, players on the winning team see an animated fireworks/explosion **YOU WIN!** screen. Players on the losing team see a skull-and-crossbones pirate flag **YOUR FLEET IS SUNK** defeat screen. Both have a **View battlefield** button; reduced-motion preferences disable the animation.
- The underlying server-authoritative ship, voting, locking and victory rules remain unchanged.

## Naval Command Center design (November 2026)

The player interface uses an immersive, responsive tactical command-center layout: a dramatic live turn banner, a fully animated CSS sonar display, two 10x10 tactical grids, fleet-damage meters, team strength panels, teammate presence, and a timestamped combat log. The Game Master interface remains authenticated and preserves all game controls.

- **Radar is functional:** it continuously sweeps while battle is active and plots blips for confirmed incoming and outgoing shots, distinguishing hits from misses. It never scans or reveals undiscovered enemy ship locations. The scan state and contact count update from server state. Motion stops for players who enable Reduced Motion.
- **Battle event timestamps:** the server records the time, attacking team, internal square, result (HIT/MISS/SUNK), and sunken ship name if applicable. The player and Game Master logs display time in the viewer's local time zone as `HH:MM:SS`, with the normal chess-style A-J/10-1 coordinates.
- **Retired features:** the intelligence feed and team chat were intentionally removed from both the interface and server event/state handlers. Neither feature is retained as a hidden stream.
- All previous mechanics remain: automatically generated five-ship fleets, islands, vote-majority attacks, team-wide square locks, ship silhouettes, sunk hull highlighting, pause/resume, protected Game Master management, and victory/defeat effects.
- Use the isolated GitHub Actions test workflow for the automated Chromium browser smoke test and Socket.IO multiplayer integration suite. Those are separate from visual testing of the Render deployment.

The design deliberately uses CSS/SVG-style elements rather than external art services or trackers. No secrets are included in the repository.
