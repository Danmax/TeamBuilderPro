# Card games implementation plan

Status: implemented November 10, 2026. Blackjack, Five-Card Draw, and Texas Hold’em now share a server-authoritative engine, private player views, durable private-table storage, and a mobile table UI. The design below describes the implemented first release; advanced variants and poker bots remain deferred.

Add **21 / Blackjack**, **Five-Card Draw**, and **Texas Hold’em** as session activities and community-room games. Use virtual play chips, shared tables, private hands, and spectators. Keep each game's rules visible at the table.

## Shared table experience

- A felt table with player characters, named seats, dealer marker, stack sizes, chips committed, pot, and a clear current-turn indicator.
- Players explicitly take a seat and receive 1,000 play chips. Hosts choose a table preset before the first hand. No payment, account wallet, or purchases.
- A private “Your hand” area and large legal-action buttons. Distinguish **Check** from **Call 40**, and **Bet** from **Raise to 120**. Show the total commitment before confirming a raise.
- A 30-second turn timer with a visible countdown. On expiry, check when legal or fold in poker; stand in Blackjack. Never automatically place a bet or rebuy.
- Players joining mid-hand wait for the next deal. A disconnected player keeps their seat for 60 seconds; the timer still applies. A returning player receives their private hand again after authentication.
- Host controls: start the next hand, pause/resume with the remaining turn time preserved, remove an idle seat between hands, and reset play-chip stacks between hands. A host does not get access to opponents' private cards.
- Clear hand results, pot/stack animations, and a short winner celebration. Respect reduced-motion and sound preferences. Keep the final hand available to review.

## Game rules for the first release

| Game | Seats | Core rules |
| --- | --- | --- |
| 21 / Blackjack | 1–6 players plus an automated dealer | Standard 52-card deck; aces count as 1 or 11. Hit, stand, and double down on the original two cards. Dealer stands on all 17s. A natural pays 3:2; ordinary wins pay 1:1; ties push. Bets use increments of 10 play chips. Dealer checks for a natural with an ace or ten-value up-card. Splits, insurance, and surrender come later. |
| Five-Card Draw | 2–5 | Five private cards; first betting round; one draw with 0–5 selected discards; second betting round; showdown. Maximum five seats lets everyone replace five cards without recycling discarded cards. Use a rotating dealer, small/big blinds of 10/20, and no-limit betting. |
| Texas Hold’em | 2–8 | Two private cards; preflop, flop, turn, river, and showdown. Burn cards before the three community-card streets. Rotating dealer, 10/20 blinds, and no-limit betting. Best five-card hand from any combination of hole and community cards wins. |

Poker uses standard hand ordering, including ace-low straights and exact tie breakers. Implement all-in contributions, separate side pots, split pots, and legal minimum raises. A short all-in raise must not incorrectly reopen betting. For heads-up Hold’em, the dealer posts the small blind and acts first preflop, last after the flop. Award odd chips clockwise from the dealer among tied eligible winners. Folded hands remain hidden; showdown reveals the cards needed to establish the result.

## Server and privacy design

The existing shared-room JSON is visible to participants, so private cards and the undealt deck **must never be stored there**.

1. Keep the shuffled deck, private hands, and game engine state in a separate server-only table store. Persist it for restart recovery, separately from public room snapshots.
2. Shuffle with `crypto.randomInt` and Fisher–Yates. Only the server deals, evaluates hands, changes chips, advances streets, and settles a hand.
3. Use an authenticated `cards:action` socket event with a table ID, hand ID, state version, and action ID. Reject another player's actions, stale hands, duplicate actions, out-of-turn requests, and illegal bet sizes.
4. Send a public snapshot for the table and a private per-player snapshot containing only that player's cards. Spectators see public cards and hidden-card backs. Reuse room/actor access checks for snapshots and reconnects.
5. Persist deadlines and action IDs so a restart cannot duplicate a deal, bet, payout, or timeout. Pause must freeze a deadline, not silently extend one player's time on every refresh.
6. Keep hidden cards out of community previews, client storage, logs, public room exports, and error messages. Ensure folded/mucked cards stay private after a hand.
7. Private tables persist in the configured database under the backend-only `private_cards:<room code>` namespace. File-only development uses owner-readable files in `DATA_DIR/private-card-tables/`. Startup restores the authoritative private table before serving clients, and successful actions are saved before public acknowledgement. Leaving the activity removes its private table. Seat credential hashes persist alongside the game so a departed player’s ID cannot be reused to steal a reserved hand.

