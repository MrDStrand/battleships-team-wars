# Test Battleships using GitHub Actions

This workflow tests the **existing** Render deployment through Socket.IO. No software needs to be installed on your Mac.

## One-time setup

1. Open the `MrDStrand/battleships-team-wars` repository on GitHub.
2. Open **Settings > Secrets and variables > Actions > New repository secret**.
3. Name it `BATTLESHIPS_HOST_KEY` and enter the current Game Master key as the secret value. Never paste the key in workflow inputs, code, or logs.
4. Ensure GitHub Actions are enabled under **Settings > Actions > General**.

## Each test run

1. Ensure no one is using the live game. This test resets the game and plays a full match.
2. **Important:** The server keeps players registered even after a game reset. If a previous test ran or players have joined, restart the Render web service to clear in-memory players **before** testing.
3. On GitHub open **Actions > Test Battleships live game > Run workflow**.
4. Select the `main` branch, enter exactly `RESET` in `confirm_live_reset`, and leave the target URL unchanged.
5. Click the green **Run workflow** button, open the new run, and follow the `multiplayer-test` job.
6. The job logs show `PASS` and `FAIL`. After completion, scroll to **Artifacts**, download `battleships-live-test-report`, and upload its JSON file to ChatGPT for analysis.

## Safety and scope

- Requires exact `RESET` confirmation before the job runs.
- Authenticates as Game Master, checks for existing registered players, and refuses to reset if any are found or the phase is not lobby.
- Creates two Blue and two Red players, deploys ships on both boards, tests majority voting/chat/islands/Intelligence/pause/reconnect/hits/misses, and aims for a Blue victory.
- Leaves a finished game and test player registrations in server memory. **Restart the Render service after testing** to return to a clean lobby.
- Does not change server code, player UI, or Game Master UI.
- This is a real Socket.IO integration test, **not** a visual/browser test of grid colors and layout.
- Missing secret means the run fails with setup instructions; the secret is not printed.