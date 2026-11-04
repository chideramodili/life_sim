// Adulthood: keeps a safe copy of the game database in MongoDB Atlas (free tier), because free hosts such as Render wipe the disk
// whenever the server restarts. The game still runs on its fast local SQLite file; this only copies it away and brings it back.
//   - On start: if there is no local database file, download the newest copy (if one exists).
//   - Every BACKUP_EVERY_MS (default 2 minutes), if anything changed: upload a compressed copy. The last 3 copies are kept.
//   - On shutdown: one last upload.
// Switched on by setting MONGODB_URI. Without it, nothing here does anything (so local testing is unchanged).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const URI = process.env.MONGODB_URI || '';
const EVERY = Number(process.env.BACKUP_EVERY_MS) || 120000;
const KEEP = 3, NAME = 'game.db.gz';
let client = null, bucket = null, uploadsOk = true, lastChanges = -1, busy = false;

async function connect() {
  if (bucket) return bucket;
  const { MongoClient, GridFSBucket } = await import('mongodb');
  client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  await client.connect();
  bucket = new GridFSBucket(client.db(process.env.MONGODB_DB || 'adulthood'), { bucketName: 'backups' });
  return bucket;
}

// Only for tests: use a fake bucket instead of a real MongoDB.
export const _setBucketForTest = (b) => { bucket = b; };
export const backupEnabled = () => Boolean(URI);

// Call before opening the database.
export async function restoreBackup(dbFile) {
  if (!URI) { console.log('[backup] off (no MONGODB_URI): the database lives only on this disk'); return; }
  try {
    if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) { console.log('[backup] local database found, not restoring'); return; }
    const b = await connect();
    const files = await b.find({ filename: NAME }).sort({ uploadDate: -1 }).limit(1).toArray();
    if (!files.length) { console.log('[backup] no backup yet: starting a new database'); return; }
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    for (const ext of ['-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
    await pipeline(b.openDownloadStream(files[0]._id), zlib.createGunzip(), fs.createWriteStream(dbFile));
    console.log(`[backup] restored the database from ${files[0].uploadDate.toISOString()} (${fs.statSync(dbFile).size} bytes)`);
  } catch (err) {
    uploadsOk = false;   // never overwrite a good backup with a fresh empty database after a failed restore
    console.error('[backup] RESTORE FAILED, uploads are switched off for this run:', err && err.message);
  }
}

// One upload. Returns true if a copy was saved.
export async function backupNow(db, dbFile, force = false) {
  if (!URI || !uploadsOk || busy) return false;
  busy = true;
  const tmp = dbFile + '.backup.tmp';
  try {
    const n = db.prepare('SELECT total_changes() AS n').get().n;
    if (!force && n === lastChanges) return false;
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);   // a clean, consistent copy even while the game is running
    const b = await connect();
    await pipeline(fs.createReadStream(tmp), zlib.createGzip(), b.openUploadStream(NAME, { metadata: { at: Date.now() } }));
    lastChanges = n;
    const all = await b.find({ filename: NAME }).sort({ uploadDate: -1 }).toArray();
    for (const f of all.slice(KEEP)) await b.delete(f._id);
    return true;
  } catch (err) {
    console.error('[backup] upload failed:', err && err.message);
    return false;
  } finally {
    fs.rmSync(tmp, { force: true });
    busy = false;
  }
}

export function startBackups(db, dbFile) {
  if (!URI) return;
  const t = setInterval(() => { backupNow(db, dbFile).then((ok) => ok && console.log('[backup] saved a copy')); }, EVERY);
  t.unref();
}

// For the shutdown handler: one last copy, but never wait longer than 8 seconds.
export async function finalBackup(db, dbFile) {
  if (!URI) return;
  const waitBusy = async () => { for (let i = 0; i < 40 && busy; i++) await new Promise((r) => setTimeout(r, 200)); };
  await Promise.race([(async () => { await waitBusy(); await backupNow(db, dbFile); })(), new Promise((r) => setTimeout(r, 8000))]);
}
