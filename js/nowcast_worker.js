/* Skylab · nowcast_worker.js — radar nowcasting in a Web Worker.

   Two layers, on purpose (Crisnapati et al., ICORIS 2019 — LK + colour blob detection):
     · motion  — pyramidal Lucas–Kanade on the echo texture. LK has no model of the object it
                 tracks, it only adds a displacement vector to a coordinate (OpenCV forum), so on
                 its own it drags a rain cell across the map without ever changing its shape.
     · objects — the echoes are re-segmented on every frame (opening + connected components, the
                 "colour blob" step) and each echo gets its own life cycle: coverage and mean
                 intensity trends over the frames, measured inside a window that is moved back
                 along the LK flow. That trend is what makes cells shrink and fade instead of
                 sliding forever.
   On top of that a scale cascade (cf. S-PROG / STEPS) decays the small scales faster than the
   large ones, so a 60-minute forecast is a softened field, not a photographic copy.

   Messages
     {type:'ping'}                                    → {type:'pong'}
     {type:'nowcast', S, frames:[Uint8Array dBZ (0 = no echo, 15..65), oldest→newest],
                      horizon, verify, debug, opt}    → motion field + forecast + verification
     {S, frames}  (legacy)                            → motion field only

   The nowcast reply carries u,v,valid,gmed,nValid,spread (motion), forecast[horizon] (dBZ per
   step), model ('object'), nObj/objArea/objGM/objGF (echo population and its trends) and
   verify{...} with the hindcast scores and the damping the verification settled on.

   Units: u,v are LEVEL-0 pixels per frame interval (level 0 = the S×S mosaic downsampled 2×,
   so one mosaic pixel = 0.5 level-0 pixels). x → east, y → south.
*/
'use strict';

const NODE = 16;        // spacing between measurement nodes (level-0 px)
const R = 7;            // LK window radius (15×15)
const LEVELS = 3;       // pyramid levels (0 = finest)
const ITER = 6;         // LK iterations per level
const MIN_EIG = 0.003;  // min eigenvalue of the structure matrix, per window pixel (texture test)
const MIN_MEAN = 0.04;  // min mean intensity in the window (needs some echo)
const FILL_R = 8;       // fill radius for nodes without a measurement (in nodes)
const MIX = 0.3;        // how much each node is pulled towards the domain-wide drift
const SM = 3;           // smoothing passes over the motion field
const TREND_CAP = 8;    // dBZ: growth/decay may move intensity by at most this much over the forecast
const DBZ0 = 15;        // echo threshold

/* model options — the last section of the README explains what each one buys and what it costs.
   `trend: 'node'` and `cascade: 0` restore plain advection, which is what the verification
   compares the forecast against before it is shown. */
const DEF = {
  trend: 'object',  // 'object' (each echo its own life cycle) | 'global' (domain) | 'node' (pixel-wise)
  objVel: true,     // each object pulls its own nodes towards its mean velocity
  objVelW: 0.5,     // how hard
  mix: 0.3,         // pull of the smoothed field towards the domain-wide drift, per pass
  sm: 3,            // smoothing passes over the motion field
  gauss: true,      // Gaussian LK window (Bouguet)
  anchor: false,    // correlate the wet masks to correct a hallucinated domain drift (measured: no gain)
  cascade: 4,       // frames; decorrelation time of the small scales (0 = off)
  cascadeWet: true, // keep the echo edge (normalized blur) instead of shaving it
  edgeR: 2,         // blur radius of the cascade
  areaGain: 12,     // dBZ per unit of coverage trend, applied at the echo edge
  gmW: 0.15,        // weight of the intensity trend of the echo
  trendW: 0.6,      // weight of the pixel-wise trend where no object covers
  trendK: 4,        // how many of the newest frames feed the trend
  shrink: 0.7,      // how much of the measured trend is extrapolated
  minArea: 10       // L0 pixels; smaller blobs are speckle, not cells
};

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const median = a => {
  if (!a.length) return NaN;
  const b = a.slice().sort((x, y) => x - y), m = b.length >> 1;
  return b.length & 1 ? b[m] : (b[m - 1] + b[m]) / 2;
};

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

