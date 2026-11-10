const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/card-games');
const player = (id, host = false) => ({ id, name: id.toUpperCase(), isHost: host });
const host = player('a', true), card = (rank, suit = 'S') => ({ rank, suit });
function table(type = 'texas-holdem', count = 3) {
  let game = C.create(type);
  for (let i = 0; i < count; i++) game = C.apply(game, player(String.fromCharCode(97 + i)), 'join', {}, 1000);
  return game;
}
function dealt(type, count = 3) { return C.apply(table(type, count), host, 'deal', {}, 1000); }
const total = g => g.players.reduce((sum, p) => sum + p.stack, 0) + g.pot;
function move(g, action, data = {}) { return C.apply(g, player(g.turnId), action, data, 2000); }
function finish(g, draw = []) {
  for (let i = 0; i < 100 && C.active(g); i++) { const l = C.privateView(g, g.turnId).legal; g = move(g, l.draw ? 'draw' : l.check ? 'check' : 'call', { indices: draw }); }
  assert.equal(g.phase, 'settled'); return g;
}
function blackjackPosition(hand, dealer, next = []) {
  const g = table('blackjack', 1), p = C.seat(g, 'a');
  g.phase = 'playing'; g.handId = 'fixture'; g.handPlayers = ['a']; g.pending = ['a']; g.turnId = 'a'; g.deadline = 31000;
  p.hand = hand; p.stack = 980; p.bet = p.total = 20; g.pot = 20; g.dealer = dealer; g.deck = [...next].reverse(); return g;
}

test('secure decks contain all 52 unique cards and drawing preserves card conservation', () => {
  const deck = C.deck(); assert.equal(deck.length, 52); assert.equal(new Set(deck.map(c => `${c.rank}${c.suit}`)).size, 52);
  for (const type of ['five-card-draw', 'texas-holdem']) {
    const before = dealt(type, type === 'five-card-draw' ? 5 : 8), after = finish(before, [0, 1, 2, 3, 4]);
    const cards = [...after.deck, ...after.discards, ...after.board, ...after.players.flatMap(p => p.hand)];
    assert.equal(cards.length, 52); assert.equal(new Set(cards.map(c => `${c.rank}${c.suit}`)).size, 52);
    assert.equal(total(after), before.players.length * 1000);
  }
});

test('poker evaluates every hand category, wheel straights, kickers and seven-card board-only ties', () => {
  const cases = [
    [[14, 11, 9, 6, 3], ['S','H','D','C','S'], 0], [[14,14,9,6,3], ['S','H','D','C','S'], 1],
    [[14,14,9,9,3], ['S','H','D','C','S'], 2], [[9,9,9,6,3], ['S','H','D','C','S'], 3],
    [[14,5,4,3,2], ['S','H','D','C','S'], 4], [[14,11,9,6,3], ['S','S','S','S','S'], 5],
    [[9,9,9,3,3], ['S','H','D','C','S'], 6], [[9,9,9,9,3], ['S','H','D','C','S'], 7],
    [[14,13,12,11,10], ['H','H','H','H','H'], 8]
  ];
  cases.forEach(([ranks, suits, category]) => assert.equal(C.rankFive(ranks.map((r,i) => card(r, suits[i])))[0], category));
  assert.deepEqual(C.rankFive([14,5,4,3,2].map((r,i) => card(r,['S','H','D','C','S'][i]))), [4,5]);
  assert.ok(C.compare([1,14,13,12,10],[1,14,13,12,9]) > 0);
  const board = [14,13,12,11,10].map(r => card(r,'H'));
  assert.deepEqual(C.bestHand([...board,card(2),card(3,'D')]), C.bestHand([...board,card(7),card(8,'D')]));
});

test('Blackjack aces, naturals, dealer 17, doubles, busts and pushes pay exact amounts', () => {
  assert.equal(C.blackjackValue([card(14),card(14,'H'),card(9)]),21);
  let g = blackjackPosition([card(14),card(10)], [card(10,'H'),card(7)]);
  g = move(g,'stand'); assert.equal(g.players[0].stack,1030); assert.equal(g.results[0].label,'Blackjack');
  g = move(blackjackPosition([card(14),card(10)], [card(14,'D'),card(13)]),'stand'); assert.equal(g.players[0].stack,1000);
  g = move(blackjackPosition([card(10),card(7)], [card(14,'H'),card(6)]),'stand'); assert.equal(g.dealer.length,2); assert.equal(g.players[0].stack,1000);
  g = move(blackjackPosition([card(5),card(6)], [card(10),card(7,'H')], [card(10,'C')]),'double'); assert.equal(g.players[0].stack,1040); assert.equal(g.players[0].hand.length,3);
  g = move(blackjackPosition([card(10),card(9)], [card(10,'H'),card(7)], [card(5)]),'hit'); assert.equal(g.players[0].stack,980); assert.equal(g.results[0].label,'Bust');
  g = move(blackjackPosition([card(10),card(8)], [card(9),card(7)], [card(10,'C')]),'stand'); assert.equal(g.players[0].stack,1020); assert.equal(C.blackjackValue(g.dealer),26);
});

