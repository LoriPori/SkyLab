/* Skylab Â· nowcast.js â€” radar nowcasting engine (RainViewer tiles â†’ dBZ â†’ optical flow â†’ advection)
   No DOM chrome, no Leaflet: the radar tab, the hero box and nowcast-test.html all use this.
   The heavy maths lives in nowcast_worker.js; this file fetches, decodes, caches, samples and paints.

   NC.forecast({lat,lon,grid,z,horizon,verify,wantRaw,onStage}) â†’ Promise<result>
   NC.canvas(result, step)      canvas with the forecast frame (transparent where there is no rain)
   NC.sample(result,lat,lon,step) â†’ mm/h
   NC.rainIn(result,lat,lon)    â†’ {startMin, stopMin, peak, wetNow}
*/
(function (g) {
'use strict';

const DEF_WORKER = 'https://aged-mountain-a883.lourencoalvesfonseca2011.workers.dev';
const RV_JSON = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE = 256, DEF_Z = 7, NF = 6, TTL = 6 * 60e3, MAX_CACHE = 3;

/* Universal Blue â€” RainViewer's colour scheme 2, dBZ 15â€¦65 (index 0 = 15 dBZ).
   Partial-alpha pixels are edge antialiasing, not light rain: they are ignored on purpose. */
const PALETTE = (
 '88ddee 6cd1eb 51c5e8 36bae5 1baee2 00a3e0 009ad5 0091ca 0088bf 007fb4 0077aa 0070a3 00699c 006295 005b8e 005588 005180 004e78 004a70 004768 ' +
 'ffee00 ffe000 ffd200 ffc500 ffb700 ffaa00 ff9f00 ff9500 ff8b00 ff8100 ff4400 f23600 e62800 d91b00 cd0d00 c10000 a80000 8f0000 760000 5d0000 ' +
 'ffaaff ff9fff ff95ff ff8bff ff81ff ff77ff ff6cff ff62ff ff58ff ff4eff ffffff'
).split(' ');

const BY_RGB = new Map(), RGB = new Uint8Array(PALETTE.length * 3);
PALETTE.forEach((h, i) => {
  const n = parseInt(h, 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  BY_RGB.set((r << 16) | (gg << 8) | b, 15 + i);
  RGB[i * 3] = r; RGB[i * 3 + 1] = gg; RGB[i * 3 + 2] = b;
});
const DBZ_MIN = 15, DBZ_MAX = 65;

/* Marshallâ€“Palmer: Z = 200Â·R^1.6, so R = (10^(dBZ/10)/200)^(1/1.6) mm/h */
const mmh = dbz => dbz > 0 ? Math.pow(Math.pow(10, dbz / 10) / 200, 0.625) : 0;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

/* ---------- worker ---------- */
const SELF = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
let WURL = 'js/nowcast_worker.js';
try { if (SELF) WURL = new URL('nowcast_worker.js', SELF).href; } catch (e) {}
const WORKER = (typeof g.ATMO !== 'undefined' && g.ATMO && g.ATMO.base) ? g.ATMO.base.replace('/v1', '') : DEF_WORKER;

let wk = null, seq = 0, pending = new Map(), tries = 0;
function spawn() {
  if (wk) return wk;
  const urls = [WURL, 'js/nowcast_worker.js', 'nowcast_worker.js'].filter((u, i, a) => a.indexOf(u) === i);
  const url = urls[Math.min(tries, urls.length - 1)];
  wk = new Worker(url);
  wk.onmessage = ev => {
    const p = pending.get(ev.data && ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.error) p.rej(new Error(ev.data.error)); else p.res(ev.data);
  };
  wk.onerror = ev => {
    const err = new Error((ev && ev.message) || 'worker failed');
    for (const [, p] of pending) p.rej(err);
    pending.clear();
    try { wk.terminate(); } catch (e) {}
    wk = null;
    if (tries < 2) { tries++; spawn(); }        // the app may be deploying the worker one folder up
  };
  return wk;
}
function call(msg) {
  return new Promise((res, rej) => {
    let w;
    try { w = spawn(); } catch (e) { rej(e); return; }
    const id = ++seq;
    pending.set(id, { res, rej });
    try { w.postMessage(Object.assign({}, msg, { id })); } catch (e) { pending.delete(id); rej(e); return; }
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); rej(new Error('nowcast worker timed out')); }
    }, 90000);
  });
}

