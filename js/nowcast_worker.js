/* Skylab · nowcast_worker.js — radar nowcasting in a Web Worker.
   Pyramidal Lucas–Kanade motion field, semi-Lagrangian advection and hindcast verification.

   Messages
     {type:'ping'}                                    → {type:'pong'}
     {type:'nowcast', S, frames:[Uint8Array dBZ (0 = no echo, 15..65), oldest→newest],
                      horizon, verify, debug}
                                                      → {gw,gh,node,u,v,valid,gmed,nValid,nStatic,spread,
                                                         growth,growthN,ms,msField,msAdvect,
                                                         forecast:[Uint8Array × horizon],
                                                         verify:{t15,t30,p15,p30,skill15,skill30[,pred,truth]}}
     {S, frames}  (legacy)                            → motion field only

   Units: u,v are LEVEL-0 pixels per frame interval (level 0 = the S×S mosaic downsampled 2×,
   so one mosaic pixel = 0.5 level-0 pixels). x → east, y → south, no rotation: the mosaic is
   Web-Mercator, so a straight motion stays straight.
*/
'use strict';

const NODE = 16;        // spacing between measurement nodes (level-0 px)
const R = 7;            // LK window radius (15×15)
const LEVELS = 3;       // pyramid levels (0 = finest)
const ITER = 6;         // LK iterations per level
const MIN_EIG = 0.003;  // min eigenvalue of the structure matrix, per window pixel (texture test)
const MIN_MEAN = 0.04;  // min mean intensity in the window (needs some echo)
const FILL_R = 8;       // fill radius for nodes without a measurement (in nodes)

/* ---------- image helpers ---------- */
function down2(src, w, h) {                       // 2×2 block mean
  const W = w >> 1, H = h >> 1, out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (2 * y) * w + 2 * x;
    out[y * W + x] = (src[i] + src[i + 1] + src[i + w] + src[i + w + 1]) * 0.25;
  }
  return out;
}
function blur3(src, w, h) {                       // 3×3 box blur, edge-clamped
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = src[y * w + Math.max(0, x - 1)], b = src[y * w + x], c = src[y * w + Math.min(w - 1, x + 1)];
    t[y * w + x] = (a + b + c) / 3;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = t[Math.max(0, y - 1) * w + x], b = t[y * w + x], c = t[Math.min(h - 1, y + 1) * w + x];
    o[y * w + x] = (a + b + c) / 3;
  }
  return o;
}
function grads(img, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    gx[i] = (img[i + 1] - img[i - 1]) * 0.5;
    gy[i] = (img[i + w] - img[i - w]) * 0.5;
  }
  return { gx, gy };
}
function bil(img, w, h, x, y) {                   // bilinear sample; out of range → edge value
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return img[i] * (1 - fx) * (1 - fy) + img[i + 1] * fx * (1 - fy) + img[i + w] * (1 - fx) * fy + img[i + w + 1] * fx * fy;
}

/* pyramid of one frame: level 0 is S/2 square */
function pyramid(dbz, S) {
  const f = new Float32Array(S * S);
  for (let i = 0; i < f.length; i++) f[i] = dbz[i] / 10;           // dBZ/10: echo edges jump from 0 to ≥1.5
  let w = S >> 1, h = S >> 1, cur = blur3(down2(f, S, S), w, h);
  const P = [{ img: cur, w, h }];
  for (let l = 1; l < LEVELS; l++) {
    cur = blur3(down2(cur, w, h), w >> 1, h >> 1); w >>= 1; h >>= 1;
    P.push({ img: cur, w, h });
  }
  for (const L of P) Object.assign(L, grads(L.img, L.w, L.h));
  return P;
}