test('completed Hold’em hands reveal folded cards, unmatched raises return and chips are conserved', () => {
  let g = dealt('texas-holdem',3); const initial=total(g);
  g = move(g,'raise',{amount:200});
  while(C.active(g)) g=move(g,'fold');
  assert.equal(total(g),initial); assert.equal(Object.keys(g.shown).length,3); assert.deepEqual(g.shown[g.results[0].playerId],C.seat(g,g.results[0].playerId).hand); assert.equal(g.results.length,1);
  assert.ok(g.results[0].amount < 200, 'uncalled excess is refunded before awarding pot');
});

test('heads-up dealer posts small blind and acts first preflop, last after the flop', () => {
  let g=dealt('texas-holdem',2);
  assert.equal(g.dealerId,'a'); assert.equal(g.turnId,'a'); assert.equal(C.seat(g,'a').bet,10); assert.equal(C.seat(g,'b').bet,20);
  g=move(g,'call'); g=move(g,'check'); assert.equal(g.street,'flop'); assert.equal(g.turnId,'b');
  g=finish(g); g=C.apply(g,host,'deal',{},3000); assert.equal(g.dealerId,'b'); assert.equal(g.turnId,'b');
});

test('short all-in raises do not reopen betting, and cumulative full raises do', () => {
  let g=dealt('texas-holdem',4);
  assert.equal(g.turnId,'d');
  g=move(g,'call'); // D has acted facing 20; reopening threshold is 40.
  C.seat(g,'a').stack=30; // A is all-in raising to 30.
  g=move(g,'raise',{amount:30});
  g=move(g,'call'); g=move(g,'call');
  assert.equal(g.turnId,'d'); assert.equal(C.privateView(g,'d').legal.raise,false);
  assert.throws(()=>move(g,'raise',{amount:60}),/did not reopen/);
  assert.throws(()=>move(g,'raise',{amount:31}),/did not reopen/);
  g=move(g,'call'); g=finish(g); assert.equal(g.phase,'settled');
  let h=dealt('texas-holdem',4); h=move(h,'call'); C.seat(h,'a').stack=30; h=move(h,'raise',{amount:30});
  C.seat(h,'b').stack=30; h=move(h,'raise',{amount:40}); h=move(h,'call');
  assert.equal(h.turnId,'d'); assert.equal(C.privateView(h,'d').legal.raise,true);
});

test('side pots, split pots, folded contributions and odd chips pay eligible winners exactly', () => {
  let g=dealt('texas-holdem',3);
  // A has 100 committed, B and C have 200; strongest A wins only the main pot.
  const ranks={a:[14,14],b:[13,13],c:[12,12]};
  g.board=[card(2,'S'),card(3,'D'),card(7,'H'),card(9,'C'),card(11,'S')]; g.street='river'; g.currentBet=0;
  for(const p of g.players){p.total=p.id==='a'?100:200;p.bet=0;p.stack=1000-p.total;p.hand=ranks[p.id].map((r,i)=>card(r,i?'H':'D'));}
  g.pot=500; g.pending=['a','b','c'];g.turnId='a';
  g=finish(g);assert.equal(total(g),3000);assert.equal(g.results.find(r=>r.playerId==='a').amount,300);assert.equal(g.results.find(r=>r.playerId==='b').amount,200);
  let h=dealt('texas-holdem',3);h.board=[14,13,12,11,10].map(r=>card(r,'H'));h.street='river';h.currentBet=0;
  for(const p of h.players){p.total=21;p.bet=0;p.stack=979;p.folded=p.id==='c';}
  h.pot=63;h.pending=['a','b'];h.turnId='a';h=finish(h);
  assert.equal(h.results.find(r=>r.playerId==='b').amount,32);assert.equal(h.results.find(r=>r.playerId==='a').amount,31);assert.deepEqual(h.shown.c,C.seat(h,'c').hand);assert.equal(total(h),3000);
});

