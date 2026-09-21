/**
 * localSession.js — how the web app talks to the Revit add-in's local server (localhost:5679), and the one place that knows the address.
 *
 * The server does not answer just anybody. It admits only the app's own origins (this page, served by the add-in on localhost:8123 or by the presentation copy on
 * 8124) and, for everything but the handshake, only a request that carries the session token. The token is made when the add-in starts; the app gets it with
 * GET /session, which the add-in gives only to a page of the app (it checks the Origin header, which a page cannot forge), and sends it as X-Sportify-Token.
 * A page from anywhere else in the browser cannot get the token and cannot read the answer of a request it has no token for.
 *
 *   localFetch(path, init)   like fetch, to the add-in, with the token; if the add-in answers 401 (Revit was restarted: a new token) it asks for a new session and tries once more
 *   localUrl(path)           an address with the token in it, for what cannot send a header: a video's src, a download link
 *   localSession.problem     why there is no token, when the add-in is running but refuses this page ("" otherwise): shown where the connection is described
 *
 * Throws like fetch when the add-in is not reachable, so callers keep their existing "not connected" handling.
 */

const SPORTIFY_LOCAL_URL = "http://localhost:5679";
const localSession = { token: null, pending: null, problem: "" };

/** The session token, asked for once and kept; `force` asks again (after a 401). null when the add-in is not running or refuses this page. */
function localSessionToken(force) {
  if (localSession.token && !force) return Promise.resolve(localSession.token);
  if (localSession.pending) return localSession.pending;
  localSession.pending = (async () => {
    try {
      const res = await fetch(SPORTIFY_LOCAL_URL + "/session", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        const changed = !!localSession.token && localSession.token !== body.token;
        localSession.token = body.token || null;
        localSession.problem = "";
        if (changed && typeof workspaceChanged === "function") workspaceChanged();      // links that carry the old token are drawn again
      } else {
        localSession.token = null;
        localSession.problem = res.status === 403
          ? `The Sportify add-in does not accept this page's address (${location.origin}). It serves the app on localhost:8123; to use another address, set SPORTIFY_ALLOWED_ORIGINS for Revit.`
          : `The Sportify add-in refused the session (${res.status}).`;
      }
    } catch (e) {
      localSession.token = null;      // not running: the request that follows fails the way it always did
    } finally {
      localSession.pending = null;
    }
    return localSession.token;
  })();
  return localSession.pending;
}

async function localFetch(path, init) {
  const send = async token => {
    const headers = new Headers((init && init.headers) || {});
    if (token) headers.set("X-Sportify-Token", token);
    return fetch(SPORTIFY_LOCAL_URL + path, Object.assign({}, init, { headers, cache: "no-store" }));
  };
  let res = await send(await localSessionToken(false));
  if (res.status === 401) res = await send(await localSessionToken(true));
  return res;
}

function localUrl(path) {
  const t = localSession.token;
  return SPORTIFY_LOCAL_URL + path + (t ? (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t) : "");
}