/* Gaussian window: Bouguet's pyramidal implementation weights the neighbourhood by a Gaussian
   instead of a flat box, which copes much better with a 15×15 window crossing an echo edge */
const GW = new Float32Array((2 * R + 1) * (2 * R + 1));
{
  const s2 = 2 * (R * 0.55) * (R * 0.55);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    GW[(dy + R) * (2 * R + 1) + (dx + R)] = Math.exp(-(dx * dx + dy * dy) / s2);
  }
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
function trackNode(PA, PB, nx, ny, gauss) {
  let gx = 0, gy = 0, found = null;
  const KW = 2 * R + 1;
  for (let l = LEVELS - 1; l >= 0; l--) {
    const A = PA[l], B = PB[l], s = 1 << l, px = nx / s, py = ny / s;
    const w = A.w, h = A.h, cx = Math.round(px), cy = Math.round(py);
    let sxx = 0, sxy = 0, syy = 0, mean = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) {
      const y = cy + dy; if (y < 1 || y >= h - 1) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx; if (x < 1 || x >= w - 1) continue;
        const i = y * w + x, ix = A.gx[i], iy = A.gy[i];
        const ww = gauss ? GW[(dy + R) * KW + (dx + R)] : 1;
        sxx += ww * ix * ix; sxy += ww * ix * iy; syy += ww * iy * iy; mean += ww * A.img[i]; n += ww;
      }
    }
    if (n > R * R * 0.5) {
      mean /= n;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.max(0, tr * tr - 4 * det);
      const lmin = (tr - Math.sqrt(disc)) / 2 / n;
      if (mean >= MIN_MEAN && lmin >= MIN_EIG && det > 1e-9) {
        for (let it = 0; it < ITER; it++) {
          let bx = 0, by = 0;
          for (let dy = -R; dy <= R; dy++) {
            const y = cy + dy; if (y < 1 || y >= h - 1) continue;
            for (let dx = -R; dx <= R; dx++) {
              const x = cx + dx; if (x < 1 || x >= w - 1) continue;
              const i = y * w + x;
              const ww = gauss ? GW[(dy + R) * KW + (dx + R)] : 1;
              const d = bil(B.img, w, h, x + gx, y + gy) - A.img[i];
              bx += ww * A.gx[i] * d; by += ww * A.gy[i] * d;
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

/* ---------- 1. static-artefact mask + motion field ---------- */
/* Global displacement of the whole scene, by direct correlation of the wet masks. Lucas–Kanade is a
   local, memoryless tracker: when the echoes are growing or dying instead of moving, it happily
   reports a displacement that is really an intensity change (Madrid: 6 px/frame of hallucinated
   drift on a field that did not move at all). The correlation is blind to that because it compares
   the masks, so it is used as the domain-wide drift and LK only supplies the pattern around it. */
function globalShift(frames, S) {
  const n = frames.length;
  if (n < 2) return null;
  const a = frames[n - 2], b = frames[n - 1];
  const ds = 4, w = S >> 2, A = new Uint8Array(w * w), B = new Uint8Array(w * w);
  let nb = 0;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    A[i] = a[(y * ds) * S + x * ds] >= DBZ0 ? 1 : 0;
    B[i] = b[(y * ds) * S + x * ds] >= DBZ0 ? 1 : 0;
    nb += B[i];
  }
  if (nb < 30) return null;
  const M = 10;
  const score = (dx, dy) => {
    let hit = 0;
    for (let y = M; y < w - M; y++) {
      const row = y * w;
      for (let x = M; x < w - M; x++) if (B[row + x] && A[(y + dy) * w + (x + dx)]) hit++;
    }
    return hit / nb - 0.003 * (Math.abs(dx) + Math.abs(dy));
  };
  let bx = 0, by = 0, bs = -1;
  for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    const sc = score(dx, dy);
    if (sc > bs) { bs = sc; bx = dx; by = dy; }
  }
  for (let dy = by - 2; dy <= by + 2; dy++) for (let dx = bx - 2; dx <= bx + 2; dx++) {
    const sc = score(dx, dy);
    if (sc > bs) { bs = sc; bx = dx; by = dy; }
  }
  /* B(x) = A(x+dx) → the pattern moved by (-dx,-dy) mosaic px; half of that in level-0 px */
  return { u: -bx * ds / 2, v: -by * ds / 2, score: bs };
}
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
function field(pyr, count, gauss) {
  const W0 = pyr[0][0].w, gw = Math.floor(W0 / NODE), gh = gw;
  const per = Array.from({ length: gw * gh }, () => ({ u: [], v: [] }));
  for (let k = 0; k < count - 1; k++) {
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const r = trackNode(pyr[k], pyr[k + 1], (i + 0.5) * NODE, (j + 0.5) * NODE, gauss);
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
  if (!gmed || !valid) return { u, v, gw, gh, gmed };          // already filled on a previous pass
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
  return { u: fu, v: fv, gw, gh, gmed };
}
/* one 3×3 pass over the filled field, then a pull towards the domain-wide drift: a node that disagrees
   with its neighbours by more than the field itself is noise, and advecting with it is what warps cells. */
function smoothOnce(f, mix) {
  const { u, v, gw, gh, gmed } = fillField(f);
  if (!gmed) return { u, v, gw, gh, gmed };
  const ou = new Float32Array(gw * gh), ov = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let su = 0, sv = 0, sw = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const jj = j + dj, ii = i + di; if (jj < 0 || jj >= gh || ii < 0 || ii >= gw) continue;
      const w = di || dj ? 1 : 2;
      const qq = jj * gw + ii; su += u[qq] * w; sv += v[qq] * w; sw += w;
    }
    ou[j * gw + i] = (su / sw) * (1 - mix) + gmed[0] * mix;
    ov[j * gw + i] = (sv / sw) * (1 - mix) + gmed[1] * mix;
  }
  return { u: ou, v: ov, gw, gh, gmed };
}
function smoothField(f, opt) {
  const mix = opt && opt.mix != null ? opt.mix : MIX;
  const passes = opt && opt.sm != null ? opt.sm : SM;
  let cur = f;
  for (let p = 0; p < passes; p++) cur = smoothOnce(cur, mix);
  return cur;
}

/* ---------- 2. echo objects (the "colour blob" layer) ---------- */
/* erosion then dilation: removes the speckle that LK would otherwise track, keeps the cell core */
function openMask(img, w, h, thr) {
  const wet = new Uint8Array(w * h), er = new Uint8Array(w * h), di = new Uint8Array(w * h);
  for (let i = 0; i < wet.length; i++) if (img[i] * 10 >= thr) wet[i] = 1;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (wet[i] && wet[i - 1] && wet[i + 1] && wet[i - w] && wet[i + w]) er[i] = 1;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (er[i] || er[i - 1] || er[i + 1] || er[i - w] || er[i + w]) di[i] = 1;
  }
  return di;
}
function box3(src, w, h) {                        // 3×3 box mean of a 0/1 mask, edge-clamped
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
function label(mask, w, h) {
  const id = new Int32Array(w * h), list = [], st = new Int32Array(w * h);
  let next = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || id[p]) continue;
    const nid = ++next;
    let sp = 0; st[sp++] = p; id[p] = nid;
    let area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (sp) {
      const q = st[--sp], qx = q % w, qy = (q / w) | 0;
      area++; sx += qx; sy += qy;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      if (qx > 0) { const r = q - 1; if (mask[r] && !id[r]) { id[r] = nid; st[sp++] = r; } }
      if (qx < w - 1) { const r = q + 1; if (mask[r] && !id[r]) { id[r] = nid; st[sp++] = r; } }
      if (qy > 0) { const r = q - w; if (mask[r] && !id[r]) { id[r] = nid; st[sp++] = r; } }
      if (qy < h - 1) { const r = q + w; if (mask[r] && !id[r]) { id[r] = nid; st[sp++] = r; } }
    }
    list.push({ id: nid, area, cx: sx / area, cy: sy / area, x0, y0, x1, y1 });
  }
  return { id, list };
}
function segment(pyr, n, S) {
  const w = S >> 1, h = S >> 1;
  const mask = openMask(pyr[n - 1][0].img, w, h, DBZ0);
  const dens = box3(mask, w, h);
  const { id, list } = label(mask, w, h);
  return { mask, dens, id, list, w, h };
}
function slope(xs, ys) {
  const n = xs.length; if (n < 2) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) { const d = xs[i] - mx; a += d * (ys[i] - my); b += d * d; }
  return b > 1e-9 ? a / b : 0;
}
/* median of all pairwise slopes: one bad frame (a radar artefact, a cell that jumps) cannot drag the
   whole trend the way it drags a least-squares fit */
