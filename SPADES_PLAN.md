# Spades implementation plan

Status: first release implemented November 10, 2026. Includes server-authoritative partnership play, private hands, four seats with computer fill, scoring, timers, pause/restart recovery, responsive table controls, and fixed match-win rewards. See README.md for operation.

## First release

Add `spades` to the Card games library, session queue, admin feature toggles, and community-room activities. Use four fixed seats and two partnerships, with partners opposite each other. Support 1–4 humans by letting the host fill open seats with computer players. Spectators can watch. Spades uses match points, never the shared poker/Blackjack chip balance.

Default to a 500-point match, with a 250-point short-match option selected before starting. These are proposed app rules, not a claim that every Spades table uses the same variant.

## Rules and scoring

- Use one standard 52-card deck, aces high, no jokers. Shuffle securely before each hand and deal 13 private cards to each seat.
- Choose the initial dealer randomly; rotate clockwise each hand. Bidding and the first trick begin left of the dealer. Each player bids once in clockwise order: 1–13 tricks, or Nil (zero). All bids are public once submitted. No blind Nil or card passing in the first release.
- Partners' non-Nil bids form the team contract. Track tricks per player as well as per team for Nil scoring.
- Play clockwise and follow the led suit whenever possible. Otherwise, any card may be played, including a spade. There is no requirement to trump or overtrump.
- Spades are always trump. The highest spade wins; if none is played, the highest card of the led suit wins. The winner leads the next trick.
- Spades may not be led until a spade has been played, unless the leader holds only spades. A spade can be played off suit on the first trick; there is no extra first-trick restriction.
- Resolve exactly 13 tricks, then score both teams once. Keep the last trick available to review before the next hand.

| Event | Proposed scoring |
| --- | --- |
| Make the team contract | +10 per bid trick, plus +1 per extra trick |
| Miss the team contract | −10 per bid trick, rather than per trick short |
| Accumulate 10 bags | −100 points; subtract 10 bags and carry any remainder |
| Successful Nil | +100 points, separate from the partner's contract |
| Failed Nil | −100 points; that player's tricks count as bags and +1 each, not toward the partner's contract |
| Both partners bid Nil | Score each Nil independently; failed-Nil tricks remain bags |

Example: a team bids 6 and takes 8, scoring +62 with 2 bags. If it instead takes 5, it scores −60. If it already has 9 bags and earns 2 more, apply the −100 penalty and carry 1 bag.

Apply contract points, Nil points, and bag penalties before checking the match result. At least one team must meet the target; the higher-scoring team wins. If tied at or above the target, play another hand. Allow negative scores with no automatic mercy cutoff in this release.

## Table experience

- Reuse the green felt, purple rail, patterned card backs, avatars, and turn highlights from the current card games.
- Arrange opponents left, top, and right, with the viewer at the bottom and their partner opposite. Label teams using names and icons as well as color.
- Replace the poker pot with four played-card positions, trick number, lead-suit indicator, and “Spades broken” status.
- Show both teams' scores, bags, bids, and tricks taken. Make “Our team: 4 of 6” easy to read.
- Sort the private hand by suit and rank. Display all 13 cards in a responsive fan or multiple rows; every card must remain identifiable and selectable at 320px width.
- During bidding, show a bid picker and an explicit Submit bid button. Label Nil with a brief explanation of the risk.
- During play, highlight legal cards. Selecting a card previews it; a Play card button confirms it. Explain disabled cards, including following suit and unbroken spades. Support keyboard selection and confirmation.
- Hold a completed trick briefly so all four cards and the winner are visible, then collect it. Drive this interval from server state so reconnects and refreshes cannot replay a trick or advance it twice. Respect reduced motion.
- Show a hand summary with each player's bid/tricks, each team's score changes and bags, and a running hand-by-hand scoreboard. Celebrate match wins separately from individual tricks.
- Include a clear rules panel showing the selected scoring variant and match target.

## Seating, timers, and computer play

- Host assigns seats/teams before the match. Lock partnerships once it starts. New arrivals watch until a hand boundary and may replace a computer in that seat without changing teams or scores.
- Host starts the match and subsequent hands, fills open seats, pauses/resumes, and starts a fresh match after completion. Team changes require a fresh match.
- Use 60 seconds for bidding or playing. On timeout, the server submits a conservative bid or plays a legal card using the same limited-information logic as a computer player. Display that the action was automatic.
- On disconnect, retain the human's seat and credentials throughout the match. Timed automatic actions keep play moving; reconnecting restores that player's current hand. Do not apply the poker rule that removes a reserved seat between hands after 60 seconds.
- Computers consider only their own hand, public bids, cards played, trick counts, and scores. They cannot see a partner's hand or any opponent's hand. Include basic contract pursuit, partner support, Nil protection, and bag avoidance; advanced difficulty levels come later.

