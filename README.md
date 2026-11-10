# Team Builder Pro

Team Builder Pro is a realtime facilitation app for host-led team sessions. It combines room management, multiplayer activities, live voice, presentation tools, and session planning in one web app.

## Quick Start

Requirements:

- Node.js 22.x
- npm

Install dependencies and start the server:

```bash
npm install
npm start
```

Open:

- `http://localhost:3000`

The app runs locally with Socket.IO and JSON persistence by default. Runtime files are created in `.runtime-data/` and should not be committed.

## What It Includes

- Realtime rooms with host-created room codes, join links, QR join, and optional private access tokens.
- Public community lobbies with a server-backed directory for browsing and joining open drop-in rooms.
- Host controls for room settings, activity queue, moderation, and Admin Console access (host-only).
- Voice chat with push-to-talk or open-mic room modes, host moderation, participant approval, raise-hand flow, 1:1 voice focus, mute controls, and compact floating controls.
- Session planning and saved session plans with shareable links, launch-into-room flow, downloadable calendar invites, timed-run support, and session-scoped content planning.
- Two presentation modes:
  - URL-based shared presentation viewer for slide decks and embeddable presentations.
  - `Slides Studio` for native in-app slide creation with templates, gradients, solid backgrounds, images, CTA links, and source links.
- Admin Console tabs for overview, feature flags, content prompt studio, and feedback review.

## Activity Library

- Lightning Trivia
- Trivia Battle
- Emoji Charades
- Icebreaker Roulette
- Team Pulse Check
- Values Vote
- Team Wordle
- Word Chain
- Brainstorm Canvas
- UNO Showdown
- Tic-Tac-Toe Blitz Arena
- Team Jeopardy
- Spin Wheel
- Presentation
- Slides Studio
- DJ Booth
- Battleship
- Bingo
- Backgammon
- Connect 4
- Checkers
- Chinese Checkers
- Memory
- Chess Lobby
- Cosmos Bound

## Notable Features

- Editable player profile with display name and emoji/avatar selection.
- Activity Queue for preloading and running activities in sequence.
- Timed session mode for auto-advancing queued activities on a countdown.
- Feedback Hub plus Admin Console workflow.
- Content Prompt Generator for building AI prompts with expected output formats, then manually importing generated JSON as activity collections.
- Brainstorm Canvas note add/edit/delete from the board, with host moderation and creator-owned editing.
- Export support for Brainstorm Canvas and Team Pulse Check.
- Keyboard shortcuts for hosting, joining, navigation, presentation mode, queue access, and host settings.
- Mobile-friendly board game layouts for Battleship, Bingo, Backgammon, and Connect 4.
- Battleship fleet setup with drag-and-drop placement, board re-selection, quick rotate, double-tap rotate, next-vessel shortcuts, and in-map ready controls.
- Bingo cards with multiple marker styles, colorable classic cover tokens, local Bingo voice announcements, live-ball draw interaction, and win celebration.
- DJ Booth with two deck sources, YouTube playlist/video support, local file decks, room-shared uploaded tracks, mic clip recording, crossfader/master controls, deck playheads, sound pads, broadcast banner, and animated booth lights.

## Cosmos Bound

Cosmos Bound is a collaborative space mission activity where crew members work together to pilot a spacecraft.

- 7 crew roles: Commander (CDR), Pilot (PLT), Engineer (ENG), Navigator (NAV), Science Officer (SCI), Comms Officer (COM), Medical Officer (MED).
- Each role controls specific cockpit subsystems — toggles, throttle lever, coordinates, heading dial, vitals, comms, and scan.
- 3 destinations with scaling difficulty: The Moon (Easy), Mars (Advanced), Epsilon Eridani (Extreme).
- 7-phase mission: Pre-flight, Ignition, Launch (with countdown), Orbit, Navigate, Landing, Complete.
- Animated space viewport with starfield, Earth, destination planet (color-coded per destination), engine exhaust, and landing approach.
- Contextual step-by-step helper guide showing each player what to do next based on their role.
- Sound effects: ambient bridge hum, rocket launch, countdown beeps, warp transition, system toggles, and info chimes.
- Drop resilience: if a crew member disconnects, their roles are automatically redistributed to remaining members.
- Multi-crew mode for 8+ participants: auto-splits into racing crews (Alpha, Beta, Gamma, Delta) with a live scoreboard.
- Destination-specific target coordinates that the Navigator must enter.