test('all-in players get automatic community runouts and can still replace Five-Card Draw cards', () => {
  for(const type of ['texas-holdem','five-card-draw']) {
    let g=table(type,2);g.players.forEach(p=>p.stack=20);g=C.apply(g,host,'deal',{},1000);
    if(C.active(g)&&g.street!=='draw') g=move(g,'call');
    if(type==='five-card-draw') {assert.equal(g.street,'draw');assert.equal(C.privateView(g,g.turnId).legal.draw,true);}
    g=finish(g,[0,1,2,3,4]);assert.equal(total(g),40);assert.equal(g.board.length,type==='texas-holdem'?5:0);
  }
});

test('turns, illegal amounts, private views, waiting seats, pause, expiry and stack resets are guarded', () => {
  let g=dealt('texas-holdem',2);
  assert.throws(()=>C.apply(g,player('b'),'call',{},2000),/not your turn/);
  assert.throws(()=>move(g,'raise',{amount:21}),/Minimum raise/);
  assert.throws(()=>move(g,'raise',{amount:1001}),/valid total/);
  assert.throws(()=>C.apply(g,player('b'),'reset',{},2000),/Only the host/);
  const publicText=JSON.stringify(C.publicView(g)); assert.equal(publicText.includes('"hand":'),false);assert.equal(publicText.includes('"deck"'),false);
  assert.deepEqual(C.privateView(g,'watcher').cards,[]);assert.equal(C.privateView(g,'a').cards.length,2);
  g=C.apply(g,player('c'),'join',{},2000);assert.equal(C.seat(g,'c').hand.length,0);assert.equal(g.handPlayers.includes('c'),false);
  g=C.apply(g,host,'pause',{},6000);assert.equal(g.remainingMs,55000);assert.equal(C.expire(g,500000),g);
  g=C.apply(g,host,'resume',{},100000);assert.equal(g.deadline,155000);
  g=C.expire(g,155000);assert.equal(g.phase,'settled');assert.equal(Object.keys(g.shown).length,2);
  g=C.apply(g,host,'reset',{},126000);assert.equal(g.players.every(p=>p.stack===1000&&p.total===0),true);
  let b=blackjackPosition([card(10),card(8)],[card(10,'H'),card(7)]);b=C.expire(b,31000);assert.equal(b.phase,'settled');assert.equal(b.results[0].label,'Win');
});

test('five-card draw validates unique discards and reveals no folded or replacement cards publicly mid-hand', () => {
  let g=dealt('five-card-draw',5);
  while(g.street!=='draw'){const l=C.privateView(g,g.turnId).legal;g=move(g,l.check?'check':'call');}
  assert.throws(()=>move(g,'draw',{indices:[0,0]}),/different cards/);
  assert.throws(()=>move(g,'draw',{indices:[5]}),/different cards/);
  const old=structuredClone(C.seat(g,g.turnId).hand), id=g.turnId;
  g=move(g,'draw',{indices:[0,4]});assert.notDeepEqual(C.seat(g,id).hand[0],old[0]);assert.deepEqual(C.seat(g,id).hand[1],old[1]);
  assert.equal(C.publicView(g).players.every(p=>!p.shownCards.length),true);
});

test('record-shaped player IDs cannot shadow object properties or expose private cards', () => {
  assert.throws(()=>C.create('constructor'),/Unknown/);
  let g=C.create('texas-holdem');
  for(const id of ['constructor','__proto__'])g=C.apply(g,{id,name:id},'join',{},1000);
  assert.equal(C.publicView(g).players.every(p=>Array.isArray(p.shownCards)&&p.shownCards.length===0),true);
  g=C.apply(g,{id:'constructor',name:'constructor',isHost:true},'deal',{},1000);
  g=finish(g);
  assert.equal(total(g),2000);
  assert.equal(C.publicView(g).players.every(p=>p.shownCards.length===2),true);
});