function medSlope(xs, ys) {
  const ds = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const dx = xs[j] - xs[i];
    if (Math.abs(dx) > 1e-9) ds.push((ys[j] - ys[i]) / dx);
  }
  return ds.length ? median(ds) : 0;
}
/* domain-wide trend, used where no echo object covers the pixel. Coverage is fitted in log space:
   a rain area decays multiplicatively (half of it in the first twenty minutes, half of the rest in
   the next), so a linear fit on the area keeps predicting losses that already happened. */
function globalTrend(clean, S, opt) {
  const n = clean.length, K = Math.min(n, opt.trendK || 4);
  const xs = [], lf = [], ms = [];
  for (let k = n - K; k < n; k++) {
    const f = clean[k];
    let w = 0, s = 0;
    for (let i = 0; i < f.length; i++) { const v = f[i]; if (v >= DBZ0) { w++; s += v; } }
    xs.push(k);
    lf.push(Math.log(Math.max(w / (S * S), 1e-4)));
    ms.push(w ? s / w : 0);
  }
  const sh = opt.shrink == null ? 0.7 : opt.shrink;
  return {
    gF: clamp(medSlope(xs, lf), -0.12, 0.12) * sh,
    gM: clamp(medSlope(xs, ms), -1.5, 1.5) * sh
  };
}
/* per-object mean velocity: the blob layer corrects the LK track, exactly as the colour mask in the
   hand-tracking paper corrects the point LK drifted on */
