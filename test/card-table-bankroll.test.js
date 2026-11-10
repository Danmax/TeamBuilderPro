const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Cards = require('../lib/card-games');

function browser(initial, playerId='a') {
  let game=initial;
  const actions={},activities={},calls=[],victories=[];
  const fields={cardAddChipsAmount:{value:'500'},cardAddChipsPlayer:{value:'b'}};
  const room=()=>({code:'CHIPS1',revision:game.version,host:'A',participants:game.players.map(p=>({id:p.id,name:p.name})),currentActivity:game.type,activityState:Cards.publicView(game)});
  const context={APP:{roomCode:'CHIPS1',player:{id:playerId,name:playerId.toUpperCase()},room:room()},
    document:{addEventListener(){},querySelector(){},getElementById:id=>fields[id]},render(){},setInterval(){},
    escapeHtml:value=>String(value??'').replaceAll('<','&lt;'),normalizeRoom:value=>value,
    getSharedActorPayload:()=>({}),createRoomActorToken:()=> 'chip-action-1234567890',showError:message=>{throw Error(message);},
    TeamBuilderGameVictory:{observe:result=>victories.push(result)},
    TEAM_BUILDER_ACTIVITY_REGISTRY:{registerAction:(key,value)=>{actions[key]=value;},registerActivity:(key,value)=>{activities[key]=value;}},
    socketEmitAck:async(event,payload)=>{
      calls.push({event,...payload});
      if(event==='cards:action') game=Cards.apply(game,{id:playerId,name:playerId.toUpperCase(),isHost:playerId==='a'},payload.action,payload);
      return {value:JSON.stringify(room()),private:Cards.privateView(game,playerId)};
    }
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/activities/card-tables'),'utf8'),context);
  return {actions,calls,victories,render:()=>activities[game.type].render(),game:()=>game};
}
function table(type) {
  let g=Cards.create(type);
  for(const id of ['a','b','c']) g=Cards.apply(g,{id,name:id.toUpperCase()},'join');
  return g;
}

test('completed Hold’em shows losing and folded opponents above collapsed details', async()=>{
  let game=Cards.apply(table('texas-holdem'),{id:'a',isHost:true},'deal');
  while(Cards.active(game)) game=Cards.apply(game,{id:game.turnId},'fold');
  const f=browser(game);f.render();await new Promise(resolve=>setImmediate(resolve));
  const markup=f.render(), completed=markup.slice(markup.indexOf('class="ct-showdown"'),markup.indexOf('class="ct-private"'));
  assert.match(completed,/Completed hands/); assert.match(completed,/<strong>B<\/strong>/); assert.match(completed,/<strong>C<\/strong>/);
  for(const p of game.players.filter(p=>p.id!=='a')) assert.ok(p.hand.every(card=>completed.includes(`aria-label="${({11:'J',12:'Q',13:'K',14:'A'})[card.rank]||card.rank} ${{S:'♠',H:'♥',D:'♦',C:'♣'}[card.suit]}"`)));
});

for(const type of Object.keys(Cards.TYPES)) test(`${type} displays a live bankroll and submits host top-ups for the selected player`, async()=>{
  const f=browser(table(type));f.render();await new Promise(resolve=>setImmediate(resolve));
  let markup=f.render();
  assert.match(markup,/Session chips/);assert.match(markup,/Shared across 21, Draw & Hold’em/);assert.match(markup,/data-action="cards-add-chips"/);
  assert.ok(markup.indexOf('Session chips')<markup.indexOf('<details'));
  await f.actions['cards-add-chips']();
  const payload=f.calls.find(c=>c.action==='add-chips');assert.equal(payload.playerId,'b');assert.equal(payload.amount,500);
  assert.equal(Cards.seat(f.game(),'b').stack,1500);
  markup=f.render();assert.match(markup,/1,500 chips/);assert.match(markup,/0 from play · 1,500 added/);
});

for(const type of Object.keys(Cards.TYPES)) test(`${type} uses the viewer’s result instead of the table’s biggest winner`,async()=>{
  for(const [payout,bet,outcome] of [[0,20,'loss'],[40,20,'win'],[40,40,'push']]) {
    const game=table(type);
    Object.assign(game,{phase:'settled',handId:'outcome',handPlayers:['a','b','c'],settledAt:Date.now(),results:[{playerId:'b',name:'B',amount:80,net:60,label:'Win'},...(payout?[{playerId:'a',name:'A',amount:payout,net:payout-bet,label:'Win'}]:[])]});
    Cards.seat(game,'a').total=bet;
    const f=browser(game);f.render();await new Promise(resolve=>setImmediate(resolve));f.render();
    const observed=f.victories.at(-1);
    assert.equal(observed.finished,true);assert.equal(observed.outcome,outcome);assert.equal(observed.net,payout-bet);
    assert.equal(observed.winnerId,outcome==='win'?'a':undefined);
  }
});

for(const type of Object.keys(Cards.TYPES)) test(`${type} shows chip piles matching the live pot and labels completed pots`, async()=>{
  for(const amount of [0,1431,1000000000]) {
    const game=table(type);Object.assign(game,{phase:'playing',pot:amount});
    const f=browser(game);f.render();await new Promise(resolve=>setImmediate(resolve));
    const markup=f.render(), felt=markup.slice(markup.indexOf('class="ct-felt"'),markup.indexOf('class="ct-board"'));
    const represented=[...felt.matchAll(/data-denomination="(\d+)" data-count="(\d+)"/g)].reduce((sum,[,value,count])=>sum+Number(value)*Number(count),0);
    assert.equal(represented,amount);
    assert.ok((felt.match(/class="ct-chip"/g)||[]).length<=40,'large pots keep a bounded number of decorative chips');
    if(!amount) assert.match(felt,/No chips in play/);
    else assert.match(felt,/<strong>[\d,]+<\/strong><span>play chips<\/span>/);
  }
  const completed=table(type);Object.assign(completed,{phase:'settled',pot:0,lastPot:80});
  const f=browser(completed);f.render();await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.render(),type==='blackjack'?/Last table bets/:/Last pot/);
  assert.match(f.render(),/data-denomination="25" data-count="3"/);assert.match(f.render(),/data-denomination="5" data-count="1"/);
});
