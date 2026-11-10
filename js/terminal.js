/* Skylab · terminal.js — SkyLab Terminal (CLI) + lifecycle · load order 23/28 (classic script, shared global scope) */
/* ═══════════ TERMINAL — SkyLab Terminal (CLI) and its lifecycle ═══════════ */
/* ============ Terminal Image Fallback ============ */
function imgFBTerm(el){
 const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2.2');
 svg.setAttribute('stroke-linecap','round');svg.innerHTML='<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>';
 el.replaceWith(svg);
}

/* ============ SkyLab Terminal (CLI) ============ */
let termIsOpen = false;
let termInst = null, termClockT = null;

function isUserAuth(){
 return !!(currentUser && currentUser.username && currentToken);
}

const SkyTerm = (() => {
'use strict';

/* ---------- config & tiny helpers ---------- */
const CFG = { mock:false, cacheMs:10*60*1000, histMax:200, version:'1.0' };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/* cores da linha de comandos (como o pip): 1.º termo = comando, -x / --xx = opção (esbatida), resto = argumentos */
const hlCmd = line => { let first = true;
 return String(line).replace(/("[^"]*"?|'[^']*'?|\s+|\S+)/g, t => {
  if(/^\s+$/.test(t)) return t;
  const cls = first ? 'hl-cmd' : /^--?[A-Za-z]/.test(t) ? 'hl-flag' : 'hl-arg'; first = false;
  return `<span class="${cls}">${esc(t)}</span>`; }); };
const num = x => typeof x === 'number' && isFinite(x);
const fmt = (v,d=1) => num(v) ? v.toFixed(d) : '—';
const sgn = (v,d=1) => { if(!num(v)) return '—'; const s = Math.abs(v).toFixed(d); return (v<0 && +s!==0 ? '-' : '+') + s; };
const dispU = s => String(s||'');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2,'0');
const isoLocal = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
const unitAscii = u => String(u||'').replace(/°/g,'deg ').replace(/²/g,'2').replace(/³/g,'3').replace(/µ/g,'u').replace(/\s+$/,'');
const reduced = () => { try{ return matchMedia('(prefers-reduced-motion:reduce)').matches; }catch(e){ return false; } };

/* =====================================================================
   1. PARSER  — tokenizer (quotes, escapes) + flag/argument resolver
   ===================================================================== */
function tokenize(line){
 const out = []; let cur = '', quote = null, had = false;
 for(let i=0;i<line.length;i++){
  const ch = line[i];
  if(quote){
   if(ch==='\\' && (line[i+1]===quote || line[i+1]==='\\')) cur += line[++i];
   else if(ch===quote) quote = null;
   else cur += ch;
  } else if(ch==='"' || ch==="'"){ quote = ch; had = true; }
  else if(/\s/.test(ch)){ if(cur || had){ out.push(cur); cur = ''; had = false; } }
  else cur += ch;
 }
 if(quote) throw new Error(`unterminated quote (${quote})`);
 if(cur || had) out.push(cur);
 return out;
}

/* spec: { flagName:{ type:'bool'|'str'|'list', alias:['x'] } }
   - '-loc', '--loc', '--loc=lisbon' are all valid
   - 'list' flags swallow every following non-flag token ("new york")
   - '-6' is a value, not a flag (flags must start with a letter)       */
function parseArgs(tokens, spec = {}){
 const names = {};
 for(const [n,d] of Object.entries(spec)){ names[n.toLowerCase()] = n; (d.alias||[]).forEach(a => names[a.toLowerCase()] = n); }
 const isFlag = t => /^--?[A-Za-z_][\w-]*(=|$)/.test(t);
 const flags = {}, args = [], errors = [];
 for(let i=0;i<tokens.length;i++){
  const t = tokens[i];
  if(t === '--'){ args.push(...tokens.slice(i+1)); break; }
  if(!isFlag(t)){ args.push(t); continue; }
  const eq = t.indexOf('=');
  const raw = (eq<0 ? t : t.slice(0,eq)).replace(/^--?/,'').toLowerCase();
  const inline = eq<0 ? undefined : t.slice(eq+1);
  const key = names[raw];
  if(!key){ errors.push(`unknown flag '${eq<0?t:t.slice(0,eq)}'` + hint(raw, Object.keys(names))); continue; }
  const type = spec[key].type || 'bool';
  if(type === 'bool'){ flags[key] = inline === undefined ? true : !/^(0|false|no|off)$/i.test(inline); continue; }
  const vals = inline !== undefined ? [inline] : [];
  if(inline === undefined){
   // A list flag accepts one comma/space-delimited value token. Multi-word
   // strings must be quoted, so trailing words cannot be swallowed as data.
   if(i+1 < tokens.length && !isFlag(tokens[i+1]) && tokens[i+1] !== '--') vals.push(tokens[++i]);
  }
  if(!vals.length){ errors.push(`flag '${t}' needs a value`); continue; }
  flags[key] = type === 'list' ? vals.join(' ') : vals[0];
 }
 return { args, flags, errors };
}
const splitList = s => String(s||'').split(/[,\s]+/).filter(Boolean);

/* ---- fuzzy matching for "did you mean" ---- */
const lev = (a,b) => { a = String(a).toLowerCase(); b = String(b).toLowerCase(); const m = a.length, n = b.length; if(!m) return n; if(!n) return m;
 let prev = Array.from({length:n+1}, (_,j) => j);
 for(let i=1;i<=m;i++){ const cur = [i]; for(let j=1;j<=n;j++) cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1] ? 0 : 1)); prev = cur; }
 return prev[n]; };
const suggest = (word, pool, max = 3) => {
 const w = String(word).toLowerCase(), lim = Math.max(2, Math.ceil(w.length/3));
 return [...new Set(pool)].map(p => [p, p.toLowerCase().startsWith(w) ? 0 : lev(w,p)]).filter(([,d]) => d <= lim)
  .sort((x,y) => x[1]-y[1] || x[0].length-y[0].length).slice(0,max).map(x => x[0]);
};
const hint = (word, pool) => { const s = suggest(word, pool); return s.length ? ` — did you mean ${s.join(', ')}?` : ''; };

/* =====================================================================
   2. REGISTRIES  — add a command / metric / exporter with one call
   ===================================================================== */
class Registry{
 constructor(label){ this.label = label; this.map = new Map(); this.byName = new Map(); }
 register(name, def){
  def.name = name; this.map.set(name, def);
  [name, ...(def.alias||[])].forEach(n => this.byName.set(n.toLowerCase(), def));
  return this;
 }
 get(n){ return this.byName.get(String(n||'').toLowerCase()); }
 list(){ return [...this.map.values()]; }
 names(){ return [...this.byName.keys()].sort(); }
}
const commands  = new Registry('command');   // terminal commands
const metrics   = new Registry('metric');    // calc <metric>
const exporters = new Registry('format');    // export --format <fmt>

/* =====================================================================
   3. ATMOSPHERIC PHYSICS  (inputs: °C, %, hPa, km/h, m)
   ===================================================================== */
const Rd = 287.058, Rv = 461.495, KT = 1.943844;
const toK = c => c + 273.15;
const es = T => 6.112 * Math.exp(17.67*T/(T+243.5));                       // sat. vapour pressure, hPa
const vaporPressure = (T,RH) => RH/100 * es(T);                             // hPa
const dewPoint = (T,RH) => { const g = Math.log(Math.max(RH,.01)/100) + 17.625*T/(243.04+T); return 243.04*g/(17.625-g); };
const mixingRatio = (T,RH,p) => { const e = vaporPressure(T,RH); return 622*e/(p-e); };           // g/kg
const airDensity = (p,T,RH) => {
 const Tk = toK(T);
 if(!num(RH)) return p*100/(Rd*Tk);
 const e = vaporPressure(T,RH);
 return (p-e)*100/(Rd*Tk) + e*100/(Rv*Tk);
};
const wetBulb = (T,RH) => T*Math.atan(.151977*Math.sqrt(RH+8.313659)) + Math.atan(T+RH) - Math.atan(RH-1.676331) + .00391838*Math.pow(RH,1.5)*Math.atan(.023101*RH) - 4.686035; // Stull 2011
const lclTemp = (T,Td) => { const a = toK(T), b = toK(Td); return 1/(1/(b-56) + Math.log(a/b)/800) + 56; };            // K (Bolton 1980)
const theta = (T,p) => toK(T)*Math.pow(1000/p, .2854);
const thetaE = (T,Td,p,RH) => {
 const Tk = toK(T), TL = lclTemp(T,Td), r = mixingRatio(T,RH,p);
 return Tk*Math.pow(1000/p, .2854*(1-.28e-3*r)) * Math.exp((3.376/TL - .00254)*r*(1+.81e-3*r));
};
const heatIndexC = (T,RH) => {
 const t = T*9/5+32, r = RH;
 if(t < 80 || r < 40) return null;
 const hi = -42.379 + 2.04901523*t + 10.14333127*r - .22475541*t*r - 6.83783e-3*t*t - 5.481717e-2*r*r + 1.22874e-3*t*t*r + 8.5282e-4*t*r*r - 1.99e-6*t*t*r*r;
 return (hi-32)*5/9;
};
const windChillC = (T,v) => (T > 10 || v <= 4.8) ? null : 13.12 + .6215*T - 11.37*Math.pow(v,.16) + .3965*T*Math.pow(v,.16);
const pressureAlt = p => 44330.77*(1 - Math.pow(p/1013.25, .190263));      // m
const densityAlt = (p,T) => { const pa = pressureAlt(p); return pa + 36.576*(T - (15 - 6.5*pa/1000)); };
const soundSpeed = T => 331.3*Math.sqrt(1 + T/273.15);
const uv2xy = (spd,dir) => { const r = dir*Math.PI/180; return [-spd*Math.sin(r), -spd*Math.cos(r)]; };
const vecShear = (v1,d1,v2,d2) => { const a = uv2xy(v1,d1), b = uv2xy(v2,d2); return Math.hypot(b[0]-a[0], b[1]-a[1]); };   // km/h
const BEAUFORT = [1,6,12,20,29,39,50,62,75,89,103,118];
const beaufort = k => { let n = 0; while(n < BEAUFORT.length && k >= BEAUFORT[n]) n++; return n; };
const CARD = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const cardinal = d => num(d) ? CARD[Math.round(((d%360)+360)%360/22.5)%16] : '—';
const classify = (v, table) => { for(const [lim,txt] of table) if(v < lim) return txt; return table[table.length-1][1]; };
const CAPE_CLS = [[100,'none / negligible'],[1000,'marginal instability'],[2500,'moderate instability'],[4000,'strong instability'],[Infinity,'extreme instability']];
const UV_CLS = [[3,'low'],[6,'moderate'],[8,'high'],[11,'very high'],[Infinity,'extreme']];
const LI_CLS = [[-6,'extremely unstable'],[-3,'very unstable'],[0,'unstable'],[3,'marginally stable'],[Infinity,'stable']];

/* =====================================================================
   4. METRIC REGISTRY  — `calc <metric>`  (add yours with metrics.register)
      run(v, flags) -> { value, unit, d, inputs:[[label,val]], extra:[[label,val]], note }
      v = flat variable map for the chosen hour (+ elevation)
   ===================================================================== */
const need = (v, keys) => {
 const miss = keys.filter(k => !num(v[k]));
 if(miss.length) throw new Error(`missing input: ${miss.join(', ')} (run 'fetch' or pass --t / --rh / --p)`);
};
const tdOf = v => num(v.dew_point_2m) ? v.dew_point_2m : dewPoint(v.temperature_2m, v.relative_humidity_2m);

metrics
.register('air_density', { group:'thermo', alias:['rho','density'], formula:'ρ = p / (R·T)    R = 287.058 J/(kg·K)',
 summary:'Air density from surface pressure & temperature (--moist = humid air)',
 run(v,f){
  need(v,['surface_pressure','temperature_2m']);
  const dry = airDensity(v.surface_pressure, v.temperature_2m);
  const wet = num(v.relative_humidity_2m) ? airDensity(v.surface_pressure, v.temperature_2m, v.relative_humidity_2m) : null;
  const main = f.moist && num(wet) ? wet : dry;
  return { value:main, unit:'kg/m³', d:4,
   inputs:[['p', fmt(v.surface_pressure,1)+' hPa'],['T', fmt(v.temperature_2m,1)+' °C ('+fmt(toK(v.temperature_2m),2)+' K)']],
   extra:[['dry-air ρ', fmt(dry,4)+' kg/m³'], ['humid-air ρ', num(wet)?fmt(wet,4)+' kg/m³':'—'], ['vs ISA sea level (1.2250)', fmt(main/1.225*100,1)+' %']],
   note: f.moist ? 'humid air: partial pressures of dry air + vapour' : 'dry-air approximation (add --moist for humid air)' };
 }})
.register('dew_point', { group:'thermo', alias:['dew','td'], formula:'Td = c·γ/(b−γ),  γ = ln(RH/100) + b·T/(c+T)   (b=17.625, c=243.04)',
 summary:'Dew point from temperature & relative humidity (Magnus formula)',
 run(v){
  need(v,['temperature_2m','relative_humidity_2m']);
  const td = dewPoint(v.temperature_2m, v.relative_humidity_2m);
  return { value:td, unit:'°C', d:1,
   inputs:[['T', fmt(v.temperature_2m,1)+' °C'],['RH', fmt(v.relative_humidity_2m,0)+' %']],
   extra:[['spread T−Td', fmt(v.temperature_2m-td,1)+' °C'],['vapour pressure e', fmt(vaporPressure(v.temperature_2m,v.relative_humidity_2m),2)+' hPa'],['API dew_point_2m', num(v.dew_point_2m)?fmt(v.dew_point_2m,1)+' °C':'—']],
   note: td > 20 ? 'oppressive' : td > 16 ? 'humid' : td > 10 ? 'comfortable' : td > 0 ? 'dry' : 'very dry' };
 }})
.register('lcl', { group:'thermo', alias:['cloud_base'], formula:'LCL ≈ 125·(T − Td)  m AGL   (Espy)   ·  T_LCL by Bolton (1980)',
 summary:'Lifting Condensation Level (estimated cloud-base height)',
 run(v){
  need(v,['temperature_2m']);
  const T = v.temperature_2m, Td = tdOf(v);
  if(!num(Td)) throw new Error('missing input: dew point (need relative_humidity_2m)');
  const h = Math.max(0, 125*(T-Td)), TL = lclTemp(T,Td);
  const pL = num(v.surface_pressure) ? v.surface_pressure*Math.pow(TL/toK(T), 3.5) : null;
  return { value:h, unit:'m AGL', d:0,
   inputs:[['T', fmt(T,1)+' °C'],['Td', fmt(Td,1)+' °C']],
   extra:[['LCL (ASL)', num(v.elevation) ? fmt(h+v.elevation,0)+' m' : '—'],['T at LCL', fmt(TL-273.15,1)+' °C'],['p at LCL', fmt(pL,0)+' hPa']],
   note: h < 300 ? 'fog / very low stratus likely' : h < 1000 ? 'low cloud base' : h < 2500 ? 'typical cumulus base' : 'high base, dry boundary layer' };
 }})
.register('wet_bulb', { group:'thermo', alias:['tw'], formula:'Tw — Stull (2011) empirical fit, valid RH 5–99 %, T −20…50 °C',
 summary:'Wet-bulb temperature',
 run(v){ need(v,['temperature_2m','relative_humidity_2m']);
  const tw = wetBulb(v.temperature_2m, v.relative_humidity_2m);
  return { value:tw, unit:'°C', d:1, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['RH',fmt(v.relative_humidity_2m,0)+' %']],
   note: tw >= 31 ? 'extreme heat stress (limit of human survivability ≈ 35 °C)' : tw >= 28 ? 'dangerous heat stress' : 'below heat-stress thresholds' }; }})
.register('theta', { group:'thermo', alias:['potential_temp'], formula:'θ = T·(1000/p)^0.2854',
 summary:'Potential temperature',
 run(v){ need(v,['temperature_2m','surface_pressure']);
  const th = theta(v.temperature_2m, v.surface_pressure);
  return { value:th, unit:'K', d:2, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['p',fmt(v.surface_pressure,1)+' hPa']], extra:[['θ in °C', fmt(th-273.15,2)+' °C']] }; }})
.register('theta_e', { group:'thermo', alias:['equiv_pot_temp'], formula:'θe — Bolton (1980) eq. 43',
 summary:'Equivalent potential temperature (moist-static energy proxy)',
 run(v){ need(v,['temperature_2m','relative_humidity_2m','surface_pressure']);
  const te = thetaE(v.temperature_2m, tdOf(v), v.surface_pressure, v.relative_humidity_2m);
  return { value:te, unit:'K', d:1, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['Td',fmt(tdOf(v),1)+' °C'],['p',fmt(v.surface_pressure,1)+' hPa']],
   note: te > 345 ? 'very high — tropical-like air mass, strong convective potential' : te > 330 ? 'warm & moist' : 'moderate / dry air mass' }; }})
.register('mixing_ratio', { group:'thermo', alias:['w'], formula:'r = 622·e / (p − e)   [g/kg]',
 summary:'Water-vapour mixing ratio',
 run(v){ need(v,['temperature_2m','relative_humidity_2m','surface_pressure']);
  return { value:mixingRatio(v.temperature_2m, v.relative_humidity_2m, v.surface_pressure), unit:'g/kg', d:2,
   inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['RH',fmt(v.relative_humidity_2m,0)+' %'],['p',fmt(v.surface_pressure,1)+' hPa']] }; }})