function segVelocity(f, sl, seg, w) {
  const wgt = w == null ? 0.5 : w;
  const ou = new Float32Array(sl.u), ov = new Float32Array(sl.v);
  const ncx = sl.gw, ncy = sl.gh;
  for (const o of seg.list) {
    if (o.area < DEF.minArea) continue;
    const i0 = clamp(Math.floor((o.x0 - 2) / NODE), 0, ncx - 1), i1 = clamp(Math.ceil((o.x1 + 2) / NODE), 0, ncx - 1);
    const j0 = clamp(Math.floor((o.y0 - 2) / NODE), 0, ncy - 1), j1 = clamp(Math.ceil((o.y1 + 2) / NODE), 0, ncy - 1);
    let su = 0, sv = 0, sw = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = j * ncx + i;
      if (!f.valid[q]) continue;
      const d = Math.hypot((i + 0.5) * NODE - o.cx, (j + 0.5) * NODE - o.cy);
      const w = 1 / (1 + d * d / 400);
      su += f.u[q] * w; sv += f.v[q] * w; sw += w;
    }
    if (sw < 0.5) continue;
    const uu = su / sw, vv = sv / sw;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = j * ncx + i;
      ou[q] = ou[q] * (1 - wgt) + uu * wgt; ov[q] = ov[q] * (1 - wgt) + vv * wgt;
    }
  }
  return { u: ou, v: ov, gw: sl.gw, gh: sl.gh, gmed: sl.gmed };
}
/* coverage / intensity trend of every echo, measured backwards along the flow inside a moving window.
   The default is the domain-wide trend; an echo object overrides it with its own. Only the recent
   frames are used, and the fit is robust: a cell that died in the first two frames must not make the
   extrapolation keep killing rain that is still there. */