## Delivery order

1. **Shared card engine and Blackjack:** card/deck types, secure dealing, private snapshots, seating, play chips, reconnects, timers, and the table interface. Blackjack exercises those pieces with the smallest betting state machine.
2. **Poker foundation and Five-Card Draw:** five-card evaluation, betting, folds, all-ins, side pots, split payouts, draw selection, and showdown. Reuse the table interface and private transport.
3. **Texas Hold’em:** seven-card best-hand evaluation, blind/position rules, streets, community cards, automatic all-in runouts, and heads-up cases.
4. **Polish:** table presets, spectator guidance, mobile action layouts, avatar reactions, optional sound, win effects, and host help.

Register each activity in the lobby, queue, admin feature toggles, and community cards. Start with multiplayer poker and an automated Blackjack dealer. Poker bots, tournaments, advanced Blackjack variants, custom blind structures, and persistent leaderboards follow later.

## Acceptance checks

- Deck uniqueness and conservation, including all five-card draw replacements.
- Blackjack naturals, soft aces, dealer 17, doubles, busts, pushes, and exact payouts.
- Every poker rank and tie breaker; ace-low straights; board-only ties; all-in and side-pot eligibility; short raises; folded contributions; odd chips; and heads-up turn order.
- Chip conservation through every action and payout. No negative stacks or duplicate settlement after retries/restarts.
- Two clients, a spectator, and reconnecting clients cannot inspect another player's private hand or the remaining deck.
- Simultaneous clicks, stale requests, departed players, timeouts, pause/resume, host transfer, and server restart recovery.
- Complete hands in desktop and 320/390px mobile browsers, keyboard-accessible controls, clear amount labels, and reduced-motion support.


## First-release operation

Open **Card games** in a session's activity library. Everyone chooses **Take a seat**; the host deals once enough funded seats are ready. Blackjack works with one player against the automated dealer. Poker requires two people; bots are not included. A new seat starts with 1,000 table-local play chips. There are no payments or cross-table wallets.

Host options are under **Seats, results & rules**: use 10/20, 25/50, or 50/100 blinds, reset stacks between hands, or remove an idle seat. Blackjack players set their own next bet in increments of 10. Pause freezes the turn deadline. A disconnected seat remains reserved, and seats whose 60-second grace period has expired are released between hands. Turn timeouts continue during disconnects; there is no automatic rebuy or betting.

The client receives its private hand only in an authenticated acknowledgement and keeps it in memory. Public room snapshots and community previews contain no deck, hidden hands, or seat credentials. Folded poker hands stay hidden after settlement; all non-folded showdown hands are revealed. Poker uses a full-bet reopening threshold for short all-ins and cumulative short raises. Surplus uncalled chips return before pot settlement; tied eligible winners receive odd chips clockwise after the dealer.

Local validation includes full-hand host/guest/spectator browser play at 320/390px, landscape/tablet/desktop checks, pause/reconnect, unit and integration coverage, randomized poker chip-conservation runs, and isolated MySQL new-connection recovery. The implementation uses the app's existing single-process realtime room model; multi-process deployment would require a shared room coordinator and transactional locking.

Rules references: [Bicycle Blackjack](https://bicyclecards.com/how-to-play/blackjack/) and [Poker TDA rules](https://www.pokertda.com/view-poker-tda-rules/). Table-specific first-release rules shown in the app take precedence over optional casino variants.
