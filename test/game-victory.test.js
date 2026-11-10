const assert = require('node:assert/strict');
const test = require('node:test');
const { createWinTracker, banner } = require('../assets/js/game-victory');

test('a new win celebrates once across repeated renders and a rematch can celebrate again', () => {
  const saved = []; const track = createWinTracker(new Set(), keys => saved.push(keys));
  const active = { key: 'room:player:checkers:1', finished: false, winnerId: '' };
  assert.equal(track(active, 1000), false);
  const result = { ...active, finished: true, winnerId: 'player', finishedAt: 2000 };
  assert.equal(track(result, 2000), true); assert.equal(track(result, 2100), false);
  const reloaded = createWinTracker(new Set(saved.at(-1)));
  assert.equal(reloaded(result, 2200), false, 'refreshing does not replay the same celebration');
  assert.equal(track({ ...result, key: 'room:player:checkers:2', finishedAt: 2300 }, 2300), true);
});

test('draws and archived results do not trigger a win animation', () => {
  const track = createWinTracker();
  assert.equal(track({ key: 'draw', finished: true, winnerId: '', finishedAt: 2000 }, 2000), false);
  assert.equal(track({ key: 'archive', finished: true, winnerId: 'other', finishedAt: 1000 }, 30000), false);
  assert.equal(track({ key: 'old-checkers', finished: true, winnerId: 'other' }, 30000), false);
  track({ key: 'legacy-live', finished: false, winnerId: '' }, 30000);
  assert.equal(track({ key: 'legacy-live', finished: true, winnerId: 'player' }, 30010), true, 'a live legacy match still works without a finish timestamp');
});

test('winner banners escape names and reasons and omit non-winning results', () => {
  const output = banner({ kind: 'Chess', winnerId: 'p1', winnerName: '<img src=x onerror=alert(1)>', reason: '<script>oops</script>' });
  assert.equal(output.includes('<img'), false); assert.equal(output.includes('<script>'), false);
  assert.ok(output.includes('&lt;img')); assert.ok(output.includes('wins!'));
  assert.equal(banner({ kind: 'Checkers', winnerName: 'No winner' }), '');
});

function victoryBrowser() {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  let now=1000,next=0;const timers=new Map(),overlays=[];
  const context=vm.createContext({Date:class extends Date{static now(){return now;}},sessionStorage:{getItem:()=>null,setItem(){}},
    setTimeout(fn,delay){const id=++next;timers.set(id,{at:now+delay,fn});return id;},clearTimeout:id=>timers.delete(id),
    document:{addEventListener(){},body:{append:element=>overlays.push(element)},createElement:()=>({removed:false,setAttribute(){},querySelector:()=>({addEventListener(){}}),remove(){this.removed=true;}})}});
  context.window=context;vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/game-victory.js'),'utf8'),context);
  return {api:context.TeamBuilderGameVictory,overlays,advance(ms){const end=now+ms;for(;;){const candidate=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!candidate)break;timers.delete(candidate[0]);now=candidate[1].at;candidate[1].fn();}now=end;}};
}
test('card celebrations leave a full three-second review window and repeated renders do not restart the delay',()=>{
  const b=victoryBrowser(),result={key:'cards:hand1',finished:true,finishedAt:1000,winnerId:'p1',winnerName:'Player',delayMs:3000};
  b.api.beginFrame();b.api.observe(result);b.api.endFrame();assert.equal(b.overlays.length,0);
  b.advance(2000);b.api.beginFrame();b.api.observe(result);b.api.endFrame();assert.equal(b.overlays.length,0);
  b.advance(999);assert.equal(b.overlays.length,0);b.advance(1);assert.equal(b.overlays.length,1);
  b.advance(4500);assert.equal(b.overlays[0].removed,true);
});
test('starting another hand or leaving the game cancels a pending celebration; ordinary board wins stay immediate',()=>{
  const b=victoryBrowser();b.api.beginFrame();b.api.observe({key:'cards:old',finished:true,finishedAt:1000,winnerId:'p1',delayMs:3000});b.api.endFrame();
  b.api.beginFrame();b.api.observe({key:'cards:new',finished:false});b.api.endFrame();b.advance(3000);assert.equal(b.overlays.length,0);
  b.api.beginFrame();b.api.observe({key:'chess:1',finished:true,finishedAt:4000,winnerId:'p1',winnerName:'Player'});b.api.endFrame();assert.equal(b.overlays.length,1);
  b.api.beginFrame();b.api.endFrame();assert.equal(b.overlays[0].removed,true);
});