## Session Planning

Team Builder supports planning sessions ahead of time:

- Save a session plan with title, date, time, meeting link, notes, activity queue, and content brief details.
- Add per-activity durations for timed queue runs.
- Share a saved session plan as a URL.
- Import a shared session plan from the URL automatically.
- Launch a new live room directly from a saved plan.
- Download an `.ics` calendar invite from a saved plan.
- Carry planned content and activity context into the live room when the session starts.

## Community Lobbies

Team Builder can also run public community spaces:

- Browse active public community lobbies from the `Community Lobby` screen.
- Host a public drop-in lobby using the same underlying room model as private sessions.
- Restrict community-lobby creation to authenticated admins or host names allowlisted in Admin Console.
- Join an open lobby directly from the directory without manually entering a room code.
- Edit or remove a community lobby from the directory or from inside the live lobby when you are the host or an admin.
- Built-in community chat inside the lobby with text messages, emoji reactions, newest-message pinning, and the most recent 50 messages visible in the feed.
- Launch full-room activities from the community lobby and return everyone to that lobby after the activity ends.

## Voice Controls

Voice controls support both participant and host moderation flows:

- Local mic input meter for the active speaker.
- Host-selectable `push-to-talk` or `open mic` room defaults.
- Raise-hand indicator for participants.
- Host-side hand alerts in the lobby and moderation panels.
- Per-user allow voice, mute/unmute, lower hand, and 1:1 conversation controls.
- Movable/collapsible voice dock.

## Slides Studio

Slides Studio is the native slide-builder activity inside the app.

It supports:

- Multiple slides in one presentation
- Template styles such as Title, Hero, Two Column, About, Features, Problem, Resolution, Looking Forward, and Did You Know?
- Solid or gradient backgrounds
- Background image or image-card layout
- Adjustable image radius and fade-to-black
- Optional tag placement at the top or bottom
- Text positioning controls
- CTA button links and source links

## DJ Booth

DJ Booth is a host-led live music activity inside the room.

It supports:

- Two independent decks (`Deck A` and `Deck B`)
- YouTube video or playlist loading per deck
- Local host-only audio file loading
- Room-shared uploaded track library for cross-device playback
- Mic clip recording into the shared track library
- Deck play/pause, restart, seek, and per-deck volume
- Crossfader and master volume controls
- Eight editable sound pads
- Scrolling broadcast banner text
- Animated DJ lighting modes and intensity controls

Notes:

- Local file decks play on the host device only.
- Shared uploaded tracks are the preferred path when you want participants to load the same audio source in the room.
- Browser autoplay policies may still require participant interaction before audio starts on some devices.

## Content Prompt Generator

The app includes a prompt generator for creating activity content using your preferred AI tool:

1. Select activities and configure topic, difficulty, and count.
2. Click "Copy Prompt" to get a ready-to-use prompt with example output formats for each activity.
3. Paste the prompt into any AI tool of your choice.
4. Copy the JSON output and import it as a collection in the app.

Each prompt includes concrete example outputs showing the exact data structure expected, plus a final import wrapper format.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Realtime: Socket.IO
- Optional realtime/storage fallback: Supabase in the browser when `window.SUPABASE_URL`, `window.SUPABASE_ANON_KEY`, and the Supabase client are injected
- Persistence: local runtime JSON files in `.runtime-data/`
- Security: `helmet` and `express-rate-limit`

## Environment Variables

- `PORT`
- `ADMIN_TOKEN`
- `DEV_ADMIN_PASSWORD`
- `ADMIN_TEMP_PASSWORD`
- `DATABASE_URL` (MySQL/MariaDB or PostgreSQL)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (MySQL alternative to a URL)
- `MYSQL_SSL_MODE` (`verify_identity` for remote hosts; `disable` for same-server loopback)
- `DB_SSL_CA` (optional CA certificate contents for MySQL TLS)
- `PGSSL` (PostgreSQL only)