## Architecture and integration

1. Implement a separate server-authoritative `lib/spades.js` engine. Model waiting, bidding, playing, trick review, hand complete, and match complete explicitly. Keep score and seat identity across hands.
2. Reuse secure shuffling conventions, authenticated room/actor checks, serialized room operations, private storage, and durable deadlines from the current card games. Do not route Spades through poker betting, bankroll synchronization, or poker seat cleanup.
3. Add `spades:view` and `spades:action` handlers. Validate table, match/hand, version, action ID, actor, turn, bid, and card ownership. Derive legal plays on the server and reject reneging.
4. Public snapshots contain seats, team assignments, bids, remaining card counts, current/previous tricks, scores, bags, and timing. Authenticated private snapshots add only the viewer's hand and legal actions. Spectators and hosts receive no extra hidden cards.
5. Adapt the existing private table store for a tagged Spades record and add explicit save/load, activity transition, restart, disconnect, and timer dispatch. Existing startup and cleanup paths currently assume poker/Blackjack state; storage reuse alone is insufficient.
6. Persist before acknowledgement or public broadcast. Deduplicate retries and make trick settlement, hand scoring, and match completion idempotent. Cancel obsolete timers on pause, restart, activity exit, and new hands.
7. Add `lib/spades-ai.js`, `assets/js/activities/spades.js`, and `assets/css/spades.css`. Share existing card/avatar styles while keeping Spades controls and state independent.
8. Register in server allowlists, frontend activity registry, discovery categories, static activity metadata, lobby/community cards, compact session navigation, queueing, and admin availability controls.

## Delivery sequence

1. Rules engine: dealing, bidding, legal cards, trick resolution, hand scoring, bags, Nil, match results.
2. Private multiplayer integration: authenticated actions/views, durable state, fixed teams, timers, pause/reconnect/restart.
3. Table interface: seating, bids, 13-card hands, tricks, scoreboards, rules, and accessible mobile controls.
4. Computer seats: solo practice, mixed human/computer teams, and timeout decisions.
5. End-to-end validation and visual polish before enabling the game in the activity library.

## Acceptance checks

- Every hand contains 52 unique cards, 13 per seat; each trick uses four owned cards and every hand resolves 13 tricks. Refreshing never reshuffles an active hand.
- Correct bidding/playing order, rotating dealer, follow-suit enforcement, trump rankings, spades-breaking rules, and an all-spades leader.
- Contract success/failure, negative scores, bag rollover, multiple bag thresholds, Nil success/failure, both partners bidding Nil, and target/tie handling. Test the documented scoring examples directly.
- Complete matches with four humans, one human plus three computers, and mixed teams. Computers and timeout decisions always produce legal actions without access to other hands.
- Hosts, teammates, spectators, room previews, logs, and client persistence cannot expose hidden hands or credentials.
- Duplicate clicks, stale cards/bids, simultaneous actions, disconnect/reconnect, host transfer, pause during trick review, restart recovery, and returning to the session cannot duplicate scores or lose turn state.
- Desktop, landscape, tablet, 390px, and 320px browser checks: all 13 cards usable, clear partnerships, visible legal actions, no horizontal overflow or controls covering cards, keyboard access, and reduced motion.
- Existing poker/Blackjack balances, house play, timers, persistence, and UI remain covered by regression checks.

## Game-win coin rewards

Spades will participate in the proposed [game-win coin rewards system](COIN_REWARDS_PLAN.md). Each eligible human on the winning partnership earns a fixed reward of 1–99 reward points at match completion, once per match. Proposed amounts are 50 for a short match and 75 for a full match. Individual tricks and hands do not trigger rewards. Reward points are distinct from the 250/500-point match score. Players can exchange reward points for coins used as poker/Blackjack chips. The proposed exchange rate is 1:1; exact rewards and the exchange rate remain draft values. Spades itself requires no coin buy-in in this release.

## Deferred variants

Blind Nil, jokers/deuces wild, alternate failed-Nil scoring, partnership minimum bids, solo/cutthroat modes, card passing, custom bag rules, tournaments, ranked play, and persistent leaderboards.

## Rules references

[Bicycle's Spades rules](https://bicyclecards.com/how-to-play/spades/) describe the deck, trick play, trump, and lead restrictions, but use a different bidding/scoring variant. The partnership, Nil, and penalty rules above are explicit proposed app choices; see [Spades.net's partnership rules](https://www.spades.net/how-to-play) for a comparable variant. The app must publish its precise rules instead of presenting all variations as interchangeable.
