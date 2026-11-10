/* Skylab · ipma.js — IPMA decoding, IPMA radar frames, RainViewer · load order 09/28 (classic script, shared global scope) */
/* ============ IPMA: descodificação ============ */
let ipmaMeta=null;
async function ipmaLoadMeta(){
  if(ipmaMeta) return ipmaMeta;
  try{
    const[w,t,p]=await Promise.all([
      fetchJSON('https://api.ipma.pt/open-data/weather-type-classe.json'),
      fetchJSON('https://api.ipma.pt/open-data/wind-speed-daily-classe.json'),
      fetchJSON('https://api.ipma.pt/open-data/precipitation-classe.json')
    ]);
    const weather={},wind={},precip={};
    (w.data||[]).forEach(x=>weather[x.idWeatherType]=LANG==='pt'?x.descWeatherTypePT:x.descWeatherTypeEN);
    (t.data||[]).forEach(x=>wind[x.classWindSpeed]=LANG==='pt'?x.descClassWindSpeedDailyPT:x.descClassWindSpeedDailyEN);
    (p.data||[]).forEach(x=>precip[x.classPrecInt]=LANG==='pt'?x.descClassPrecIntPT:x.descClassPrecIntEN);
    ipmaMeta={weather,wind,precip};
    return ipmaMeta;
  }catch(e){console.warn('[IPMA meta]',e.message);return{weather:{},wind:{},precip:{}}}
}

function isPortugal(lat,lon){
  return lat>=29.5&&lat<=42.2&&lon>=-32&&lon<=-6;
}
async function ipmaDaily(lat,lon){
  try{
    const list=await fetchJSON('https://api.ipma.pt/open-data/distrits-islands.json');
    const areas=(list.data||[]).map(a=>({id:a.globalIdLocal,name:a.local,lat:+a.latitude,lon:+a.longitude}));
    if(!areas.length) return null;
    let best=areas[0],bd=1e9;
    for(const a of areas){
      const d=hav(lat,lon,a.lat,a.lon);
      if(d<bd){bd=d;best=a}
    }
    if(bd>50) return null;   // mais de 50 km: não mostra
    const f=await fetchJSON(`https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${best.id}.json`);
    const meta=await ipmaLoadMeta();
    return{area:best,daily:(f.data||[]).map(d=>({
      date:d.forecastDate,
      tMin:+d.tMin,tMax:+d.tMax,
      rain:+d.precipitaProb,
      windDir:d.predWindDir,
      windCls:meta.wind[d.classWindSpeed]||d.classWindSpeed,
      code:+d.idWeatherType,
      desc:meta.weather[d.idWeatherType]||''
    }))};
  }catch(e){console.warn('[IPMA daily]',e.message);return null}
}

/* ============ Radar IPMA (Portugal) ============ */
const IPMA_RADAR_BASE = 'https://www.ipma.pt/resources.www/transf/radar/';
let ipmaRadarCache = null;
let ipmaRadarPrefix = lsGet('ipmaRadarPrefix');

function ipmaRadarURL(path){
  return IPMA_RADAR_BASE + (ipmaRadarPrefix ?? 'por/') + path;
}
function probeImage(url){
  return new Promise(res=>{
    const im=new Image(),to=setTimeout(()=>{im.src='';res(false)},4000);
    im.onload=()=>{clearTimeout(to);res(true)};
    im.onerror=()=>{clearTimeout(to);res(false)};
    im.src=url;
  });
}
async function ipmaResolvePrefix(samplePath){
  if(ipmaRadarPrefix) return ipmaRadarPrefix;
  for(const pre of ['por/','']){
    if(await probeImage(IPMA_RADAR_BASE+pre+samplePath)){
      ipmaRadarPrefix=pre;lsSet('ipmaRadarPrefix',pre);
      console.info('[IPMA Radar] prefix resolved:',pre||'(root)');
      return pre;
    }
  }
  ipmaRadarPrefix='por/';
  return 'por/';
}

async function ipmaRadarFrames(){
  try{
    const r=await fetchJSON(WORKER+'/ipma-radar');
    // Estrutura real: {"Portugal":[{date,path},...]} — pode ter mais regiões no futuro
    const all=[];
    for(const region of Object.keys(r||{})){
      const arr=Array.isArray(r[region])?r[region]:[];
      for(const f of arr){
        if(!f||!f.path) continue;                                  // path:null = frame ainda não processado
          const time=Date.parse(String(f.date||'').replace(' ','T'))||0;
        if(!time) continue;
        all.push({time,path:f.path,region});
      }
    }
    all.sort((a,b)=>a.time-b.time);   // mais antiga primeiro, mais recente por último
    if(!all.length){console.warn('[IPMA Radar] no frames with paths');return null}
    const out=all.slice(-12);
    console.info('[IPMA Radar]',out.length,'frames ·',new Date(out[0].time).toISOString(),'→',new Date(out[out.length-1].time).toISOString());
    return out;
  }catch(e){console.warn('[IPMA Radar]',e.message);return null}
}



/* ============ RainViewer (global) ============ */
let rainViewerFrames = null;
let rainViewerCacheAt = 0;

async function rainViewerLoad() {
  if (rainViewerFrames && Date.now() - rainViewerCacheAt < 5 * 60 * 1000) {
    return rainViewerFrames;
  }
  try {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const radar = j.radar || {};
    const past = (radar.past || []).map(f => ({ time: f.time * 1000, path: f.path }));
    const nowcast = (radar.nowcast || []).map(f => ({ time: f.time * 1000, path: f.path, fc: true }));
    rainViewerFrames = { host: j.host, past, nowcast, all: [...past, ...nowcast] };
    rainViewerCacheAt = Date.now();
    return rainViewerFrames;
  } catch (e) {
    console.warn('[RainViewer]', e.message);
    return null;
  }
}

function rainViewerTileURL(host, path, colorScheme = 4, options = '0_0') {
  return `${host}${path}/256/{z}/{x}/{y}/${colorScheme}/${options}.png`;
}
