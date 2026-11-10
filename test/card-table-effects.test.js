const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../assets/js/card-table-effects');
const card = rank => ({rank,suit:'H'});
test('deal effects stagger new cards, continue through redraws, and do not replay finished cards',()=>{
  const observe=E.createDealTracker();
  assert.deepEqual(observe('hand',[card(2),card(3)],1000),[{kind:'deal',delay:0},{kind:'deal',delay:E.STAGGER_MS}]);
  assert.deepEqual(observe('hand',[card(2),card(3)],1100),[{kind:'deal',delay:-100},{kind:'deal',delay:E.STAGGER_MS-100}]);
  assert.deepEqual(observe('hand',[card(2),card(3)],2000),[null,null]);
  const hit=observe('hand',[card(2),card(3),card(4)],2100);assert.equal(hit[0],null);assert.equal(hit[1],null);assert.equal(hit[2].kind,'deal');
});
test('dealer hole cards flip when revealed, replacements animate individually and a new hand deals again',()=>{
  const observe=E.createDealTracker();observe('dealer',[card(2),null],1000);
  const reveal=observe('dealer',[card(2),card(14)],2000);assert.equal(reveal[0],null);assert.equal(reveal[1].kind,'reveal');
  observe('draw',[card(2),card(3),card(4)],1000);const replaced=observe('draw',[card(2),card(9),card(4)],2000);
  assert.equal(replaced[0],null);assert.equal(replaced[1].kind,'deal');assert.equal(replaced[2],null);
  assert.equal(observe('next-hand',[card(2)],3000)[0].kind,'deal');assert.equal(E.RESULT_DELAY_MS,3000);
});
