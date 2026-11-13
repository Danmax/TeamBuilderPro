# Game-win reward points and coins

Status: first release implemented November 10, 2026.

## Confirmed behavior

- A completed win earns a fixed reward of 1–99 reward points; balances can exceed 99.
- Reward points exchange into playable coins. Coins committed to a card table are called chips; tokens/coins/chips are not three independently traded currencies.
- The initial rate is **1 reward point = 1 coin = 1 chip**, with an explicit Exchange action. Reward points remain distinct from XP and a game's match score.

## Enabled fixed rewards

| Verified win | Reward points |
| --- | ---: |
| Connect 4 | 20 |
| Family Face-Off, winning team | 30 per winning human |
| Checkers | 30 |
| Chinese Checkers | 30 |
| Multiplayer Memory, single winner | 20 |
| Spades, 250-point match | 50 per winning human |
| Spades, 500-point match | 75 per winning human |

Other games retain their existing XP. Their coin rewards await server-authoritative result validation; client-reported winners and scores do not credit wallets. Planned examples for later adapters include Chess, UNO, Trivia, and Tic-Tac-Toe Blitz. Poker/Blackjack settle chip winnings without also creating reward points.

Computers, spectators, draws, ties, solo Memory, abandoned games, individual Spades tricks/hands, and games predating this feature produce no win rewards. Players link their wallet while in the session before the game finishes. Spades rewards each eligible winning human once per match.

## Player flow

1. Win an enabled game and see a reward notice.
2. Open Wallet from the lobby, profile, or card-table header.
3. Choose a whole number of points to exchange; review the rate and resulting balances.
4. At an empty Blackjack/poker table, the host can select coin-funded mode.
5. Open Wallet to buy in or add chips between hands. Return the entire remaining stack to coins when leaving the seat between hands.

Free practice remains available with its existing starting chips and top-ups. Practice chips never convert to wallet coins. Coin-funded tables disable free starting stacks, free top-ups, host stack resets, and house poker. Coin-funded poker needs two human players; Blackjack retains the virtual automated dealer, whose payouts come from the app's virtual house rather than another player's wallet.

Closing a table returns remaining player stacks. Closing during a hand voids that hand and returns committed chips as well. A player explicitly leaving a session between hands receives their chips; disconnected coin seats are reserved for 60 seconds and then refunded once between hands. Spades seats remain reserved for its full match and are independent of coin escrow.

## Implementation

- `lib/coin-wallet.js`: authenticated wallet storage, fixed reward adapters, durable award receipts, exchange/buy-in/return ledger, replay checks, and coin-table escrow.
- `lib/table-games.js`: dispatches the existing private-card transport to poker/Blackjack or Spades.
- `server.js`: authenticates wallet ownership and room actors, records server-verified winners, handles wallet actions, publishes updated table state, and recovers/refunds escrow on restart.
- `assets/js/coin-wallet.js`: balance controls, exchange preview, table transfers, reward notices, and recent activity.

The wallet stores accounts, deduplicated awards/action IDs, and authoritative coin-table state in one serialized atomic record. Buy-ins and refunds therefore cannot leave coins in both the wallet and table. Failed persistence does not publish an in-memory credit. A durable owner-only reward outbox records verified awards before publishing the final result; wallet refresh and startup retry them even after the original activity closes. Unique match/player award keys prevent repeated rewards; unique action IDs prevent repeated exchange or transfer. Balances and rewards never come from client XP/profile values.

The backend uses `private_coin_wallets` in the configured database or owner-only `DATA_DIR/coin-wallets.json`. Coin-funded hands restore from that record; free practice and Spades retain private-table storage. Startup refunds orphaned coin tables. Wallet secrets stay in browser-local storage and only their hashes are stored on the server. The public room state contains no wallet credentials or opponents' private cards.

## Validation and limits

Unit coverage exercises award bounds, exact Spades/team rewards, duplicate claims, concurrent spending, ownership, persistence errors, exchange, buy-ins, zero-stack exits, and interrupted-table refunds. Socket integration covers a real Memory win through a Blackjack buy-in and refund, blocked free top-ups, retries, forged wallet secrets, and paused Spades recovery. Browser checks exercise Spades bidding, legal-card confirmation, wallet access, and phone/desktop layouts.

The current backend is single-process. Multiple workers need shared room coordination and database locking rather than independent in-memory transaction queues. Wallet access is tied to this browser profile, with no cross-device login/recovery yet. Deleting browser credentials loses access; balances are not copied from browser profile exports. Coins stay inside the app and have no real-money redemption.