/* ---------- Lucas-Kanade for one node, coarse → fine ---------- */
function trackNode(PA, PB, nx, ny) {                // nx,ny: node position in level-0 px
  let gx = 0, gy = 0, found = null;
  for (let l = LEVELS - 1; l >= 0; l--) {
    const A = PA[l], B = PB[l], s = 1 << l, px = nx / s, py = ny / s;
    const w = A.w, h = A.h;
    let sxx = 0, sxy = 0, syy = 0, mean = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) {
      const y = Math.round(py) + dy; if (y < 1 || y >= h - 1) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = Math.round(px) + dx; if (x < 1 || x >= w - 1) continue;
        const i = y * w + x, ix = A.gx[i], iy = A.gy[i];
        sxx += ix * ix; sxy += ix * iy; syy += iy * iy; mean += A.img[i]; n++;
      }
    }
    if (n > R * R) {
      mean /= n;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.max(0, tr * tr - 4 * det);
      const lmin = (tr - Math.sqrt(disc)) / 2 / n;
      if (mean >= MIN_MEAN && lmin >= MIN_EIG && det > 1e-9) {
        for (let it = 0; it < ITER; it++) {
          let bx = 0, by = 0;
          for (let dy = -R; dy <= R; dy++) {
            const y = Math.round(py) + dy; if (y < 1 || y >= h - 1) continue;
            for (let dx = -R; dx <= R; dx++) {
              const x = Math.round(px) + dx; if (x < 1 || x >= w - 1) continue;
              const i = y * w + x;
              const d = bil(B.img, w, h, x + gx, y + gy) - A.img[i];
              bx += A.gx[i] * d; by += A.gy[i] * d;
            }
          }
          const ddx = -(syy * bx - sxy * by) / det, ddy = -(-sxy * bx + sxx * by) / det;
          gx += ddx; gy += ddy;
          if (Math.abs(ddx) + Math.abs(ddy) < 0.02) break;
        }
        if (Math.abs(gx) > 3 * R || Math.abs(gy) > 3 * R) { /* implausible jump at this scale */ }
        else if (l <= 1) found = { u: gx * s, v: gy * s, q: lmin };
      }
    }
    if (l > 0) { gx *= 2; gy *= 2; }
  }
  return found;
}

const median = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length & 1 ? b[m] : (b[m - 1] + b[m]) / 2; };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

/* ---------- 1. static-artefact mask + motion field ---------- */
function cleanFrames(frames, S) {
  const n = frames.length, P = S * S, st = new Uint8Array(P);
  let nStatic = 0;
  for (let p = 0; p < P; p++) {
    const v = frames[0][p]; if (!v) continue;
    let same = true;
    for (let k = 1; k < n; k++) if (frames[k][p] !== v) { same = false; break; }
    if (same) { st[p] = 1; nStatic++; }
  }
  const clean = frames.map(f => { const c = new Uint8Array(f); for (let p = 0; p < P; p++) if (st[p]) c[p] = 0; return c; });
  return { clean, nStatic };
}

/* track every node on every consecutive pair of the first `count` frames, then take the per-node median */
function field(pyr, count) {
  const W0 = pyr[0][0].w, gw = Math.floor(W0 / NODE), gh = gw;
  const per = Array.from({ length: gw * gh }, () => ({ u: [], v: [] }));
  for (let k = 0; k < count - 1; k++) {
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const r = trackNode(pyr[k], pyr[k + 1], (i + 0.5) * NODE, (j + 0.5) * NODE);
      if (r) { per[j * gw + i].u.push(r.u); per[j * gw + i].v.push(r.v); }
    }
  }
  const u = new Float32Array(gw * gh), v = new Float32Array(gw * gh), valid = new Uint8Array(gw * gh);
  const need = count > 2 ? 2 : 1, devs = [];
  let nValid = 0;
  for (let q = 0; q < gw * gh; q++) {
    const d = per[q];
    if (d.u.length >= need) {
      u[q] = median(d.u); v[q] = median(d.v); valid[q] = 1; nValid++;
      if (d.u.length >= 2) devs.push(median(d.u.map((x, i) => Math.hypot(x - u[q], d.v[i] - v[q]))));
    }
  }
  let gmed = null;
  if (nValid) {
    const vu = [], vv = [];
    for (let q = 0; q < gw * gh; q++) if (valid[q]) { vu.push(u[q]); vv.push(v[q]); }
    gmed = [median(vu), median(vv)];
  }
  return { u, v, valid, gw, gh, gmed, nValid, spread: median(devs) };
}

