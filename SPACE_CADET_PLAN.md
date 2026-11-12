# Space Cadet: Zero to Hero

Status: campaign plan with an initial playable preview implemented. The larger campaign, trusted rewards, and ship upgrades remain planned.

## Current playable slice

Launch **Space Cadet: First Launch** from a room's activity picker. The host starts the activity; each participant plays an independent solo adventure. The preview includes connected crew quarters, engineering/training, and hangar rooms; collision-aware walking; a staged relay diagnosis, power-routing, and load-test job; a hands-on flight simulator; a starter ship; a supply-pod rescue; drones, asteroids, repair/rapid-fire pickups, and Scrap Maw with escalating attack patterns.

Jobs use framed RPG dialogue with a named speaker, a comms portrait, paged character-by-character messages, and instant text reveal. The relay must be scanned before routing, and its repair is saved only after a successful load test. Flight qualification requires navigating three beacons, shooting three targets, and absorbing two real simulated pulses with the shield. The simulator causes no hull damage. All task completions retain the success animation; reduced-motion settings show static success feedback and instant dialogue text. Existing earned qualifications remain valid in saved previews.

Keyboard and touch controls, pause, personal browser-local progress, a boss checkpoint, retries, a debrief, and returning to the hangar are implemented. Pixel scenery and the initial character adapter are drawn directly in Canvas 2D; the concept board remains a separate art reference. The adapter currently preserves species, basic hair, skin/fur, and outfit colors, with simplified hats. Complete accessory and body-shape mapping, richer animation, the bridge, and sound design remain future art work.

This preview awards and spends no coins and provides no permanent upgrade shop. Flight is simulated locally, not server-verified. Progress belongs to this browser's player profile; clearing storage removes it. It does not promise cross-device saves or cooperative flight. Replay starts a new sortie while keeping qualifications and completed objectives. Returning to the hangar retains a boss checkpoint when reached; choosing New adventure explicitly resets only this preview's local progress.

Implementation: `assets/js/games/space-cadet-core.js` (rules and collision), `assets/js/activities/space-cadet.js` (pixel rendering, input, local saves, and lifecycle), and `assets/css/space-cadet.css` (HUD and responsive controls). The activity registers through the existing registry and respects the room/admin activity settings.

Visual development: [art direction and reference analysis](docs/design/space-cadet/ART_DIRECTION.md), including the [first concept board](docs/design/space-cadet/visual-direction-v1.png). Establish the room, character, ship, and combat art studies before producing the full chapter asset library.

## The adventure

Your existing Team Builder character arrives aboard a battered relief ship with no rank and no ship of their own. Start with maintenance jobs, learn to fly, uncover a conspiracy, and become the commander who breaks an alien war fleet's control of the frontier.

An original 16-bit action RPG combining walkable ship interiors, arcade space combat, environmental puzzles, ship upgrades, and faction decisions. Classic formation shooters, asteroid navigation, and cinematic flight missions inform different modes; characters, ships, music, enemies, and story are original.

Planning assumptions: solo-first campaign; desktop and phone controls; private personal progression; cooperative missions added after the core loop works. These are proposals, not previously approved product requirements.

## The main loop

1. Walk around the ship or station using your character. Meet crew, take a job, or investigate a story lead.
2. Complete a short task or training exercise. Learn a mechanic that matters in the next mission.
3. Select a ship and equipment in the hangar. Review mission goals and difficulty.
4. Launch into combat, navigation, rescue, or a boarding mission.
5. Solve an obstacle and defeat the sector boss or complete an equivalent story objective.
6. Receive a mission debrief, eligible coin rewards, rank progress, and unlocks.
7. Upgrade your ship and return to a hub changed by your decisions.

Target individual jobs at 2–5 minutes, flight missions at 5–10 minutes, and a complete chapter at 20–30 minutes. These are pacing targets to test, not delivery estimates.

## Play modes