function objectLayer(clean, S, sl, seg, opt) {
  const n = clean.length, w = seg.w, h = seg.h, K = Math.min(n, opt.trendK || 4);
  const P = S * S, sh = opt.shrink == null ? 0.7 : opt.shrink;
  const GM = new Float32Array(P), GF = new Float32Array(P), ED = new Float32Array(P);
  const gt = globalTrend(clean, S, opt);
  GM.fill(gt.gM); GF.fill(gt.gF);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    ED[y * S + x] = 1 - seg.dens[(y >> 1) * w + (x >> 1)];
  }
  if (opt.trend !== 'object') return { GM, GF, ED, n: 0, area: 0, gM: gt.gM, gF: gt.gF };
  let used = 0, gms = [], gfs = [], area = 0;
  for (const o of seg.list) {
    if (o.area < opt.minArea) continue;
    used++; area += o.area;
    const pad = 4;
    const WX0 = Math.max(0, o.x0 - pad), WY0 = Math.max(0, o.y0 - pad);
    const WX1 = Math.min(w - 1, o.x1 + pad), WY1 = Math.min(h - 1, o.y1 + pad);
    const ux = nodeAt(sl.u, sl, o.cx * 2, o.cy * 2), uy = nodeAt(sl.v, sl, o.cx * 2, o.cy * 2);
    const xs = [], lf = [], ms = [];
    for (let k = n - K; k < n; k++) {
      const back = n - 1 - k;
      const sx = Math.round(ux * back), sy = Math.round(uy * back);
      const ax = WX0 - sx, ay = WY0 - sy, bx = WX1 - sx, by = WY1 - sy;
      if (ax < 0 || ay < 0 || bx >= w || by >= h) continue;      // window left the mosaic
      let wet = 0, tot = 0, sum = 0;
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
        const v = clean[k][(2 * y) * S + 2 * x];
        tot++; if (v >= DBZ0) { wet++; sum += v; }
      }
      xs.push(k); lf.push(Math.log(Math.max(wet / tot, 1e-4))); ms.push(wet ? sum / wet : 0);
    }
    const gF = clamp(medSlope(xs, lf), -0.12, 0.12) * sh;
    const gM = clamp(medSlope(xs, ms), -1.5, 1.5) * sh;
    o.gF = isFinite(gF) ? gF : 0; o.gM = isFinite(gM) ? gM : 0;
    gfs.push(o.gF); gms.push(o.gM);
    for (let y = o.y0; y <= o.y1; y++) for (let x = o.x0; x <= o.x1; x++) {
      if (seg.id[y * w + x] !== o.id) continue;
      const e = 1 - seg.dens[y * w + x];
      for (let yy = 2 * y; yy <= 2 * y + 1; yy++) for (let xx = 2 * x; xx <= 2 * x + 1; xx++) {
        const i = yy * S + xx;
        GM[i] = o.gM; GF[i] = o.gF; ED[i] = e;
      }
    }
  }
  return { GM, GF, ED, n: used, area, gM: gms.length ? median(gms) : gt.gM, gF: gfs.length ? median(gfs) : gt.gF };
}

/* ---------- 3. intensity trend (growth / decay where no object covers the pixel) ---------- */
function trendField(clean, count, f) {
  const A = clean[count - 2], B = clean[count - 1], S = Math.sqrt(clean[0].length) | 0;
  const gw = f.gw, gh = f.gh, out = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const q = j * gw + i, nx = (i + 0.5) * NODE, ny = (j + 0.5) * NODE;
    const bx = (nx - f.u[q]) * 2, by = (ny - f.v[q]) * 2;
    let sb = 0, sa = 0, nb = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const ox = dx * NODE * 0.45, oy = dy * NODE * 0.45;
      const vb = sample(B, S, nx * 2 + ox, ny * 2 + oy);
      const va = sample(A, S, bx + ox, by + oy);
      sb += vb; sa += va; nb++;
    }
    sb /= nb; sa /= nb;
    if (sb < 8) continue;                               // no rain here → nothing to grow or decay
    out[q] = clamp((sb - sa) * 0.7, -2.5, 2.5);
  }
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

