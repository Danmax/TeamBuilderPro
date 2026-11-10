# Game-win coin rewards

Status: proposed November 10, 2026. Planning only; no rewards implementation yet.

## Requested behavior

Confirmed by the user:

- Each game has a **fixed win reward**, with awards between **1 and 99 points inclusive**. The range limits each award, not the accumulated balance.
- Players exchange earned reward points for playable currency and use it as chips in Blackjack and poker.

Working interpretation: tokens, coins, and chips describe one playable currency rather than three separately traded currencies. Use “Coins” for the wallet and “Chips” for coins committed to a card table. Reward points remain separate from XP and each game's match score.

Proposed starting exchange rate: **1 reward point = 1 coin = 1 table chip**, using whole units and an explicit Exchange action. This rate and the game-specific amounts below are draft values, not yet user-selected.

## Proposed fixed rewards

| Completed win | Reward points |
| --- | ---: |
| Tic-Tac-Toe Blitz match | 10 |
| Connect 4 match | 20 |
| Checkers match | 30 |
| Chess match | 50 |
| UNO match | 30 |
| Trivia match | 25 |
| Spades short match (250-point target) | 50 per winning human |
| Spades full match (500-point target) | 75 per winning human |

These values are an initial proposal. Define an explicit reward for each additional eligible game before enabling it. Awards are never random and do not equal a player's raw match score. Read the reward from the server's configured schedule and freeze it when the match starts.

## Player flow

1. Win a supported game: “Victory! +30 reward points.”
2. Open the wallet to see reward points, available coins, and chips currently committed to tables.
3. Exchange a chosen whole number of reward points for coins. Show the conversion and resulting balances before submission.
4. Transfer coins to a card table to play with chips. Clearly show the buy-in before seating.
5. Leave between hands to return eligible uncommitted chips to the coin wallet. Restarting or disconnecting does not create a second refund.

## Shared behavior

- Award on a completed game or match with a verified winner, not on every render, reconnect, trick, score change, or celebration.
- For team games, award each eligible human on the winning team. Computers and spectators receive no reward points. Resolve eligibility from participation in that match; joining after completion does not create eligibility.
- Draws, abandoned games, unfinished matches, and noncompetitive activities produce no win reward. Define tied winning scores explicitly per game rather than inferring winners from a generic maximum score.
- Display the reward in the existing result experience: “You won! +25 reward points.” Show the current balance in the player's profile and provide a small reward history.
- Keep match scores, XP, reward points, wallet coins, and committed table chips clearly labeled. Never infer a coin balance from an XP value or a displayed game score.
- No retroactive awards for previously completed games. New rewards require a match started after the feature becomes active.

## Integration findings

The current `PlayerManager` saves the profile and XP on the client. Existing victory overlays observe rendered results and use browser-session deduplication. Neither is an authoritative source for a spendable coin wallet.

Poker/Blackjack currently use shared session play chips with free starting balances and host/player top-ups. Proposed policy: coin-funded tables use wallet-backed buy-ins and disable free starting chips, host top-ups, and stack resets. Preserve unlimited free-chip practice as a clearly separate mode whose chips cannot be redeemed. The user has confirmed coin-funded play; this practice-mode policy remains a design proposal.

Several games publish shared room state from clients. Review each game's completion validation before enabling rewards. Reuse server-verified outcomes where available and add validation for other games; a client-supplied winner, reward amount, or completion flag alone must not credit coins.

## Server design

1. Create server-owned reward-point and coin balances with a durable player identity and authenticated ownership. Current browser profile IDs alone are insufficient for a recoverable cross-session wallet. Define recovery and cross-device behavior before promising persistence beyond the current profile/device.
2. Store an append-only reward ledger keyed by activity instance/match ID and player ID. A unique award key prevents repeat rewards across clients, sessions, and server restarts.
3. Validate the final result, determine eligible winners, look up the fixed 1–99-point award frozen for that game/match, and atomically commit the reward entry and balance update. Persist the amount once; retries must return the same award even if the reward schedule subsequently changes.
4. Read reward receipts and balances from the server. Refreshing the page or reopening a celebration only displays a previous receipt.
5. Use each game's actual match boundary. For Spades, reward the winning partnership once when the match ends; do not award reward points for tricks or individual hands. Proposed first release: poker/Blackjack settle coin-funded chip winnings without also generating win-reward points.
6. Implement reward-point exchange, table buy-in, and table exit as atomic ledger transfers with retry protection. Debit points when crediting coins; debit coins when crediting chips; debit table chips when returning coins. Prevent concurrent spending across tabs, rooms, or tables. Proposed first release: no coins-to-points reverse conversion; table returns stay within the app with no real-money redemption. Free practice chips never enter these transfers. Define house funding and unfinished-hand recovery explicitly so the same chips cannot exist both at the table and in a wallet.

## Delivery order

1. Finalize proposed reward amounts, exchange rate, free-practice separation, house funding, and first eligible games. Fixed game rewards and exchange into playable currency are confirmed.
2. Add authenticated wallet storage, atomic reward/exchange/transfer records, and verified result adapters.
3. Enable awards for games with validated match completion; expand other games after their outcome checks are ready.
4. Add profile balances, result receipts, and reward history.
5. Integrate Spades match wins when Spades ships. Ship coin-funded card tables after transfers, house settlement, and free-practice separation are validated.

## Acceptance checks

- Every award is a fixed integer from 1 through 99 reward points; balances can exceed 99. The same configured game/preset earns the same reward.
- Winning humans receive the correct award exactly once, including team wins and agreed tie cases.
- Losses, draws, spectators, bots, abandoned games, and fabricated results receive no award.
- Refresh, multiple tabs, duplicate requests, reconnect, concurrent wins, and server restarts cannot duplicate or lose credits.
- Wallet ownership and balances cannot be changed through browser profile edits or shared-room state.
- Exchange deducts the exact points it converts; buy-ins and returns transfer value once. Concurrent requests cannot overspend, produce negative balances, or duplicate a refund.
- XP and match scoring continue independently. Free practice chips and host resets cannot credit spendable coins. Wallet-backed table outcomes, house payouts, activity exit, and interrupted hands reconcile without duplicate value.