/* ---------- tiles â†’ dBZ ---------- */
function tileXY(lat, lon, z) {
  const N = 1 << z, s = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360 * N, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N];
}
function tileLat(y, z) {
  const N = 1 << z;
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI;
}
function tileURL(id, z, x, y) {
  return WORKER + '/rv/' + id + '/256/' + z + '/' + x + '/' + y + '/2/0_0.png';
}

let frameCache = { at: 0, list: null };
async function frameList() {
  if (frameCache.list && Date.now() - frameCache.at < 4 * 60e3) return frameCache.list;
  let j;
  try {
    const r = await fetch(RV_JSON);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    j = await r.json();
  } catch (e) {
    if (frameCache.list) return frameCache.list;               // stale list beats no list
    const err = new Error('RainViewer frame list unavailable');
    err.code = 'frames';
    throw err;
  }
  const past = ((j.radar && j.radar.past) || []).slice(-NF).map(f => ({ id: f.path.split('/').pop(), time: f.time }));
  if (past.length < 3) { const err = new Error('not enough radar frames'); err.code = 'frames'; throw err; }
  frameCache = { at: Date.now(), list: past };
  return past;
}

/* stitch the whole sequence at once: 6 frames Ã— gridÂ² tiles, fetched through a small pool
   (one round-trip instead of six) and drawn into one canvas per frame */
async function loadMosaic(list, cx, cy, grid, z, onTile) {
  const S = grid * TILE, N = 1 << z;
  const frames = list.map(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    return { cv, ctx, ok: 0, fail: 0 };
  });
  const jobs = [];
  for (let fi = 0; fi < list.length; fi++) for (let dy = 0; dy < grid; dy++) for (let dx = 0; dx < grid; dx++) {
    const y = cy + dy;
    jobs.push({ fi, dx, dy, x: cx + dx, y, skip: y < 0 || y >= N });
  }
  const total = jobs.length;
  let done = 0, next = 0, lastErr = null;
  async function pump() {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const t = jobs[i];
      if (t.skip) { done++; if (onTile) onTile(done, total); continue; }
      try {
        const r = await fetch(tileURL(list[t.fi].id, z, ((t.x % N) + N) % N, t.y),
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(9000) } : undefined);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const bm = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        frames[t.fi].ctx.drawImage(bm, t.dx * TILE, t.dy * TILE);
        bm.close();
        frames[t.fi].ok++;
      } catch (e) { frames[t.fi].fail++; lastErr = e; }
      done++;
      if (onTile) onTile(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(12, jobs.length) }, pump));
  const bad = frames.find(f => !f.ok && f.fail);              // every tile of a frame failed: proxy or CORS
  if (bad) {
    const err = new Error('radar tiles unavailable (' + (lastErr && lastErr.message || 'network') + ')');
    err.code = 'tile';
    throw err;
  }
  return frames.map(f => f.ctx.getImageData(0, 0, S, S).data);
}