.register('vapor_pressure', { group:'thermo', alias:['vp','e'], formula:'e = RH/100 · es(T),  es = 6.112·exp(17.67T/(T+243.5))',
 summary:'Actual & saturation vapour pressure, VPD',
 run(v){ need(v,['temperature_2m','relative_humidity_2m']);
  const s = es(v.temperature_2m), e = vaporPressure(v.temperature_2m, v.relative_humidity_2m);
  return { value:e, unit:'hPa', d:2, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['RH',fmt(v.relative_humidity_2m,0)+' %']],
   extra:[['saturation es', fmt(s,2)+' hPa'],['deficit (VPD)', fmt((s-e)/10,2)+' kPa'],['abs. humidity', fmt(e*100/(Rv*toK(v.temperature_2m))*1000,2)+' g/m³']] }; }})
.register('heat_index', { group:'comfort', alias:['hi'], formula:'Rothfusz regression (NWS) — valid for T ≥ 27.0 °C and RH ≥ 40 %',
 summary:'Heat index & apparent thermal deviation',
 run(v){
  need(v,['temperature_2m','relative_humidity_2m']);
  const T = v.temperature_2m, RH = v.relative_humidity_2m;
  if(T < 27.0 || RH < 40){
   return { value:T, unit:'°C', d:1, inputs:[['T',fmt(T,1)+' °C'],['RH',fmt(RH,0)+' %']],
    extra:[['ΔT (deviation)', '0.0 °C'],['status', 'outside heat index threshold (T < 27°C or RH < 40%)']],
    note:'Heat index is equal to dry-bulb temperature below threshold' };
  }
  const hi = heatIndexC(T, RH);
  const diff = hi - T;
  const risk = hi >= 54 ? 'EXTREME DANGER (heat stroke imminent)' :
               hi >= 41 ? 'DANGER (cramps, exhaustion & heat stroke likely)' :
               hi >= 32 ? 'EXTREME CAUTION (cramps & exhaustion possible)' : 'CAUTION (fatigue with prolonged activity)';
  return { value:hi, unit:'°C', d:1,
   inputs:[['T',fmt(T,1)+' °C'],['RH',fmt(RH,0)+' %']],
   extra:[['ΔT (deviation)', `${diff>=0?'+':''}${diff.toFixed(1)} °C`],
          ['thermal stress', risk],
          ['apparent_temperature (model)', num(v.apparent_temperature)?fmt(v.apparent_temperature,1)+' °C':'—']],
   note: `Humid air impedes evaporative cooling: thermal load is increased by ${diff.toFixed(1)} °C` };
 }})
.register('wind_chill', { group:'comfort', alias:['wc'], formula:'JAG/TI (2001) formula — valid for T ≤ 10.0 °C and wind ≥ 4.8 km/h',
 summary:'Wind chill factor & convective convective thermal loss',
 run(v){
  need(v,['temperature_2m','wind_speed_10m']);
  const T = v.temperature_2m, spd = v.wind_speed_10m;
  if(T > 10.0 || spd < 4.8){
   return { value:T, unit:'°C', d:1, inputs:[['T',fmt(T,1)+' °C'],['wind',fmt(spd,1)+' km/h']],
    extra:[['ΔT (deviation)', '0.0 °C'],['status', 'outside wind chill threshold (T > 10°C or wind < 4.8 km/h)']],
    note:'Wind chill is equal to ambient temperature under mild/calm conditions' };
  }
  const wc = windChillC(T, spd);
  const diff = wc - T;
  const frostbite = wc <= -40 ? 'SEVERE (frostbite in < 10 minutes)' :
                    wc <= -28 ? 'HIGH RISK (frostbite in ~30 minutes)' :
                    wc <= -15 ? 'MODERATE (hypothermia risk with prolonged exposure)' : 'LOW RISK';
  return { value:wc, unit:'°C', d:1,
   inputs:[['T',fmt(T,1)+' °C'],['wind',fmt(spd,1)+' km/h']],
   extra:[['ΔT (deviation)', `${diff.toFixed(1)} °C`],
          ['frostbite risk', frostbite],
          ['apparent_temperature (model)', num(v.apparent_temperature)?fmt(v.apparent_temperature,1)+' °C':'—']],
   note: `Forced aerodynamic convection accelerates sensible heat loss by ${Math.abs(diff).toFixed(1)} °C` };
 }})
.register('shear', { group:'dynamics', alias:['wind_shear'], formula:'|V80 − V10| (vector difference) / 70 m',
 summary:'Low-level vector wind shear, 10 m → 80 m',
 run(v){ need(v,['wind_speed_10m','wind_direction_10m','wind_speed_80m','wind_direction_80m']);
  const dv = vecShear(v.wind_speed_10m, v.wind_direction_10m, v.wind_speed_80m, v.wind_direction_80m)/3.6;
  return { value:dv, unit:'m/s (10→80 m)', d:2,
   inputs:[['V10', fmt(v.wind_speed_10m,1)+' km/h @ '+fmt(v.wind_direction_10m,0)+'°'],['V80', fmt(v.wind_speed_80m,1)+' km/h @ '+fmt(v.wind_direction_80m,0)+'°']],
   extra:[['gradient', fmt(dv/70*1000,2)+' ×10⁻³ s⁻¹'],['gradient', fmt(dv*KT/70*100,2)+' kt/100 m'],['speed ratio V80/V10', fmt(v.wind_speed_80m/Math.max(v.wind_speed_10m,.1),2)]],
   note: dv/70 > .02 ? 'strong low-level shear' : dv/70 > .01 ? 'moderate shear' : 'weak shear' }; }})
.register('beaufort', { group:'dynamics', alias:['bf'], formula:'Beaufort scale from 10 m wind speed',
 summary:'Beaufort number & description',
 run(v){ need(v,['wind_speed_10m']);
  const n = beaufort(v.wind_speed_10m);
  const names = ['calm','light air','light breeze','gentle breeze','moderate breeze','fresh breeze','strong breeze','near gale','gale','strong gale','storm','violent storm','hurricane force'];
  return { value:n, unit:'Bft', d:0, inputs:[['wind',fmt(v.wind_speed_10m,1)+' km/h']], extra:[['gust', fmt(v.wind_gusts_10m,1)+' km/h'],['direction', fmt(v.wind_direction_10m,0)+'° '+cardinal(v.wind_direction_10m)]], note:names[n] }; }})
.register('pressure_alt', { group:'aviation', alias:['pa'], formula:'PA = 44330.77·(1 − (p/1013.25)^0.190263)',
 summary:'Pressure altitude',
 run(v){ need(v,['surface_pressure']);
  const pa = pressureAlt(v.surface_pressure);
  return { value:pa, unit:'m', d:0, inputs:[['p',fmt(v.surface_pressure,1)+' hPa']], extra:[['feet', fmt(pa*3.28084,0)+' ft']] }; }})
.register('density_alt', { group:'aviation', alias:['da'], formula:'DA = PA + 36.576·(T − T_ISA)   [m]',
 summary:'Density altitude (aircraft / drone performance)',
 run(v){ need(v,['surface_pressure','temperature_2m']);
  const da = densityAlt(v.surface_pressure, v.temperature_2m);
  return { value:da, unit:'m', d:0, inputs:[['p',fmt(v.surface_pressure,1)+' hPa'],['T',fmt(v.temperature_2m,1)+' °C']], extra:[['feet', fmt(da*3.28084,0)+' ft'],['pressure alt', fmt(pressureAlt(v.surface_pressure),0)+' m']] }; }})
.register('sound_speed', { group:'aviation', alias:['mach'], formula:'c = 331.3·√(1 + T/273.15)',
 summary:'Speed of sound',
 run(v){ need(v,['temperature_2m']);
  return { value:soundSpeed(v.temperature_2m), unit:'m/s', d:1, inputs:[['T',fmt(v.temperature_2m,1)+' °C']], extra:[['km/h', fmt(soundSpeed(v.temperature_2m)*3.6,0)]] }; }})
.register('cape', { group:'convection', formula:'CAPE from the model (J/kg) + stability classification',
 summary:'Convective Available Potential Energy (model value) with CIN & lifted index',
 run(v){ need(v,['cape']);
  return { value:v.cape, unit:'J/kg', d:0, inputs:[['model','best_match']],
   extra:[['CIN', fmt(v.convective_inhibition,0)+' J/kg'],['lifted index', fmt(v.lifted_index,1)+(num(v.lifted_index)?'  ('+classify(v.lifted_index,LI_CLS)+')':'')],['max updraft √(2·CAPE)', fmt(Math.sqrt(2*Math.max(v.cape,0)),1)+' m/s']],
   note: classify(v.cape, CAPE_CLS) }; }})
.register('uv', { group:'radiation', alias:['uv_index'], formula:'WHO UV-index categories',
 summary:'UV index & category, with clear-sky comparison',
 
 run(v){ need(v,['uv_index']);
  return { value:v.uv_index, unit:'UVI', d:1, inputs:[['model','best_match']],
   extra:[['clear-sky UVI', fmt(v.uv_index_clear_sky,1)],['cloud attenuation', num(v.uv_index_clear_sky)&&v.uv_index_clear_sky>0 ? fmt((1-v.uv_index/v.uv_index_clear_sky)*100,0)+' %' : '—']],
   note: classify(v.uv_index, UV_CLS) }; }})

.register('solar_budget', { group:'radiation', alias:['solar_flux','rad_budget','irradiance'], formula:'Erbs (1982) decomposition + Brutsaert downwelling longwave',
 summary:'Surface radiative budget (Direct, Diffuse, GHI, Clearness Index & Net Flux)',
 run(v, f){
  need(v,['temperature_2m']);
  const lat = (v.latitude !== undefined ? v.latitude : (f.lat !== undefined ? +f.lat : 41.15));
  const tC = v.temperature_2m;
  const ghi = num(v.shortwave_radiation) ? Math.max(0, v.shortwave_radiation) : 0;
  const clouds = num(v.cloud_cover) ? v.cloud_cover : 0;
  
  // Calculate approximate Solar Zenith Angle
  const dateObj = new Date(v.time || Date.now());
  const dayOfYear = Math.floor((dateObj - new Date(dateObj.getFullYear(), 0, 0)) / 864e5);
  const hour = dateObj.getUTCHours() + dateObj.getUTCMinutes() / 60;
  const delta = 23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear - 172)) * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  const omega = (15 * (hour - 12)) * (Math.PI / 180);
  const cosZenith = Math.max(0, Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(omega));
  const zenithDeg = Math.acos(cosZenith) * (180 / Math.PI);
  
  // Extraterrestrial Irradiance on Horizontal Surface (G0)
  const I0 = 1361.0; // Solar constant W/m2
  const g0 = I0 * cosZenith;
  const kt = g0 > 10 ? Math.min(1.0, ghi / g0) : 0; // Clearness Index
  
  // Erbs decomposition model for Diffuse Fraction (DHI / GHI)
  let dhi = 0;
  if(ghi > 0 && g0 > 10){
    const df = kt <= 0.22 ? (1.0 - 0.09 * kt) :
               kt <= 0.80 ? (0.9511 - 0.1604 * kt + 4.388 * Math.pow(kt, 2) - 16.638 * Math.pow(kt, 3) + 12.336 * Math.pow(kt, 4)) : 0.165;
    dhi = Math.min(ghi, ghi * df);
  }
  const dni = cosZenith > 0.08 ? Math.max(0, (ghi - dhi) / cosZenith) : 0;
  
  // Net Shortwave Absorbed (Albedo alpha ≈ 0.18 for standard ground)
  const albedo = 0.18;
  const netShortwave = ghi * (1 - albedo);
  
  // Downwelling Longwave (Brutsaert clear sky + cloud correction)
  const Tk = toK(tC);
  const vp = num(v.relative_humidity_2m) ? vaporPressure(tC, v.relative_humidity_2m) : 10;
  const epsClear = 1.24 * Math.pow(vp / Tk, 1 / 7);
  const epsEff = epsClear * (1 + 0.22 * Math.pow(clouds / 100, 2));
  const sigmaSB = 5.670374e-8;
  const lwDown = epsEff * sigmaSB * Math.pow(Tk, 4);
  const lwUp = 0.98 * sigmaSB * Math.pow(Tk, 4);
  const netRadiation = netShortwave + (lwDown - lwUp);

  return {
    value: ghi, unit:'W/m²', d:0,
    inputs:[
      ['GHI (Global Horiz.)', fmt(ghi, 0) + ' W/m²'],
      ['Cloud Cover', fmt(clouds, 0) + ' %'],
      ['Solar Zenith', fmt(zenithDeg, 1) + '° (' + (cosZenith <= 0 ? 'Night / Below Horizon' : 'Daylight') + ')']
    ],
    extra:[
      ['Direct Normal (DNI)', fmt(dni, 0) + ' W/m²'],
      ['Diffuse Horiz. (DHI)', fmt(dhi, 0) + ' W/m²'],
      ['Clearness Index (k_t)', fmt(kt, 3) + (kt > 0.65 ? ' [Clear Beam]' : kt > 0.35 ? ' [Intermittent/Partly]' : ' [Overcast/Attenuated]')],
      ['Extraterrestrial G₀', fmt(g0, 0) + ' W/m²'],
      ['Net Shortwave Absorbed', fmt(netShortwave, 0) + ' W/m² (albedo α=0.18)'],
      ['Downwelling Longwave', fmt(lwDown, 0) + ' W/m²'],
      ['Net All-Wave Radiation (R_n)', `${netRadiation >= 0 ? '+' : ''}${fmt(netRadiation, 0)} W/m²`]
    ],
    note: netRadiation > 0 ? 'Surface energy surplus (driving upward sensible & latent heat flux)' : 'Surface radiative cooling deficit (nighttime/inversion regime)'
  };
 }})

   
   

/* derived values used by compare / export / now */
const derivedOf = v => {
 const o = {};
 for(const k of ['air_density','dew_point','lcl','wet_bulb','theta','theta_e','mixing_ratio','shear','pressure_alt','density_alt','sound_speed']){
  try{ o[k] = metrics.get(k).run(v,{}).value; }catch(e){ o[k] = null; }
 }
 return o;
};

/* =====================================================================
   5. DATA LAYER  — async, cached, auto-prunes variables the API rejects
   ===================================================================== */
const HOURLY = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m','surface_pressure','pressure_msl',
 'precipitation','precipitation_probability','rain','snowfall','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','visibility',
 'wind_speed_10m','wind_direction_10m','wind_gusts_10m','wind_speed_80m','wind_direction_80m',
 'shortwave_radiation','direct_normal_irradiance','diffuse_radiation','uv_index','uv_index_clear_sky',
 'cape','lifted_index','convective_inhibition','freezing_level_height','boundary_layer_height','vapor_pressure_deficit','et0_fao_evapotranspiration',
 'soil_temperature_0cm','soil_moisture_0_to_1cm',
 'temperature_850hPa','temperature_500hPa','relative_humidity_850hPa','relative_humidity_500hPa','wind_speed_850hPa','wind_speed_500hPa',
 'wind_direction_850hPa','wind_direction_500hPa','geopotential_height_850hPa','geopotential_height_500hPa'];
const CURRENT = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m','surface_pressure','pressure_msl','wind_speed_10m','wind_direction_10m',
 'wind_gusts_10m','wind_speed_80m','wind_direction_80m','shortwave_radiation','direct_normal_irradiance','diffuse_radiation','vapor_pressure_deficit','cloud_cover','precipitation'];
const DAILY = ['temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_speed_10m_max','wind_gusts_10m_max',
 'uv_index_max','sunrise','sunset','daylight_duration','shortwave_radiation_sum','et0_fao_evapotranspiration'];
const UNITS = { temperature_2m:'°C',apparent_temperature:'°C',relative_humidity_2m:'%',dew_point_2m:'°C',surface_pressure:'hPa',pressure_msl:'hPa',precipitation:'mm',precipitation_probability:'%',
 rain:'mm',snowfall:'cm',cloud_cover:'%',cloud_cover_low:'%',cloud_cover_mid:'%',cloud_cover_high:'%',visibility:'m',wind_speed_10m:'km/h',wind_direction_10m:'°',wind_gusts_10m:'km/h',
 wind_speed_80m:'km/h',wind_direction_80m:'°',shortwave_radiation:'W/m²',direct_normal_irradiance:'W/m²',diffuse_radiation:'W/m²',uv_index:'',uv_index_clear_sky:'',cape:'J/kg',lifted_index:'',
 convective_inhibition:'J/kg',freezing_level_height:'m',boundary_layer_height:'m',vapor_pressure_deficit:'kPa',et0_fao_evapotranspiration:'mm',soil_temperature_0cm:'°C',soil_moisture_0_to_1cm:'m³/m³',
 temperature_850hPa:'°C',temperature_500hPa:'°C',relative_humidity_850hPa:'%',relative_humidity_500hPa:'%',wind_speed_850hPa:'km/h',wind_speed_500hPa:'km/h',wind_direction_850hPa:'°',
 wind_direction_500hPa:'°',geopotential_height_850hPa:'m',geopotential_height_500hPa:'m' };