test('Blackjack splits keep separate bets, turns and results and protect both private hands', () => {
  let g = blackjackPosition([card(8),card(8,'H')], [card(10,'D'),card(7,'C')], [card(10,'C'),card(9,'H'),card(10)]);
  const original = structuredClone(g);
  assert.equal(C.privateView(g,'a').legal.split,true);
  g = move(g,'split');
  assert.deepEqual(original.players[0].hand,[card(8),card(8,'H')], 'actions do not mutate previous state');
  assert.equal(g.pot,40); assert.equal(g.players[0].stack,960); assert.equal(g.players[0].total,40);
  let own = C.privateView(g,'a');
  assert.deepEqual(own.hands.map(h=>h.total),[18,17]); assert.equal(own.activeHand,0); assert.equal(own.legal.handBet,20);
  assert.deepEqual(C.privateView(g,'watcher').cards,[]); assert.equal(C.privateView(g,'watcher').hands,undefined);
  assert.deepEqual(C.publicView(g).players[0].blackjackHands.map(h=>h.cards),[[],[]]);
  assert.equal(C.publicView(g).dealer[1],null);
  g = move(g,'stand'); assert.equal(g.turnId,'a'); assert.equal(C.privateView(g,'a').activeHand,1);
  g = move(g,'hit'); // Second hand busts while the first wins.
  assert.equal(g.phase,'settled'); assert.equal(g.players[0].stack,1000);
  assert.deepEqual(g.results.map(r=>[r.handIndex,r.label,r.net]),[[0,'Win',20],[1,'Bust',-20]]);
  assert.deepEqual(C.publicView(g).players[0].blackjackHands.map(h=>h.cards.length),[2,3]);
  assert.equal(g.shown.a.length,5);
  const reset = C.apply(g,host,'reset',{},3000);
  assert.equal(reset.players[0].blackjackHands,undefined); assert.equal(C.privateView(reset,'a').hands.length,1);
  const next = C.apply(g,host,'deal',{},3000);
  assert.equal(next.players[0].blackjackHands,undefined); assert.equal(next.players[0].hand.length,2);
});

test('Blackjack doubling after splitting charges only the active hand bet', () => {
  let g = blackjackPosition([card(5),card(5,'H')],[card(10),card(7)], [card(6),card(4),card(10)]);
  g=move(g,'split'); assert.equal(C.privateView(g,'a').legal.double,true);
  g=move(g,'double');
  assert.equal(g.players[0].total,60); assert.equal(g.pot,60); assert.equal(g.players[0].stack,940);
  assert.deepEqual(C.privateView(g,'a').hands.map(h=>h.bet),[40,20]);
  assert.equal(C.privateView(g,'a').activeHand,1); assert.equal(C.privateView(g,'a').legal.handBet,20);
  g=move(g,'stand'); assert.equal(g.players[0].stack,1020);
  assert.deepEqual(g.results.map(r=>r.net),[40,-20]);
});

test('Blackjack split aces get one card and split 21 pays even money', () => {
  let g=blackjackPosition([card(14),card(14,'H')],[card(10),card(7)], [card(13),card(10,'H')]);
  g=move(g,'split'); assert.equal(g.phase,'settled'); assert.equal(g.players[0].stack,1040);
  assert.deepEqual(g.results.map(r=>r.label),['Win','Win']);
  assert.deepEqual(C.privateView(g,'a').hands.map(h=>h.cards.length),[2,2]);
  g=move(blackjackPosition([card(10),card(13,'H')],[card(10),card(7)], [card(14),card(14,'H')]),'split');
  assert.equal(g.phase,'settled'); assert.equal(g.players[0].stack,1040);
});

test('Blackjack resplits stop at four hands and reject mismatches, hits, insufficient chips and wrong turns', () => {
  let g=blackjackPosition([card(8),card(8,'H')],[card(10),card(7)], [card(8,'D'),card(8,'C'),card(8),card(8),card(8),card(8)]);
  for(let i=0;i<3;i++) { assert.equal(C.privateView(g,'a').legal.split,true); g=move(g,'split'); }
  assert.equal(C.privateView(g,'a').hands.length,4); assert.equal(C.privateView(g,'a').legal.split,false);
  const snapshot=structuredClone(g); assert.throws(()=>move(g,'split'),/Split needs/); assert.deepEqual(g,snapshot);
  assert.equal(g.pot,80); assert.equal(g.players[0].stack,920);
  while(C.active(g)) g=move(g,'stand'); assert.equal(g.results.length,4); assert.equal(g.players[0].stack,920);
  for(const ranks of [[8,9],[14,10],[14,13]]) {
    const h=blackjackPosition(ranks.map(r=>card(r)),[card(10),card(7)]);
    assert.equal(C.privateView(h,'a').legal.split,false); assert.throws(()=>move(h,'split'),/Split needs/);
  }
  let h=blackjackPosition([card(8),card(8,'H')],[card(10),card(7)], [card(2)]);
  h.players[0].stack=19; assert.equal(C.privateView(h,'a').legal.split,false); assert.throws(()=>move(h,'split'),/Split needs/);
  h.players[0].stack=20; assert.throws(()=>C.apply(h,player('b'),'split',{},2000),/not your turn/);
  h=move(h,'hit'); assert.equal(C.privateView(h,'a').legal.split,false); assert.throws(()=>move(h,'split'),/Split needs/);
});

