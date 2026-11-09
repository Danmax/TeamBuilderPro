# Card games implementation plan

Status: planned November 9, 2026. No card-game implementation in this change.

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
7. Keep existing JSON runtime persistence working initially; introduce database-backed private-table persistence through a storage interface, with migration as an explicit follow-up.

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
