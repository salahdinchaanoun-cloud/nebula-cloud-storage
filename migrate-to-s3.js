require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { uploadFile } = require('./s3');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'nebula.sqlite'));
const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));

(async () => {
  const rows = await all('SELECT stored_name, mime_type FROM files');
  for (const r of rows) {
    const key = path.basename(r.stored_name);
    const local = path.join(__dirname, 'storage', key);
    if (!fs.existsSync(local)) { console.warn('missing:', key); continue; }
    await uploadFile(local, key, r.mime_type || 'application/octet-stream');
    console.log('uploaded:', key);
  }
  console.log('done');
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