/* ---------- 4. advection ---------- */
function sample(img, S, x, y) {                     // bilinear, 0 outside
  if (x < 0 || y < 0 || x > S - 1 || y > S - 1) return 0;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * S + x0;
  const x1 = x0 < S - 1 ? 1 : 0, y1 = y0 < S - 1 ? 1 : 0;
  const a = img[i], b = img[i + x1], c = img[i + y1 * S], d = img[i + y1 * S + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
/* nearest neighbour for the advected frame: bilinear averaging of a speckled radar field eats the light
   rain every step (the edge of every cell gets mixed with dry air and drops below the 15 dBZ cut) */
function sampleN(img, S, x, y) {
  if (x < 0 || y < 0 || x > S - 1 || y > S - 1) return 0;
  return img[(y + 0.5 | 0) * S + (x + 0.5 | 0)];
}
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
/* per-pixel trace-back offset (mosaic px per frame) + the trend fields, built once */
function plan(S, sl, trend, obj) {
  const P = S * S, ox = new Float32Array(P), oy = new Float32Array(P), tr = new Float32Array(P);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    ox[i] = nodeAt(sl.u, sl, x, y) * 2; oy[i] = nodeAt(sl.v, sl, x, y) * 2;
    tr[i] = nodeAt(trend, sl, x, y);
  }
  return { ox, oy, tr, S, gm: obj ? obj.GM : null, gf: obj ? obj.GF : null, ed: obj ? obj.ED : null };
}
/* separable box blur, sliding window; used by the cascade */
function boxBlur(src, S, r) {
  const t = new Float32Array(S * S), o = new Float32Array(S * S), d = 2 * r + 1;
  for (let y = 0; y < S; y++) {
    const row = y * S;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + clamp(k, 0, S - 1)];
    for (let x = 0; x < S; x++) {
      t[row + x] = sum / d;
      sum += src[row + clamp(x + r + 1, 0, S - 1)] - src[row + clamp(x - r, 0, S - 1)];
    }
  }
  for (let x = 0; x < S; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += t[clamp(k, 0, S - 1) * S + x];
    for (let y = 0; y < S; y++) {
      o[y * S + x] = sum / d;
      sum += t[clamp(y + r + 1, 0, S - 1) * S + x] - t[clamp(y - r, 0, S - 1) * S + x];
    }
  }
  return o;
}
/* normalized (wet-only) blur: a plain box blur mixes the dry zeros of the surrounding air into the
   echo edge, so every cascade step shaved a rim off every cell. Dividing by the wet weight keeps the
   edge value while still removing the texture inside the echo. */
function boxBlurWet(img, S, r) {
  const m = new Float32Array(S * S), w = new Float32Array(S * S);
  for (let i = 0; i < img.length; i++) if (img[i] > 0) { m[i] = img[i]; w[i] = 1; }
  const mb = boxBlur(m, S, r), wb = boxBlur(w, S, r), out = new Float32Array(S * S);
  for (let i = 0; i < img.length; i++) out[i] = wb[i] > 1e-3 ? mb[i] / wb[i] : 0;
  return out;
}
/* the cascade filtering of the base field is cached: it depends only on the field, not on the lead
   time, and computing it once per analysis instead of once per forecast step is what keeps the
   worker inside its budget */
const BLUR_CACHE = new WeakMap();
function smoothBase(base, S, r) {
  let m = BLUR_CACHE.get(base);
  if (!m) { m = new Map(); BLUR_CACHE.set(base, m); }
  let e = m.get(r);
  if (!e) { e = boxBlurWet(base, S, r); m.set(r, e); }
  return e;
}
/* semi-Lagrangian backward advection of `base` by `lead` frame intervals; `damp` scales the motion.
   The trend saturates with lead time (a cell that grew for ten minutes does not grow for an hour);
   the object trend works on the cell, the pixel trend only where no cell covers the pixel. */