Optional browser globals for the Supabase fallback path:

- `window.SUPABASE_URL`
- `window.SUPABASE_ANON_KEY`

Notes:

- Supabase is not a required backend dependency for local development.
- The default realtime/storage path uses Socket.IO plus local runtime persistence.
- Supabase code is present only as an optional browser-side fallback for shared room state and realtime sync.

## Development Notes

- `npm start` runs `server.js`.
- `PORT` can be set to run on a different port.
- Admin-only flows can be protected with `ADMIN_TOKEN`, `DEV_ADMIN_PASSWORD`, or `ADMIN_TEMP_PASSWORD` depending on the environment.
- Supabase is optional; the local default does not require Supabase credentials.

## Repository Structure

- `index.html` - main frontend application shell and markup
- `assets/js/` - modular frontend JavaScript (extracted from `index.html`)
  - `admin-runtime-core.js` - admin console logic
  - `domain-managers.js` - domain/state managers
  - `navigation-core.js` - screen navigation
  - `room-renderers-core.js` - room UI rendering
  - `room-session-core.js` - room and session logic
  - `runtime-utils.js` - shared runtime utilities
  - `screen-renderers-core.js` - screen-level rendering
  - `session-plans-core.js` - session planning logic
  - `socket-core.js` - Socket.IO client handling
  - `static-data.js` - static app data
  - `storage-api.js` - API storage layer
  - `storage-runtime.js` - local runtime storage
- `sounds/` - mission sound effects for Cosmos Bound activity
- `server.js` - realtime and API backend
- `package.json` - scripts and backend dependencies
- `.runtime-data/` - local persistence created at runtime

## Themed Questions and Session Navigation

From the session lobby, choose **Create themed questions**, describe a theme, and select the activities. Copy the prepared prompt into an AI app, then paste its JSON reply into Team Builder and save it to the session. Optional controls are under **Customize question count, difficulty & audience**. Session content takes priority over global and sample questions for those activities. Family Face-Off supports themed rounds with 2–8 answers whose simulated points total 100.

Slides Studio also supports copying an AI prompt and importing a JSON array of slides. Neither flow requires an API key or makes direct AI requests.

Every activity has a host **Back to session** control, which pauses any running queue while keeping the agenda. The legacy standalone survey board links back to Team Builder and remains separate from the multiplayer session game.

See [the app and UX review](UX_REVIEW.md) for findings, validation, and further improvements.

The Admin Console separates live sessions, activity availability, app settings, questions/themes, and feedback. Unsaved app settings survive tab changes; use **Save app settings** or **Discard edits**. The Activities tab includes search and Essentials / Enable all / Disable all presets.

The question builder includes grouped theme presets and reusable themes saved on the current browser. Name a question pack, copy its AI prompt, and use **Review questions** to validate and preview a reply before saving. A plain JSON question array is accepted when exactly one activity is selected; complete content-pack JSON supports multiple activities. Global admin packs and session-specific packs are labeled separately.

## Checkers

Start **Checkers** from the lobby or add it to the activity queue. The first two participants take Black and Red; other participants can watch. If the match starts with one player, a joining participant can choose **Join match**. Black moves first, and each player sees the board from their own side.

Select a highlighted piece, then a legal destination. By default, captures are required and kings move one square or jump an adjacent opponent. The host can open **Match rules**, choose **Flying kings** for long-range diagonal movement, and enable **Allow free moves when a capture is available** for optional captures. Choose **Apply rules & start new match** to use the selections on a fresh board; the active rules are shown to both players. **New match** preserves the current rules. Once a capture starts, multiple jumps must use the same piece; promotion to a king ends the turn. Flying kings capture one opposing piece per jump and may land on any empty square beyond it, stopping at the next occupied square. Kings move and capture diagonally in both directions. Capturing all opposing pieces or blocking every opposing move wins; threefold repetition or 80 moves without capture/promotion ends in a draw. Moves and player turns are validated by the server. The host can start a new match to reseat current participants or use **Back to session**.

