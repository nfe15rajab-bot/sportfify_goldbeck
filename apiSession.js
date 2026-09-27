/**
 * apiSession.js — how the web app changes the catalogue: the write key.
 *
 * Reading the catalogue (GET on localhost:5107) is open. Every write (POST, PUT, PATCH, DELETE) needs the header X-Sportify-Key, or the API answers 401 (see the API's
 * ApiSecurity.cs). Two ways to have the key:
 *   the API made it for this run    GET /api/session gives it to a page of the app (the API checks the Origin, which a page cannot forge), so nothing has to be set up
 *   the API was given one           (Api:WriteKey) it is not handed out: the person who runs the API knows it, and is asked for it once per browser tab (kept in sessionStorage)
 *
 *   apiWrite(url, init)   fetch for a write, with the key; a 401 (a new key after the API restarted, or a wrong one typed) asks again once
 *   apiCapabilities()     what the API allows (GET /api/Admin/capabilities): today whether the SQL import exists, so the Catalogue tab does not offer what would be refused
 */

const API_SESSION_URL = "http://localhost:5107/api/session";
const API_CAPABILITIES_URL = "http://localhost:5107/api/Admin/capabilities";
const API_KEY_STORAGE = "sportify-api-write-key";
const apiSession = { key: null, pending: null };

function apiStoredKey() {
  try { return sessionStorage.getItem(API_KEY_STORAGE) || null; } catch (e) { return null; }
}
function apiStoreKey(key) {
  try { if (key) sessionStorage.setItem(API_KEY_STORAGE, key); else sessionStorage.removeItem(API_KEY_STORAGE); } catch (e) { /* private window: asked again next time */ }
}

/** The write key: from the session handshake, else the one typed earlier in this tab, else asked for. null when there is none (the person cancelled). `forget` drops a key that was refused. */
async function apiWriteKey(forget) {
  if (forget) { apiSession.key = null; apiStoreKey(null); }
  if (apiSession.key) return apiSession.key;
  if (apiSession.pending) return apiSession.pending;
  apiSession.pending = (async () => {
    try {
      const res = await fetch(API_SESSION_URL, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        if (body.mode === "handshake" && body.key) { apiSession.key = body.key; return apiSession.key; }
        const stored = apiStoredKey();
        if (stored) { apiSession.key = stored; return stored; }
        const typed = typeof prompt === "function" ? prompt("The Sportify API needs its write key to change the catalogue (Api:WriteKey, set by whoever runs the API):") : null;
        if (typed && typed.trim()) { apiSession.key = typed.trim(); apiStoreKey(apiSession.key); return apiSession.key; }
      }
    } catch (e) { /* the API is not running: the write that follows fails the way it always did */ }
    return null;
  })().finally(() => { apiSession.pending = null; });
  return apiSession.pending;
}

async function apiWrite(url, init) {
  const send = async key => {
    const headers = new Headers((init && init.headers) || {});
    if (key) headers.set("X-Sportify-Key", key);
    return fetch(url, Object.assign({}, init, { headers }));
  };
  let res = await send(await apiWriteKey(false));
  if (res.status === 401) res = await send(await apiWriteKey(true));
  if (res.status === 401) { apiSession.key = null; apiStoreKey(null); }      // refused twice: whatever was typed is wrong, ask again next time
  return res;
}

let apiCapabilitiesCache = null;
async function apiCapabilities() {
  if (apiCapabilitiesCache) return apiCapabilitiesCache;
  try {
    const res = await fetch(API_CAPABILITIES_URL, { cache: "no-store" });
    if (res.ok) apiCapabilitiesCache = await res.json();
  } catch (e) { /* not running */ }
  return apiCapabilitiesCache || { sqlImport: true };      // unknown: leave the button, the API answers plainly
}
