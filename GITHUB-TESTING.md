# Test Battleships in GitHub Actions — isolated multiplayer

The **Test Battleships (isolated multiplayer)** workflow launches a temporary Battleships server inside GitHub Actions using the current repository's code. It drives a four-player Socket.IO match against that isolated server.

## Run the test

1. Open the GitHub repository **Actions** tab.
2. Select **Test Battleships (isolated multiplayer)**.
3. Click **Run workflow**, select `main`, and click the green **Run workflow** button.
4. Open the run and inspect the **multiplayer-test** job.
5. Download the `battleships-integration-test-report` artifact for the JSON report.

No Render restart, lobby reset, or GitHub secret is needed. The workflow generates a fresh, random, temporary GM key for its own local game instance. Never use that key outside the test.

## What it verifies

- GM authentication and restricted controls
- Four player connections, team balancing and chat isolation
- Random island and ship generation
- Majority-voted attacks, hits/misses, and latest incoming attack markers
- Pause/resume, disconnect/reconnect and eventual victory
- JavaScript syntax and dependency installation

## Important distinction

This is a **multiplayer integration test of the repository code**, not a test of the public Render deployment. It does not alter or reset the live game and cannot be interfered with by browser tabs connected to Render. Manual checks of deployment availability and actual browser layout/colors remain necessary.

The old `BATTLESHIPS_HOST_KEY` GitHub secret is **no longer required** by this isolated workflow. You may remove that repository secret if no other workflows depend on it. Keep the actual `HOST_KEY` in Render.