## Memory

Start **Memory** from the lobby or add it to the activity queue. Everyone present joins the round automatically; late arrivals can choose **Join this round**. One player can practice solo. Reveal two cards on your turn: matching pairs earn one point and keep your turn; mismatches stay visible for 1.4 seconds, then turn face down and pass play to the next player. The highest pair count wins, and equal scores tie.

The host can choose **Animals**, **Space**, or **Food** and a **12-, 16-, or 24-card board** under **New round & options**. Starting a new round reshuffles the deck and resets scores. Options stay selected during live updates. Other room participants can watch without joining.

The server validates flips and scores, keeps unrevealed card identities private, and handles mismatch timers. Reconnecting restores the visible board. The private deck is persisted with room metadata so an active round and its pending timer can recover after a normal server restart. **Back to session** ends the activity while retaining the room.

## Chinese Checkers

Start **Chinese Checkers** from the lobby or activity queue. The host chooses **2, 3, 4, or 6 players**; participants choose an open camp, and the host starts once all seats are filled. Everyone else can watch. Seats lock during the round, so late arrivals can join the next round.

Move one of your ten marbles toward the opposite camp. Choose a neighboring empty hole for a single step, or hop over an adjacent marble of any color into the empty hole immediately beyond. Hopped marbles stay on the board. You may chain hops with the same marble, change direction between hops, and choose **End turn** after any hop. Hops are optional; a step ends the turn immediately. Reach your opposite camp with all ten marbles to win. A pass is available only if no legal move exists.

Use **+ / −**, **Fit board**, and **Center my camp** to view the star board; scroll or swipe the zoomed board to pan. Colors and symbols identify camps. Arrow keys plus Home/End move keyboard focus in six directions, and Enter/Space selects a marble or destination.

The host can pause/resume without losing a hop chain, start a new round, or return to the session. Reconnecting restores the shared board and any confirmed intermediate jumps. A departed player's seat stays reserved during play; the host can pause for their return or start a new round with available players. New rounds retain seats for participants still in the room. All actions are validated by the server, and ordinary room writes cannot change the board. To play solo, choose **Play vs computer** during setup; this fills every open seat and starts the round. For a mix of friends and computers, let friends choose seats, then use **Fill open seats with computers** and **Start round**. The host can remove computers during setup. Computer turns run on the server, support multi-hop moves, stop while paused, and resume after a server restart. New rounds retain computer seats.

### Family Face-Off game-show board

Family Face-Off (formerly Survey Clash) has a blue-and-gold game-show stage, team score displays, a round bank, and numbered answer panels. Hosts can click a panel or submit a matching guess to flip down the answer and its points for everyone in the room. Reveals animate once, continue through live updates, and respect reduced-motion preferences. Strikes display one to three large red X tiles over the screen, fade out after three seconds, and play a synthesized buzzer. Correct answers play a bell, including the last answer. Everyone has a local sound toggle; mute and volume settings are respected. Browser interaction enables audio, and saved events do not replay when reconnecting. Existing sessions, themed question packs, and the standalone `survey-clash.html` URL remain compatible.

### Spin the Wheel

The wheel now puts the stage, result, and player predictions together, with a compact host panel beside them on desktop. Players choose a named option under **Call your shot**; predictions lock during a spin, reset afterward, and award 50 XP for a correct choice. When choices appear on more than one slice, either matching slice counts. Each choice has equal odds.

Hosts can hand the next spin to a participant, turn predictions on/off, or load **Break the ice**, **Celebrate**, **Pick a person**, and **Truth or dare** presets. **Customize your wheel** holds the name and one-choice-per-line editor; points, prompts, and activity actions remain available under **Add points or activities**. Larger pools sample up to eight choices. Changing choices resets the result and recent history; changing only the title preserves the current choices. Edits are disabled during spins, and unsaved editor text survives live updates.