function advect(pl, base, lead, damp, opt) {
  opt = opt || DEF;
  const { ox, oy, tr, S, gm, gf, ed } = pl;
  const out = new Uint8Array(S * S), k = damp == null ? 1 : damp;
  const sat = Math.exp(-lead / 4), cap = TREND_CAP;
  /* a trend measured over the last half hour says little about the next ten minutes (the field is
     still almost what it is now) and everything about the next hour, so it is ramped in with lead */
  const ramp = Math.min(1, Math.max(0, (lead - 1) / 3));
  const useTrend = !!gm && opt.trend !== 'node';
  /* cascade: the smallest scales are the first to be lost. A weighted blend towards the wet-only
     blur, applied to the source field once per lead, softens the texture before it is advected —
     the same thing as blurring the result, for a fraction of the cost. */
  let src = base;
  if (opt.cascade > 0 && lead > 3) {
    /* the first half hour keeps its detail; after that the small scales are the first thing an
       extrapolation loses, so they are faded towards the cell mean with a weight and a radius
       that grow with the horizon (an hour ahead, structure below ~5 km is noise) */
    const a = 1 - Math.exp(-(lead - 3) / opt.cascade);
    const r = Math.min(3, 1 + Math.round(lead * 0.45));
    const sm = opt.cascadeWet ? smoothBase(base, S, r) : boxBlur(base, S, opt.edgeR || 2);
    src = new Uint8Array(S * S);
    for (let i = 0; i < src.length; i++) {
      if (!base[i]) continue;                        // never grow rain into dry air
      const z = base[i] + a * (sm[i] - base[i]);
      src[i] = z >= DBZ0 ? (z > 65 ? 65 : Math.round(z)) : 0;
    }
  }
  for (let y = 0; y < S; y++) {
    const row = y * S;
    for (let x = 0; x < S; x++) {
      const i = row + x;
      const d = sampleN(src, S, x - ox[i] * lead * k, y - oy[i] * lead * k);
      if (d <= 0) continue;
      let dz;
      if (useTrend) {
        /* the cell's own trend, plus a coverage term that acts on the echo edge: an area that is
           shrinking loses its rim before it loses its core, which is what a decaying cell looks like */
        dz = (opt.gmW * gm[i] * lead * sat + opt.areaGain * gf[i] * lead * sat * ed[i]) * ramp;
      } else {
        dz = tr[i] * lead * sat * opt.trendW;
      }
      const z = d + (dz > cap ? cap : dz < -cap ? -cap : dz);
      if (z >= DBZ0) out[i] = z > 65 ? 65 : Math.round(z);
    }
  }
  return out;
}

/* ---------- 5. verification ---------- */
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
  const skill = (c, p) => (p != null && p > 0.02 && c != null ? (c - p) / (1 - p) : null);
  return { t15, t30, p15, p30, skill15: skill(t15.csi, p15.csi), skill30: skill(t30.csi, p30.csi) };
}

/* ---------- 6. analyse + entry points ---------- */
function analyze(clean, S, opt) {
  const n = clean.length;
  const pyr = clean.map(f => pyramid(f, S));
  const f = field(pyr, n, opt.gauss);
  /* anchor the domain-wide drift to the correlation measurement, keeping the local structure */
  if (opt.anchor !== false && f.gmed) {
    const gs = globalShift(clean, S);
    if (gs) {
      const du = gs.u - f.gmed[0], dv = gs.v - f.gmed[1];
      if (Math.hypot(du, dv) > 1.5) {
        for (let q = 0; q < f.u.length; q++) { f.u[q] += du; f.v[q] += dv; }
        f.gmed = [gs.u, gs.v];
      }
      f.shift = gs;
    }
  }
  let sl = f.nValid ? smoothField(f, opt) : f;
  let seg = null, obj = null;
  if (opt.trend !== 'node' && f.nValid) {
    seg = segment(pyr, n, S);
    if (opt.objVel) sl = segVelocity(f, sl, seg, opt.objVelW);
    obj = objectLayer(clean, S, sl, seg, opt);
  }
  const trend = f.nValid ? trendField(clean, n, sl) : new Float32Array(sl.gw * sl.gh);
  return { pyr, f, sl, trend, seg, obj };
}