const ALIAS = { temp:'temperature_2m', t:'temperature_2m', feels:'apparent_temperature', apparent:'apparent_temperature', rh:'relative_humidity_2m', humidity:'relative_humidity_2m',
 dew:'dew_point_2m', dewpoint:'dew_point_2m', pressure:'surface_pressure', p:'surface_pressure', msl:'pressure_msl', wind:'wind_speed_10m', gust:'wind_gusts_10m', gusts:'wind_gusts_10m',
 wind80:'wind_speed_80m', precip:'precipitation', pop:'precipitation_probability', cloud:'cloud_cover', clouds:'cloud_cover', cloud_low:'cloud_cover_low', cloud_mid:'cloud_cover_mid',
 cloud_high:'cloud_cover_high', vis:'visibility', ghi:'shortwave_radiation', solar:'shortwave_radiation', sw:'shortwave_radiation', dni:'direct_normal_irradiance', dhi:'diffuse_radiation',
 uv:'uv_index', li:'lifted_index', cin:'convective_inhibition', freezing:'freezing_level_height', pblh:'boundary_layer_height', vpd:'vapor_pressure_deficit', et0:'et0_fao_evapotranspiration',
 soil_moisture:'soil_moisture_0_to_1cm', soil_temp:'soil_temperature_0cm', t850:'temperature_850hPa', t500:'temperature_500hPa', z500:'geopotential_height_500hPa', z850:'geopotential_height_850hPa' };
const DEFAULT_EXPORT = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m','surface_pressure','pressure_msl','wind_speed_10m','wind_direction_10m',
 'wind_gusts_10m','cloud_cover','precipitation','shortwave_radiation','uv_index','cape','soil_moisture_0_to_1cm','visibility'];

const cache = new Map();
const hourlyLinear = (i,base,amp,ph,lo,hi) => Math.min(hi, Math.max(lo, base + amp*Math.sin(2*Math.PI*((i%24)-ph)/24) + 0.35*amp*Math.sin(i*1.7)));
function mockWeather(pl){
 const t0 = new Date(); t0.setMinutes(0,0,0); t0.setHours(t0.getHours()-48);
 const N = 216, time = Array.from({length:N}, (_,i) => isoLocal(new Date(t0.getTime()+i*3600e3)));
 const M = { temperature_2m:[16,6,9,-5,45], relative_humidity_2m:[62,22,21,5,100], surface_pressure:[1008,4,3,950,1050], wind_speed_10m:[14,8,13,0,80], wind_speed_80m:[22,11,13,0,110],
  shortwave_radiation:[220,260,6,0,950], cape:[300,350,15,0,3500], uv_index:[3,3.2,6,0,11], cloud_cover:[45,30,2,0,100], soil_moisture_0_to_1cm:[.24,.01,3,.05,.45],
  boundary_layer_height:[700,550,8,50,2500], visibility:[24000,6000,5,500,40000], precipitation_probability:[20,18,0,0,100] };
 const hourly = { time };
 for(const k of HOURLY){
  const m = M[k] || (k.startsWith('temperature_8')?[8,2,9,-30,30]: k.startsWith('temperature_5')?[-18,2,9,-50,0]: k.startsWith('geopotential_height_8')?[1500,20,3,1000,2000]: k.startsWith('geopotential_height_5')?[5700,30,3,5000,6000]:
   k.startsWith('wind_speed_')?[40,15,5,0,200]: k.startsWith('wind_direction')?[270,40,5,0,359]: k.startsWith('relative_humidity_')?[50,15,3,0,100]: [0,0,0,-1e9,1e9]);
  hourly[k] = time.map((_,i) => { const x = hourlyLinear(i, ...m); return +x.toFixed(2); });
 }
 hourly.dew_point_2m = hourly.temperature_2m.map((T,i) => +dewPoint(T, Math.max(hourly.relative_humidity_2m[i],5)).toFixed(1));
 hourly.apparent_temperature = hourly.temperature_2m.map(T => +(T-1).toFixed(1));
 hourly.pressure_msl = hourly.surface_pressure.map(p => +(p+11).toFixed(1));
 hourly.wind_gusts_10m = hourly.wind_speed_10m.map(w => +(w*1.6).toFixed(1));
 hourly.wind_direction_10m = hourly.wind_direction_10m.map(d => Math.round(d));
 const days = Array.from({length:9}, (_,d) => time[d*24].slice(0,10));
 const daily = { time:days, temperature_2m_max:days.map((_,i)=>21+Math.sin(i)*2), temperature_2m_min:days.map((_,i)=>13+Math.cos(i)*2), precipitation_sum:days.map((_,i)=>+(i%3?0:2.4).toFixed(1)),
  precipitation_probability_max:days.map((_,i)=>i%3?10:60), wind_speed_10m_max:days.map((_,i)=>22+i), wind_gusts_10m_max:days.map((_,i)=>41+i), uv_index_max:days.map(()=>5.6),
  sunrise:days.map(d=>d+'T07:12'), sunset:days.map(d=>d+'T18:55'), daylight_duration:days.map(()=>42180), shortwave_radiation_sum:days.map(()=>14.2), et0_fao_evapotranspiration:days.map(()=>2.1) };
 const cur = { time: time[48] }; for(const k of CURRENT) cur[k] = hourly[k] ? hourly[k][48] : null;
 return { latitude:pl.lat, longitude:pl.lon, elevation:42, timezone:'mock/UTC', utc_offset_seconds:0, hourly_units:{...UNITS}, hourly, daily, current:cur, _mock:true };
}

async function resolvePlace(name){
 const n = String(name||'').trim();
 if(!n || /^(here|\.|current)$/i.test(n)){
  if(typeof place !== 'undefined' && place) return { lat:place.lat, lon:place.lon, name:place.name, sub:place.sub||'' };
  throw new Error('no location selected in SkyLab yet');
 }
 const m = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(n);
 if(m){
  if(Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) throw new Error(`coordinates out of range: latitude must be -90…90 and longitude -180…180 (got ${m[1]}, ${m[2]})`);
  return { lat:+m[1], lon:+m[2], name:`${(+m[1]).toFixed(3)},${(+m[2]).toFixed(3)}`, sub:'coordinates' };
 }
 if(n.length < 2 || !/\p{L}/u.test(n)) throw new Error(`'${n}' is not a place name or a lat,lon pair`);
 const r = await geo(n, 5);
 if(!r.length) throw new Error(`location not found: "${n}"`);
 const flat = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const q = flat(n), hit = r.find(x => { const f = flat(x.name); return f.includes(q) || q.includes(f); });
 return hit || { ...r[0], fuzzy:true };
}

