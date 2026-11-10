const Cards = require('./card-games');
const Spades = require('./spades');
module.exports = { ...Cards, TYPES: { ...Cards.TYPES, spades: { label: 'Spades', min: 4, max: 4 } } };
for (const method of ['apply', 'publicView', 'privateView', 'active', 'expire', 'seat']) module.exports[method] = (game, ...args) => (game.type === 'spades' ? Spades : Cards)[method](game, ...args);
module.exports.create = (type, options) => type === 'spades' ? Spades.create(options) : Cards.create(type, options);
module.exports.syncChipBalances = game => game.type === 'spades' ? (game.chipBalances ||= {}) : Cards.syncChipBalances(game);
module.exports.sweep = (game, now) => { if (game.type !== 'spades') Cards.sweep(game, now); };