The wheel lands on the slice under the top pointer and displays the same result to everyone. Spin timing and result settlement run on the server, survive a spinner refresh/disconnect and server restarts, and cannot be overwritten by player room updates. Live renders continue from elapsed animation time. Recent spins, earned spin points, and saved favorites remain available. Wheel sounds are optional and muted initially; reduced-motion mode skips rotation and confetti.

### Family Face-Off teams, buzzers, and player answers

Players now answer from their own devices in the shared session (the standalone board remains a host-operated screen):

1. Join a team during setup. The host can assign players, rename the teams, and choose one representative per team.
2. The host chooses a 5, 8 (default), 10, or 15-second answer window and selects **Open the buzzers**. The question appears for everyone. Only the nominated players can buzz; the server accepts the first buzz.
3. The winner types an answer and presses Enter/**Send answer**, or speaks and selects **I answered out loud**. Exact matches and aliases reveal automatically. Other wording and spoken answers wait for host judgment; the host selects a matching answer or **Not on the board**. Submitting before the deadline stops the clock for review.
4. A highest-scoring answer wins the face-off immediately. Otherwise the opposing representative gets a timed chance to beat it. Ties favor the first answer. If both miss or time out, the buzzers reopen. The winner chooses **Play** or **Pass**.
5. During the main round, members of the controlling team can type answers. Three strikes give the other team one answer to steal the bank. Successful steals include the new answer's points; failed steals award the existing bank to the controlling team. The host opens the next round after scoring.

Face-off deadlines, buzz order, answer permissions, review, and scoring are server-controlled and survive refreshes and server restarts. Players joining during a round watch until the next setup. Representatives rotate by default between rounds. If a representative leaves, the host can use **Host controls → Restart this face-off** to choose replacements before points are awarded.

### Community Plaza

The **Community Lobby** now opens a bright avatar plaza with public-session cards. Each room shows a bounded preview of its members, its host, current game, voice availability, occupancy, and an explicit **Join session** button. Open rooms appear first, followed by games in progress and full rooms. Full rooms remain visible with joining disabled; a game in progress can be joined, with seating handled by that game. Closed, expired, and private rooms are excluded from discovery.

Search by room title, host, room code, description, or game. Filters show all rooms, rooms waiting to play, active games, or rooms with voice. The directory refreshes every 15 seconds while visible. Failed refreshes retain the last-known list and display a retry message. Search focus and host-request drafts survive refreshes.

Approved hosts can start rooms; other players can expand **Request host access** below the room list. Community rooms have a matching avatar welcome area, a link back to the plaza, and a return-to-room action. Switching sessions joins the new room before releasing the old seat. Avatars are generated locally from room-scoped seeds and retain the player's emoji badge; public previews contain no raw player IDs or guest names. Reduced-motion preferences disable avatar movement.

### Create your character

Open **Create Character** from the dashboard, **Customize your character** in Edit Profile, or **Create your character** in the Community Plaza. The creator has six sections with a live preview:

- **Character:** person, robot, or cat; body shape; skin, fur, or shell color.
- **Face:** eyes and eye color, nose, and mouth.
- **Hair:** hairstyle and color.
- **Outfit:** shirt, pants, and shoes, with separate colors.
- **Extras:** hand gestures or mittens, hats, and accessories such as glasses, headphones, and scarves.
- **Background:** scene style and background color, including a transparent option.

Choose a palette color or use the custom color picker. **Surprise me** creates a random draft you can continue editing. **Save character** stores it in the player profile and updates the current room; **Cancel** discards the draft. Saved characters survive a page reload, travel with the player into new rooms, and appear on the dashboard, profile, community session previews, and member gatherings. The existing emoji remains as the character's badge.

### MySQL connection

`npm start` reads the ignored local `.env` file with Node 22. The app supports MySQL/MariaDB and PostgreSQL for global settings and reusable question collections. With MySQL, supply `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. A `mysql://` or `mariadb://` `DATABASE_URL` is also accepted and takes precedence. Copy `.env.example` for the variable names; keep real credentials out of Git.

Run `npm run check:database` for a read-only connection check. It reports the selected database, authenticated user, server version, and whether TLS is active; it does not print passwords or create tables. Remote MySQL connections default to verified TLS. When deploying to Hostinger, the app connects to `127.0.0.1:3306`; use the account's remote database host only from outside Hostinger. Configure the production environment separately from the ignored local `.env`.

On application startup, the settings adapter creates `app_config` if needed, loads existing settings, and uses parameterized updates when admin settings or collections change. PostgreSQL support and local-file fallback remain available. Rooms, session secrets, and feedback continue using the existing runtime files; this change does not migrate those datasets.

### Chess and Checkers win celebrations

A new win shows a trophy, the winner's avatar or custom character, and a confetti celebration. The winner sees **Victory!**; other viewers see the winning player's name. It dismisses after 4.5 seconds, with **Back to board** and Escape available sooner. A winner banner stays on the board. Live updates and refreshes do not replay the celebration; rematches can celebrate again. Draws and old archived results do not trigger a win animation. Reduced-motion mode shows a static result without confetti.

The next card games are described in [CARD_GAMES_PLAN.md](CARD_GAMES_PLAN.md).


## Permanent settings

With MySQL configured, `app_config` stores both application settings and private user preferences. Startup imports this installation's existing `feedback-state.json` when the global database record is first created. Branding, admin preferences, question collections, community host requests and approvals, and feedback survive server restarts. Older config-only records are upgraded using the existing local host requests and feedback. Global saves acknowledge success after the database write; a configured database outage returns a save error rather than silently falling back to files.

Each browser identity has a separate `user_settings:<SHA-256 of user token>` record. It stores the character/profile, host room defaults, AI generation preferences (excluding API keys), session plans, saved themes, wheel favorites, and game sound preferences. Existing browser settings migrate automatically without replacing newer database values. Local changes stay queued through reloads if a request fails and retry when the browser reconnects or regains focus. Host settings saved in a room also become defaults for the next room; community rooms remain public and voice focus never carries between sessions.

The browser identity is anonymous, not an account login. Keep its browser storage to retain access to its saved preferences; clearing all site data creates a new identity. Database storage does not add cross-device sign-in. Admin tokens, room access/actor tokens, AI API keys, active-session snapshots, and device-specific voice dock positions are excluded from this sync. Server-side AI credentials remain in environment variables.

Without database configuration, development uses atomic files under `DATA_DIR`, including a private `user-settings/` directory. When switching this installation to MySQL, those user files are imported on the next settings sync. Deploy the updated server and frontend together and configure production database environment variables separately from the local `.env`; local configuration does not change the hosted app.


## Blackjack and poker

Use the **Card games** filter in a session to open **21 / Blackjack**, **Five-Card Draw**, or **Texas Hold’em**. Take a seat, then the host selects **Deal first hand**. Seats start with 1,000 virtual play chips; Blackjack has an automated dealer, while both poker games require at least two players. Late arrivals can watch or take an open seat for the next hand.

Only the server deals, validates actions, advances turns, and pays pots. Blackjack supports hit, stand, double, soft aces, 3:2 naturals, and pushes; the dealer stands on every 17. Poker includes no-limit betting, all-ins, side pots, ties, rotating blinds, and private folded hands. Five-Card Draw allows one exchange of up to five cards. Hold’em deals the flop, turn, and river with burn cards and selects the best five of seven cards.

Each player sees only their own private hand before showdown. Card selection, amount previews, 30-second turn timers, pause/resume, reconnect recovery, and win celebrations are included. **Seats, results & rules** contains player stacks, revealed results, table rules, and host options. Host resets are allowed between hands; no automatic rebuy occurs. Blinds default to 10/20, with 25/50 and 50/100 presets. Chips belong to the current table and are not an account wallet.

Private decks, hands, action IDs, and seat credential hashes use backend-only database records when MySQL is configured, with an owner-readable private-file adapter for local development. Private writes complete before acknowledgement; restart recovery restores the authoritative hand and deadline. Ending the activity removes the private table. This follows the existing single-process server architecture. See [CARD_GAMES_PLAN.md](CARD_GAMES_PLAN.md) for the rules, privacy design, and release limits.