function runNowcast(d) {
  const t0 = performance.now();
  const S = d.S | 0, frames = d.frames, n = frames.length;
  if (!S || !frames || n < 3) throw new Error('need at least 3 frames');
  const opt = Object.assign({}, DEF, d.opt || {});
  const { clean, nStatic } = cleanFrames(frames, S);
  const A = analyze(clean, S, opt);
  const f = A.f, sl = A.sl;
  const t1 = performance.now();

  const horizon = clamp(d.horizon | 0 || 6, 1, 12);

  /* How far should the field be displaced? Hindcast the last frame from the ones before it, at two
     horizons (ten and twenty minutes), and keep the strongest motion that is within 1.5 CSI points
     of the best. k = 0 is a candidate: if moving the field at all makes the forecast worse, the
     forecast says so and the cells decay in place. */
  let verify = null, gt = 0, damp = 1;
  const model = opt.trend;
  if (d.verify && n >= 4) {
    const sub = clean.slice(0, n - 1);
    const V = analyze(sub, S, opt);
    const truth = clean[n - 1];
    const base1 = sub[sub.length - 1], base2 = sub[sub.length - 2];
    const pl = plan(S, V.sl, V.trend, V.obj);
    const cands = [1, 0.65, 0.35, 0].map(k => {
      const p1 = advect(pl, base1, 1, k, opt), p2 = advect(pl, base2, 2, k, opt);
      const a15 = scores(S, truth, p1, 15), b15 = scores(S, truth, p2, 15);
      const a30 = scores(S, truth, p1, 30), b30 = scores(S, truth, p2, 30);
      const parts = [a15.csi, b15.csi, a30.csi, b30.csi].filter(x => x != null);
      return { k, pred: p1, s1: a15, score: parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : -2 };
    });
    let best = cands[0];
    for (const c of cands) if (c.score > best.score) best = c;
    let pick = best;
    for (const c of cands) {
      if (c.s1.csi != null && best.s1.csi != null && c.s1.csi >= best.s1.csi - 0.015) { pick = c; break; }
    }
    damp = pick.k;
    verify = compare(S, truth, pick.pred, base1);
    verify.pred = d.debug ? pick.pred : null;
    verify.truth = d.debug ? truth : null;
    verify.damp = damp;
    verify.model = model;
    verify.score = pick.score;
    gt = median(Array.from(V.trend).filter(x => x !== 0).map(Math.abs));
  }

  const layer = A.obj;
  const usePl = plan(S, sl, A.trend, layer);
  const forecast = [];
  for (let k = 1; k <= horizon; k++) forecast.push(advect(usePl, clean[n - 1], k, damp, opt));
  const t2 = performance.now();

  const obj = model === 'object' ? layer : null;

  const growth = median(Array.from(A.trend).filter(x => x !== 0));
  const out = {
    id: d.id,
    gw: sl.gw, gh: sl.gh, node: NODE, u: sl.u, v: sl.v, valid: f.valid,
    gmed: f.gmed, nValid: f.nValid, spread: f.spread, nStatic, damp, model,
    nObj: obj ? obj.n : 0, objArea: obj && S ? obj.area / ((S >> 1) * (S >> 1)) : 0,
    objGM: obj ? obj.gM : 0, objGF: obj ? obj.gF : 0,
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
  const opt = Object.assign({}, DEF, d.opt || {});
  const { clean, nStatic } = cleanFrames(frames, S);
  const pyr = clean.map(f => pyramid(f, S));
  const f = field(pyr, n, opt.gauss);
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