test('Blackjack timeouts finish each split hand before moving to the next player', () => {
  let g=blackjackPosition([card(8),card(8,'H')],[card(10),card(7)], [card(10),card(9)]);
  const second=structuredClone(g.players[0]); second.id='b'; second.name='B'; second.hand=[card(10),card(8)];
  g.players.push(second); g.handPlayers.push('b'); g.pending.push('b'); g.pot+=20;
  g=move(g,'split');
  g=C.expire(g,g.deadline); assert.equal(g.turnId,'a'); assert.equal(C.privateView(g,'a').activeHand,1);
  g=C.expire(g,g.deadline); assert.equal(g.turnId,'b'); assert.equal(g.phase,'playing'); assert.equal(C.publicView(g).dealer[1],null);
  g=C.expire(g,g.deadline); assert.equal(g.phase,'settled'); assert.equal(g.results.length,3);
});

test('Hold’em reveals every dealt hand at completion, keeps active cards private and clears reveals next deal', () => {
  let g=dealt('texas-holdem',3);
  assert.ok(C.publicView(g).players.every(p=>p.shownCards.length===0));
  g=move(g,'fold'); assert.ok(C.publicView(g).players.every(p=>p.shownCards.length===0));
  g=move(g,'fold');
  for(const p of C.publicView(g).players) assert.deepEqual(p.shownCards,C.seat(g,p.id).hand);
  g=C.apply(g,host,'deal',{},3000); assert.ok(C.publicView(g).players.every(p=>p.shownCards.length===0));
  let draw=dealt('five-card-draw',3); draw=move(draw,'fold'); draw=move(draw,'fold');
  assert.ok(C.publicView(draw).players.filter(p=>p.folded).every(p=>p.shownCards.length===0));
});

test('all card games top up between hands, track buy-ins separately and restore the shared bankroll on rejoining', () => {
  let balances={};
  for(const type of Object.keys(C.TYPES)) {
    let g=C.create(type,{chipBalances:balances}); g=C.apply(g,host,'join',{},1000);
    const before=balances.a?.stack??1000;
    assert.equal(C.seat(g,'a').stack,before);
    g=C.apply(g,host,'add-chips',{amount:500},1000);
    assert.equal(C.seat(g,'a').stack,before+500);
    assert.equal(C.seat(g,'a').buyIn,(balances.a?.buyIn??1000)+500);
    const row=C.publicView(g).chipBalances[0]; assert.equal(row.stack-row.buyIn,0);
    g=C.apply(g,host,'leave',{},1000);
    g=C.apply(g,host,'join',{},1000); assert.equal(C.seat(g,'a').stack,before+500);
    balances=JSON.parse(JSON.stringify(g.chipBalances));
  }
  assert.equal(balances.a.stack,2500);
});

test('top-ups enforce ownership, amounts and active-hand restrictions without changing pots or winnings', () => {
  let g=table('texas-holdem',2);
  assert.throws(()=>C.apply(g,player('b'),'add-chips',{playerId:'a',amount:100},1000),/own seat/);
  for(const amount of [0,-10,11,1.5,NaN,Infinity,100010,'100']) assert.throws(()=>C.apply(g,host,'add-chips',{amount},1000),/increments/);
  g=C.apply(g,host,'add-chips',{playerId:'b',amount:200},1000);
  assert.equal(C.seat(g,'b').stack,1200); assert.equal(C.seat(g,'b').buyIn,1200); assert.equal(g.pot,0);
  g=C.apply(g,host,'deal',{},1000);
  assert.throws(()=>C.apply(g,host,'add-chips',{amount:100},2000),/between hands/);
  const inPlay=C.publicView(g).chipBalances.find(row=>row.playerId==='a');
  assert.equal(inPlay.stack+inPlay.committed,inPlay.buyIn);
  while(C.active(g)) g=move(g,'fold');
  const net=C.publicView(g).chipBalances.find(row=>row.playerId==='a');
  const profit=net.stack-net.buyIn;
  g=C.apply(g,host,'add-chips',{amount:500},3000);
  const topped=C.publicView(g).chipBalances.find(row=>row.playerId==='a'); assert.equal(topped.stack-topped.buyIn,profit);
  const next=C.create('blackjack',{chipBalances:C.syncChipBalances(g)});
  const joined=C.apply(next,host,'join',{},3000); assert.equal(C.seat(joined,'a').stack,topped.stack);
});
