/* Skylab · core.js — config, basics, units, weather codes, icons · load order 02/28 (classic script, shared global scope) */
/* ═══════════ CORE — config, i18n, data fetching, Sky Explained, hero, tabs, ephemeris, render ═══════════ */
/* ============ CONFIG: Atmospore ============
   I could not verify Atmospore's endpoint from here. Edit `candidates` to match
   their docs. Each candidate is tried in order; the first response that contains
   pollen-like fields wins. The raw response is logged in the console.
   NOTE: this key is visible to anyone who views the page source. */

const ATMO={ base:'https://aged-mountain-a883.lourencoalvesfonseca2011.workers.dev/v1' };
let atmoDead=false;
const SYNC_KEYS = ['favs','unitPick','lang','place','homeCity','progMode','termHist','termTheme','tabPick','recent','skyInterests','skyStreak','skyBest'];// declared first so lsSet can reference it safely
/* ============ basics ============ */
const IS_MOBILE=document.documentElement.classList.contains('is-mobile');
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const main=$('#main'),q=$('#q'),sg=$('#sg');
const lsGet=k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}};
const lsSet=(k,v)=>{
  try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}
  if(typeof SYNC_KEYS!=='undefined' && SYNC_KEYS.includes(k) && !window.__prefsApplying){
    try{localStorage.setItem('prefsTs',String(Date.now()))}catch(e){}
    if(typeof prefsSchedulePush==='function') prefsSchedulePush();
  }
};
let LANG=lsGet('lang')||((navigator.language||'').toLowerCase().startsWith('pt')?'pt':'en');
const LOC=()=>LANG=='pt'?'pt-PT':'en';
document.documentElement.lang=LANG;
try{localStorage.removeItem('unit');localStorage.removeItem('unitManual')}catch(e){}   // limpa o estado antigo que bloqueava a mudança automática
let unit=lsGet('unitPick')||(LANG=='pt'?'c':'f'),data=null,place=null,tab='today',lastKey='',tickT;
const still=matchMedia('(prefers-reduced-motion:reduce)').matches;
const T=c=>Math.round(unit=='c'?c:c*9/5+32);
const W=k=>unit=='c'?Math.round(k)+' km/h':Math.round(k*.539957)+' kt';
const deg=()=>unit=='c'?'°C':'°F';
/* pressão e chuva seguem o botão °C/°F: °C → hPa · mm ; °F → inHg · in (o mapa e as fórmulas científicas ficam em hPa) */
const HPA_INHG=.0295300;
const dcm=(v,n)=>{const t=v.toFixed(n);return LANG=='pt'?t.replace('.',','):t};
const pU=()=>unit=='c'?'hPa':'inHg';
const pN=h=>unit=='c'?String(Math.round(h)):dcm(h*HPA_INHG,2);                   // valor absoluto, sem unidade
const pf=h=>pN(h)+' '+pU();                                                          // valor absoluto com unidade
const pdS=d=>unit=='c'?dcm(d,1)+' hPa':dcm(d*HPA_INHG,2)+' inHg';                    // DIFERENÇA de pressão com unidade
const rateS=mm=>{if(unit=='c')return(mm<1?mm.toFixed(2):mm<10?mm.toFixed(1):String(Math.round(mm)))+' mm/h';
 const v=mm/25.4;return(v<.1?v.toFixed(3):v<1?v.toFixed(2):v.toFixed(1))+' in/h'};     // intensidade de chuva
const hm=m=>`${Math.floor(m/60)}h ${Math.round(m%60)}m`;
const fmtT=s=>s.slice(11,16);
const idx0=()=>Math.max(0,data.hourly.time.findIndex(t=>t>=data.current.time.slice(0,13)+':00'));

function cat(code,day){
 if(code>=95)return'storm';
 if(code>=71&&code<=77||code==85||code==86)return'snow';
 if(code>=51&&code<=67||code>=80&&code<=82)return'rain';
 if(code==45||code==48)return'fog';
 if(code==3||code==2)return'cloud';
 return day?'clear':'night';
}
const LABEL={0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Freezing fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',82:'Violent showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with hail'};
const IC={
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
cloud:'<path d="M17.5 19H9a5 5 0 1 1 4.8-6.4h3.7a3.2 3.2 0 0 1 0 6.4z"/>',
partly:'<circle cx="8" cy="8" r="2.6"/><path d="M8 2.5v1.2M2.5 8h1.2M4.1 4.1l.9.9M11.9 4.1l-.9.9M18 20H10.5a4.2 4.2 0 1 1 4-5.5H18a2.9 2.9 0 0 1 0 5.5z"/>',
fog:'<path d="M4 8h16M2 12h20M5 16h14M8 20h8"/>',
drizzle:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M8 17v.01M12 19v.01M16 17v.01M10 21v.01M14 21v.01"/>',
rain:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3"/>',
snow:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M8 17v.01M12 19v.01M16 17v.01M10 21v.01M14 21v.01"/>',
storm:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M12.5 13.5L10 17.5h3.5L11 21.5"/>',
umbrella:'<path d="M12 3v1M3 13a9 9 0 0 1 18 0zM12 13v5a2 2 0 0 1-4 0"/>',
tshirt:'<path d="M8 3L3 6l2.5 4L8 9v12h8V9l2.5 1L21 6l-5-3a4 4 0 0 1-8 0z"/>',
layers:'<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
jacket:'<path d="M9 3L3 6v5l3 1v9h12v-9l3-1V6l-6-3-3 4zM12 7v14"/>',
flake:'<path d="M12 2v20M4.2 7l15.6 10M4.2 17L19.8 7"/>',
wind:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
walk:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'};
const ic=n=>`<svg class="ic i-${n}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]||''}</svg>`;
function emoji(code,day=1){
 let n;
 if(code<=1)n=day?'sun':'moon'; else if(code==2)n=day?'partly':'cloud'; else if(code==3)n='cloud';
 else if(code==45||code==48)n='fog'; else if(code<=57)n='drizzle';
 else if(code<=67||code>=80&&code<=82)n='rain'; else if(code<=77||code==85||code==86)n='snow'; else n='storm';
 return ic(n);
}
const IPMA_TO_WMO={
  1:0,2:2,3:3,4:3,5:3,6:3,7:3,8:3,9:3,10:3,11:3,12:3,13:3,
  14:51,15:61,16:45,17:61,18:65,19:95,20:95,21:95,22:95,
  23:71,24:71,25:75,26:75,27:77,28:85,29:86,30:95
};
