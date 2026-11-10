const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardTableStore } = require('../lib/card-table-store');

test('private table files are owner-only, round-trip across stores and reject invalid room keys', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'private-card-store-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const options={database:()=>null,databaseRequired:false,dataDir:dir},game={id:'private-table',deck:[{rank:14,suit:'S'}],version:3};
  await createCardTableStore(options).save('room:CAR123',game);
  assert.deepEqual(await createCardTableStore(options).load('room:CAR123'),game);
  assert.equal(fs.statSync(path.join(dir,'private-card-tables','CAR123.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(dir,'private-card-tables')).mode&0o777,0o700);
  await assert.rejects(createCardTableStore(options).save('room:../../secret',game),/Invalid/);
  await createCardTableStore(options).remove('room:CAR123');assert.equal(await createCardTableStore(options).load('room:CAR123'),null);
});

test('database table writes use a private namespace and fail closed without a configured database', async () => {
  const records=new Map(),db={load:async key=>records.get(key)||null,save:async(key,value)=>records.set(key,value)};
  const store=createCardTableStore({database:()=>db,databaseRequired:true,dataDir:'/unused'});
  const game={id:'private',hands:{owner:['AS','KH']}};await store.save('room:CAR123',game);
  assert.equal(records.has('private_cards:CAR123'),true);assert.deepEqual(await store.load('room:CAR123'),game);
  await store.remove('room:CAR123');assert.equal(records.get('private_cards:CAR123'),null);
  const offline=createCardTableStore({database:()=>null,databaseRequired:true,dataDir:'/unused'});
  await assert.rejects(offline.load('room:CAR123'),/unavailable/);await assert.rejects(offline.save('room:CAR123',game),/unavailable/);
});