function decode(rgba, S, keepRGBA) {
  const out = new Uint8Array(S * S);
  let unknown = 0, weak = 0, wet = 0, max = 0;
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    const a = rgba[i + 3];
    if (!a) continue;
    if (a < 255) { weak++; continue; }
    const v = BY_RGB.get((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    if (v === undefined) { unknown++; continue; }
    out[p] = v; wet++;
    if (v > max) max = v;
  }
  return { dbz: out, unknown, weak, wet, max, rgba: keepRGBA ? rgba : null };
}

/* ---------- forecast ---------- */
const cache = new Map(), inflight = new Map();

async function build(o, key, stage) {
  const grid = clamp(o.grid | 0 || 3, 2, 4), z = clamp(o.z | 0 || DEF_Z, 5, 8);
  const N = 1 << z;
  const [tx, ty] = tileXY(+o.lat, +o.lon, z);
  /* keep the block inside the world: at the antimeridian a wrapped box cannot be described as [west,east] */
  const cx = Math.max(0, Math.min(N - grid, Math.round(tx - grid / 2)));
  const cy = Math.max(0, Math.min(N - grid, Math.round(ty - grid / 2)));
  const S = grid * TILE;

  if (stage) stage('frames');
  const list = await frameList();

  const mosaic = await loadMosaic(list, cx, cy, grid, z, (done, total) => { if (stage) stage('tiles', done, total); });
  const frames = mosaic.map((rgba, i) => decode(rgba, S, o.wantRaw && i === mosaic.length - 1));

  if (stage) stage('flow');
  const dbz = frames.map(f => f.dbz);
  const wet = frames[frames.length - 1].wet;

  /* dt between radar frames, in minutes (RainViewer: 10) */
  const diffs = [];
  for (let i = 1; i < list.length; i++) diffs.push(list[i].time - list[i - 1].time);
  diffs.sort((a, b) => a - b);
  const dtMin = (diffs[diffs.length >> 1] || 600) / 60;

  const nw = { lat: tileLat(cy, z), lng: (cx / (1 << z)) * 360 - 180 };
  const se = { lat: tileLat(cy + grid, z), lng: ((cx + grid) / (1 << z)) * 360 - 180 };
  const centre = { lat: (nw.lat + se.lat) / 2, lng: (nw.lng + se.lng) / 2 };
  const kmPerPx = 156543.03392 * Math.cos(centre.lat * Math.PI / 180) / Math.pow(2, z) / 1000;
  const last = list[list.length - 1].time;

  /* nothing to track: save the worker the trip */
  if (!wet) return { ok: false, why: 'dry', S, z, grid, cx, cy, dtMin, kmPerPx, nw, se, centre, at: Date.now(), ms: 0 };

  const w = await call({ type: 'nowcast', S, frames: dbz, horizon: clamp(o.horizon | 0 || 6, 1, 12), verify: !!o.verify, debug: !!o.debug });
  if (!w.nValid) return { ok: false, why: 'nomotion', S, z, grid, cx, cy, dtMin, kmPerPx, nw, se, centre, at: Date.now(), ms: w.ms };
  const damp = w.damp == null ? 1 : w.damp;

  /* step 0 is “now” (the newest radar frame as decoded), then +10 … +60 min */
  const steps = [{ min: 0, time: last, dbz: frames[frames.length - 1].dbz }]
    .concat((w.forecast || []).map((d, i) => ({ min: Math.round((i + 1) * dtMin), time: last + (i + 1) * dtMin * 60, dbz: d })));

  return {
    ok: true, S, z, grid, cx, cy, dtMin, kmPerPx, at: Date.now(),
    nw, se, centre, llBounds: [[se.lat, nw.lng], [nw.lat, se.lng]],
    frames: list.map(f => ({ time: f.time * 1000 })),
    lastTime: last * 1000,
    motion: { u: w.u, v: w.v, gw: w.gw, gh: w.gh, node: w.node, valid: w.valid, gmed: w.gmed, nValid: w.nValid, spread: w.spread },
    damp,
    speed: w.gmed ? Math.hypot(w.gmed[0] * 2 * kmPerPx, w.gmed[1] * 2 * kmPerPx) / (dtMin / 60) * damp : 0,
    bearing: w.gmed ? (Math.atan2(w.gmed[0], -w.gmed[1]) * 180 / Math.PI + 360) % 360 : 0,
    growth: w.growth || 0, growthN: w.growthN || 0,
    steps, wet: wet / (S * S), max: frames[frames.length - 1].max,
    unknown: frames.reduce((a, f) => a + f.unknown, 0),
    raw: frames[frames.length - 1].rgba,
    skill: w.verify || null,
    dbg: o.debug && w.verify ? { pred: w.verify.pred, truth: w.verify.truth } : null,
    ms: w.ms
  };
}

function forecast(o) {
  o = o || {};
  const grid = clamp(o.grid | 0 || 3, 2, 4), z = clamp(o.z | 0 || DEF_Z, 5, 8);
  const [tx, ty] = tileXY(+o.lat, +o.lon, z);
  const key = z + '/' + Math.round(tx - grid / 2) + '/' + Math.round(ty - grid / 2) + '/' + grid;
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return Promise.resolve(c.res);
  if (inflight.has(key)) return inflight.get(key);
  const p = build(o, key, o.onStage)
    .then(res => { cache.set(key, { at: Date.now(), res }); trim(); return res; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
function trim() {
  if (cache.size <= MAX_CACHE) return;
  let oldest = null;
  for (const [k, v] of cache) if (!oldest || v.at < oldest[1].at) oldest = [k, v];
  if (oldest) cache.delete(oldest[0]);
}

/* ---------- sampling ---------- */
function pxOf(res, lat, lon) {
  const [tx, ty] = tileXY(lat, lon, res.z);
  return [(tx - res.cx) * TILE, (ty - res.cy) * TILE];
}
function sampleDZ(dbz, S, x, y) {
  if (x < 0 || y < 0 || x > S - 1 || y > S - 1) return 0;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * S + x0;
  const x1 = x0 < S - 1 ? 1 : 0, y1 = y0 < S - 1 ? 1 : 0;
  const a = dbz[i], b = dbz[i + x1], c = dbz[i + y1 * S], d = dbz[i + y1 * S + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function sample(res, lat, lon, step) {
  if (!res || !res.steps || !res.steps[step]) return null;
  const [x, y] = pxOf(res, lat, lon);
  if (x < 0 || y < 0 || x >= res.S || y >= res.S) return null;
  const dbz = sampleDZ(res.steps[step].dbz, res.S, x, y);
  return { dbz, mm: mmh(dbz), x, y };
}
/* â€œat this placeâ€ means a neighbourhood, not one pixel: a rain edge 2 km away is still your rain.
   Max over a disc of Â±km, but only if the echo is more than a speck (â‰¥3 wet pixels). */
function sampleArea(res, lat, lon, step, km) {
  if (!res || !res.steps || !res.steps[step]) return null;
  const [x, y] = pxOf(res, lat, lon);
  if (x < 0 || y < 0 || x >= res.S || y >= res.S) return null;
  const r = Math.max(1, Math.min(5, Math.round((km || 4) / (res.kmPerPx || 1))));
  const dbzArr = res.steps[step].dbz, S = res.S;
  let max = 0, n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const v = sampleDZ(dbzArr, S, x + dx, y + dy);
    if (v >= DBZ_MIN) { n++; if (v > max) max = v; }
  }
  const dbz = n >= 3 ? max : 0;
  return { dbz, mm: mmh(dbz), x, y, r };
}
function rainIn(res, lat, lon) {
  const out = { startMin: null, stopMin: null, peak: 0, wetNow: false, maxMin: res && res.steps ? res.steps[res.steps.length - 1].min : 0 };
  if (!res || !res.steps) return out;
  const wet = mm => mm >= 0.15;
  let first = -1, last = -1;
  for (let i = 0; i < res.steps.length; i++) {
    const s = sampleArea(res, lat, lon, i);
    if (!s) continue;
    out.peak = Math.max(out.peak, s.mm);
    if (wet(s.mm)) { if (first < 0) first = i; last = i; }
  }
  if (first === 0) out.wetNow = true;
  if (first >= 0) out.startMin = res.steps[first].min;
  if (last >= 0 && last < res.steps.length - 1) out.stopMin = res.steps[last + 1].min;
  return out;
}

/* ---------- painting ---------- */
function canvasFrom(dbz, S) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), o = img.data;
  const fade = Math.max(4, S * 0.055);
  for (let y = 0; y < S; y++) {
    const edgeY = Math.min(y, S - 1 - y) / fade;
    for (let x = 0; x < S; x++) {
      const v = dbz[y * S + x];
      if (!v) continue;
      const k = (v < DBZ_MIN ? 0 : v > DBZ_MAX ? DBZ_MAX : v) - DBZ_MIN;
      const p = (y * S + x) * 4;
      o[p] = RGB[k * 3]; o[p + 1] = RGB[k * 3 + 1]; o[p + 2] = RGB[k * 3 + 2];
      const edge = Math.min(edgeY, Math.min(x, S - 1 - x) / fade);
      o[p + 3] = Math.round((95 + k * 3.2) * clamp(edge * 1.6, 0, 1));
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
function canvas(res, step) { return canvasFrom(res.steps[step].dbz, res.S); }
function blobURL(cv) {
  return new Promise(res => {
    if (cv.toBlob) cv.toBlob(b => res(b ? URL.createObjectURL(b) : ''), 'image/png');
    else res(cv.toDataURL('image/png'));
  });
}

const NC = {
  palette: PALETTE, mmh, tileXY, tileLat, decode, forecast, sample, sampleArea, rainIn, canvas, canvasFrom, blobURL, pxOf,
  DBZ_MIN, DBZ_MAX, TILE, WURL
};
g.NC = NC;
})(typeof window !== 'undefined' ? window : globalThis);