async function fetchWeather(pl, { refresh=false } = {}){
 const key = `${pl.lat.toFixed(2)},${pl.lon.toFixed(2)}${CFG.mock?'#m':''}`;
 const hit = cache.get(key);
 if(hit && !refresh && Date.now()-hit.t < CFG.cacheMs) return { raw:hit.raw, cached:true, dropped:hit.dropped };
 if(CFG.mock){ await sleep(180); const raw = mockWeather(pl); cache.set(key,{t:Date.now(),raw,dropped:[]}); return { raw, cached:false, dropped:[] }; }
 let hv = [...HOURLY], cv = [...CURRENT], dv = [...DAILY]; const dropped = [];
 for(let tries=0; tries<6; tries++){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pl.lat}&longitude=${pl.lon}&current=${cv.join(',')}&hourly=${hv.join(',')}&daily=${dv.join(',')}&timezone=auto&past_days=2&forecast_days=7`;
  const r = await fetch(url);
  if(r.ok){ const raw = await r.json(); cache.set(key,{t:Date.now(),raw,dropped}); return { raw, cached:false, dropped }; }
  let j = {}; try{ j = await r.json(); }catch(e){}
  const bad = /value\s+'?([A-Za-z0-9_]+)'?/.exec(j.reason||'');
  if(r.status === 400 && bad && [...hv,...cv,...dv].includes(bad[1])){
   dropped.push(bad[1]); hv = hv.filter(x=>x!==bad[1]); cv = cv.filter(x=>x!==bad[1]); dv = dv.filter(x=>x!==bad[1]); continue;
  }
  throw new Error(j.reason || `Open-Meteo HTTP ${r.status}`);
 }
 throw new Error('Open-Meteo rejected too many variables');
}

function buildCtx(pl, raw, extra={}){
 const h = raw.hourly, ct = ((raw.current && raw.current.time) || h.time[0]).slice(0,13)+':00';
 let i0 = h.time.findIndex(t => t >= ct); if(i0 < 0) i0 = 0;
 return { place:pl, raw, i0, fetchedAt:new Date(), ...extra };
}
const hourAt = (ctx,i) => { const o = { time:ctx.raw.hourly.time[i], elevation:ctx.raw.elevation }; for(const k in ctx.raw.hourly) if(k !== 'time') o[k] = ctx.raw.hourly[k][i]; return o; };
const nowVals = ctx => { const o = hourAt(ctx, ctx.i0), c = ctx.raw.current || {}; for(const k in c) if(c[k] !== null && c[k] !== undefined && k !== 'interval') o[k] = c[k]; return o; };
const unitOf = (ctx,k) => (ctx && ctx.raw.hourly_units && ctx.raw.hourly_units[k] !== undefined) ? ctx.raw.hourly_units[k] : (UNITS[k] ?? '');
const resolveVar = (ctx,name) => {
 const n = String(name).toLowerCase(), h = ctx.raw.hourly, k = ALIAS[n] || n;
 if(k !== 'time' && h[k]) return k;
 const m = Object.keys(h).filter(x => x !== 'time' && x.startsWith(n));
 return m.length === 1 ? m[0] : null;
};
const resolveVars = (ctx,str) => {
 const ok = [], bad = [];
 splitList(str).forEach(n => { const k = resolveVar(ctx,n); k ? (ok.includes(k)||ok.push(k)) : bad.push(n); });
 if(bad.length){ const pool = varNamesFor(ctx);
  throw new Error(`unknown variable${bad.length>1?'s':''}: ${bad.map(b => `'${b}'` + hint(b,pool)).join('; ')}  (list them with: vars)`); }
 if(!ok.length) throw new Error('no variable given (see: vars)');
 return { ok, bad };
};
const varNamesFor = ctx => ctx ? [...Object.keys(ctx.raw.hourly).filter(k=>k!=='time'), ...Object.keys(ALIAS)] : Object.keys(ALIAS);
const hhmm = s => (s||'').slice(11,16);
const needCtx = t => { if(!t.ctx) throw new Error("no context loaded — run: fetch -loc <city>"); return t.ctx; };
const winIdx = (ctx, from, hours) => { const n = ctx.raw.hourly.time.length; const a = Math.max(0, Math.min(n-1, from)), b = Math.max(a+1, Math.min(n, from+hours)); return [a,b]; };
const stats = a => {
 const v = a.filter(num); if(!v.length) return null;
 const mean = v.reduce((s,x)=>s+x,0)/v.length, sd = Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length);
 const sorted = [...v].sort((x,y)=>x-y), med = sorted.length%2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
 const n = v.length, xs = v.map((_,i)=>i), mx = (n-1)/2; let sxy = 0, sxx = 0; v.forEach((y,i)=>{ sxy += (xs[i]-mx)*(y-mean); sxx += (xs[i]-mx)**2; });
 return { n, min:Math.min(...v), max:Math.max(...v), mean, sd, med, slope: sxx ? sxy/sxx : 0 };
};

/* =====================================================================
   6. ASCII CHARTS
   ===================================================================== */
const BARS = '▁▂▃▄▅▆▇█';
function sparkline(vals, lo, hi){
 const v = vals.filter(num); if(!v.length) return '';
 const mn = lo ?? Math.min(...v), mx = hi ?? Math.max(...v);
 return vals.map(x => !num(x) ? ' ' : BARS[mx === mn ? 3 : Math.max(0, Math.min(7, Math.round((x-mn)/(mx-mn)*7)))]).join('');
}
function blockChart(vals, rows){
 const v = vals.filter(num), mn = Math.min(...v), mx = Math.max(...v), out = [];
 for(let r = rows-1; r >= 0; r--){
  out.push(vals.map(x => { if(!num(x)) return ' '; const lvl = mx===mn ? rows*4 : (x-mn)/(mx-mn)*rows*8; const e = Math.max(0, Math.min(8, Math.round(lvl - r*8))); return e ? BARS[e-1] : ' '; }).join(''));
 }
 return out;
}
function timeAxis(times, step=6){
 const a = Array(times.length).fill(' ');
 times.forEach((t,i) => { if(i % step === 0){ const lab = t.slice(11,13); a[i] = lab[0]; if(i+1 < a.length) a[i+1] = lab[1]; } });
 return a.join('');
}

/* JSON as a collapsible tree (details/summary) */
function jsonTree(v, open = 1, key = null){
 const k = key === null ? '' : `<span class="tk-key">${esc(JSON.stringify(key))}</span>: `;
 if(v === null || v === undefined) return k + '<span class="tk-null">null</span>';
 if(typeof v === 'string') return k + `<span class="tk-str">${esc(JSON.stringify(v))}</span>`;
 if(typeof v === 'number') return k + `<span class="tk-num">${v}</span>`;
 if(typeof v === 'boolean') return k + `<span class="tk-bool">${v}</span>`;
 const arr = Array.isArray(v), ent = arr ? v.map((x,i)=>[i,x]) : Object.entries(v), o = arr ? '[' : '{', c = arr ? ']' : '}';
 if(!ent.length) return k + o + c;
 if(arr && v.length > 8 && v.every(x => x === null || typeof x !== 'object'))
  return `<details class="jt"><summary>${k}${o}<span class="tk-null"> ${v.length} items · ${esc(v.slice(0,4).join(', '))}, … </span>${c}</summary><div class="jt-in">${esc(v.join(', '))}</div></details>`;
 return `<details class="jt"${open>0?' open':''}><summary>${k}${o}<span class="tk-null"> ${ent.length} ${arr?'items':'keys'}</span></summary><div class="jt-in">${ent.map(([kk,x]) => `<div>${jsonTree(x, open-1, arr?null:kk)}</div>`).join('')}</div><div class="jt-end">${c}</div></details>`;
}

/* =====================================================================
   7. OUTPUT RENDERER  — stdout-style blocks appended to the DOM
   ===================================================================== */
function textTable(head, rows, align = []){
 const w = head.map((h,i) => Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length)));
 const cell = (s,i) => align[i] === 'r' ? String(s).padStart(w[i]) : String(s).padEnd(w[i]);
 const line = r => r.map((c,i) => cell(c ?? '', i)).join('  ').replace(/\s+$/,'');
 return { head:line(head), sep:w.map(n => '─'.repeat(n)).join('  '), rows:rows.map(line) };
}
class Out{
 constructor(el){ this.el = el; this.plain = []; }
 html(h, plain = ''){ const d = document.createElement('div'); d.className = 'cli-ln'; d.innerHTML = h; this.el.appendChild(d); this.plain.push(plain); return d; }
 line(t = '', cls = ''){ return this.html(`<span class="${cls}">${esc(t)}</span>`, t); }
 ok(t){ return this.line(t,'c-ok'); } err(t){ return this.line(t,'c-err'); } warn(t){ return this.line(t,'c-warn'); } dim(t){ return this.line(t,'c-dim'); } hd(t){ return this.line(t,'c-hd'); }
 pre(t, cls = ''){ return this.html(`<pre class="cli-pre ${cls}">${esc(t)}</pre>`, t); }
 table(head, rows, align){
  const t = textTable(head, rows, align);
  return this.html(`<pre class="cli-pre"><span class="c-hd">${esc(t.head)}</span>\n<span class="c-dim">${esc(t.sep)}</span>\n${esc(t.rows.join('\n'))}</pre>`, [t.head,t.sep,...t.rows].join('\n'));
 }
 kv(pairs, indent = 2){
  const w = Math.max(...pairs.map(p => String(p[0]).length));
  const txt = pairs.map(([k,v]) => ' '.repeat(indent) + String(k).padEnd(w) + '  ' + v).join('\n');
  const htm = pairs.map(([k,v]) => ' '.repeat(indent) + `<span class="c-dim">${esc(String(k).padEnd(w))}</span>  ${esc(v)}`).join('\n');
  return this.html(`<pre class="cli-pre">${htm}</pre>`, txt);
 }
 section(t){ return this.html(`<span class="c-hd">${esc(t)}</span>`, t); }
}

/* =====================================================================
   8. TERMINAL CLASS  — state, input handling, routing
   ===================================================================== */
class Terminal{
 constructor({ outEl, inEl, psEl, scrollEl }){
  const HIST0 = (Array.isArray(lsGet('termHist')) ? lsGet('termHist') : []).filter(x => typeof x === 'string').slice(-CFG.histMax);
  Object.assign(this, { outEl, inEl, psEl, scrollEl, history:HIST0, hIdx:HIST0.length, draft:'', ctx:null, busy:false, lastText:'', theme:'modern' });
  this.inEl.addEventListener('keydown', e => this.onKey(e));
  const hlSpan = inEl.parentElement && inEl.parentElement.querySelector('.cli-hl > span');
  if(hlSpan){                                                   // camada colorida por baixo do <input> (texto do input é transparente)
   const sync = () => { hlSpan.innerHTML = hlCmd(inEl.value); hlSpan.style.transform = `translateX(${-inEl.scrollLeft}px)`; };
   const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
   Object.defineProperty(inEl, 'value', { configurable:true, get(){ return d.get.call(this); }, set(v){ d.set.call(this, v); sync(); } });   // apanha também histórico, Tab e limpeza após Enter
   ['input','keydown','keyup','click','mouseup','focus','select','scroll'].forEach(ev => inEl.addEventListener(ev, () => requestAnimationFrame(sync)));
   sync();
  }
 }
 ps1(){ const slug = this.ctx ? this.ctx.place.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') : 'void'; return `skylab@${slug}:~$`; }
 paintPrompt(){ this.psEl.innerHTML = esc(this.ps1()).replace('@','<i>@</i>').replace(':~$','<i>:~$</i>'); }
 clear(){ this.outEl.innerHTML = ''; }
 reset(){ this.clear(); this.ctx = null; this.lastText = ''; this.paintPrompt(); }
 block(cmd){
  const b = document.createElement('div'); b.className = 'cli-block';
  b.innerHTML = `<div class="cli-echo"><span class="cli-ps1">${esc(this.ps1())}</span> ${hlCmd(cmd)}</div><div class="cli-res"></div>`;
  this.outEl.appendChild(b);
  return new Out(b.querySelector('.cli-res'));
 }
 scroll(){ this.scrollEl.scrollTop = this.scrollEl.scrollHeight; }
 setBusy(v){ this.busy = v; this.inEl.disabled = v; this.inEl.closest('.cli-prompt').classList.toggle('busy', v); if(!v) this.inEl.focus(); }

 async exec(raw){
  let line = String(raw||'').trim();
  const bang = /^!(!|\d+)$/.exec(line);
  if(bang){ const i = bang[1] === '!' ? this.history.length : +bang[1]; line = this.history[i-1] || ''; if(!line){ this.block(raw).err('history: event not found'); return; } }
  const out = this.block(line);
  if(!line) return;
if(this.history[this.history.length-1] !== line){ this.history.push(line); if(this.history.length > CFG.histMax) this.history.shift(); lsSet('termHist', this.history); }
  this.hIdx = this.history.length; this.draft = '';
  let tokens;
  try{ tokens = tokenize(line); }catch(e){ out.err(`parse error: ${e.message}`); return; }
      if(!tokens.length) return;
      const name = tokens.shift().toLowerCase(), def = commands.get(name);
      if(!def){
        out.err(`Error: Command not found. Type 'help' for available commands.`);
        const near = suggest(name, commands.names());
        if(near.length) out.dim(`did you mean: ${near.join(', ')}?`);
        this.scroll(); return;
      }
      const { args, flags, errors } = parseArgs(tokens, def.flags);
      if(errors.length){ 
        out.err(`Error: Syntax/argument error in '${def.name}': ${errors.join('; ')}`); 
        out.dim(`Usage: ${def.usage}`); 
        this.scroll(); return; 
      }
      // Central command contract: commands may only receive positional arguments
      // explicitly supported by their existing syntax. This closes the old gap
      // where commands without maxArgs silently accepted arbitrary trailing words.
      const positionalLimits = {
        help:1, fetch:1, filter:1, vars:1, calc:1, delta:1, plot:1, stats:1,
        simulate:1, export:1, theme:1, mock:1, echo:Infinity, storms:1
      };
      const maxArgs = def.maxArgs !== undefined ? def.maxArgs : (positionalLimits[def.name] ?? 0);
      const fallbackArgFlags = { fetch:'loc', filter:'vars', delta:'time', plot:'var', stats:'var', export:'format' };
      const fallbackFlag = fallbackArgFlags[def.name];
      if(fallbackFlag && flags[fallbackFlag] !== undefined && args.length){
        out.err(`Error: '${def.name}' received both '--${fallbackFlag}' and positional argument(s). Choose one input form.`);
        out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
      }
      if(args.length > maxArgs){
        out.err(`Error: Unexpected argument(s) for '${def.name}': ${args.slice(maxArgs).map(a => `'${a}'`).join(', ')}.`);
        out.dim(`Usage: ${def.usage || def.name}`);
        this.scroll(); return;
      }
      if(def.minArgs !== undefined && args.length < def.minArgs){
        out.err(`Error: Missing required arguments for '${def.name}'. Expected at least ${def.minArgs} argument(s).`);
        out.dim(`Usage: ${def.usage || def.name}`);
        this.scroll(); return;
      }
      // Reject invalid inline boolean values and duplicate flags instead of
      // coercing arbitrary text into true or silently overriding earlier input.
      const flagTokens = tokens.filter(t => /^--?[A-Za-z_][\w-]*(?:=.*)?$/.test(t));
      const seenFlags = new Set();
      for(const token of flagTokens){
        const rawFlag = token.split('=',1)[0].replace(/^--?/,'').toLowerCase();
        const specEntry = Object.entries(def.flags||{}).find(([k,v]) => k.toLowerCase()===rawFlag || (v.alias||[]).some(a=>a.toLowerCase()===rawFlag));
        if(!specEntry) continue; // parseArgs already reports unknown flags
        const [key, spec] = specEntry;
        if(seenFlags.has(key)){
          out.err(`Error: Flag '${token.split('=',1)[0]}' was supplied more than once.`);
          out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
        }
        seenFlags.add(key);
        const eq = token.indexOf('=');
        if((spec.type||'bool')==='bool' && eq>=0 && !/^(1|0|true|false|yes|no|on|off)$/i.test(token.slice(eq+1))){
          out.err(`Error: '${token}' is not a valid boolean flag value (use true/false or omit '=…').`);
          out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
        }
      }
      // Validate common numeric options before any command executes; otherwise
      // strings such as '--hours banana' could silently fall back to defaults.
      // [min, max] per flag; a "command.flag" entry overrides the generic "flag" one.
      const RANGES = { at:[-48,168], time:[-48,168], hours:[1,216], 'plot.hours':[2,168], 'stats.hours':[2,216], 'export.hours':[0,216], back:[0,48], rows:[1,12],
        'view.depth':[0,10], depth:[1,5000], alt:[1,6000], dtemp:[0,30], wind:[0,300], source:[0.001,100000], t:[-90,60], rh:[0,100], p:[100,1100], days:[7,46] };
      const NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;
      const bail = msg => { out.err('Error: ' + msg); out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); };
      for(const [key, value] of Object.entries(flags)){
        const rg = RANGES[def.name + '.' + key] || RANGES[key];
        if(!rg) continue;
        if(typeof value !== 'string' || !NUM.test(value.trim())){ bail(`'--${key}' requires a number; received '${value}'.`); return; }
        if(+value < rg[0] || +value > rg[1]){ bail(`'--${key}' must be between ${rg[0]} and ${rg[1]}; received ${value}.`); return; }
      }
      if(flags.steps !== undefined && !splitList(flags.steps).every(x => /^[+-]?\d+$/.test(x))){ bail(`'--steps' must be whole hour offsets such as 3,6,12,24; received '${flags.steps}'.`); return; }
      if(flags.stability !== undefined && !/^[A-Fa-f]$/.test(flags.stability)){ bail(`'--stability' must be a Pasquill class A-F; received '${flags.stability}'.`); return; }
      // Validate command-specific enumerated values centrally.
      const enumArgs = { theme:['modern','retro','amber'], mock:['on','off','1','0','true','false'] };
      if(enumArgs[def.name] && args[0] && !enumArgs[def.name].includes(args[0].toLowerCase())){
        out.err(`Error: Invalid value '${args[0]}' for '${def.name}'. Expected: ${enumArgs[def.name].join(' | ')}.`);
        out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
      }
      const enumFlags = { format: exporters.names() };
      for(const [key, allowed] of Object.entries(enumFlags)){
        if(flags[key] !== undefined && !allowed.includes(String(flags[key]).toLowerCase())){
          out.err(`Error: Invalid value '${flags[key]}' for '--${key}'. Expected: ${allowed.join(' | ')}.`);
          out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
        }
      }
      // Reject placeholder-like syntax for any positional argument (except echo,
      // whose purpose is to print literal text), not just the fetch command.
      const malformedValue = value => /[()[\]{}]/.test(String(value));
      const malformedArgs = def.name !== 'echo' && args.some(malformedValue);
      const malformedFlags = Object.values(flags).some(value => typeof value === 'string' && malformedValue(value));
      if(malformedArgs || malformedFlags){
        out.err(`Error: Invalid argument syntax for '${def.name}'. Remove placeholder brackets/parentheses and provide a real value.`);
        out.dim(`Usage: ${def.usage || def.name}`);
        this.scroll(); return;
      }
  this.setBusy(true);
  try{ await def.run({ term:this, out, args, flags, line }); }
  catch(e){ out.err(`${def.name}: ${e.message}`); }
  finally{
   if(!def.keepLast) this.lastText = out.plain.join('\n');
   this.paintPrompt(); this.setBusy(false); this.scroll();
  }
 }

 onKey(e){
  const el = this.inEl;
  if(e.key === 'Enter'){ e.preventDefault(); if(this.busy) return; const v = el.value; el.value = ''; this.exec(v); }
  else if(e.key === 'ArrowUp'){
   e.preventDefault(); if(!this.history.length) return;
   if(this.hIdx === this.history.length) this.draft = el.value;
   this.hIdx = Math.max(0, this.hIdx-1); el.value = this.history[this.hIdx]; el.setSelectionRange(el.value.length, el.value.length);
  } else if(e.key === 'ArrowDown'){
   e.preventDefault(); if(this.hIdx >= this.history.length) return;
   this.hIdx++; el.value = this.hIdx === this.history.length ? this.draft : this.history[this.hIdx];
  } else if(e.key === 'Tab'){ e.preventDefault(); this.complete(); }
  else if(e.ctrlKey && e.key.toLowerCase() === 'l'){ e.preventDefault(); this.clear(); }
  else if(e.ctrlKey && e.key.toLowerCase() === 'c' && el.selectionStart === el.selectionEnd){ e.preventDefault(); if(el.value){ this.block(el.value + '^C'); el.value = ''; } }
 }

 complete(){
  const el = this.inEl, head = el.value.slice(0, el.selectionStart ?? el.value.length), parts = head.split(/\s+/), last = parts[parts.length-1] || '';
  let pool = [];
  if(parts.length <= 1) pool = commands.names();
  else { const def = commands.get(parts[0]); if(def && def.complete) pool = def.complete(parts.slice(1), this) || []; }
  const cut = last.lastIndexOf(',') + 1, pre = last.slice(0,cut), seg = last.slice(cut).toLowerCase();
  const hits = [...new Set(pool)].filter(n => n.toLowerCase().startsWith(seg));
  if(!hits.length) return;
  let cp = hits[0]; for(const h of hits) while(!h.toLowerCase().startsWith(cp.toLowerCase())) cp = cp.slice(0,-1);
  const rest = el.value.slice(el.selectionStart ?? el.value.length);
  const base = head.slice(0, head.length - last.length) + pre + cp + (hits.length === 1 ? ' ' : '');
  el.value = base + rest;
  if(hits.length > 1){ const o = this.block(head); o.dim(hits.slice(0,40).join('  ')); this.scroll(); }
 }

 async boot(){
  this.reset();
  const o = this.block('boot --skylab');
  const logo = ['╔═╗╦╔═╦ ╦╦  ╔═╗╔╗ ','╚═╗╠╩╗╚╦╝║  ╠═╣╠╩╗','╚═╝╩ ╩ ╩ ╩═╝╩ ╩╚═╝'];
  const retro = this.theme !== 'modern', delay = (retro && !reduced()) ? 70 : 0;
  for(const l of logo){ o.pre(l, 'c-acc cli-logo'); if(delay) await sleep(delay); }
  o.dim(`SkyLab Terminal v${CFG.version} · atmospheric physics CLI · type 'help' or press Tab`);
  if(delay){ await sleep(120); o.ok('[ OK ] telemetry link established'); await sleep(90); o.ok('[ OK ] physics kernel loaded: ' + metrics.list().length + ' metrics, ' + exporters.list().length + ' exporters'); await sleep(90); }
  this.scroll();
  await this.exec('fetch');
 }
}

/* =====================================================================
   9. COMMANDS
   ===================================================================== */
const GROUPS = { data:'DATA & STATE', parse:'PARSING & FILTERING', math:'ATMOSPHERIC MATH', compare:'COMPARISON', viz:'VISUALIZATION', export:'EXPORT', sys:'SYSTEM' };
const varComplete = (parts, t) => varNamesFor(t.ctx);
const plusH = n => (n>=0?'+':'') + n + 'h';

commands
.register('help', { group:'sys', alias:['?','man'], usage:'help [command]', summary:'List commands, or show the manual of one',
 complete:(p)=>commands.names(),
 run({ out, args }){
  if(args[0]){
   const d = commands.get(args[0]); if(!d) throw new Error(`no manual entry for '${args[0]}'`);
   out.section(d.name.toUpperCase() + (d.alias && d.alias.length ? `   (aliases: ${d.alias.join(', ')})` : ''));
   out.line('  ' + d.summary); out.line(); out.line('  usage:    ' + d.usage);
   const fl = Object.entries(d.flags||{}); if(fl.length){ out.line('  flags:'); out.kv(fl.map(([n,f]) => ['--'+n+(f.alias&&f.alias.length?' (-'+f.alias.join(', -')+')':''), (f.type||'bool')+(f.help?' · '+f.help:'')]), 4); }
   if(d.examples){ out.line('  examples:'); d.examples.forEach(x => out.line('    $ ' + x, 'c-acc')); }
   if(d.name === 'calc'){ out.line(); out.line('  metrics:'); out.kv(metrics.list().map(m => [m.name, m.summary]), 4); }
   if(d.name === 'export'){ out.line(); out.line('  formats:'); out.kv(exporters.list().map(m => [m.name, m.summary]), 4); }
   return;
  }
  for(const [g,label] of Object.entries(GROUPS)){
   const list = commands.list().filter(c => c.group === g); if(!list.length) continue;
   out.section(label); out.kv(list.map(c => [c.name, c.summary])); out.line();
  }
  out.dim("tips: Tab = autocomplete · ↑/↓ = history · !! / !n = re-run · Ctrl+L = clear · Esc = close");
  out.dim("      'fetch -loc \"new york\"' loads a city; every other command works on that context");
 }})
.register('fetch', { group:'data', alias:['load'], usage:'fetch [-loc <city|lat,lon>] [--refresh]', summary:'Fetch Open-Meteo data for a city and set it as the active context', maxArgs:1,
 flags:{ loc:{type:'list',alias:['l'],help:'city name, "lat,lon", or "here"'}, refresh:{type:'bool',alias:['r'],help:'bypass the 10-min cache'} },
 examples:['fetch -loc lisbon','fetch -loc "new york"','fetch --loc 35.68,139.69','fetch   # reload the SkyLab location'],
 async run({ term, out, args, flags }){
  const q = flags.loc || args.join(' ');
  out.dim(q ? `resolving "${q}" …` : 'resolving SkyLab location …');
  const pl = await resolvePlace(q);
  if(pl.fuzzy) out.warn(`  ! no exact match for "${q}" — using the closest result. Check it is the place you meant, or use lat,lon.`);
  out.dim(CFG.mock ? 'GET mock://skylab …' : 'GET api.open-meteo.com/v1/forecast …');
  const r = await fetchWeather(pl, { refresh:flags.refresh });
  term.ctx = buildCtx(pl, r.raw, { cached:r.cached, dropped:r.dropped });
  const h = r.raw.hourly, nv = Object.keys(h).length - 1;
  out.ok(`✓ context set — ${h.time.length} hourly rows × ${nv} variables · ${r.raw.daily ? r.raw.daily.time.length : 0} days · elevation ${r.raw.elevation ?? '?'} m · ${r.raw.timezone || ''}`);
  out.dim(`  now = ${r.raw.current ? r.raw.current.time : h.time[term.ctx.i0]}${r.cached ? ' · served from cache' : ''}${r.raw._mock ? ' · MOCK DATA' : ''}`);
  if(r.dropped.length) out.warn(`  ! API rejected ${r.dropped.length} variable(s): ${r.dropped.join(', ')} — they are skipped`);
 }})
.register('clear', { group:'data', alias:['cls'], usage:'clear', summary:'Clear the terminal output', maxArgs:0, keepLast:true, run({ term }){ term.clear(); }})
.register('history', { group:'data', alias:['hist'], usage:'history [-c]', summary:'List the command history (-c to wipe it)',
 flags:{ c:{type:'bool',help:'clear history'} },
 run({ term, out, flags }){
  if(flags.c){ term.history.length = 0; term.hIdx = 0; out.ok('history cleared'); return; }
  if(!term.history.length){ out.dim('(empty)'); return; }
  out.pre(term.history.map((h,i) => String(i+1).padStart(4) + '  ' + h).join('\n'));
  out.dim('re-run with !<n> or !!');
 }})
.register('status', { group:'data', alias:['info','ctx'], usage:'status', summary:'Show the active context (location, rows, variables, cache)', maxArgs:0,
 run({ term, out }){
  const c = term.ctx; if(!c){ out.warn('context: empty — run  fetch -loc <city>'); return; }
  const h = c.raw.hourly;
  out.kv([['location', `${c.place.name}${c.place.sub ? ', ' + c.place.sub : ''}`],['coordinates', `${c.place.lat.toFixed(4)}, ${c.place.lon.toFixed(4)}`],['elevation', `${c.raw.elevation ?? '?'} m`],['timezone', c.raw.timezone || '?'],
   ['now (row)', `${h.time[c.i0]}  [${c.i0}]`],['range', `${h.time[0]} → ${h.time[h.time.length-1]}  (${h.time.length} rows)`],['variables', `${Object.keys(h).length-1} hourly · ${Object.keys(c.raw.daily||{}).length-1} daily`],
   ['fetched', c.fetchedAt.toLocaleTimeString()],['cache', `${cache.size} location(s) · TTL ${CFG.cacheMs/60000} min`],['mode', CFG.mock ? 'MOCK' : 'live Open-Meteo'],['theme', term.theme]]);
  if(c.dropped && c.dropped.length) out.warn(`  skipped by API: ${c.dropped.join(', ')}`);
 }})
.register('view', { group:'parse', alias:['cat'], usage:'view --raw [--path hourly.cape] [--depth n]', summary:'Dump the current state as a collapsible JSON tree',
 flags:{ raw:{type:'bool',help:'full JSON tree'}, path:{type:'str',help:'dot path, e.g. current or hourly.temperature_2m'}, depth:{type:'str',help:'levels opened by default (1)'} },
 examples:['view --raw','view --raw --path current','view --raw --path daily --depth 2'],
 complete:()=>['--raw','--path','--depth'],
 run({ term, out, flags }){
  const c = needCtx(term);
  if(!flags.raw){ out.dim('tip: use --raw for the JSON tree · see also: now, status'); return; }
  let v = { place:c.place, i0:c.i0, ...c.raw };
  if(flags.path){ for(const k of flags.path.split('.')){ if(v === null || typeof v !== 'object' || !(k in v)) throw new Error(`path not found: ${flags.path}`); v = v[k]; } }
  out.html(jsonTree(v, flags.depth ? +flags.depth : 1), JSON.stringify(v, null, 2));
 }})
.register('filter', { group:'parse', alias:['grep'], usage:'filter --vars v1,v2,… [--steps 3,6,12,24]', summary:'Table of selected variables: now + forecast steps',
 flags:{ vars:{type:'list',alias:['v'],help:'comma list; aliases ok (uv, cape, soil_moisture, cloud_low…)'}, steps:{type:'str',help:'hour offsets (default 3,6,12,24)'} },
 examples:['filter --vars shortwave_radiation,cape,soil_moisture,uv_index,cloud_cover_low','filter --vars temp,wind,pressure --steps 1,2,3'],
 complete:varComplete,
 run({ term, out, args, flags }){
  const c = needCtx(term), want = flags.vars || args.join(' ');
  if(!want) throw new Error('missing --vars (try: filter --vars temp,cape,uv)');
  const { ok, bad } = resolveVars(c, want);
  if(bad.length) out.warn(`unknown variable(s): ${bad.join(', ')}  (see: vars)`);
  if(!ok.length) return;
  const steps = splitList(flags.steps || '3,6,12,24').map(Number).filter(Number.isFinite), n = c.raw.hourly.time.length;
  const rows = ok.map(k => { const a = c.raw.hourly[k], now = nowVals(c)[k];
   return [k, dispU(unitOf(c,k)) || '-', fmt(now,2), ...steps.map(s => c.i0+s < n && c.i0+s >= 0 ? fmt(a[c.i0+s],2) : '—')]; });
  out.table(['VARIABLE','UNIT','NOW', ...steps.map(plusH)], rows, ['l','l','r', ...steps.map(()=>'r')]);
 }})
.register('vars', { group:'parse', alias:['ls'], usage:'vars [prefix]', summary:'List every variable in the context with unit and current value',
 complete:varComplete,
 run({ term, out, args }){
  const c = needCtx(term), v = nowVals(c), pf = (args[0]||'').toLowerCase();
  const keys = Object.keys(c.raw.hourly).filter(k => k !== 'time' && (!pf || k.includes(pf)));
  if(!keys.length) throw new Error(`no variable matches '${pf}'` + hint(pf, varNamesFor(c)));
  const al = {}; for(const [a,k] of Object.entries(ALIAS)) (al[k] = al[k] || []).push(a);
  out.table(['VARIABLE','UNIT','NOW','ALIASES'], keys.map(k => [k, dispU(unitOf(c,k)) || '-', fmt(v[k],2), (al[k]||[]).join(' ')]), ['l','l','r','l']);
  out.dim(`${keys.length} variable(s)`);
 }})
.register('now', { group:'parse', alias:['matrix','snapshot'], usage:'now [--at <hours>]', summary:'Full atmospheric snapshot: thermo, wind, radiation, convection, soil, upper air',
 flags:{ at:{type:'str',help:'hour offset from now (e.g. 6, -3)'} },
 run({ term, out, flags }){
  const c = needCtx(term), off = flags.at ? +flags.at : 0, i = c.i0 + off, n = c.raw.hourly.time.length;
  if(!Number.isFinite(off) || i < 0 || i >= n) throw new Error(`--at out of range (${-c.i0}…${n-1-c.i0})`);
  const v = off ? hourAt(c,i) : nowVals(c), d = derivedOf(v), U = k => dispU(unitOf(c,k));
  const row = (label,k,dec=1,u) => [label, `${fmt(v[k],dec)} ${u ?? U(k)}`.trim()];
  out.hd(`▌ ${c.place.name} · ${v.time || c.raw.hourly.time[i]} ${off ? `(${plusH(off)})` : '(now)'}`);
  out.section('[01] THERMODYNAMICS & MOISTURE');
  out.kv([row('temperature','temperature_2m'),row('apparent','apparent_temperature'),row('dew point','dew_point_2m'),['spread T−Td', fmt(v.temperature_2m-v.dew_point_2m,1)+' °C'],row('humidity','relative_humidity_2m',0),
   row('surface pressure','surface_pressure'),row('MSL pressure','pressure_msl'),row('VPD','vapor_pressure_deficit',2),['wet-bulb', fmt(d.wet_bulb,1)+' °C'],['θ / θe', fmt(d.theta,1)+' K / '+fmt(d.theta_e,1)+' K'],
   ['air density', fmt(d.air_density,4)+' kg/m³'],['mixing ratio', fmt(d.mixing_ratio,2)+' g/kg'],['LCL', fmt(d.lcl,0)+' m AGL']]);
  out.section('[02] KINEMATICS');
  out.kv([['wind 10 m', `${fmt(v.wind_speed_10m,1)} km/h @ ${fmt(v.wind_direction_10m,0)}° ${cardinal(v.wind_direction_10m)}  (Bft ${num(v.wind_speed_10m)?beaufort(v.wind_speed_10m):'—'})`],
   ['wind 80 m', `${fmt(v.wind_speed_80m,1)} km/h @ ${fmt(v.wind_direction_80m,0)}° ${cardinal(v.wind_direction_80m)}`],row('gusts','wind_gusts_10m'),['shear 10→80 m', fmt(d.shear,2)+' m/s'],row('boundary layer','boundary_layer_height',0),['speed of sound', fmt(d.sound_speed,1)+' m/s']]);
  out.section('[03] RADIATION & CLOUDS');
  out.kv([row('shortwave (GHI)','shortwave_radiation',0),row('direct normal (DNI)','direct_normal_irradiance',0),row('diffuse (DHI)','diffuse_radiation',0),row('UV index','uv_index'),row('clouds total','cloud_cover',0),
   ['clouds L / M / H', `${fmt(v.cloud_cover_low,0)} / ${fmt(v.cloud_cover_mid,0)} / ${fmt(v.cloud_cover_high,0)} %`],['visibility', num(v.visibility) ? fmt(v.visibility/1000,1)+' km' : '—']]);
  out.section('[04] CONVECTION & PRECIPITATION');
  out.kv([['CAPE', `${fmt(v.cape,0)} J/kg${num(v.cape) ? '  ('+classify(v.cape,CAPE_CLS)+')' : ''}`],row('CIN','convective_inhibition',0),['lifted index', `${fmt(v.lifted_index,1)}${num(v.lifted_index) ? '  ('+classify(v.lifted_index,LI_CLS)+')' : ''}`],
   row('freezing level','freezing_level_height',0),row('precipitation','precipitation',2),row('precip. prob.','precipitation_probability',0),row('snowfall','snowfall',2)]);
  out.section('[05] SURFACE & SOIL');
  out.kv([row('soil temp (0 cm)','soil_temperature_0cm'),row('soil moisture (0–1 cm)','soil_moisture_0_to_1cm',3),row('ET₀','et0_fao_evapotranspiration',2)]);
  out.section('[06] UPPER AIR');
  out.kv([['850 hPa', `${fmt(v.temperature_850hPa,1)} °C · ${fmt(v.wind_speed_850hPa,0)} km/h @ ${fmt(v.wind_direction_850hPa,0)}° · Z ${fmt(v.geopotential_height_850hPa,0)} m`],
   ['500 hPa', `${fmt(v.temperature_500hPa,1)} °C · ${fmt(v.wind_speed_500hPa,0)} km/h @ ${fmt(v.wind_direction_500hPa,0)}° · Z ${fmt(v.geopotential_height_500hPa,0)} m`]]);
 }})
.register('daily', { group:'parse', alias:['week'], usage:'daily', summary:'7-day table: min/max, rain, wind, UV, sunrise/sunset, solar energy', maxArgs:0,
 run({ term, out }){
  const c = needCtx(term), d = c.raw.daily; if(!d) throw new Error('no daily data in context');
  const g = (k,i,dec=1) => d[k] ? fmt(d[k][i],dec) : '—';
  const rows = d.time.map((t,i) => [t.slice(5), g('temperature_2m_min',i), g('temperature_2m_max',i), g('precipitation_sum',i), g('precipitation_probability_max',i,0), g('wind_speed_10m_max',i,0), g('wind_gusts_10m_max',i,0), g('uv_index_max',i),
   d.sunrise ? hhmm(d.sunrise[i]) : '—', d.sunset ? hhmm(d.sunset[i]) : '—', d.shortwave_radiation_sum ? g('shortwave_radiation_sum',i) : '—', g('et0_fao_evapotranspiration',i,1)]);
  out.table(['DATE','TMIN','TMAX','RAIN','POP%','WIND','GUST','UVMAX','RISE','SET','MJ/m²','ET0'], rows, ['l','r','r','r','r','r','r','r','l','l','r','r']);
 }})
.register('upper', { group:'parse', alias:['sounding'], usage:'upper [--at <hours>]', summary:'Upper-air levels (850/500 hPa), lapse rate and stability', maxArgs:0,
 flags:{ at:{type:'str',help:'hour offset from now'} },
 run({ term, out, flags }){
  const c = needCtx(term), off = flags.at ? +flags.at : 0, v = off ? hourAt(c, c.i0+off) : nowVals(c);
  const rows = [['SFC', fmt(v.surface_pressure,0), fmt(c.raw.elevation,0), fmt(v.temperature_2m,1), fmt(v.relative_humidity_2m,0), fmt(v.wind_speed_10m,0), fmt(v.wind_direction_10m,0)],
   ['850', '850', fmt(v.geopotential_height_850hPa,0), fmt(v.temperature_850hPa,1), fmt(v.relative_humidity_850hPa,0), fmt(v.wind_speed_850hPa,0), fmt(v.wind_direction_850hPa,0)],
   ['500', '500', fmt(v.geopotential_height_500hPa,0), fmt(v.temperature_500hPa,1), fmt(v.relative_humidity_500hPa,0), fmt(v.wind_speed_500hPa,0), fmt(v.wind_direction_500hPa,0)]];
  out.table(['LEVEL','hPa','Z(m)','T(°C)','RH(%)','V(km/h)','DIR(°)'], rows, ['l','r','r','r','r','r','r']);
  if(num(v.temperature_850hPa) && num(v.temperature_500hPa) && num(v.geopotential_height_850hPa) && num(v.geopotential_height_500hPa)){
   const lr = (v.temperature_850hPa - v.temperature_500hPa)/((v.geopotential_height_500hPa - v.geopotential_height_850hPa)/1000);
   out.kv([['lapse rate 850–500', fmt(lr,2)+' °C/km  ('+(lr > 9.8 ? 'absolutely unstable' : lr > 7 ? 'conditionally unstable' : lr > 5 ? 'near moist-adiabatic' : 'stable')+')'],
    ['T850 − T500', fmt(v.temperature_850hPa - v.temperature_500hPa,1)+' °C'],['wind 850→500 shear', fmt(vecShear(v.wind_speed_850hPa,v.wind_direction_850hPa,v.wind_speed_500hPa,v.wind_direction_500hPa)/3.6,1)+' m/s'],
    ['CAPE / CIN / LI', `${fmt(v.cape,0)} / ${fmt(v.convective_inhibition,0)} J/kg / ${fmt(v.lifted_index,1)}`],['freezing level', fmt(v.freezing_level_height,0)+' m']]);
  } else out.warn('upper-air variables are not available for this location/model');
 }})
.register('sun', { group:'parse', usage:'sun', summary:'Sunrise, sunset, day length and next solar event', maxArgs:0,
 run({ term, out }){
  const c = needCtx(term), d = c.raw.daily; if(!d || !d.sunrise) throw new Error('no sunrise/sunset data');
  const day = (c.raw.current && c.raw.current.time || c.raw.hourly.time[c.i0]).slice(0,10), i = Math.max(0, d.time.indexOf(day));
  const nowT = new Date(c.raw.current ? c.raw.current.time : c.raw.hourly.time[c.i0]), r = new Date(d.sunrise[i]), s = new Date(d.sunset[i]), dl = (s-r)/60000;
  out.kv([['date', day],['sunrise', hhmm(d.sunrise[i])],['solar noon', hhmm(isoLocal(new Date((r.getTime()+s.getTime())/2)))],['sunset', hhmm(d.sunset[i])],['day length', `${Math.floor(dl/60)} h ${Math.round(dl%60)} min`],
   ['UV max today', fmt(d.uv_index_max && d.uv_index_max[i],1)],['next event', nowT < r ? `sunrise in ${Math.round((r-nowT)/60000)} min` : nowT < s ? `sunset in ${Math.round((s-nowT)/60000)} min` : 'sun is down']]);
 }})
.register('calc', { group:'math', usage:'calc <metric|all> [--at h] [--moist] [--t °C --rh % --p hPa]', summary:'Run an atmospheric calculation on the current state (calc to list metrics)', maxArgs:1,
 flags:{ at:{type:'str',help:'evaluate at hour offset (forecast)'}, moist:{type:'bool',help:'humid-air variant where supported'}, t:{type:'str',help:'override temperature °C'}, rh:{type:'str',help:'override humidity %'}, p:{type:'str',help:'override pressure hPa'} },
 examples:['calc air_density','calc dew_point','calc lcl --at 6','calc cape','calc air_density --t 30 --rh 70 --p 1000 --moist','calc all'],
 complete:(p)=>[...metrics.names(),'all'],
 run({ term, out, args, flags }){
  if(!args.length){ out.section('METRICS'); out.kv(metrics.list().map(m => [m.name, m.summary])); out.dim("usage: calc <metric> · calc all · help calc"); return; }
  let v = {};
  if(term.ctx){ const off = flags.at ? +flags.at : 0, i = term.ctx.i0 + off; if(!Number.isFinite(off) || i < 0 || i >= term.ctx.raw.hourly.time.length) throw new Error('--at out of range'); v = off ? hourAt(term.ctx,i) : nowVals(term.ctx); }
  if(flags.t !== undefined) v.temperature_2m = +flags.t;
  if(flags.rh !== undefined) v.relative_humidity_2m = +flags.rh;
  if(flags.t !== undefined || flags.rh !== undefined) v.dew_point_2m = undefined;   // recompute Td from the overrides
  if(flags.p !== undefined) v.surface_pressure = +flags.p;
  const names = args[0].toLowerCase() === 'all' ? metrics.list().map(m => m.name) : [args[0]];
  const summary = [];
  for(const n of names){
   const m = metrics.get(n); if(!m) throw new Error(`unknown metric '${n}' (type: calc)`);
   let r; try{ r = m.run(v, flags); }catch(e){ if(names.length > 1){ summary.push([m.name,'—','','n/a: '+e.message.replace(/ \(.*/,'')]); continue; } throw e; }
   if(names.length > 1){ summary.push([m.name, r.value === null ? '—' : fmt(r.value, r.d ?? 2), dispU(r.unit), r.note || '']); continue; }
   out.section(m.name); out.dim('  ' + m.formula);
   out.kv([...(r.inputs||[]).map(([k,x]) => ['input '+k, x]), ['RESULT', r.value === null ? 'n/a' : `${fmt(r.value, r.d ?? 2)} ${r.unit}`], ...(r.extra||[])]);
   if(r.note) out.line('  ↳ ' + r.note, 'c-acc');
  }
  if(summary.length) out.table(['METRIC','VALUE','UNIT','NOTE'], summary, ['l','r','l','l']);
 }})
.register('compare', { group:'compare', alias:['cmp'], usage:'compare -loc1 <cityA> -loc2 <cityB>', summary:'Fetch two places and print a side-by-side Δ matrix',
 flags:{ loc1:{type:'list',alias:['a']}, loc2:{type:'list',alias:['b']} },
 examples:['compare -loc1 lisbon -loc2 madrid','compare -loc1 "new york" -loc2 tokyo'],
 async run({ term, out, flags }){
  if(!flags.loc1 || !flags.loc2) throw new Error('both -loc1 and -loc2 are required');
  out.dim('resolving both locations …');
  const [A,B] = await Promise.all([resolvePlace(flags.loc1), resolvePlace(flags.loc2)]);
  out.dim(`fetching ${A.name} ∥ ${B.name} …`);
  const [ra,rb] = await Promise.all([fetchWeather(A), fetchWeather(B)]);
  const ca = buildCtx(A,ra.raw), cb = buildCtx(B,rb.raw), va = nowVals(ca), vb = nowVals(cb), da = derivedOf(va), db = derivedOf(vb);
  const spec = [['temperature_2m','°C',1],['apparent_temperature','°C',1],['dew_point_2m','°C',1],['relative_humidity_2m','%',0],['surface_pressure','hPa',1],['pressure_msl','hPa',1],['wind_speed_10m','km/h',1],['wind_gusts_10m','km/h',1],
   ['wind_speed_80m','km/h',1],['@shear','m/s',2],['cloud_cover','%',0],['precipitation','mm',2],['shortwave_radiation','W/m2',0],['uv_index','',1],['cape','J/kg',0],['boundary_layer_height','m',0],['@lcl','m',0],['@air_density','kg/m3',4],['@wet_bulb','°C',1],['@theta_e','K',1]];
  const rows = spec.map(([k,u,d]) => { const x = k[0]==='@' ? da[k.slice(1)] : va[k], y = k[0]==='@' ? db[k.slice(1)] : vb[k];
   return [k[0]==='@' ? k.slice(1)+'*' : k, dispU(u)||'-', fmt(x,d), fmt(y,d), (num(x)&&num(y)) ? sgn(y-x,d) : '—']; });
  const nm = s => s.length > 12 ? s.slice(0,11)+'…' : s;
  out.table(['VARIABLE','UNIT',nm(A.name),nm(B.name),`Δ (B−A)`], rows, ['l','l','r','r','r']);
  out.dim(`A = ${A.name}${A.sub?', '+A.sub:''}   B = ${B.name}${B.sub?', '+B.sub:''}   (* = derived)`);
  const dist = (() => { const R = 6371, r = x => x*Math.PI/180, dl = r(B.lat-A.lat), dn = r(B.lon-A.lon), a = Math.sin(dl/2)**2 + Math.cos(r(A.lat))*Math.cos(r(B.lat))*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(a)); })();
  out.dim(`great-circle distance: ${dist.toFixed(0)} km`);
 }})
.register('delta', { group:'compare', alias:['diff'], usage:'delta --time <hours>', summary:'Compare now with the value N hours ahead (+) or behind (−)',
 flags:{ time:{type:'str',alias:['t','h'],help:'hours: 6, +6, -3'} },
 examples:['delta --time 6','delta --time -3','delta --time 24'],
 run({ term, out, args, flags }){
  const c = needCtx(term), h = Number(flags.time ?? args[0]);
  if(!Number.isFinite(h)) throw new Error('missing --time <hours>  (e.g. delta --time 6)');
  const j = c.i0 + Math.round(h), n = c.raw.hourly.time.length;
  if(j < 0 || j >= n) throw new Error(`out of range — the context covers ${-c.i0}h … +${n-1-c.i0}h`);
  const a = nowVals(c), b = hourAt(c,j), da = derivedOf(a), db = derivedOf(b);
  out.hd(`Δ ${c.place.name}: now (${a.time || c.raw.hourly.time[c.i0]})  →  ${plusH(Math.round(h))} (${b.time})`);
  const spec = [['Temp','temperature_2m','°C',1],['Feels','apparent_temperature','°C',1],['Dew pt','dew_point_2m','°C',1],['RH','relative_humidity_2m','%',0],['Pressure','surface_pressure','hPa',1],['Wind 10m','wind_speed_10m','km/h',1],['Gusts','wind_gusts_10m','km/h',1],
   ['Wind 80m','wind_speed_80m','km/h',1],['Cloud','cloud_cover','%',0],['Precip','precipitation','mm',2],['Solar','shortwave_radiation','W/m2',0],['UV','uv_index','',1],['CAPE','cape','J/kg',0],['PBL','boundary_layer_height','m',0],['Freezing lvl','freezing_level_height','m',0]];
  const rows = spec.map(([lab,k,u,d]) => { const x = a[k], y = b[k], dx = (num(x)&&num(y)) ? y-x : null; return [lab, fmt(x,d), fmt(y,d), `${sgn(dx,d)}${dispU(u)}`, dx === null ? '' : dx > 0 ? '▲' : dx < 0 ? '▼' : '='] ; });
  const dd = (a.wind_direction_10m !== undefined && num(a.wind_direction_10m) && num(b.wind_direction_10m)) ? ((b.wind_direction_10m - a.wind_direction_10m + 540) % 360) - 180 : null;
  rows.push(['Wind dir', fmt(a.wind_direction_10m,0), fmt(b.wind_direction_10m,0), `${sgn(dd,0)}°`, dd === null ? '' : dd > 0 ? '↻' : dd < 0 ? '↺' : '=']);
  rows.push(['Air density*', fmt(da.air_density,4), fmt(db.air_density,4), sgn(num(da.air_density)&&num(db.air_density) ? db.air_density-da.air_density : null,4)+'kg/m3', '']);
  rows.push(['LCL*', fmt(da.lcl,0), fmt(db.lcl,0), sgn(num(da.lcl)&&num(db.lcl) ? db.lcl-da.lcl : null,0)+'m', '']);
  out.table(['VARIABLE','NOW',plusH(Math.round(h)),'Δ',''], rows, ['l','r','r','r','l']);
  const dp = b.surface_pressure - a.surface_pressure;
  if(num(dp) && Math.abs(Math.round(h)) === 3){
   const t = Math.round(h) > 0 ? dp : -dp, cls = t > 6 ? 'rising rapidly' : t > 1.6 ? 'rising' : t > -1.6 ? 'steady' : t > -6 ? 'falling' : 'falling rapidly';
   out.line(`  pressure tendency (3 h): ${cls}`, 'c-acc');
  }
  out.dim(`  summary → Temp: ${sgn(b.temperature_2m-a.temperature_2m,1)}°C · Pressure: ${sgn(dp,1)}hPa · Wind: ${sgn(b.wind_speed_10m-a.wind_speed_10m,1)}km/h   (* = derived)`);
 }})
.register('plot', { group:'viz', alias:['spark'], usage:'plot --var <v[,v2]> [--hours 24] [--back 0] [--rows 1]', summary:'ASCII sparkline / block chart of an hourly series',
 flags:{ var:{type:'list',alias:['v','vars']}, hours:{type:'str',alias:['n'],help:'window length (default 24)'}, back:{type:'str',help:'start N hours before now'}, rows:{type:'str',help:'chart height; 1 = sparkline'} },
 examples:['plot --var wind_speed_10m','plot --var temp,pressure --hours 48','plot --var cape --rows 6','plot --var temp --back 24 --hours 48'],
 complete:varComplete,
 run({ term, out, args, flags }){
  const c = needCtx(term), want = flags.var || args.join(' ');
  if(!want) throw new Error('missing --var (try: plot --var wind_speed_10m)');
  const { ok, bad } = resolveVars(c, want); if(bad.length) out.warn(`unknown variable(s): ${bad.join(', ')}`);
  const hours = Math.max(2, Math.min(168, +flags.hours || 24)), rows = Math.max(1, Math.min(12, +flags.rows || 1)), [a,b] = winIdx(c, c.i0 - (+flags.back || 0), hours);
  const times = c.raw.hourly.time.slice(a,b), nowAt = c.i0 - a;
  for(const k of ok){
   const ser = c.raw.hourly[k].slice(a,b), s = stats(ser);
   if(!s){ out.warn(`${k}: no data in this window`); continue; }
   const iMax = ser.indexOf(s.max), iMin = ser.indexOf(s.min);
   out.hd(`${k}  [${dispU(unitOf(c,k)) || '-'}]  ${c.place.name} · ${times[0]} → ${times[times.length-1]} (${times.length} h)`);
   const lines = rows > 1 ? blockChart(ser, rows) : [sparkline(ser)];
   const pad = rows > 1 ? 8 : 0;
   lines.forEach((l,i) => { const lab = rows > 1 ? (i===0 ? fmt(s.max,1) : i===lines.length-1 ? fmt(s.min,1) : '').padStart(pad-1) + ' ' : ''; out.line(lab + l, 'c-spark'); });
   out.line(' '.repeat(pad) + timeAxis(times), 'c-dim');
   if(nowAt >= 0 && nowAt < times.length) out.line(' '.repeat(pad + nowAt) + '▲ now', 'c-acc');
   out.dim(`min ${fmt(s.min,1)} @ ${hhmm(times[iMin])}   max ${fmt(s.max,1)} @ ${hhmm(times[iMax])}   avg ${fmt(s.mean,1)}   Δ ${sgn(ser.filter(num).slice(-1)[0]-ser.filter(num)[0],1)}`);
   out.line();
  }
 }})
.register('stats', { group:'viz', alias:['stat'], usage:'stats --var <v> [--hours 24] [--back 0]', summary:'Min / max / mean / median / σ / trend for a variable over a window',
 flags:{ var:{type:'list',alias:['v','vars']}, hours:{type:'str',alias:['n']}, back:{type:'str'} }, complete:varComplete,
 run({ term, out, args, flags }){
  const c = needCtx(term), want = flags.var || args.join(' '); if(!want) throw new Error('missing --var');
  const { ok, bad } = resolveVars(c, want); if(bad.length) out.warn(`unknown variable(s): ${bad.join(', ')}`);
  const hours = Math.max(2, Math.min(216, +flags.hours || 24)), [a,b] = winIdx(c, c.i0 - (+flags.back || 0), hours), times = c.raw.hourly.time.slice(a,b);
  const rows = ok.map(k => { const ser = c.raw.hourly[k].slice(a,b), s = stats(ser); if(!s) return [k,'—','—','—','—','—','—','—'];
   return [k, fmt(s.min,2)+' @'+hhmm(times[ser.indexOf(s.min)]), fmt(s.max,2)+' @'+hhmm(times[ser.indexOf(s.max)]), fmt(s.mean,2), fmt(s.med,2), fmt(s.sd,2), sgn(s.slope,3)+'/h', sparkline(ser)]; });
  out.table(['VARIABLE','MIN','MAX','MEAN','MEDIAN','σ','TREND','SHAPE'], rows, ['l','r','r','r','r','r','r','l']);
  out.dim(`window: ${times[0]} → ${times[times.length-1]} (${times.length} h)`);
 }})
/* =====================================================================
 ADVANCED ATMOSPHERIC SIMULATION ENGINE (Inversion, Plume, Parcel)
 ===================================================================== */
commands.register('simulate', {
 group:'math', alias:['sim'],
 usage:'simulate <inversion|plume|parcel> [--alt m] [--depth m] [--dtemp °C] [--wind km/h] [--source g/s]',
 summary:'Run dynamic physics simulations (thermal inversion, Gaussian plume dispersion, parcel sounding)',
 minArgs: 1, maxArgs: 1,
 flags:{
  alt:{type:'str',alias:['a'],help:'inversion capping altitude (m AGL)'},
  depth:{type:'str',alias:['d'],help:'inversion layer thickness (m)'},
  dtemp:{type:'str',alias:['dt'],help:'temperature inversion magnitude (°C)'},
  wind:{type:'str',alias:['w'],help:'wind speed override (km/h)'},
  source:{type:'str',alias:['q','s'],help:'source pollutant emission rate (g/s)'},
  stability:{type:'str',help:'Pasquill stability class A-F (default: D)'}
 },
 examples:[
  'simulate inversion',
  'simulate inversion --alt 400 --depth 200 --dtemp 6.0',
  'simulate plume --wind 12 --source 150',
  'simulate parcel'
 ],
 complete: () => ['inversion', 'plume', 'parcel'],
 async run({ term, out, args, flags }){
  const sub = (args[0] || '').toLowerCase();
  const c = needCtx(term);
  const v = nowVals(c);


  /* -----------------------------------------------------------
     1. INVERSION SIMULATION
     ----------------------------------------------------------- */
  if(sub === 'inversion'){
    const t0 = v.temperature_2m;
    const p0 = v.surface_pressure || 1013.25;
    const u10 = num(+flags.wind) ? +flags.wind : Math.max(0.5, v.wind_speed_10m || 8.0);
    const pblh = num(v.boundary_layer_height) ? v.boundary_layer_height : 750;
    const invBase = num(+flags.alt) ? +flags.alt : Math.round(pblh * 0.65);
    const invDepth = num(+flags.depth) ? +flags.depth : 220;
    const invTop = invBase + invDepth;
    const dTemp = num(+flags.dtemp) ? +flags.dtemp : 4.8;

    // Environmental temperature lapse below inversion (-6.5 °C / km)
    const gammaStd = 0.0065;
    const tBase = t0 - (gammaStd * invBase);
    const tTop = tBase + dTemp; // Inversion: temperature increases with height!
    const invGradient = (dTemp / invDepth) * 100; // °C per 100m

    // Ventilation Index (m²/s) = Mixing Height (m) * Wind Speed (m/s)
    const u10ms = u10 / 3.6;
    const ventIndex = Math.round(invBase * u10ms);
    const ventRating = ventIndex < 1500 ? 'HAZARDOUS (Severe Trapping)' :
                       ventIndex < 3000 ? 'POOR (Stagnant Airshed)' :
                       ventIndex < 5000 ? 'MARGINAL (Moderate Retention)' : 'GOOD (Active Cleansing)';

    // Stagnation Factor (0 to 100%)
    const windPenalty = Math.max(0, 1 - (u10 / 25));
    const invPenalty = Math.min(1.0, dTemp / 8.0);
    const altPenalty = Math.max(0.2, Math.min(1.0, 1000 / invBase));
    const stagnation = Math.min(99, Math.round((windPenalty * 0.45 + invPenalty * 0.35 + altPenalty * 0.20) * 100));

    // Trapped Pollutant Dispersion Index (PDI) [1 - 100]
    const pdi = Math.min(99, Math.max(1, Math.round((10000 / (ventIndex + 120)) * (dTemp / 2.5))));

    out.hd(`SIMULATION // LOW-LEVEL THERMAL INVERSION & AIRSHED STAGNATION`);
    out.dim(`Context: ${c.place.name} · Baseline Surface Temp: ${t0.toFixed(1)} °C · Surface Wind: ${u10.toFixed(1)} km/h`);
    out.line();

    const metricsTable = [
      ['Inversion Base Height', `${invBase} m AGL`],
      ['Inversion Top Height', `${invTop} m AGL`],
      ['Inversion Thickness', `${invDepth} m`],
      ['Thermal Inversion Jump (ΔT)', `+${dTemp.toFixed(1)} °C (dT/dz = +${invGradient.toFixed(2)} °C/100m)`],
      ['Ventilation Index (V_i)', `${ventIndex} m²/s [${ventRating}]`],
      ['Surface Stagnation Factor', `${stagnation}% [${stagnation > 75 ? 'CRITICAL' : stagnation > 45 ? 'ELEVATED' : 'NOMINAL'}]`],
      ['Trapped Dispersion Index (PDI)', `${pdi} / 100`],
      ['Stability Regimes', `Sub-inversion: Neutral/Stable | Inversion Lid: Strongly Inverted (LID)`]
    ];
    out.kv(metricsTable);
    out.line();

    // ASCII Vertical Profile Matrix
    out.section('VERTICAL THERMAL SOUNDING PROFILE:');
    const zLevels = [
      { name:'TROPO FREE ', z: invTop + 350, t: tTop - (gammaStd * 350), tag:'COOLING' },
      { name:'INV TOP    ', z: invTop,       t: tTop,                  tag:'WARM CAP' },
      { name:'INV BASE   ', z: invBase,      t: tBase,                 tag:'COLD BASE' },
      { name:'MID BOUND  ', z: Math.round(invBase * 0.5), t: t0 - (gammaStd * invBase * 0.5), tag:'MIXING' },
      { name:'SURFACE    ', z: 0,            t: t0,                    tag:'GROUND' }
    ];
    const profRows = zLevels.map(lvl => [
      lvl.name,
      `${lvl.z} m`,
      `${lvl.t.toFixed(1)} °C`,
      `[${'='.repeat(Math.max(1, Math.min(18, Math.round((lvl.t + 10) * 0.4))))}]`,
      lvl.tag
    ]);
    out.table(['ATMOS LAYER','ALTITUDE','TEMP','GRAPH','LAYER DYNAMICS'], profRows, ['l','r','r','l','l']);
    return;
  }

  /* -----------------------------------------------------------
     2. GAUSSIAN PLUME DISPERSION SIMULATION
     ----------------------------------------------------------- */
  if(sub === 'plume'){
    const qRate = num(+flags.source) ? +flags.source : 100; // g/s
    const windKmh = num(+flags.wind) ? +flags.wind : (v.wind_speed_10m || 14.0);
    const u = Math.max(0.8, windKmh / 3.6); // wind speed m/s
    const stackH = 25; // Release height (m)

    out.hd(`SIMULATION // 2D ATMOSPHERIC GAUSSIAN PLUME DISPERSION`);
    out.dim(`Source Emission: ${qRate.toFixed(1)} g/s | Advection Wind: ${windKmh.toFixed(1)} km/h (${u.toFixed(1)} m/s) | Effective Stack H: ${stackH} m`);
    out.line();

    // Crosswind Y grid (-250m to +250m) vs Downwind X grid (100m to 1500m)
    const yGrid = [250, 150, 80, 0, -80, -150, -250];
    const xGrid = [100, 200, 350, 500, 700, 950, 1200, 1500];

    // Compute ground-level concentration matrix (mg/m³)
    let maxC = 0, xPeak = 0;
    const matrix = [];
    for(const y of yGrid){
      const row = [];
      for(const x of xGrid){
        // Briggs dispersion coefficients for neutral (Class D) conditions
        const sigY = 0.08 * x * Math.pow(1 + 0.0001 * x, -0.5);
        const sigZ = 0.06 * x * Math.pow(1 + 0.0015 * x, -0.5);
        const cVal = (qRate / (Math.PI * u * sigY * sigZ)) *
                     Math.exp(-0.5 * Math.pow(y / sigY, 2)) *
                     Math.exp(-0.5 * Math.pow(stackH / sigZ, 2));
        if(cVal > maxC){ maxC = cVal; xPeak = x; }
        row.push(cVal);
      }
      matrix.push(row);
    }

    // ASCII Density Shading
    const charShade = val => {
      const r = maxC > 0 ? val / maxC : 0;
      if(r >= 0.75) return '█';
      if(r >= 0.45) return '▓';
      if(r >= 0.20) return '▒';
      if(r >= 0.05) return '░';
      return '·';
    };

    let asciiMap = '    Y (cross) │ Downwind Distance X ──► (100 m to 1500 m)\n';
    asciiMap   += '  ────────────┼─────────────────────────────────────────────\n';
    yGrid.forEach((y, i) => {
      const yLabel = (y >= 0 ? `+${y}` : `${y}`).padStart(6, ' ') + ' m │ ';
      const cells = matrix[i].map(cVal => '  ' + charShade(cVal) + '  ').join('');
      asciiMap += yLabel + cells + '\n';
    });
    asciiMap   += '              │  100m   200m   350m   500m   700m   950m  1200m  1500m\n';

    out.pre(asciiMap, 'c-spark');
    out.line();
    out.kv([
      ['Peak Ground Level Conc. (C_max)', `${(maxC * 1000).toFixed(2)} µg/m³`],
      ['Peak Ground Impact Distance', `~${xPeak} m downwind`],
      ['Plume Lateral Spread (2·σ_y @ 1km)', `~${Math.round(2 * (0.08 * 1000 * Math.pow(1 + 0.0001 * 1000, -0.5)))} m`],
      ['Dilution Rate (X=200m vs X=1500m)', `1 : ${(matrix[3][1] / Math.max(1e-6, matrix[3][7])).toFixed(1)}`],
      ['Legend', '· <5%  |  ░ 5-20%  |  ▒ 20-45%  |  ▓ 45-75%  |  █ ≥75% of C_max']
    ]);
    return;
  }

  /* -----------------------------------------------------------
     3. SOUNDING PARCEL ASCENT SIMULATION
     ----------------------------------------------------------- */
  if(sub === 'parcel'){
    const t0 = v.temperature_2m;
    const td0 = tdOf(v);
    const p0 = v.surface_pressure || 1013.25;
    const lclH = Math.max(0, 125 * (t0 - td0));

    out.hd(`SIMULATION // CONVECTIVE PARCEL ASCENT & THERMODYNAMIC SOUNDING`);
    out.dim(`Parcel Source: Ground (${p0.toFixed(0)} hPa, T₀=${t0.toFixed(1)} °C, Td₀=${td0.toFixed(1)} °C)`);
    out.line();

    // Ascent steps: Surface, 300m, LCL, 1500m, 3000m, 5000m
    const zSteps = [0, 300, Math.round(lclH), 1500, 3000, 5000].sort((a,b)=>a-b);
    const uniqueSteps = [...new Set(zSteps)];

    const parcelSounding = uniqueSteps.map(z => {
      let tParcel, phase;
      if(z <= lclH){
        // Dry adiabatic cooling (9.8 °C / km)
        tParcel = t0 - (0.0098 * z);
        phase = 'DRY ADIABATIC (Unsaturated)';
      } else {
        // Moist pseudo-adiabatic cooling (~5.5 °C / km)
        const tAtLcl = t0 - (0.0098 * lclH);
        tParcel = tAtLcl - (0.0055 * (z - lclH));
        phase = 'MOIST ADIABATIC (Condensing)';
      }
      // Estimated environmental ambient temperature
      const tEnv = t0 - (0.0065 * z);
      const buoyancy = tParcel - tEnv; // Virtual temperature buoyancy approximation
      return [
        `${z} m`,
        `${tParcel.toFixed(1)} °C`,
        `${tEnv.toFixed(1)} °C`,
        `${buoyancy >= 0 ? '+' : ''}${buoyancy.toFixed(1)} °C`,
        buoyancy > 0.5 ? 'ACCELERATING (Pos. Buoyant)' : buoyancy >= -0.5 ? 'NEUTRAL' : 'STABLE (Inhibited)',
        phase
      ];
    });

    out.table(['ALTITUDE','PARCEL TEMP','ENV TEMP','BUOYANCY (ΔT)','PARCEL VECTOR','STATE'], parcelSounding, ['r','r','r','r','l','l']);
    out.dim(`Lifting Condensation Level (LCL): ${Math.round(lclH)} m AGL. Above LCL, latent heat of condensation offsets dry expansion.`);
    return;
  }

  // If sub-command is not recognized:
  out.err(`Error: Unknown simulation '${sub}'.`);
  out.dim(`Available simulations: 'simulate inversion', 'simulate plume', 'simulate parcel'`);
 }
});
commands.register('export', { group:'export', alias:['exp'], usage:'export --format <csv|cpp_struct|json> [--vars a,b] [--hours n] [--all] [--copy] [--download]', summary:'Export the context as CSV, a C++ struct for ESP32/Arduino, or JSON',
 flags:{ format:{type:'str',alias:['f']}, vars:{type:'list',alias:['v']}, hours:{type:'str',alias:['n'],help:'rows (csv, default 24) / forecast arrays (cpp_struct, default 0)'}, name:{type:'str',help:'C++ struct name'}, all:{type:'bool',help:'every variable'}, copy:{type:'bool'}, download:{type:'bool'} },
 examples:['export --format csv','export --format cpp_struct','export --format cpp_struct --vars temp,pressure,wind --hours 12','export --format csv --all --hours 48 --download'],
 complete:(p)=> /^(--?f(ormat)?)$/.test(p[p.length-2]||'') ? exporters.names() : ['--format','--vars','--hours','--all','--copy','--download'],
 async run({ term, out, args, flags }){
  const c = needCtx(term), fmtName = flags.format || args[0];
  if(!fmtName){ out.section('FORMATS'); out.kv(exporters.list().map(e => [e.name, e.summary])); return; }
  const ex = exporters.get(fmtName); if(!ex) throw new Error(`unknown format '${fmtName}' (${exporters.names().join(', ')})`);
  let keys = DEFAULT_EXPORT.filter(k => c.raw.hourly[k]);
  if(flags.all) keys = Object.keys(c.raw.hourly).filter(k => k !== 'time');
  if(flags.vars){ const r = resolveVars(c, flags.vars); if(r.bad.length) out.warn(`unknown variable(s): ${r.bad.join(', ')}`); keys = r.ok; }
  if(!keys.length) throw new Error('no variables selected');
  const text = ex.run(c, { keys, hours:flags.hours, name:flags.name });
  out.pre(text, 'c-code');
  if(flags.copy){ await navigator.clipboard.writeText(text); out.ok('✓ copied to clipboard'); }
  if(flags.download){
   const a = document.createElement('a'), blob = new Blob([text], { type:ex.mime });
   a.href = URL.createObjectURL(blob); a.download = `skylab_${c.place.name.toLowerCase().replace(/[^a-z0-9]+/g,'_')}.${ex.ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
   out.ok(`✓ downloaded ${a.download}`);
  }
  if(!flags.copy && !flags.download) out.dim('tip: add --copy or --download');
 }})
.register('copy', { group:'sys', alias:['clip'], usage:'copy', summary:'Copy the output of the previous command to the clipboard', keepLast:true,
 async run({ term, out }){ if(!term.lastText) throw new Error('nothing to copy'); await navigator.clipboard.writeText(term.lastText); out.ok(`✓ copied ${term.lastText.length} characters`); }})
.register('theme', { group:'sys', usage:'theme [modern|retro|amber]', summary:'Switch look: modern (light), retro (green phosphor CRT), amber (amber CRT)', keepLast:true,
 complete:()=>['modern','retro','amber'],
 run({ term, out, args }){
  const t = (args[0] || '').toLowerCase();
  if(!['modern','retro','amber'].includes(t)){ out.line(`current: ${term.theme}`); out.dim('usage: theme modern | retro | amber'); return; }
  SkyTerm.setTheme(t); out.ok(`theme → ${t}`);
 }})
.register('mock', { group:'sys', usage:'mock [on|off]', summary:'Use offline synthetic data instead of the live API', keepLast:true,
 complete:()=>['on','off'],
 run({ out, args }){ if(args[0]) CFG.mock = /^(on|1|true)$/i.test(args[0]); cache.clear(); out.line(`mock data: ${CFG.mock ? 'ON' : 'OFF'}  (cache cleared — run fetch)`); }})
.register('echo', { group:'sys', usage:'echo <text>', summary:'Print text', run({ out, args }){ out.line(args.join(' ')); }})
.register('date', { group:'sys', alias:['utc'], usage:'date', summary:'Current UTC time and local time at the context location', maxArgs:0, keepLast:true,
 run({ term, out }){ out.kv([['UTC', new Date().toISOString().replace('T',' ').slice(0,19)+'Z'], ['location now', term.ctx && term.ctx.raw.current ? term.ctx.raw.current.time.replace('T',' ') + '  ' + (term.ctx.raw.timezone||'') : '—']]); }});

/* =====================================================================
   MONTHLY OUTLOOK — ECMWF EC46 (46 days) via the Open-Meteo seasonal API
   ===================================================================== */
const monthlyCache = new Map();
const avgOf = a => { const v = a.filter(num); return v.length ? v.reduce((s,x) => s+x, 0)/v.length : null; };
const pctl = (a, p) => { const s = a.filter(num).sort((x,y) => x-y); if(!s.length) return null; const i = (s.length-1)*p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi]-s[lo])*(i-lo); };
async function fetchMonthly(pl, days, refresh){
 if(CFG.mock) throw new Error('monthly needs the live API — turn mock off with:  mock off');
 const key = `${pl.lat.toFixed(2)},${pl.lon.toFixed(2)}|${days}`, hit = monthlyCache.get(key);
 if(hit && !refresh && Date.now() - hit.t < 6*3600e3) return { ...hit.d, cached:true };
 const url = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${pl.lat}&longitude=${pl.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=${days}&timezone=auto`;
 const r = await fetch(url);
 if(!r.ok){ let j = {}; try{ j = await r.json(); }catch(e){} throw new Error(j.reason || `Open-Meteo seasonal HTTP ${r.status}`); }
 const raw = await r.json(), d = raw.daily;
 if(!d || !Array.isArray(d.time) || !d.time.length) throw new Error('the seasonal API returned no daily data for this location');
 // one column per ensemble member (temperature_2m_max, …_member01, …) or a single mean column
 const members = v => Object.keys(d).filter(k => k === v || k.startsWith(v + '_member')).map(k => d[k]);
 const mx = members('temperature_2m_max'), mn = members('temperature_2m_min'), pr = members('precipitation_sum');
 if(!mx.length) throw new Error('the seasonal API did not return temperature data');
 const col = (ms, i) => ms.map(m => m[i]).filter(num);
 const rows = d.time.slice(0, days).map((date, i) => { const x = col(mx,i), n = col(mn,i), p = col(pr,i);
  return { date, tmax:avgOf(x), lo:pctl(x,.1), hi:pctl(x,.9), tmin:avgOf(n), rain:avgOf(p), wet:p.length ? p.filter(v => v >= 1).length/p.length : null }; });
 const res = { rows, members:mx.length };
 monthlyCache.set(key, { t:Date.now(), d:res });
 return { ...res, cached:false };
}
commands.register('monthly', { group:'parse', alias:['month','outlook'], usage:'monthly [--days 7-46] [--daily] [--refresh]',
 summary:'Monthly outlook (ECMWF ensemble, up to 46 days): weekly temperature, rain and member spread', maxArgs:0,
 flags:{ days:{type:'str',alias:['n'],help:'outlook length, 7–46 (default 30)'}, daily:{type:'bool',help:'also print the day-by-day table'}, refresh:{type:'bool',alias:['r'],help:'bypass the 6 h cache'} },
 examples:['monthly','monthly --days 45','monthly --daily'],
 complete:()=>['--days','--daily','--refresh'],
 async run({ term, out, flags }){
  const c = needCtx(term), days = flags.days ? Math.round(+flags.days) : 30;
  out.dim(`GET seasonal-api.open-meteo.com/v1/seasonal …  (${days} days · ECMWF ensemble)`);
  const m = await fetchMonthly(c.place, days, flags.refresh), R = m.rows;
  out.hd(`▌ ${c.place.name} · monthly outlook · ${R[0].date} → ${R[R.length-1].date} · ${m.members} member${m.members > 1 ? 's' : ''}${m.cached ? ' · cached' : ''}`);
  const sum = a => a.reduce((s,x) => s + (num(x) ? x : 0), 0), weeks = [];
  for(let i = 0; i < R.length; i += 7) weeks.push(R.slice(i, i+7));
  out.table(['WEEK','DATES','TMAX','TMIN','TMAX p10…p90','RAIN mm','WET DAYS'],
   weeks.map((w,k) => [`W${k+1}`, `${w[0].date.slice(5)} … ${w[w.length-1].date.slice(5)}`, fmt(avgOf(w.map(x => x.tmax)),1), fmt(avgOf(w.map(x => x.tmin)),1),
    `${fmt(avgOf(w.map(x => x.lo)),0)}…${fmt(avgOf(w.map(x => x.hi)),0)}`, fmt(sum(w.map(x => x.rain)),1), fmt(sum(w.map(x => x.wet)),1)]),
   ['l','l','r','r','r','r','r']);
  out.line();
  out.line('  Tmax  ' + sparkline(R.map(x => x.tmax)), 'c-spark');
  out.line('  Tmin  ' + sparkline(R.map(x => x.tmin)), 'c-spark');
  out.line('  rain  ' + sparkline(R.map(x => x.rain), 0), 'c-spark');
  out.dim('        ' + R[0].date.slice(5) + ' '.repeat(Math.max(1, R.length - 10)) + R[R.length-1].date.slice(5));
  out.kv([['mean Tmax / Tmin', `${fmt(avgOf(R.map(x => x.tmax)),1)} / ${fmt(avgOf(R.map(x => x.tmin)),1)} °C`],
   ['total rain (ens. mean)', `${fmt(sum(R.map(x => x.rain)),0)} mm over ${R.length} days`],
   ['wettest week', (() => { const t = weeks.map(w => sum(w.map(x => x.rain))), k = t.indexOf(Math.max(...t)); return `W${k+1} · ${fmt(t[k],1)} mm`; })()]]);
  if(flags.daily) out.table(['DATE','TMAX','p10','p90','TMIN','RAIN mm','WET %'],
   R.map(x => [x.date.slice(5), fmt(x.tmax,1), fmt(x.lo,1), fmt(x.hi,1), fmt(x.tmin,1), fmt(x.rain,1), num(x.wet) ? fmt(x.wet*100,0) : '—']), ['l','r','r','r','r','r','r']);
  out.warn('Read weeks, not days: beyond ~2 weeks single days are not predictable. 36 km grid, not bias-corrected — an area outlook, not a point forecast.');
  out.dim('p10…p90 = range across ensemble members · WET DAYS = expected days with ≥ 1 mm · source: ECMWF EC46/SEAS5 via Open-Meteo');
 }});

/* =====================================================================
   10. EXPORTERS  (add yours with exporters.register)
   ===================================================================== */
const fNum = x => num(x) ? (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(4))) + 'f' : 'NAN';
const ident = s => s.replace(/[^A-Za-z0-9_]/g,'_').replace(/^(\d)/,'_$1');
const cStr = s => '"' + String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"';

exporters
.register('csv', { ext:'csv', mime:'text/csv', summary:'Hourly rows as CSV (--hours rows from now, default 24)',
 run(c,{ keys, hours }){
  const n = Math.max(1, Math.min(216, +hours || 24)), [a,b] = winIdx(c, c.i0, n), h = c.raw.hourly;
  const rows = [['time', ...keys].join(',')];
  for(let i=a;i<b;i++) rows.push([h.time[i], ...keys.map(k => num(h[k][i]) ? h[k][i] : '')].join(','));
  return rows.join('\n');
 }})
.register('cpp_struct', { ext:'h', mime:'text/x-c++hdr', alias:['cpp','arduino','esp32'], summary:'C++ struct + const instance for ESP32/Arduino (--hours N adds forecast arrays)',
 run(c,{ keys, hours, name }){
  const v = nowVals(c), d = derivedOf(v), sName = ident(name || 'SkyLabWeather'), inst = (name ? ident(name).toLowerCase() : 'skylab') + '_now';
  const L = [];
  L.push('// ─────────────────────────────────────────────────────────');
  L.push(`// SkyLab export · ${unitAscii(c.place.name)}${c.place.sub ? ', ' + unitAscii(c.place.sub) : ''}`);
  L.push(`// ${c.place.lat.toFixed(4)}, ${c.place.lon.toFixed(4)} · ${c.raw.elevation ?? '?'} m · ${v.time} (${c.raw.timezone || 'local'}) · source: Open-Meteo`);
  L.push('// units: degC, %, hPa, km/h, W/m2, J/kg, m   ·   NAN = value unavailable');
  L.push('// ─────────────────────────────────────────────────────────');
  L.push('#pragma once', '#include <math.h>   // NAN', '');
  L.push(`struct ${sName} {`, '  const char* location;', '  const char* time_iso;', '  float latitude;', '  float longitude;', '  float elevation_m;');
  keys.forEach(k => L.push(`  float ${ident(k)};${' '.repeat(Math.max(1, 34 - ident(k).length))}// ${unitAscii(unitOf(c,k)) || '-'}`));
  const DN = { air_density:'air_density_kgm3', dew_point:'dew_point_c', lcl:'lcl_m', wet_bulb:'wet_bulb_c', theta_e:'theta_e_k', shear:'shear_ms', density_alt:'density_alt_m' };
  const dk = Object.keys(DN).filter(k => num(d[k]));
  dk.forEach(k => L.push(`  float ${DN[k]};${' '.repeat(Math.max(1, 34 - DN[k].length))}// derived`));
  L.push('};', '');
  L.push(`static const ${sName} ${inst} = {`);
  L.push(`  ${cStr(c.place.name.normalize('NFD').replace(/[\u0300-\u036f]/g,''))},`, `  ${cStr(v.time)},`, `  ${fNum(c.place.lat)},`, `  ${fNum(c.place.lon)},`, `  ${fNum(c.raw.elevation)},`);
  [...keys.map(k => [k, v[k]]), ...dk.map(k => [DN[k], d[k]])].forEach(([k,x],i,all) => L.push(`  ${fNum(x)}${i < all.length-1 ? ',' : ' '} // ${k}`));
  L.push('};');
  const n = Math.max(0, Math.min(168, +hours || 0));
  if(n){
   L.push('', `#define SKYLAB_FCST_HOURS ${n}`);
   keys.forEach(k => L.push(`static const float skylab_${ident(k)}_fcst[SKYLAB_FCST_HOURS] = { ${c.raw.hourly[k].slice(c.i0, c.i0+n).map(fNum).join(', ')} };`));
  }
  return L.join('\n');
 }})
.register('json', { ext:'json', mime:'application/json', summary:'Current snapshot + derived metrics as JSON',
 run(c,{ keys }){ const v = nowVals(c), o = { location:c.place.name, latitude:c.place.lat, longitude:c.place.lon, elevation_m:c.raw.elevation, time:v.time, values:{}, derived:derivedOf(v) };
  keys.forEach(k => o.values[k] = { value:v[k] ?? null, unit:unitOf(c,k) }); return JSON.stringify(o, null, 2); }});

/* =====================================================================
   11. PUBLIC API
   ===================================================================== */
return { commands, metrics, exporters, CFG, Terminal, tokenize, parseArgs, fetchWeather, math:{ dewPoint, airDensity, wetBulb, thetaE, lclTemp, sparkline },
 setTheme(t){ const dr = document.getElementById('termDrawer'); if(!dr) return; dr.classList.remove('retro','amber'); if(t !== 'modern') dr.classList.add(t);
  if(termInst) termInst.theme = t; lsSet('termTheme', t);
  const b = document.getElementById('cliThemeBtn'); if(b) b.textContent = 'Theme: ' + t; } };
})();
/* ============ CLI: Hurricane Tracker storm reports ============ */
SkyTerm.commands.register('storms', {
  group: 'data',
  alias: ['storm', 'hurricane', 'hurricanes', 'cyclone', 'cyclones', 'tc'],

  usage: 'storms [name|id|number] [--refresh] [--all] [--raw]',
  summary: 'Hurricane Tracker: list active cyclones or inspect detailed storm reports',

  flags: {
    refresh: {
      type: 'bool',
      alias: ['r'],
      help: 'Refresh the shared Hurricane Tracker data'
    },
    all: {
      type: 'bool',
      alias: ['a'],
      help: 'Print detailed reports for every tracked storm'
    },
    raw: {
      type: 'bool',
      help: 'Also print the exact tracker data as JSON'
    }
  },

  examples: [
    'storms',
    'storms 1',
    'storms "<storm name>"',
    'storms --all',
    'storms --refresh',
    'storms 1 --raw'
  ],

  complete() {
    const list = hurrD && Array.isArray(hurrD.storms)
      ? hurrD.storms
      : [];

    return [
      '--refresh',
      '--all',
      '--raw',
      ...list.map(s => s.name.toLowerCase())
    ];
  },

  async run({ term, out, args, flags }) {
    out.dim('Reading the shared Hurricane Tracker feed…');

    // Same cache, requests, data and ordering as the tracker.
    const tracker = await hurrGet(!!flags.refresh);

    if (!tracker || !Array.isArray(tracker.storms)) {
      throw new Error('Hurricane Tracker returned invalid data.');
    }

    hurrBadge();

    // Do not filter out weak storms or systems with unknown winds.
    const list = tracker.storms;

    // Respect a city loaded with "fetch -loc", not just the website city.
    const reference = term.ctx && term.ctx.place
      ? term.ctx.place
      : place;

    const valid = n =>
      typeof n === 'number' && Number.isFinite(n);

    const missing = 'Not supplied';

    const timestamp = value => {
      const ms = typeof value === 'number'
        ? value
        : Date.parse(value || '');

      return Number.isFinite(ms)
        ? `${new Date(ms).toISOString()} (${hAgo(ms)})`
        : missing;
    };

    const coordinates = (lat, lon) => {
      if (!valid(lat) || !valid(lon)) return missing;

      const normalizedLon = ((lon + 180) % 360 + 360) % 360 - 180;

      return (
        `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ` +
        `${Math.abs(normalizedLon).toFixed(3)}° ` +
        `${normalizedLon >= 0 ? 'E' : 'W'}`
      );
    };

    const distance = s => {
      if (
        !reference ||
        !valid(reference.lat) ||
        !valid(reference.lon) ||
        !valid(s.lat) ||
        !valid(s.lon)
      ) return null;

      return hav(reference.lat, reference.lon, s.lat, s.lon);
    };

    const report = s => {
      const category = hCat(s.windKt);
      const km = distance(s);

      out.line();
      out.hd(`HURRICANE TRACKER // ${s.name.toUpperCase()}`);

      out.section('[01] SOURCE & ADVISORY');
      out.kv([
        ['Tracker ID', s.id || missing],
        ['Source', s.src || missing],
        ['Advisory timestamp', timestamp(s.updated)],
        ['Tracker dataset timestamp', timestamp(tracker.at)],
        ['Advisory / event report', s.url || missing]
      ]);

      out.section('[02] REPORTED INTENSITY');
      out.kv([
        ['Classification', hLabel(s)],
        [
          'Wind-based category',
          category >= 2
            ? `Saffir–Simpson Category ${category - 1}`
            : category === 1
              ? 'Tropical storm'
              : category === 0
                ? 'Tropical depression'
                : 'Unknown'
        ],
        [
          'Reported wind',
          valid(s.windKt)
            ? `${s.windKt.toFixed(1)} kt · ` +
              `${(s.windKt * 1.852).toFixed(1)} km/h · ` +
              `${(s.windKt * 1.15078).toFixed(1)} mph`
            : missing
        ],
        [
          'Central pressure',
          valid(s.pressure) ? `${s.pressure} hPa` : missing
        ],
        ['Wind averaging interval', 'Not specified in tracker data']
      ]);

      out.section('[03] POSITION & MOTION');
      out.kv([
        ['Centre coordinates', coordinates(s.lat, s.lon)],
        [
          'Hemisphere',
          s.lat > 0 ? 'Northern' : s.lat < 0 ? 'Southern' : 'Equator'
        ],
        ['Movement summary', hMove(s)],
        [
          'Movement bearing',
          valid(s.moveDir)
            ? `${(((s.moveDir % 360) + 360) % 360).toFixed(0)}°`
            : missing
        ],
        [
          'Translation speed',
          valid(s.moveMph)
            ? `${s.moveMph.toFixed(1)} mph · ` +
              `${(s.moveMph * 1.609344).toFixed(1)} km/h`
            : missing
        ],
        ['Distance reference', reference ? reference.name : 'No city loaded'],
        [
          'Distance to reference',
          valid(km)
            ? `${Math.round(km)} km · ${Math.round(km * 0.621371)} mi`
            : 'Unavailable'
        ]
      ]);

      // Same illustrative projection used by the tracker's dashed line.
      if (
        valid(s.moveDir) &&
        valid(s.moveMph) &&
        s.moveMph >= 1
      ) {
        const projected = hDest(
          s.lat,
          s.lon,
          s.moveDir,
          s.moveMph * 1.609 * 24
        );

        out.section('[04] CONSTANT-MOTION ILLUSTRATION');
        out.kv([
          ['Position after 24 hours', coordinates(projected[0], projected[1])]
        ]);
        out.warn(
          'Illustration only: assumes unchanged speed and direction. ' +
          'Not an official forecast or landfall prediction.'
        );
      }

      out.dim(
        'Peak gusts, wind radii and storm-surge forecasts are not supplied ' +
        'by the current tracker schema; they are not inferred here.'
      );

      if (flags.raw) {
        out.section('EXACT TRACKER RECORD');
        out.pre(JSON.stringify(s, null, 2), 'c-code');
      }
    };

    out.hd(`HURRICANE TRACKER // ${list.length} TRACKED SYSTEMS`);
    out.dim(`Dataset timestamp: ${timestamp(tracker.at)}`);

    if (!list.length) {
      out.line('The tracker currently lists no active tropical cyclones.');
      if (flags.raw) out.pre(JSON.stringify(tracker, null, 2), 'c-code');
      return;
    }

    const query = args.join(' ').trim().toLowerCase();

    if (query) {
      let matches;

      if (/^#?\d+$/.test(query)) {
        const index = Number(query.replace(/^#/, '')) - 1;
        matches = list[index] ? [list[index]] : [];
      } else {
        const exact = list.filter(s =>
          s.name.toLowerCase() === query ||
          String(s.id || '').toLowerCase() === query
        );

        matches = exact.length ? exact : list.filter(s =>
          s.name.toLowerCase().includes(query) ||
          String(s.id || '').toLowerCase().includes(query)
        );
      }

      if (!matches.length) {
        throw new Error(`no tracked storm matches "${query}" — run "storms" for the list`);
      }

      if (matches.length > 1) {
        out.warn(
          'Multiple matches: ' +
          matches.map(s => `${s.name} [${s.id}]`).join(', ')
        );
        out.dim('Use an exact name, ID or list number.');
        return;
      }

      report(matches[0]);
      return;
    }

    if (flags.all) {
      list.forEach(report);
      return;
    }

    out.dim(`Distance reference: ${reference ? reference.name : 'No city loaded'}`);
    out.line();

    out.table(
      ['#', 'NAME', 'CLASS', 'WIND', 'PRESSURE', 'MOTION', 'DISTANCE', 'SOURCE'],
      list.map((s, index) => {
        const km = distance(s);

        return [
          String(index + 1),
          s.name,
          hLabel(s),
          valid(s.windKt) ? hWind(s.windKt) : '—',
          valid(s.pressure) ? `${s.pressure} hPa` : '—',
          hMove(s),
          valid(km) ? hDist(km) : '—',
          s.src || '—'
        ];
      }),
      ['r', 'l', 'l', 'r', 'r', 'l', 'r', 'l']
    );

    out.line();
    out.dim('Detailed report: storms 1 | storms "<name>" | storms <id>');
    out.dim('Every report: storms --all | Refresh: storms --refresh');

    if (flags.raw) {
      out.pre(JSON.stringify(tracker, null, 2), 'c-code');
    }
  }
});
/* ============ Terminal lifecycle ============ */
function termShell(){
 let ov = $('#termOverlay');
 if(ov) return ov;
 ov = document.createElement('div');
 ov.className = 'term-overlay';
 ov.id = 'termOverlay';
 ov.setAttribute('aria-hidden', 'true');
 ov.innerHTML = `<aside class="term-drawer" id="termDrawer" role="dialog" aria-modal="true" aria-label="Skylab Atmospheric Physics Terminal">
  <div class="term-header">
   <div class="term-brand">
    <div class="term-brand-icon">
     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
    </div>
    <div class="term-titles">
     <h2>SKYLAB // ATMOSPHERIC PHYSICS TERMINAL <span class="term-cursor">_</span></h2>
     <p id="termOpTag">OPERATOR: LEVEL-2 TELEMETRY LINK</p>
    </div>
   </div>
   <div class="term-controls">
    <button class="term-btn-icon" id="termFsBtn" title="Toggle Fullscreen" aria-label="Toggle Fullscreen">⛶</button>
    <button class="term-btn-icon" id="termCloseBtn" title="Close Terminal (Esc)" aria-label="Close Terminal">✕</button>
   </div>
  </div>

  <div class="term-meta-strip">
   <div style="display:flex;align-items:center;gap:12px">
    <span><span class="term-dot" style="display:inline-block"></span> STREAM: ACTIVE</span>
    <span id="termCoords">LAT: --.---- LON: --.----</span>
    <span id="termElev">ELEV: -- m</span>
   </div>
   <div id="termUtc">UTC: ----/--/-- --:--:--</div>
  </div>

  <div class="term-nav-bar">
   <div class="term-chips" id="cliChips" role="toolbar" aria-label="Quick commands">
    <button class="term-chip" data-cmd="help">help</button>
    <button class="term-chip" data-cmd="now">now</button>
    <button class="term-chip" data-cmd="storms">storms</button>
    <button class="term-chip" data-cmd="monthly">monthly</button>
    <button class="term-chip" data-cmd="calc all">calc all</button>
    <button class="term-chip" data-cmd="simulate inversion">sim inversion</button>
    <button class="term-chip" data-cmd="simulate plume --wind 12 --source 120">sim plume</button>
    <button class="term-chip" data-cmd="simulate parcel">sim parcel</button>
   </div>
   <div class="term-actions">
    <button class="term-act-btn" id="cliCopyBtn" title="Copy the previous output">Copy last</button>
    <button class="term-act-btn" id="cliThemeBtn" title="Cycle modern / retro / amber">Theme: modern</button>
   </div>
  </div>

  <!-- Intentionally empty of data: output is written strictly after an authenticated open -->
  <div class="term-body cli" id="termBody">
   <div class="cli-out" id="cliOut" aria-live="polite"></div>
   <div class="cli-prompt"><label class="cli-ps1" id="cliPs1" for="cliIn"></label><div class="cli-inw"><div class="cli-hl" aria-hidden="true"><span></span></div><input id="cliIn" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Terminal command"></div></div>
  </div>
 </aside>`;
 document.body.appendChild(ov);

 $('#termCloseBtn').onclick = () => termClose();
 $('#termFsBtn').onclick = () => $('#termDrawer').classList.toggle('fullscreen');
 $('#termOverlay').onclick = (e) => { if(e.target === $('#termOverlay')) termClose(); };
 $('#termBody').addEventListener('click', () => { if(!getSelection().toString()) $('#cliIn').focus(); });
 $('#cliChips').addEventListener('click', e => {
  const b = e.target.closest('.term-chip'); if(!b || !termInst || termInst.busy) return;
  termInst.exec(b.dataset.cmd);
 });
 $('#cliCopyBtn').onclick = () => termInst && termInst.exec('copy');
 $('#cliThemeBtn').onclick = () => {
  const order = ['modern','retro','amber'], cur = termInst ? termInst.theme : 'modern';
  SkyTerm.setTheme(order[(order.indexOf(cur)+1) % order.length]);
 };
 return ov;
}

function termOpen(){
 if(!isUserAuth()){
  authOpen();
  toast(LANG==='pt'?'Terminal restrito a utilizadores registados. Inicia sessão.':'Terminal restricted to registered users. Please sign in.');
  return;
 }
 if(!data || !place){
  toast(LANG==='pt'?'A aguardar dados meteorológicos...':'Waiting for meteorological data...');
  return;
 }
 const ov = termShell();
 termIsOpen = true;
 ov.classList.add('active');
 ov.setAttribute('aria-hidden','false');
 document.documentElement.classList.add('hlock');

 $('#termOpTag').textContent = `OPERATOR: @${currentUser.username.toUpperCase()} // LEVEL-2 TELEMETRY LINK`;
 $('#termCoords').textContent = `LAT: ${place.lat.toFixed(4)}° LON: ${place.lon.toFixed(4)}°`;
 $('#termElev').textContent = `ELEV: ${data.elevation ?? 0} m`;
 const tick = () => { $('#termUtc').textContent = `UTC: ${new Date().toISOString().replace('T',' ').slice(0,19)}Z`; };
 tick(); clearInterval(termClockT); termClockT = setInterval(tick, 1000);

 if(!termInst){
  termInst = new SkyTerm.Terminal({ outEl:$('#cliOut'), inEl:$('#cliIn'), psEl:$('#cliPs1'), scrollEl:$('#termBody') });
 }
 let th = lsGet('termTheme') || 'modern';
 SkyTerm.setTheme(th);
 termInst.boot();
 setTimeout(() => { const i = $('#cliIn'); if(i && termIsOpen) i.focus(); }, 380);
}

function termClose(){
 termIsOpen = false;
 clearInterval(termClockT);
 const ov = $('#termOverlay');
 if(ov){
  ov.classList.remove('active');
  ov.setAttribute('aria-hidden','true');
 }
 document.documentElement.classList.remove('hlock');
 if(termInst) termInst.reset();   // purge telemetry from the DOM and from memory (history of typed commands is kept)
}

/* Event bindings */
const termBtnEl = $('#termBtn');
if(termBtnEl) termBtnEl.onclick = () => termOpen();
document.addEventListener('keydown', e => {
 if(e.key !== 'Escape' || !termIsOpen) return;
 const i = $('#cliIn');
 if(i && i.value){ i.value = ''; return; }
 termClose();
});
