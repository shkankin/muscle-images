// js/idb-store.js
// ════════════════════════════════════════════════════════════════════
// IndexedDB-backed key/value store with a synchronous in-memory mirror
// and a transparent localStorage fallback. Adapted from the MOTU app.
//
// WHY: the collection can outgrow localStorage's ~5 MB ceiling, and IDB's
// quota is far larger — but IDB is async and the app is written against a
// synchronous store. So we hydrate the chosen keys into an in-memory Map
// ONCE at boot (a single awaited step); after that, reads are synchronous
// Map lookups and writes mirror to IDB in the background. If IDB is
// unavailable, everything falls back to localStorage with identical
// behavior. Migration deletes the localStorage copy only AFTER a confirmed
// IDB write, so a failed migration never loses data.
// ════════════════════════════════════════════════════════════════════

const DB_NAME = 'muscle-collector';
const STORE = 'kv';
const DB_VERSION = 1;

let _dbPromise = null;
function _openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return _dbPromise;
}
function _idbGet(db, key) {
  return new Promise(resolve => {
    let tx; try { tx = db.transaction(STORE, 'readonly'); } catch { resolve(undefined); return; }
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
function _idbSet(db, key, val) {
  return new Promise(resolve => {
    let tx; try { tx = db.transaction(STORE, 'readwrite'); } catch { resolve(false); return; }
    try { tx.objectStore(STORE).put(val, key); } catch { resolve(false); return; }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

function _lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
function _lsRemove(k) { try { localStorage.removeItem(k); } catch {} }

const _mem = new Map();
let _useIdb = false;
let _hydrated = false;

/**
 * Hydrate the given keys from IndexedDB (migrating any that still live only in
 * localStorage) into the in-memory mirror. Await once, early in boot.
 * Returns true if IndexedDB is the active backend.
 */
export async function hydrate(keys, opts = {}) {
  const migrate = opts.migrate !== false;
  const db = await _openDB();
  _useIdb = !!db;
  for (const key of keys) {
    if (_useIdb) {
      const got = await _idbGet(db, key);
      if (got !== undefined) { _mem.set(key, got); continue; }
      const ls = _lsGet(key);
      if (ls !== null) {
        const wrote = migrate ? await _idbSet(db, key, ls) : false;
        _mem.set(key, ls);
        if (wrote) _lsRemove(key);
        continue;
      }
      _mem.set(key, null);
    } else {
      _mem.set(key, _lsGet(key));
    }
  }
  _hydrated = true;
  return _useIdb;
}

export function bigGet(key) {
  if (_hydrated && _mem.has(key)) return _mem.get(key);
  return _lsGet(key);
}

export function bigSet(key, val) {
  _mem.set(key, val);
  if (_useIdb) {
    _openDB().then(db => db ? _idbSet(db, key, val) : false)
             .then(ok => { if (!ok) _lsSet(key, val); })
             .catch(() => _lsSet(key, val));
  } else {
    _lsSet(key, val);
  }
  return true;
}

// Best-effort flush used on tab-hide. The async IDB write may not commit if
// the page is killed, so callers pair this with a synchronous localStorage
// journal (see data.saveColl) reconciled on next boot.
export function bigFlush(key, val) {
  _mem.set(key, val);
  if (_useIdb) { _openDB().then(db => { if (db) _idbSet(db, key, val); }).catch(() => {}); }
  else { _lsSet(key, val); }
}

export function idbAvailable() { return _useIdb; }
