const fs = require('node:fs');
const path = require('node:path');
function createCardTableStore({ database, databaseRequired, dataDir }) {
  function file(key) {
    if (!/^room:[A-Z0-9]{6}$/.test(key)) throw new Error('Invalid table room.');
    return path.join(dataDir, 'private-card-tables', `${key.slice(5)}.json`);
  }
  return {
    async load(key) {
      const fileName = file(key), db = database();
      if (databaseRequired && !db) throw new Error('Card table database is unavailable.');
      if (db) { const value = await db.load(`private_cards:${key.slice(5)}`); if (value) return value; }
      try { return JSON.parse(fs.readFileSync(fileName, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async save(key, value) {
      const fileName = file(key), db = database();
      if (databaseRequired && !db) throw new Error('Card table database is unavailable.');
      if (db) { await db.save(`private_cards:${key.slice(5)}`, value); return; }
      fs.mkdirSync(path.dirname(fileName), { recursive: true, mode: 0o700 });
      fs.writeFileSync(`${fileName}.tmp`, JSON.stringify(value), { mode: 0o600 });
      fs.renameSync(`${fileName}.tmp`, fileName);
    },
    async remove(key) {
      const fileName = file(key), db = database();
      if (databaseRequired && !db) throw new Error('Card table database is unavailable.');
      if (db) await db.save(`private_cards:${key.slice(5)}`, null);
      try { fs.unlinkSync(fileName); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  };
}
module.exports = { createCardTableStore };
