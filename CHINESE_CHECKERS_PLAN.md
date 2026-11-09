# Chinese Checkers implementation plan

Status: implemented locally on November 9, 2026. Not deployed or pushed as part of this implementation.
Decision: multiplayer first, followed by computer opponents (implemented November 9, 2026).

## First release

Add a room activity named **Chinese Checkers** (`chinese-checkers`) for 2, 3, 4, or 6 players, mixing humans and computer opponents, with spectators. Use one color and ten marbles per player. Five-player games and multiple colors per player are excluded from the first release to keep setup balanced and simple.

The board has 121 holes: a central 61-hole hexagon plus six ten-hole triangular arms. Use axial coordinates and a canonical board topology shared by rendering, move validation, and tests. Assign opposite camps for two players, alternating camps for three, two opposite pairs for four, and all camps for six. Each goal is the camp opposite its starting camp.

The first player to place all ten of their marbles in their opposite camp wins. Other players see their progress as “marbles home / 10”; this is progress, not a separate scoring system. A round ends at the first winner.

## Rules to implement

Use the ordinary step-and-hop rules described by [Winning Moves](https://www.winning-moves.com/images/ChineseCheckers_Rules.pdf):

- A turn moves one marble, either one step to an adjacent empty hole or a sequence of jumps.
- Jumps cross one adjacent marble into the empty hole immediately beyond it, along a straight line. The jumped marble may belong to any player, including the mover.
- Jumped marbles remain on the board. There are no captures, promotions, kings, or compulsory jumps.
- A player may change direction between jumps and may stop a jump sequence after any legal landing. Steps cannot be combined with jumps in the same turn.
- One-step moves end the turn immediately. Jump sequences require **End turn** unless no further jump is available, in which case the turn ends automatically.

Explicit app decisions for this release:

- Permit steps and jumps in all six board directions, including backward moves.
- Keep all board holes available; do not add restrictions on entering other camps or leaving the goal camp in this release.
- Prevent revisiting a landing hole within the same jump sequence, avoiding meaningless loops.
- Allow **Pass turn** only when the server finds no legal move. If every remaining active player passes consecutively, end the round as a draw.
- Do not automatically skip a disconnected player. Preserve their seat for reconnecting. The host may pause, end, or restart the round. Removing a seat or taking over its marbles mid-round is outside the first release.
- Destination blocking uses the literal ten-own-marbles win condition. An anti-blocking variant needs separate design; it must not accidentally award a win just because the opposing camp starts full.

The publisher includes a five-player variant with an asymmetric advantage. Excluding it from the initial player-count selector is an app choice, not a claim that all editions forbid it.

## Host and participant experience

1. Start the activity from the lobby or queue. Show a setup board, an available-seat list, and a player-count selector: 2 / 3 / 4 / 6.
2. Participants choose **Join game**; the host takes the first seat by default. The server assigns camps from the selected layout. Everyone else watches.
3. The host starts when the required seats are filled. Lock seats and rules once play begins. Late arrivals spectate until the next round; no mid-round replacement takes over another player's position.
4. On a turn, select a marble to highlight legal steps and first hops. After a hop, highlight legal continuations and show a prominent **End turn** button. The player can stop even if another hop is available.
5. Display the current player, their home-to-goal direction, the selected path, and each player's marbles-home count. Identify seats with both colors and symbols so color is not the only cue.
6. Show the winner, final progress, **Play again**, and **Back to session**. Host restart and rule/setup changes create a fresh round. Returning to the session uses the existing queue-pause behavior.

Use a responsive SVG board with an accessible HTML control layer or accessible SVG buttons. Preserve real hexagonal spacing; do not draw a square-grid approximation. On phones, add zoom and pan with **Fit board** and **Center my camp** controls so 121 small targets remain usable. Keep turn actions reachable without scrolling through the full standings. Support keyboard navigation between neighboring holes, selection with Enter/Space, visible focus, and reduced-motion preferences.

## Implementation structure

- `assets/js/games/chinese-checkers-core.js`: pure board geometry, camp layouts, setup, legal steps/hops, jump-path validation, turn completion, passing, and win detection. Accept explicit state and return new state without mutating the previous board.
- `assets/js/activities/chinese-checkers.js`: activity registration, setup, responsive board, selection/highlights, turn actions, standings, rules, and host controls.
- `server.js`: authenticated `chinese-checkers:action` events for joining/leaving setup seats, selecting a layout, starting, stepping/hopping, ending a jump turn, passing, pausing/resuming, and restarting.
- Integrate the activity ID into frontend/backend catalogs, defaults, Board games filtering, the lobby card, queue, saved plans, and admin availability settings. Ship it enabled by default, consistent with Checkers and Memory.
- Document the selected rules and hosting flow in `README.md`.

State should contain a unique round ID, revision, phase (`setup`, `playing`, `finished`), chosen layout, seats/player IDs/camps, board occupancy, active seat, optional jump path, consecutive-pass count, progress, winner, and last move. Store occupancy using stable hole IDs rather than screen positions. Derive legal destinations instead of trusting client-supplied lists.

Reuse the app's room persistence and shared updates. All board information is public, so no private deck storage is needed. Every action must authenticate the player and check the round ID and revision. The server validates each hop against the current intermediate board. A player may end only their own in-progress jump sequence. Reject stale actions, moves by spectators, setup changes after start, and direct shared-room writes that alter the game state. Do not publish partial turns from client-only drafts.

Reconnects restore a confirmed intermediate jump sequence, including the same marble and its visited holes. Host pause/resume must preserve an intermediate jump sequence and reject moves while paused. Round restarts and queue transitions must invalidate outstanding actions from the previous round.

## Delivery order

1. Implement and test the 121-hole topology, camp layouts, and core step/hop engine.
2. Add server-controlled setup, moves, optional jump continuation, turn completion, and persistence.
3. Build the desktop board and setup/turn controls, then mobile zoom/pan and keyboard interaction.
4. Integrate lobby/queue/admin controls and complete multiplayer browser checks.

## Acceptance checks

- Exactly 121 unique holes, six symmetric ten-hole camps, correct opposite-goal mapping, and legal layouts for all four player counts.
- Legal steps in six directions, hops over any color, occupied-landing rejection, no off-board moves, no removal of jumped marbles, and no step/hop mixing.
- Optional first hops and continuation; **End turn** works after any confirmed hop. Only the same marble can continue, and a path cannot revisit a landing.
- Win detection requires all ten own marbles in the correct goal; partial occupation and a full enemy camp must not trigger a win.
- Server rejects impersonation, spectator moves, stale actions, duplicate seat claims, direct state edits, and host-only actions from guests.
- Setup, waiting, reconnecting mid-chain, host pause/resume, restart, queued launch/advance, and session return behave consistently.
- Two browser clients complete a turn and a jump chain, see identical updates, and recover an intermediate turn after reconnect. Six-player turn rotation and pass/draw behavior are exercised through integration tests.
- Mobile board can be zoomed/panned and refitted without page overflow; destinations remain tappable. Keyboard and reduced-motion behavior are checked.

## Later releases

Optional long-jump variants, team modes, multiple colors per player, tournament standings, and an explicitly defined anti-blocking rule. Computer opponents now reuse the same legal-move generator, with server-controlled turns and host-managed setup.

## Implementation verification

- `npm run check`: 44 tests passed, covering board topology, all four layouts, legal steps/hops, voluntary turn completion, pause/resume, win detection, passing, server permissions, six-player rotation, queue transitions, rematches, and restoring a paused hop chain after a server restart.
- Two isolated browser clients verified seat selection, shared steps, a reachable multi-hop sequence, optional End turn, pause/reconnect/resume, preserved rematch seats, all layout controls, keyboard neighbors, and return to the session.
- The 390px browser check verified no horizontal page overflow, zoom controls, fitting and camp centering. Mobile screenshot inspected. Six-player behavior was exercised through the integration test, rather than six simultaneous browser windows.
- The test suite's all-pass draw scenario uses a blocked test board; the browser check did not play an entire match to victory. Goal completion and rejection of a false win are covered by core tests.