| Mode | Play | Progression purpose |
| --- | --- | --- |
| Ship life | Top-down walking, crew conversations, cargo runs, repair tasks, med-bay assistance | Establish character, relationships, and mission leads |
| Cadet academy | Safe movement, firing, shield, rescue, and navigation drills | Teach controls and earn qualifications |
| Sector defense | Formation-based waves, aimed shots, shields, and temporary pickups | Fast combat and enemy-pattern training |
| Asteroid run | Top-down directional flight through debris, mines, salvage, and distress signals | Handling, route selection, rescue choices |
| Strike mission | Forward-scrolling 2D flight with depth cues, wingmate dialogue, and boss weak points | Cinematic chapter finales; later expansion |
| Boarding and investigation | Explore derelicts, restore power, bypass doors, collect evidence | Puzzles and story discoveries |
| Command and diplomacy | Faction conversations, permit disputes, evidence hearings, blockade negotiations | Change routes, allies, and mission conditions |

Use one top-down flight model in the first release. Cinematic forward flight needs its own controls and camera, and follows later. No fully 3D flight in the initial scope.

## Zero-to-hero progression

| Rank | New responsibility | Example milestone |
| --- | --- | --- |
| Recruit | Ship jobs and basic movement | Restore the training deck |
| Cadet | Simulators and supervised flight | Earn the launch qualification |
| Ensign | Own a starter ship and take contracts | Rescue a missing supply crew |
| Lieutenant | Specialized ships and faction assignments | Break the first blockade |
| Captain | Crew choices and multi-stage operations | Expose the occupation's legal pretext |
| Commander | Sector alliances and fleet objectives | Unite frontier stations |
| Frontier Hero | Resolve the campaign and unlock challenge missions | Defeat the warlord flagship |

Rank comes from campaign milestones and qualifications. Coins buy equipment; they cannot buy rank or bypass required training. Avoid mandatory repetitive chores between story missions.

## Your character in a 16-bit world

- Keep the existing character's species/type, skin or fur, hair, outfit colors, and recognizable accessories.
- Build a pixel rendering adapter for walking sprites and portraits from those supported character attributes. Existing SVG characters are a reference; pixel animation assets and mapping still need to be made.
- Start with four walking directions, idle, interact, and a simple tool-use animation. Expand animations after the first chapter.
- Use a consistent pixel grid, nearest-neighbor scaling, readable silhouettes, and a restrained palette.
- Keep dialogue and controls sharp and readable at phone sizes. Offer reduced motion, independent audio controls, and enemy telegraphs that do not rely only on color.
- Ship interiors should feel inhabited: hangar, bridge, quarters, training deck, engineering, and a small canteen. Only hangar, engineering, and training deck are needed in chapter one.

## Ships, upgrades, and power-ups

| Ship | Strength | Tradeoff | Unlock |
| --- | --- | --- | --- |
| Sparrow trainer | Predictable handling and a forgiving shield | Limited damage and equipment slots | Cadet qualification |
| Wasp interceptor | Speed and evasive movement | Light armor | First combat chapter |
| Bastion gunship | Armor and heavy weapons | Slow turning | Escort qualification |
| Lantern explorer | Scanning, repair, and puzzle tools | Lower weapon output | Investigation chapter |
| Horizon command ship | Flexible support and mixed equipment | Requires careful energy allocation | Late campaign |

Permanent upgrades: hull, shield recovery, thrusters, weapon modules, and utility slots. Give each ship a small fixed number of equipment slots and meaningful energy limits. Favor different viable builds over an unlimited damage ladder.

Temporary pickups: rapid fire, spread shot, shield bubble, repair drone, magnet, and brief overdrive. They last for a mission segment and do not become permanent purchases. Bosses must remain beatable with the starter configuration available for their chapter.

Show upgrade cost, current balance, exact stat change, and resulting balance before purchase. Upgrade unlocks and owned ships persist between sessions. No paid repairs or entry fees required to retry a failed story mission.

