# Test Battleships using GitHub Actions

Use the repository's manual **Test Battleships live game** workflow to run real Socket.IO integration tests against the Render deployment. No Mac setup is needed.

## Initial setup

1. Repository **Settings > Secrets and variables > Actions**.
2. Create the secret `BATTLESHIPS_HOST_KEY` with the same value as the deployed Render `HOST_KEY`. Never enter that key in a workflow input or commit it.

## Run a test

1. Make sure nobody is currently using the live game. Close all **player** game browser tabs, including your own, to prevent automatic reconnection.
2. The game must be in the **lobby** phase. If a game is underway or finished, return it to the lobby through the Game Master **Reset game** control (only when it is safe to discard that game). Do **not** restart Render just because disconnected player registrations remain.
3. Open **Actions > Test Battleships live game > Run workflow**.
4. Select `main`, type `RESET` as `confirm_live_reset`, and press the green **Run workflow** button.
5. View the `multiplayer-test` job. Download the `battleships-live-test-report` artifact if you want detailed JSON results.

## Safety and cleanup

- The workflow refuses to run against any phase other than **lobby**.
- The runner checks that **zero player sockets are connected**. If any are connected, it fails without resetting or removing them; close player tabs and try again.
- With GM authentication, the runner calls `host:test-prepare`, a **test-only** server operation that clears disconnected registrations and resets an empty lobby. This operation also checks for active player connections and lobby phase on the server. It cannot run without GM authentication.
- The workflow then joins four temporary players, checks random fleet placement, majority voting, privacy, chat, pause/resume, latest incoming attack markers, reconnection, hits/misses and a full game through victory.
- A completed test leaves a **finished game**. Use Game Master **Reset game** to return to a lobby before another test. Disconnected temporary player registrations will be cleared safely during the next test preparation.
- Actual visual browser testing remains separate from this Socket.IO integration run.

**Important:** The workflow is destructive to an unused lobby, and manual `RESET` confirms that behavior. It does not interrupt a live game.
