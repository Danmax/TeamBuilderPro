const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/card-games');
const AI = require('../lib/card-games-ai');
const host = { id: 'human', name: 'Player', isHost: true };
function scope(g, id) { const own=C.privateView(g,id),pub=C.publicView(g);return {type:g.type,cards:own.cards,board:pub.board,legal:own.legal,pot:g.pot,stack:C.seat(g,id).stack}; }
for(const type of ['five-card-draw','texas-holdem']) {
  test(`${type}: one player can start a house match with a 60-second deadline`,()=>{
    const waiting=C.create(type);const game=C.apply(waiting,host,'house',{},1000);
    assert.equal(game.players.length,2);assert.equal(game.players.filter(p=>p.isHouse).length,1);assert.equal(game.turnId,host.id);assert.equal(game.deadline,61000);
    assert.equal(C.publicView(game).players.find(p=>p.isHouse).shownCards.length,0);
    assert.throws(()=>C.apply(waiting,{...host,isHost:false},'house'),/Only the host/);
    assert.throws(()=>C.apply(game,host,'house'),/between hands/);
  });
  test(`${type}: house decisions play complete hands without seeing another player's cards`,()=>{
    for(let round=0;round<60;round++){
      let game=C.apply(C.create(type),host,'house',{},1000);
      for(let steps=0;C.active(game)&&steps<200;steps++){
        const actor=C.seat(game,game.turnId),view=scope(game,actor.id);
        const restricted=new Proxy(view,{get(target,key){if(['deck','opponents','hands'].includes(key))throw new Error('House attempted to peek');return target[key];}});
        const decision=actor.isHouse?AI.chooseAction(restricted):{action:view.legal.draw?'draw':view.legal.check?'check':'call',indices:[]};
        game=C.apply(game,{id:actor.id,name:actor.name},decision.action,decision,2000);
        assert.equal(game.players.reduce((s,p)=>s+p.stack,0)+game.pot,2000);
      }
      assert.equal(game.phase,'settled');
    }
  });
  test(`${type}: the house reveals its winning hand when the player folds, while folded cards stay private`,()=>{
    let game=C.apply(C.create(type),host,'house',{},1000);const computer=game.players.find(p=>p.isHouse),hand=structuredClone(computer.hand);
    game=C.apply(game,host,'fold',{},2000);const publicGame=C.publicView(game);
    assert.deepEqual(publicGame.players.find(p=>p.isHouse).shownCards,hand);assert.deepEqual(publicGame.players.find(p=>p.id===host.id).shownCards,[]);
    assert.equal(publicGame.deck,undefined);assert.equal(publicGame.actorHashes,undefined);
    game=C.apply(game,host,'remove',{playerId:computer.id},3000);assert.equal(game.players.length,1);
  });
}
test('Five-Card Draw house retains made hands and replaces only cards outside a pair',()=>{
  const cards=[{rank:14,suit:'S'},{rank:14,suit:'H'},{rank:2,suit:'D'},{rank:7,suit:'C'},{rank:9,suit:'H'}];
  assert.deepEqual(AI.chooseAction({type:'five-card-draw',cards,legal:{draw:true}}),{action:'draw',indices:[2,3,4]});
  assert.deepEqual(AI.chooseAction({type:'five-card-draw',cards:[10,11,12,13,14].map(rank=>({rank,suit:'S'})),legal:{draw:true}}),{action:'draw',indices:[]});
});
test('Blackjack keeps its automated dealer rather than adding a poker house seat',()=>{
  assert.throws(()=>C.apply(C.create('blackjack'),host,'house'),/house poker/);
});