## Combat and bosses

Enemy families include drone formations, evasive scouts, shield carriers, mine layers, boarding craft, and capital ships. Introduce one behavior at a time before combining it with others.

Every boss follows readable phases: introduce a pattern, expose a weakness, escalate, then resolve. Telegraph attacks, show a clear health bar, and provide checkpoints before bosses.

- **Scrap Maw:** a salvage machine seized by alien drones. Dodge scrap bursts, disable exposed tractor coils, then attack its core.
- **The Warden:** a blockade cruiser with shield generators protecting its weapon batteries. Destroy or disable generators in a chosen order.
- **Mirror Wing:** a rival ace using decoys. Scans and movement patterns reveal the real ship.
- **The Chancellor's Flagship:** a late-game encounter whose support fleet changes with prior alliances and evidence discoveries.

Assisted aim, slower enemy projectiles, and practice mode should let new players learn without blocking campaign access. Difficulty changes are explicit and reward rules are visible.

## Puzzles and political conflict

Puzzles should teach useful systems: reroute power to open a door, align navigation beacons, decode a signal using collected clues, sequence safe reactor shutdowns, or identify a forged cargo manifest.

Provide optional staged hints and an accessible alternative for timing-heavy puzzles. Critical evidence cannot become permanently inaccessible because a player missed a collectible or failed once.

The fictional frontier faces hostile fleets and institutional coercion: revoked docking permits, rigged trade rules, false charges against relief crews, and emergency decrees used to justify occupation. Hostile alien factions have individual motives; peaceful alien crews and allies also exist.

Players can gather records, question witnesses, escort inspectors, negotiate safe passage, and present evidence at a tribunal. Dialogue choices affect faction trust, prices, optional missions, and support in later battles. Show likely immediate consequences and save at chapter decisions. The main story remains finishable after an unfavorable ruling.

Chapter one only introduces a suspicious blockade order. Branching tribunal systems follow after movement, missions, and saves are proven.

## Coins and progression storage

Use the existing app coins as upgrade currency. Describe them consistently as coins in the UI rather than adding a second exchangeable token balance. Campaign rank, mission score, and collected evidence are separate progression values, not additional currencies.

Proposed first-chapter reward balance: training qualifies the player for a free Sparrow; the first verified story completion awards 30 reward points through the existing wallet, exchangeable for 30 coins. Example first-tier upgrades cost 10–20 coins. These values require playtesting. Do not change rewards for existing games.

Award story rewards once per campaign owner and mission version, independent of room code. Replays initially award score and practice progress only. Later replay rewards need a deliberate economy rule before implementation. Existing app coins may purchase unlocked upgrades, but story qualifications still apply.

The current wallet supports fixed verified rewards, point-to-coin exchange, and card-table transactions. It does not yet support space-game mission verification or upgrade purchases. Add those explicitly: server-validated mission completion, a fixed reward adapter, and an atomic purchase transaction that deducts coins and grants the upgrade together. Reuse durable reward delivery and idempotent action IDs.

Client-submitted scores or a claimed boss defeat cannot directly mint rewards. Never trust client prices, balances, loadouts, damage, or unlocks.

Persist a versioned campaign record with chapter/checkpoint, rank, mission completions, evidence, faction choices, owned ships, upgrades, and equipped loadout. Save at jobs, mission checkpoints, purchases, and chapter transitions. Make record migrations explicit.

Current identity limitation: wallets use browser-local credentials and do not yet offer cross-device account recovery. Initial progress can resume on the same browser; reliable cross-device campaigns require a separate identity/recovery design. Do not promise profile-export recovery for wallets.

## App and technical integration