/* nodes without a measurement take the weighted neighbourhood mean (plus a weak pull to the global median) */
function fillField(f) {
  const { u, v, valid, gw, gh, gmed } = f;
  if (!f.gmed) return { u, v, gw, gh };
  const fu = new Float32Array(u), fv = new Float32Array(v);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const q = j * gw + i; if (valid[q]) continue;
    let su = gmed[0] * 0.15, sv = gmed[1] * 0.15, sw = 0.15;
    for (let dj = -FILL_R; dj <= FILL_R; dj++) for (let di = -FILL_R; di <= FILL_R; di++) {
      const jj = j + dj, ii = i + di; if (jj < 0 || jj >= gh || ii < 0 || ii >= gw) continue;
      const qq = jj * gw + ii; if (!valid[qq]) continue;
      const w = 1 / (di * di + dj * dj + 1);
      su += u[qq] * w; sv += v[qq] * w; sw += w;
    }
    fu[q] = su / sw; fv[q] = sv / sw;
  }
  return { u: fu, v: fv, gw, gh };
}
/* one light 3×3 pass over the filled field: removes single-node outliers that would smear the advection */
function smoothField(f) {
  const { u, v, gw, gh, gmed } = fillField(f);
  if (!gmed) return { u, v, gw, gh };
  const ou = new Float32Array(gw * gh), ov = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let su = 0, sv = 0, sw = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const jj = j + dj, ii = i + di; if (jj < 0 || jj >= gh || ii < 0 || ii >= gw) continue;
      const w = di || dj ? 1 : 2;
      const qq = jj * gw + ii; su += u[qq] * w; sv += v[qq] * w; sw += w;
    }
    ou[j * gw + i] = su / sw; ov[j * gw + i] = sv / sw;
  }
  return { u: ou, v: ov, gw, gh };
}

/* ---------- 2. intensity trend (growth / decay of the cells) ---------- */
/* mean dBZ at a node now vs the same air 10 min ago (advected back), clipped to ±2.5 dBZ/frame */
function trendField(clean, count, f) {
  const A = clean[count - 2], B = clean[count - 1], S = Math.sqrt(clean[0].length) | 0;
  const gw = f.gw, gh = f.gh, out = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const q = j * gw + i, nx = (i + 0.5) * NODE, ny = (j + 0.5) * NODE;
    const ux = f.u[q] * 2, uy = f.v[q] * 2;            // mosaic px per frame
    const bx = (nx - f.u[q]) * 2, by = (ny - f.v[q]) * 2;
    let sb = 0, sa = 0, nb = 0, na = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const ox = dx * NODE * 0.45, oy = dy * NODE * 0.45;
      const vb = sample(B, S, nx * 2 + ox, ny * 2 + oy);
      const va = sample(A, S, bx + ox, by + oy);
      sb += vb; sa += va; nb++; if (va > 0) na++;
    }
    sb /= nb; sa /= nb;
    if (sb < 8) continue;                               // no rain here → nothing to grow or decay
    out[q] = clamp((sb - sa) * 0.7, -2.5, 2.5);
  }
  /* smooth so isolated noisy nodes do not paint streaks */
  const sm = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let s = 0, w = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const jj = j + dj, ii = i + di; if (jj < 0 || jj >= gh || ii < 0 || ii >= gw) continue;
      const ww = di || dj ? 1 : 2; s += out[jj * gw + ii] * ww; w += ww;
    }
    sm[j * gw + i] = s / w;
  }
  return sm;
}

