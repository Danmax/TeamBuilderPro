const core = require('./chinese-checkers-core');

function distance(a, b) {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
}

// Assign each marble a distinct destination, so crowded goal entrances do not
// make every marble aim for the same hole. Ten marbles need only 1,024 states.
function remainingDistance(game, seat) {
  const marbles = core.HOLES.filter(hole => game.board[hole.id] === seat.camp);
  const goals = core.CAMP_HOLES[seat.goal].map(id => core.BY_ID[id]);
  const costs = new Float64Array(1 << goals.length).fill(Infinity);
  const counts = new Uint8Array(costs.length);
  costs[0] = 0;
  for (let mask = 1; mask < counts.length; mask++) counts[mask] = counts[mask >> 1] + (mask & 1);
  for (let mask = 0; mask < costs.length - 1; mask++) {
    const marble = marbles[counts[mask]];
    if (!marble) continue;
    for (let goal = 0; goal < goals.length; goal++) if (!(mask & (1 << goal))) {
      const next = mask | (1 << goal);
      costs[next] = Math.min(costs[next], costs[mask] + distance(marble, goals[goal]));
    }
  }
  return costs[costs.length - 1];
}

function chooseTurn(game) {
  if (game.phase !== 'playing' || game.paused) return null;
  const seat = game.seats[game.turnIndex];
  let best = null, bestScore = -Infinity;
  const consider = (next, path) => {
    const goalCenter = core.CAMP_HOLES[seat.goal].map(id => core.BY_ID[id]);
    const from = core.BY_ID[path[0]], to = core.BY_ID[path.at(-1)];
    const spread = hole => goalCenter.reduce((sum, goal) => sum + distance(hole, goal) ** 2, 0);
    const score = next.winner === seat.playerId ? 1e9 :
      -remainingDistance(next, seat) * 100 + core.progress(next, seat) * 12 + (spread(from) - spread(to)) / 100;
    if (score > bestScore) { bestScore = score; best = path; }
  };
  const origins = game.jumpPath.length ? [game.jumpPath.at(-1)] : core.HOLES.filter(hole => game.board[hole.id] === seat.camp).map(hole => hole.id);
  for (const origin of origins) {
    const visited = new Set([origin]);
    const queue = [{ game, path: [origin] }];
    for (let index = 0; index < queue.length; index++) {
      const entry = queue[index];
      for (const move of core.legalMoves(entry.game, entry.path.at(-1))) {
        // Steps can reach the same destination as a longer hop; only hops
        // participate in the reachability search.
        if (move.kind === 'hop' && visited.has(move.to)) continue;
        const next = core.move(entry.game, seat.playerId, move.from, move.to);
        const path = [...entry.path, move.to];
        consider(next, path);
        if (move.kind === 'hop') {
          visited.add(move.to);
          if (next.phase === 'playing' && next.turnIndex === game.turnIndex && next.jumpPath.length) queue.push({ game: next, path });
        }
      }
    }
  }
  return best;
}

function playTurn(game) {
  if (game.phase !== 'playing' || game.paused || !game.seats[game.turnIndex]?.isComputer) return game;
  const actor = game.seats[game.turnIndex].playerId;
  const path = chooseTurn(game);
  if (!path) return game.jumpPath.length ? core.endTurn(game, actor) : core.pass(game, actor);
  let next = game;
  for (let index = 1; index < path.length; index++) next = core.move(next, actor, path[index - 1], path[index]);
  if (next.phase === 'playing' && next.turnIndex === game.turnIndex && next.jumpPath.length) next = core.endTurn(next, actor);
  return next;
}

module.exports = { chooseTurn, playTurn };