- Register a new activity, proposed ID `space-cadet`, through the activity registry and activity discovery. Preserve the existing Cosmos Bound activity.
- The community room launches the adventure, with personal campaign state kept outside the public room snapshot. A host ending a room activity cannot erase a player's campaign.
- Render the action scene in Canvas 2D, with DOM-based menus, dialogue, mission status, and accessible controls. Use a fixed logical pixel resolution with responsive scaling and touch-friendly overlays.
- Desktop: WASD/arrows to move, primary action to fire or interact, secondary action for shield/utility. Phone: virtual directional control plus fire/interact and utility buttons. Prevent game input from intercepting typing in chat or dialogue controls.
- Keep gameplay updates out of the app's full-screen `render()` loop. Own the animation loop, canvas, resize handling, and input lifecycle within the activity; clean them up when leaving.
- Separate deterministic game rules, mission definitions, rendering, input, and persistence. Seed enemy waves and boss patterns for reproducible tests.
- For reward-bearing missions, the server owns the mission seed, legal loadout, damage, objective progress, and completion. The client sends bounded input commands and predicts presentation; the server corrects divergence. Prototype latency and server load before scaling this model.
- Save mission checkpoints rather than every animation frame. On disconnect, pause the solo mission; on server restart, resume from the last durable checkpoint with the same mission identity so rewards cannot duplicate.
- Keep initial scope to one active solo run per player. Multiplayer requires additional shared simulation, ownership, disconnect, and scaling work.

## First playable chapter: First Launch

Build one complete 15–25 minute slice before producing a large campaign:

1. Arrive at the relief ship as your existing character. Receive a cadet badge and meet the engineer.
2. Walk through three connected areas: engineering, training deck, and hangar.
3. Repair a power relay through a small routing puzzle, then complete a movement/fire/shield drill.
4. Qualify for the Sparrow and choose a starter loadout.
5. Launch into a top-down asteroid rescue mission with a short formation-combat section.
6. Recover a supply pod containing a suspicious blockade order.
7. Defeat Scrap Maw using the shield and targeting lessons from training.
8. Return to the hangar, receive the first-completion reward, exchange points, buy an upgrade, and save.

Included: one character adapter, one ship, two basic enemy types, one boss, one puzzle, one rescue objective, two temporary pickups, three first-tier upgrades, dialogue, checkpoints, keyboard/touch controls, and a debrief.

Deferred: open galaxy exploration, cinematic forward flight, branching trials, fleet command, PvP, cooperative campaign state, crafting markets, and procedural mission generation.

## Delivery stages and exit criteria

1. **Movement prototype:** a character walks around one room and boards a ship; top-down flight, collisions, firing, and touch controls work. Validate on desktop and a real phone before expanding art.
2. **Combat prototype:** two enemies, pickups, and Scrap Maw produce an enjoyable complete encounter. Check frame pacing, input delay, readability, pause/resume, and reduced motion. No wallet rewards yet.
3. **First Launch slice:** connect jobs, training, puzzle, flight, boss, and debrief. Players can recover after failure without restarting the whole chapter.
4. **Trusted progression:** persist campaigns; verify missions on the server; add once-only rewards and atomic upgrade purchases. Test forged completions, duplicate requests, concurrent purchases, disconnects, persistence failure, and restart recovery.
5. **Community launch:** add discovery and lobby entry, character compatibility, sound settings, accessible menus, and clear return-to-room behavior. Complete the chapter on keyboard and touch and resume after closing the browser.
6. **Campaign expansion:** add the next ship and chapter, then faction investigations and tribunals. Add cooperative sorties and cinematic flight only after solo progression and performance are stable.

First-release acceptance: a new player can enter from the community lobby, use their recognizable character, qualify as a cadet, complete First Launch, receive exactly one eligible reward, purchase an upgrade once, resume saved progress, and return to the community room.

## Decisions to settle before implementation

- Confirm the working title and whether solo-first is the desired launch scope.
- Review a small pixel-art character/ship reference sheet and one-room layout before producing a full asset set.
- Playtest the flight prototype before locking weapon feel, difficulty, upgrade prices, or chapter length.
- Decide whether cross-device account recovery is required for the initial release; that materially expands the persistence and identity work.