/* ---------- 3. advection ---------- */
function sample(img, S, x, y) {                     // bilinear, 0 outside (rain does not come from nowhere)
  if (x < 0 || y < 0 || x > S - 1 || y > S - 1) return 0;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * S + x0;
  const x1 = x0 < S - 1 ? 1 : 0, y1 = y0 < S - 1 ? 1 : 0;
  const a = img[i], b = img[i + x1], c = img[i + y1 * S], d = img[i + y1 * S + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
/* bilinear interpolation over the node grid; (x,y) in mosaic px */
function nodeAt(arr, f, x, y) {
  const gw = f.gw, gh = f.gh;
  let lx = x * 0.5 / NODE - 0.5, ly = y * 0.5 / NODE - 0.5;
  let i0 = Math.floor(lx), j0 = Math.floor(ly), tx = lx - i0, ty = ly - j0;
  if (i0 < 0) { i0 = 0; tx = 0; } else if (i0 > gw - 1) { i0 = gw - 1; tx = 0; }
  if (j0 < 0) { j0 = 0; ty = 0; } else if (j0 > gh - 1) { j0 = gh - 1; ty = 0; }
  const i1 = Math.min(gw - 1, i0 + 1), j1 = Math.min(gh - 1, j0 + 1);
  const a = arr[j0 * gw + i0], b = arr[j0 * gw + i1], c = arr[j1 * gw + i0], d = arr[j1 * gw + i1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
/* per-pixel trace-back offset (mosaic px per frame) + trend, built once and reused for every lead time */
function plan(S, f, trend) {
  const P = S * S, ox = new Float32Array(P), oy = new Float32Array(P), tr = new Float32Array(P);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    ox[i] = nodeAt(f.u, f, x, y) * 2; oy[i] = nodeAt(f.v, f, x, y) * 2;
    tr[i] = nodeAt(trend, f, x, y);
  }
  return { ox, oy, tr, S };
}
/* semi-Lagrangian backward advection of `base` by `lead` frame intervals; `damp` scales the motion */
function advect(pl, base, lead, damp) {
  const { ox, oy, tr, S } = pl, out = new Uint8Array(S * S), k = damp == null ? 1 : damp;
  for (let y = 0; y < S; y++) {
    const row = y * S;
    for (let x = 0; x < S; x++) {
      const i = row + x;
      const d = sample(base, S, x - ox[i] * lead * k, y - oy[i] * lead * k);
      if (d <= 0) continue;
      const z = d + tr[i] * lead;
      if (z >= 15) out[i] = z > 65 ? 65 : Math.round(z);
    }
  }
  return out;
}

/* ---------- 4. verification (hindcast: predict the last frame from the ones before it) ---------- */
function scores(S, truth, pred, thr) {
  const a = Math.round(S * 0.15), b = Math.round(S * 0.85);
  let hits = 0, miss = 0, fa = 0, ae = 0, n = 0;
  for (let y = a; y < b; y++) {
    const row = y * S;
    for (let x = a; x < b; x++) {
      const i = row + x, t = truth[i], p = pred[i];
      const wt = t >= thr, wp = p >= thr;
      if (wt && wp) hits++; else if (wt) miss++; else if (wp) fa++;
      ae += Math.abs(t - p); n++;
    }
  }
  const d = hits + miss + fa;
  return {
    csi: d ? hits / d : null,
    pod: hits + miss ? hits / (hits + miss) : null,
    far: hits + fa ? fa / (hits + fa) : null,
    bias: hits + miss ? (hits + fa) / (hits + miss) : null,
    mae: n ? ae / n : null,
    hits, miss, fa
  };
}
function compare(S, truth, pred, persist) {
  const t15 = scores(S, truth, pred, 15), t30 = scores(S, truth, pred, 30);
  const p15 = scores(S, truth, persist, 15), p30 = scores(S, truth, persist, 30);
  /* skill = how much of the gap between persistence and a perfect forecast we close */
  const skill = (c, p) => (p != null && p > 0.02 && c != null ? (c - p) / (1 - p) : null);
  return { t15, t30, p15, p30, skill15: skill(t15.csi, p15.csi), skill30: skill(t30.csi, p30.csi) };
}

/* ---------- entry points ---------- */
function runNowcast(d) {
  const t0 = performance.now();
  const S = d.S | 0, frames = d.frames, n = frames.length;
  if (!S || !frames || n < 3) throw new Error('need at least 3 frames');
  const { clean, nStatic } = cleanFrames(frames, S);
  const pyr = clean.map(f => pyramid(f, S));
  const f = field(pyr, n), sl = smoothField(f);
  const trend = trendField(clean, n, sl);
  const t1 = performance.now();

  const horizon = clamp(d.horizon | 0 || 6, 1, 12);
  const pl = plan(S, sl, trend);

  /* How far do we trust the motion? Test the one-frame hindcast at a few damping factors: if moving the
     field makes the prediction worse than leaving it still, trust it less. This is the classic
     "blend with persistence" and it stops a noisy vector field from inventing rain that never arrives. */
  let verify = null, gt = 0, damp = 1;
  if (d.verify && n >= 4) {
    const fv = field(pyr, n - 1), sv = smoothField(fv), tv = trendField(clean, n - 1, sv);
    const pv = plan(S, sv, tv), base = clean[n - 2], truth = clean[n - 1];
    const cands = [];
    for (const k of [1, 0.65, 0.35, 0]) {
      const pred = advect(pv, base, 1, k);
      cands.push({ k, pred, v: compare(S, truth, pred, base) });
    }
    let best = cands[0];
    for (const c of cands) if (c.v.t15.csi != null && (best.v.t15.csi == null || c.v.t15.csi > best.v.t15.csi)) best = c;
    /* keep the strongest motion that is within 1.5 CSI points of the best: do not freeze the field for noise */
    let pick = best;
    if (best.v.t15.csi != null) for (const c of cands) {
      if (c.v.t15.csi != null && c.v.t15.csi >= best.v.t15.csi - 0.015) { pick = c; break; }
    }
    damp = pick.k; verify = pick.v;
    verify.pred = d.debug ? pick.pred : null;
    verify.truth = d.debug ? truth : null;
    verify.damp = damp;
    gt = median(Array.from(tv).filter(x => x !== 0).map(Math.abs));
  }

  const forecast = [];
  for (let k = 1; k <= horizon; k++) forecast.push(advect(pl, clean[n - 1], k, damp));
  const t2 = performance.now();

  const growth = median(Array.from(trend).filter(x => x !== 0));
  const out = {
    id: d.id,
    gw: sl.gw, gh: sl.gh, node: NODE, u: sl.u, v: sl.v, valid: f.valid,
    gmed: f.gmed, nValid: f.nValid, spread: f.spread, nStatic, damp,
    growth: isFinite(growth) ? growth : 0, growthN: gt,
    ms: performance.now() - t0, msField: t1 - t0, msAdvect: t2 - t1,
    forecast, verify
  };
  const transfer = forecast.map(x => x.buffer);
  if (out.verify && out.verify.pred) transfer.push(out.verify.pred.buffer, out.verify.truth.buffer);
  postMessage(out, transfer);
}

/* legacy: motion field only (the step-2 contract) */
function runMotion(d) {
  const t0 = performance.now(), S = d.S | 0, frames = d.frames, n = frames.length;
  if (!S || !frames || n < 2) throw new Error('need at least 2 frames');
  const { clean, nStatic } = cleanFrames(frames, S);
  const pyr = clean.map(f => pyramid(f, S));
  const f = field(pyr, n);
  if (f.nValid) {
    const sl = fillField(f);
    postMessage({ id: d.id, gw: f.gw, gh: f.gh, node: NODE, u: sl.u, v: sl.v, valid: f.valid, gmed: f.gmed, nValid: f.nValid, nStatic, spread: f.spread, ms: performance.now() - t0 });
  } else {
    postMessage({ id: d.id, gw: f.gw, gh: f.gh, node: NODE, u: f.u, v: f.v, valid: f.valid, gmed: null, nValid: 0, nStatic, spread: NaN, ms: performance.now() - t0 });
  }
}

onmessage = e => {
  const d = e.data || {};
  if (d.type === 'ping') { postMessage({ type: 'pong' }); return; }
  try {
    if (d.type === 'nowcast') runNowcast(d);
    else runMotion(d);
  } catch (err) {
    postMessage({ error: String((err && err.message) || err) });
  }
};
