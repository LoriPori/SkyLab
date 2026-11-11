/* Skylab · tabs.js — tabs: Today, UV, Week, Sea, Air & pollen, Science, count-up, ticker · load order 11/28 (classic script, shared global scope) */
/* ============ tabs ============ */
const TABS=[['today','Today'],['week','Week'],['radar','Radar'],['uv','UV'],['air','Air & pollen'],['sky','Sky Explained'],['sci','Science']];
function shell(){
 return`<div class="tabs" role="tablist" id="tabs"><i class="ind" id="ind"></i>${TABS.map(([k,n])=>`<button class="tab" role="tab" data-t="${k}" aria-selected="${k==tab}">${n}</button>`).join('')}</div><div id="pane"></div>`;
}
function moveInd(){
 const b=$('.tab[aria-selected=true]'),i=$('#ind');if(!b||!i)return;
 i.style.left=b.offsetLeft+'px';i.style.width=b.offsetWidth+'px';
}
const PANES={today:()=>todayPane(),week:()=>weekPane(),radar:()=>radarPane(),uv:()=>uvPane(),air:()=>airPane(),sky:()=>skyPane(),sci:()=>sciPane()};
const INIT={today:()=>scrub(),radar:()=>radarInit()};
function setTab(k){
 radarStop();
 tab=k;$$('.tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.t==k));moveInd();
 const pane=$('#pane');pane.innerHTML=PANES[k]();
 if(INIT[k])INIT[k]();
 if(k==='sky')initSparkTooltip();   // <-- adicionar esta linha
 runCounters(pane);
}

/* --- Today --- */
function ringHTML(ci){
 const C=2*Math.PI*30;
 return`<div class="ringw" title="Comfort score"><svg viewBox="0 0 76 76" width="76" height="76" role="img" aria-label="Comfort score ${ci.s} out of 100"><circle cx="38" cy="38" r="30" fill="none" stroke="rgba(20,49,79,.12)" stroke-width="7"/><circle class="rg" cx="38" cy="38" r="30" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-ci.s/100)}" style="--C:${C}" transform="rotate(-90 38 38)"/><text x="38" y="45" text-anchor="middle" font-family="Instrument Serif,serif" font-size="24" fill="#14314f">${ci.s}</text></svg><small>${ci.lab}</small></div>`;
}
function chartSVG(){
 const h=data.hourly,i0=idx0();
 const v=h.temperature_2m.slice(i0,i0+25),pp=h.precipitation_probability.slice(i0,i0+25),tt=h.time.slice(i0,i0+25);
 const lo=Math.min(...v),hi=Math.max(...v),sp=hi-lo||1,n=v.length-1;
 const X=i=>24+i*(552/n),Y=x=>38+(hi-x)/sp*66;
 let d=`M${X(0)},${Y(v[0])}`;
 for(let i=1;i<=n;i++){const m=(X(i-1)+X(i))/2;d+=` C${m},${Y(v[i-1])} ${m},${Y(v[i])} ${X(i)},${Y(v[i])}`}
 const bars=pp.map((p,i)=>`<rect class="rb" style="--i:${i}" x="${X(i)-4}" y="${140-p*.3}" width="8" height="${Math.max(0,p*.3)}" rx="3" fill="#3b8fe0" opacity=".28"/>`).join('');
 const pct=i=>((X(i)-X(0))/(X(n)-X(0))*100).toFixed(1)+'%';
 const stops=v.map((x,i)=>`<stop offset="${pct(i)}" stop-color="${tempColor(x)}"/>`).join('');
 const areaStops=v.map((x,i)=>`<stop offset="${pct(i)}" stop-color="${tempColor(x)}" stop-opacity=".3"/>`).join('');
 const pts=v.map((x,i)=>i%4==0?`<circle cx="${X(i)}" cy="${Y(x)}" r="4.5" fill="${tempColor(x)}" stroke="#fff" stroke-width="1.5"/><text x="${X(i)}" y="${Y(x)-12}" text-anchor="middle" font-size="13" font-weight="600" fill="#14314f">${T(x)}°</text><text x="${X(i)}" y="162" text-anchor="middle" font-size="11" fill="rgba(20,49,79,.6)">${i?tt[i].slice(11,13)+'h':'Now'}</text>`:'').join('');
 return`<div class="chartbox"><svg viewBox="0 0 600 170" role="img" aria-label="Temperature over the next 24 hours" style="width:100%;height:auto;display:block"><defs>
 <linearGradient id="tgrad" gradientUnits="userSpaceOnUse" x1="${X(0)}" y1="0" x2="${X(n)}" y2="0">${stops}</linearGradient>
 <linearGradient id="agrad" gradientUnits="userSpaceOnUse" x1="${X(0)}" y1="0" x2="${X(n)}" y2="0">${areaStops}</linearGradient>
 <linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
 <mask id="fade"><rect x="0" y="0" width="600" height="140" fill="url(#ar)"/></mask></defs>
 ${bars}<g mask="url(#fade)"><path d="${d} L${X(n)},140 L${X(0)},140Z" fill="url(#agrad)"/></g>
 <path d="${d}" pathLength="1" class="draw" fill="none" stroke="url(#tgrad)" stroke-width="3.5" stroke-linecap="round"/>${pts}</svg></div>
 <div class="tlegend"><span>Cooler</span><div class="tgbar" style="background:linear-gradient(90deg,${tempColor(lo)},${tempColor((lo+hi)/2)},${tempColor(hi)})"></div><span>Warmer</span><span style="margin-left:10px">▮ rain chance</span></div>`;
}
function sunSVG(){
 const d=data.daily,now=new Date(data.current.time),sr=new Date(d.sunrise[0]),ss=new Date(d.sunset[0]);
 const up=now>=sr&&now<=ss;let t;
 if(up)t=(now-sr)/(ss-sr);
 else{const a=now<sr?new Date(ss-864e5):ss,b=now<sr?sr:new Date(d.sunrise[1]||sr.getTime()+864e5);t=Math.min(1,Math.max(0,(now-a)/(b-a)))}
 const P='M20,100 Q150,-20 280,100';
 const body=up?'<circle r="20" fill="#ffd166" opacity=".4" class="glow"/><circle r="10" fill="#f6a81c"/>':'<circle r="9" fill="#e9eeff" stroke="#6b7bd6" stroke-width="1.5"/>';
 return`<svg viewBox="0 0 300 124" role="img" aria-label="Sun position" style="width:100%;height:auto"><path class="arc" d="${P}" fill="none" stroke="rgba(20,49,79,.35)" stroke-width="2"/><line x1="0" y1="100" x2="300" y2="100" stroke="rgba(20,49,79,.2)"/><g><animateMotion dur="${still?.01:2.6}s" path="${P}" keyPoints="0;${t.toFixed(3)}" keyTimes="0;1" calcMode="linear" fill="freeze"/>${body}</g><text x="20" y="118" font-size="12" fill="rgba(20,49,79,.65)">${fmtT(d.sunrise[0])}</text><text x="280" y="118" font-size="12" text-anchor="end" fill="rgba(20,49,79,.65)">${fmtT(d.sunset[0])}</text></svg>`;
}
/* ============ New Feature: Celestial Ephemeris & Stargazing Seeing ============ */
function ephemerisData(){
 const d=data.daily,c=data.current,h=data.hourly,i0=idx0();
 const sr=new Date(d.sunrise[0]),ss=new Date(d.sunset[0]);
 
 // Hora Dourada: ~45 min antes do pôr do sol
 const ghStart=new Date(ss.getTime()-45*60000);
 // Hora Azul: ~15 a 35 min após o pôr do sol
 const bhStart=new Date(ss.getTime()+15*60000);
 
 const fmtH=dt=>dt.toLocaleTimeString(LOC(),{hour:'2-digit',minute:'2-digit'});
 
 // Índice de Observação Astronómica (Seeing 0-100)
 const cloudProb=Math.max(...h.precipitation_probability.slice(i0,i0+6));
 const rh=c.relative_humidity_2m;
 const moonLit=moon().lit;
 
 const seeingScore=Math.max(5,Math.min(100,Math.round(100 - (cloudProb*0.5) - (rh*0.25) - (moonLit*0.25))));
 const seeingLabel=seeingScore>=75?tr('Optimal Seeing'):seeingScore>=50?tr('Fair Seeing'):tr('Obscured / Hazy');
 
 return{
  gh:`${fmtH(ghStart)} – ${fmtH(ss)}`,
  bh:`${fmtH(bhStart)}`,
  seeingScore,
  seeingLabel
 };
}

function sourceBadge(){
 if(!data||!place)return'';
 const c=data.current;
 // usa o offset da API em vez de confiar no parsing de timezone do browser
 const apiNow = data.utc_offset_seconds!=null
   ? Date.now() + data.utc_offset_seconds*1000
   : Date.now();
 const stale = apiNow - new Date(c.time).getTime() > 60*60*1000;
 const dot = stale ? '#f59a3a' : '#2fb34a';
 const label = stale ? tr('Stale data') : tr('Live');
 return`<div class="src-badge">
 <span class="src-dot${stale?'':' live'}" style="background:${dot}"></span>
 <span>${label}</span>
 ${place.lat!=null?`<span class="src-sep">·</span><span class="src-coords">${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}</span>`:''}
 </div>`;
}
function stationHTML(){
 const s = extras.station;
 if(!s) return '';
 const fresh = data && (Date.now() - new Date(data.current.time).getTime()) < 30*60*1000;
 return`<div class="station-row">
   <span class="src-dot${fresh?' live':''}" style="background:${fresh?'#2fb34a':'#f59a3a'}"></span>
   <div class="station-info">
     <b>${escH(s.name)}</b>
     <small>${s.lat!=null?s.lat.toFixed(2):'—'}, ${s.lon!=null?s.lon.toFixed(2):'—'}${s.id?' · ID '+escH(s.id):''}</small>
   </div>
   <span class="station-src">NOAA ISD</span>
 </div>`;
}
async function loadStation(){
 const key = place.lat+','+place.lon;
 if(extras.stationKey===key && extras.station) return;
 extras.stationKey = key;
 extras.station = null;
 try{
  const r = await fetch(`https://www.ncei.noaa.gov/access/services/search/v1/data?dataset=global-hourly&bbox=${(place.lon-1).toFixed(2)},${(place.lat-1).toFixed(2)},${(place.lon+1).toFixed(2)},${(place.lat+1).toFixed(2)}&limit=1&format=json`);
  if(!r.ok) throw 0;
  const j = await r.json();
  const s = j.results && j.results[0];
  if(!s) throw 0;
  extras.station = { id: s.station || '', name: s.name || s.station || '—', lat: +s.latitude, lon: +s.longitude };
  putExtra('station', stationHTML());
 }catch(e){ /* sem estação disponível: não mostra nada */ }
}

function todayPane(){
 const c=data.current,d=data.daily,m=moon(),uv=d.uv_index_max[0],ci=comfortInfo(),h=data.hourly;
 const uvl=uv<3?'Low':uv<6?'Moderate':uv<8?'High':uv<11?'Very high':'Extreme';
 const best=ci.best<0?'Daylight has passed for today.':`Best time outside: <b>${new Date(h.time[ci.best]).toLocaleTimeString('en',{hour:'numeric'})}</b> · ${T(h.temperature_2m[ci.best])}° · ${h.precipitation_probability[ci.best]}% rain`;
 return`${window.SkyOrb?SkyOrb.html():''}<div class="pane g2"> <section class="card"> ${sourceBadge()}
  <div class="strip">
   ${ringHTML(ci)}
   <div class="mini"><span>Wind</span><b><svg class="wind" style="--r:${(c.wind_direction_10m||0)+180}deg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 9h-4v9h-2v-9H7z" fill="currentColor"/></svg>${W(c.wind_speed_10m)}</b></div>
   <div class="mini"><span>Humidity</span><b>${c.relative_humidity_2m}%</b><div class="bar2"><i style="--w:${c.relative_humidity_2m}%"></i></div></div>
   <div class="mini"><span>UV · ${uvl}</span><b>${Math.round(uv)}</b><div class="bar2"><i style="--w:${Math.min(100,uv/11*100)}%"></i></div></div>
   <div class="mini"><span>Pressure</span><b>${pN(c.surface_pressure)}<small>${pU()}</small></b></div>
   </div>
  ${chartSVG()}
 </section>
 <section class="card side">
  <div><h3>Sun and moon</h3>${sunSVG()}</div>
  <div class="moonrow"><span>${moonIcon()}</span><div><b>${m.n}</b><small>${m.lit}% illuminated</small></div></div>
  
  <!-- New Feature: Celestial Ephemeris & Stargazing Seeing -->
  <div class="ephem">
   <div><span>${tr('Golden hour')}</span><b>${ephemerisData().gh}</b></div>
   <div><span>${tr('Stargazing index')}</span><b>${ephemerisData().seeingScore}% · ${ephemerisData().seeingLabel}</b></div>
  </div>

 <p class="best">${best}</p>
 <div id="station">${stationHTML()}</div>
</section></div>${xtraHTML()}`;
}
function scrub(){
 const svg=$('.chartbox svg');if(!svg)return;
 const h=data.hourly,i0=idx0(),v=h.temperature_2m.slice(i0,i0+25),n=v.length-1,box=svg.parentElement;
 const tip=document.createElement('div');tip.className='tip';box.appendChild(tip);
 svg.insertAdjacentHTML('beforeend','<line id="sl" y1="18" y2="140" stroke="#14314f" stroke-opacity=".5" stroke-dasharray="3 4" style="opacity:0;transition:opacity .2s"/>');
 const ln=svg.querySelector('#sl');
 const mv=e=>{
  const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*600,i=Math.max(0,Math.min(n,Math.round((x-24)/(552/n))));
  const px=24+i*(552/n);ln.setAttribute('x1',px);ln.setAttribute('x2',px);ln.style.opacity=1;
  const j=i0+i;tip.style.left=`clamp(44px, ${px/600*100}%, calc(100% - 44px))`;tip.style.opacity=1;
  tip.innerHTML=`<b>${T(v[i])}°</b><br><small>${new Date(h.time[j]).toLocaleTimeString('en',{hour:'numeric'})} · ${h.precipitation_probability[j]}% rain</small>`;
 };
 svg.addEventListener('pointermove',mv);svg.addEventListener('pointerdown',mv);
 svg.addEventListener('pointerleave',()=>{ln.style.opacity=0;tip.style.opacity=0});
}

/* --- UV: proteção solar personalizada --- */
const UV_PHOTOTYPES=[
 {n:1,med:200,col:'#fde8d7',en:'Very fair',pt:'Muito clara',enDesc:'Always burns, never tans',ptDesc:'Queima sempre, não bronzeia'},
 {n:2,med:250,col:'#f7d8bb',en:'Fair',pt:'Clara',enDesc:'Usually burns, tans a little',ptDesc:'Queima facilmente, bronzeia pouco'},
 {n:3,med:350,col:'#e8be96',en:'Medium',pt:'Média',enDesc:'May burn, gradually tans',ptDesc:'Pode queimar, bronzeia gradualmente'},
 {n:4,med:500,col:'#c99368',en:'Olive',pt:'Oliva',enDesc:'Rarely burns, tans easily',ptDesc:'Raramente queima, bronzeia facilmente'},
 {n:5,med:650,col:'#8d5633',en:'Brown',pt:'Castanha',enDesc:'Very rarely burns',ptDesc:'Muito raramente queima'},
 {n:6,med:1000,col:'#422818',en:'Dark brown',pt:'Castanho-escura',enDesc:'Rarely burns',ptDesc:'Raramente queima'}
];
function uvLevel(u){return u<3?T2('Low','Baixo'):u<6?T2('Moderate','Moderado'):u<8?T2('High','Alto'):u<11?T2('Very high','Muito alto'):T2('Extreme','Extremo')}
function uvColour(u){return u<3?'#2fb34a':u<6?'#e6a317':u<8?'#e56d2f':u<11?'#d64343':'#7c3db8'}
function uvBurnMinutes(u,photo){return u>.1?Math.max(1,Math.round(photo.med/(u/40)/60)):null}
function uvDuration(min){if(min==null)return T2('No measurable UV','Sem UV mensurável');if(min<60)return `${min} ${T2('min','min')}`;const h=Math.floor(min/60),m=min%60;return `${h} ${T2('h','h')}${m?` ${m} ${T2('min','min')}`:''}`}
function uvHourly(){
 const h=data.hourly||{},start=idx0(),out=[];
 for(let i=start;i<Math.min(h.time.length,start+13);i++){
  const direct=Number(h.uv_index&&h.uv_index[i]);
  const estimate=Number(h.shortwave_radiation&&h.shortwave_radiation[i]);
  out.push({i,time:h.time[i],uvi:Number.isFinite(direct)?Math.max(0,direct):Math.max(0,estimate/100),live:Number.isFinite(direct),day:!!(h.is_day&&h.is_day[i])});
 }
 return out;
}
function uvPane(){
 const c=data.current,d=data.daily,types=UV_PHOTOTYPES;
 const saved=+lsGet('uvPhototype')||3,photo=types.find(x=>x.n===saved)||types[2];
 const hours=uvHourly(),hourNow=hours[0];
 const live=Number(c.uv_index),peak=Math.max(0,Number(d.uv_index_max&&d.uv_index_max[0])||0);
 const shownUV=c.is_day&&(Number.isFinite(live)?live:(hourNow&&hourNow.uvi)||0);
 const burn=uvBurnMinutes(shownUV,photo),risk=shownUV||peak,colour=uvColour(risk);
 const spf=peak>=6||photo.n<=2?'SPF 50+':peak>=3?'SPF 30+':T2('SPF 30 for extended time','FPS 30 para exposição prolongada');
 const shades=peak>=3?T2('Take UV400 sunglasses','Leva óculos de sol UV400'):T2('Useful in bright conditions','Úteis com muita luminosidade');
 const safe=hours.find((x,n)=>n>0&&x.day&&x.uvi<3),sunset=hours.find((x,n)=>n>0&&!x.day);
 const safeText=safe?T2(`UV drops below 3 around ${safe.time.slice(11,16)}.`, `O UV baixa de 3 por volta das ${safe.time.slice(11,16)}.`):sunset?T2(`Sunset is around ${sunset.time.slice(11,16)}.`, `O pôr do sol é por volta das ${sunset.time.slice(11,16)}.`):T2('No lower-UV daylight window appears in the next 12 hours.','Não há uma janela diurna de UV baixo nas próximas 12 horas.');
 const ring=Math.min(1,risk/12),dash=(2*Math.PI*38).toFixed(1),offset=(2*Math.PI*38*(1-ring)).toFixed(1);
 const timerOffset=(2*Math.PI*77*(1-Math.min(1,Math.max(.08,90/(burn||90))))).toFixed(1);
 const timerText=shownUV>.1?uvDuration(burn):T2('Sun is low','Sol baixo');
 const bars=hours.map((x,n)=>{const v=Math.min(12,x.uvi),now=n===0?' now':'',label=x.time.slice(11,16),h=Math.max(3,v/12*100);return`<div class="uv-hbar${now}"><span class="uv-hval">${x.uvi.toFixed(1)}</span><span class="uv-hpillar"><i style="height:${h}%;background:${uvColour(v)}"></i></span><span class="uv-htime">${n===0?T2('Now','Agora'):label}</span></div>`}).join('');
 const cards=types.map(x=>`<button type="button" class="uv-pt-card${x.n===photo.n?' on':''}" data-uv-type="${x.n}" aria-pressed="${x.n===photo.n}" style="--pt-col:${x.col}"><i class="uv-pt-swatch" style="background:${x.col}"></i><b class="uv-pt-num">${T2('Type','Tipo')} ${x.n}</b><span class="uv-pt-name">${T2(x.en,x.pt)}</span><small class="uv-pt-desc">${T2(x.enDesc,x.ptDesc)}</small></button>`).join('');
 return`<div class="uv-pane" style="--uv-col:${colour}">
  <section class="card uv-hero">
   <div class="uv-hero-left"><span class="uv-hero-tag">${T2('Sun protection planner','Planeador de proteção solar')}</span><div class="uv-hero-score"><b class="uv-hero-num">${shownUV.toFixed(1)}</b><span class="uv-hero-cat"><b>${uvLevel(risk)}</b><small>${T2('UV now','UV agora')} · ${T2('peak','máximo')} ${peak.toFixed(1)}</small></span></div><p class="uv-hero-meta">${T2('For','Para')} <b>${escH(place.name)}</b> · ${c.is_day?T2('live forecast conditions','condições previstas em tempo real'):T2('the Sun is below the horizon','o Sol está abaixo do horizonte')}</p></div>
   <div class="uv-hero-right"><div class="uv-sun-gauge"><svg class="uv-ring-svg" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="38" fill="none" stroke="rgba(20,49,79,.1)" stroke-width="8"/><circle cx="44" cy="44" r="38" fill="none" stroke="${colour}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" transform="rotate(-90 44 44)"/></svg><span class="uv-sun-icon" aria-hidden="true">☀️</span></div></div>
  </section>
  <section class="card uv-card"><div class="uv-card-h"><span class="uv-card-ico">◐</span><div><h4>${T2('Choose your skin type','Escolhe o teu tipo de pele')}</h4><span class="uv-card-sub">${T2('A personal estimate uses your selected phototype.','A estimativa pessoal usa o fotótipo selecionado.')}</span></div></div><div class="uv-grad-wrap" aria-hidden="true"><div class="uv-grad-bar"></div><i class="uv-grad-indicator" style="left:${(photo.n-1)/5*100}%;background:${photo.col}"></i></div><div class="uv-pt-grid" role="group" aria-label="${T2('Skin phototype','Fotótipo de pele')}">${cards}</div></section>
  <section class="card uv-card"><div class="uv-card-h"><span class="uv-card-ico">◷</span><div><h4>${T2('Time until burn','Tempo até queimar')}</h4><span class="uv-card-sub">${T2('Estimated time until unprotected skin could start to redden at the UV level now.','Tempo estimado até a pele desprotegida poder começar a ficar vermelha com o UV atual.')}</span></div></div><div class="uv-timer-body"><div class="uv-timer-clock-wrap"><svg class="uv-clock-ring" viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="77" fill="none" stroke="rgba(20,49,79,.09)" stroke-width="10"/><circle cx="90" cy="90" r="77" fill="none" stroke="${colour}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(2*Math.PI*77).toFixed(1)}" stroke-dashoffset="${timerOffset}" transform="rotate(-90 90 90)"/></svg><div class="uv-clock-center"><div class="uv-timer-val"><b class="uv-timer-digits">${timerText}</b><small>${shownUV>.1?T2('without sunscreen','sem protetor solar'):T2('no burn timer while UV is near zero','sem temporizador com UV perto de zero')}</small></div></div></div><div class="uv-timer-ctrls"><p class="uv-vitd-p">${T2(`Based on skin type ${photo.n} and UVI ${shownUV.toFixed(1)}. This is a cautious guide, not a guarantee: water, altitude, medicines and reflection can shorten it.`, `Baseado no tipo de pele ${photo.n} e UV ${shownUV.toFixed(1)}. É uma orientação cautelosa, não uma garantia: água, altitude, medicamentos e reflexão podem encurtar o tempo.`)}</p><p class="uv-vitd-p"><b>${T2('Formula','Fórmula')}:</b> ${T2('typical redness threshold ÷ (UVI ÷ 40).','limiar típico de vermelhidão ÷ (UV ÷ 40).')}</p></div></div></section>
  <section class="card uv-card"><div class="uv-card-h"><span class="uv-card-ico">✓</span><div><h4>${T2('What to take','O que levar')}</h4><span class="uv-card-sub">${T2('Recommendations reflect today’s forecast peak.','As recomendações refletem o máximo previsto para hoje.')}</span></div></div><div class="uv-gear-grid"><article class="uv-gear-item${peak>=3?' alert':''}"><div class="uv-gi-top"><span class="uv-gi-icon">🧴</span><b class="uv-gi-badge spf">${spf}</b></div><b class="uv-gi-title">${T2('Sunscreen','Protetor solar')}</b><p class="uv-gi-desc">${T2('Broad-spectrum, water-resistant. Reapply every 2 hours and after swimming or sweating.','Espetro amplo e resistente à água. Reaplica de 2 em 2 horas e depois de nadar ou transpirar.')}</p></article><article class="uv-gear-item${peak>=3?' alert':''}"><div class="uv-gi-top"><span class="uv-gi-icon">🕶️</span><b class="uv-gi-badge ${peak>=3?'rec':'opt'}">${peak>=3?T2('Recommended','Recomendado'):T2('Optional','Opcional')}</b></div><b class="uv-gi-title">${T2('Sunglasses','Óculos de sol')}</b><p class="uv-gi-desc">${shades}. ${T2('Look for a CE mark and 100% UVA/UVB or UV400 protection.','Procura marcação CE e 100% de proteção UVA/UVB ou UV400.')}</p></article><article class="uv-gear-item"><div class="uv-gi-top"><span class="uv-gi-icon">🧢</span><b class="uv-gi-badge opt">${T2('Best extra','Melhor extra')}</b></div><b class="uv-gi-title">${T2('Shade and cover','Sombra e cobertura')}</b><p class="uv-gi-desc">${peak>=6?T2('Use shade, a wide-brim hat and covering clothing, especially from late morning to mid-afternoon.','Usa sombra, chapéu de aba larga e roupa que cubra a pele, sobretudo entre o fim da manhã e meio da tarde.'):T2('A hat and shade still reduce exposure, even when the index is moderate.','Um chapéu e a sombra continuam a reduzir a exposição, mesmo com índice moderado.')}</p></article></div></section>
  <section class="card uv-card"><div class="uv-card-h"><span class="uv-card-ico">⌁</span><div><h4>${T2('UV forecast and safer hours','Previsão UV e horas mais seguras')}</h4><span class="uv-card-sub">${safeText}</span></div><span class="uv-card-pill" style="background:${colour}20;color:${colour}">${T2('Next 12 h','Próximas 12 h')}</span></div><div class="uv-chart-wrap"><div class="uv-chart-bars" role="img" aria-label="${T2('Hourly UV forecast','Previsão UV por hora')}">${bars}</div></div><p class="uv-vitd-p">${T2('This is an extra planning tool: UV can still cause damage on cloudy days, and snow, sand and water reflect it.','Esta é uma ferramenta extra de planeamento: o UV pode causar danos mesmo com nuvens, e a neve, areia e água refletem-no.')}</p></section>
 </div>`;
}

/* --- Week --- */
/* ============ "Porquê": explica a semana a partir do vento, da pressão e da humidade (substitui os cartões de destaques) ============ */
// [en, pt, latMin, latMax, lonMin, lonMax, 'l' terra | 's' mar] — a primeira que corresponder ganha, por isso as mais específicas vêm antes
const WHY_REG=[
 ['Antarctica','a Antártida',-90,-62,-180,180,'l'],['the Arctic','o Ártico',72,90,-180,180,'s'],
 ['Greenland and the far North Atlantic','a Gronelândia e o extremo norte do Atlântico',60,84,-75,-12,'l'],
 ['the Maghreb (North Africa)','o Magrebe (Norte de África)',30,37.5,-10,12,'l'],['the Sahara','o Saara',15,30,-17,35,'l'],
 ['the Sahel and West Africa','o Sael e a África Ocidental',4,15,-17,25,'l'],['the Arabian Peninsula and Middle East','a Península Arábica e o Médio Oriente',12,38,35,60,'l'],
 ['East Africa','a África Oriental',-12,12,25,52,'l'],['the Congo basin','a bacia do Congo',-12,4,8,25,'l'],['southern Africa','a África Austral',-35,-12,10,42,'l'],
 ['the Iberian Peninsula','a Península Ibérica',36,44,-10,3.5,'l'],['the British Isles','as Ilhas Britânicas',50,60,-11,2,'l'],
 ['France and western Europe','a França e a Europa Ocidental',42,51.5,-5,8,'l'],['central Europe','a Europa Central',44,55,8,24,'l'],
 ['Scandinavia','a Escandinávia',55,72,4,32,'l'],['eastern Europe and Russia','a Europa de Leste e a Rússia',44,70,24,60,'l'],
 ['the Mediterranean','o Mediterrâneo',30,46,-6,36,'s'],['Central Asia','a Ásia Central',35,55,50,90,'l'],['Siberia','a Sibéria',50,80,60,180,'l'],
 ['East Asia','o Leste Asiático',20,50,100,146,'l'],['South Asia','o Sul da Ásia',5,35,60,100,'l'],['Southeast Asia','o Sudeste Asiático',-10,20,95,140,'l'],
 ['Australia','a Austrália',-40,-11,112,154,'l'],['the Gulf of Mexico','o Golfo do México',18,30.5,-98,-80,'s'],['the Caribbean','as Caraíbas',8,24,-86,-60,'s'],
 ['Mexico and Central America','o México e a América Central',7,32,-118,-86,'l'],['Canada','o Canadá',49,72,-141,-52,'l'],
 ['the western United States','o Oeste dos EUA',31,49,-125,-104,'l'],['the US Great Plains','as Grandes Planícies dos EUA',25,49,-104,-90,'l'],
 ['the eastern United States','o Leste dos EUA',25,49,-90,-67,'l'],['the Amazon','a Amazónia',-15,8,-75,-45,'l'],
 ['southern South America','o Sul da América do Sul',-56,-15,-76,-40,'l'],
 ['the North Atlantic','o Atlântico Norte',40,72,-65,-10,'s'],['the subtropical Atlantic (Azores and Canaries)','o Atlântico subtropical (Açores e Canárias)',20,40,-50,-8,'s'],
 ['the tropical Atlantic','o Atlântico tropical',-25,20,-65,15,'s'],['the South Atlantic','o Atlântico Sul',-60,-20,-65,20,'s'],
 ['the North Pacific','o Pacífico Norte',20,65,-180,-125,'s'],['the North Pacific','o Pacífico Norte',20,65,140,180,'s'],
 ['the tropical Pacific','o Pacífico tropical',-25,20,-180,-76,'s'],['the tropical Pacific','o Pacífico tropical',-25,20,140,180,'s'],
 ['the South Pacific','o Pacífico Sul',-60,-25,-180,-70,'s'],['the South Pacific','o Pacífico Sul',-60,-25,150,180,'s'],
 ['the Indian Ocean','o Oceano Índico',-45,22,40,120,'s'],['the Southern Ocean','o Oceano Austral',-62,-45,-180,180,'s']
];
const whyRegion=(lat,lon)=>{for(const r of WHY_REG)if(lat>=r[2]&&lat<=r[3]&&lon>=r[4]&&lon<=r[5])return r;
 const a=Math.abs(lat);return a<23.5?['the tropics','os trópicos',0,0,0,0,'s']:a<50?['mid-latitude air','o ar das latitudes médias',0,0,0,0,'s']:['high-latitude air','o ar das latitudes altas',0,0,0,0,'s']};
function whyDest(lat,lon,brg,km){const R=6371,d=km/R,b=brg*Math.PI/180,p1=lat*Math.PI/180,l1=lon*Math.PI/180,
  p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(b)),
  l2=l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
 return[p2*180/Math.PI,((l2*180/Math.PI+540)%360)-180]}
const WHY_C8=[['north','norte'],['north-east','nordeste'],['east','leste'],['south-east','sudeste'],['south','sul'],['south-west','sudoeste'],['west','oeste'],['north-west','noroeste']];
const whyCompass=deg=>WHY_C8[Math.round(((deg%360)+360)%360/45)%8];
function weekWhy(){
 try{
  const d=data.daily,h=data.hourly,pt=LANG==='pt',L=(a,b)=>pt?b:a,la=place.lat,lo=place.lon,aLat=Math.abs(la);
  const wd=(t,k)=>k===0?L('today','hoje'):new Date(t+'T12:00').toLocaleDateString(LOC(),{weekday:'long'});
  const ang=(a,b)=>Math.abs(((a-b+540)%360)-180);
  const D=[];
  for(let k=0;k<d.time.length;k++){
   const ix=[];for(let i=0;i<h.time.length;i++)if(h.time[i].slice(0,10)===d.time[k])ix.push(i);
   if(ix.length<18)continue;
   let sx=0,sy=0,sp=0,gu=0,pr=0,rain=0,wet=0,conv=0,snow=0,dp=0,dn=0;
   for(const i of ix){const s=h.wind_speed_10m[i]||0,a=(h.wind_direction_10m[i]||0)*Math.PI/180;sx+=s*Math.sin(a);sy+=s*Math.cos(a);sp+=s;gu=Math.max(gu,h.wind_gusts_10m?h.wind_gusts_10m[i]||0:0);pr+=h.pressure_msl[i];
    rain=Math.max(rain,h.precipitation_probability[i]||0);const c=h.weather_code[i];if(c>=51&&c<=67||c>=80&&c<=82||c>=95)wet++;if(c>=80&&c<=82||c>=95)conv++;if(c>=71&&c<=77||c===85||c===86)snow++;
    const hr=+h.time[i].slice(11,13);if(hr>=11&&hr<=16){dp+=h.temperature_2m[i]-h.dew_point_2m[i];dn++}}
   const n=ix.length,spd=sp/n,dir=(Math.atan2(sx,sy)*180/Math.PI+360)%360,calm=spd<9;
   const km=Math.max(600,Math.min(2500,spd*30)),src=calm?null:whyDest(la,lo,dir,km),reg=src?whyRegion(src[0],src[1]):null;
   D.push({k,t:d.time[k],ix,tmax:d.temperature_2m_max[k],tmin:d.temperature_2m_min[k],spd,gu,dir,calm,reg,sLat:src?Math.abs(src[0]):null,
    p:pr/n,p0:h.pressure_msl[ix[0]],p1:h.pressure_msl[ix[n-1]],rain,wet,conv,snow,dep:dn?dp/dn:6})
  }
  if(D.length<3)return'';
  const warmth=x=>x.calm||x.sLat==null?0:(x.sLat<aLat-3?1:x.sLat>aLat+3?-1:0);
  const moist=x=>x.dep<4?'h':x.dep>=9?'d':'';
  const air=x=>{ if(x.calm)return L('light-wind air that stays local','ar parado, com vento fraco');
   const w=warmth(x),m=moist(x),sea=x.reg&&x.reg[6]==='s';
   let a=w>0?(x.tmax>=30?L('hot','muito quente'):L('warm','quente')):w<0?L('cold','frio'):(sea?L('mild','ameno'):L('continental','continental'));
   if(m==='d')a+=L(', dry',' e seco');else if(m==='h')a+=w<0?L(', damp',' e húmido'):L(', humid',' e húmido');
   return a};
  const reg=x=>x.reg?L(x.reg[0],x.reg[1]):'';
  const dirN=x=>whyCompass(x.dir)[pt?1:0];
  const tm=D.map(x=>(x.tmax+x.tmin)/2),P=[];
  const say=(ic,txt)=>{txt=txt.replace(/<b>(\p{L})/u,(m,c)=>'<b>'+c.toUpperCase());if(pt)txt=txt.replace(/ de (o|a|os|as) /g,(m,x)=>' d'+x+' ');P.push(`<p><span class="why-i">${ic}</span><span>${txt}</span></p>`)};

  // 1) temperatura: a maior mudança de um dia para o outro e o que a causa
  let bi=-1,bd=0;for(let k=0;k<D.length-1;k++){const x=tm[k+1]-tm[k];if(Math.abs(x)>Math.abs(bd)){bd=x;bi=k}}
  const tmin=Math.min(...D.map(x=>x.tmin)),tmax=Math.max(...D.map(x=>x.tmax));
  if(Math.abs(bd)>=3){
   const a=D[bi],b=D[bi+1],dd=Math.abs(Math.round(bd)),warmer=bd>0;
   say(warmer?'🌡️':'🥶',L(`<b>${wd(b.t,b.k)} turns ${dd}° ${warmer?'warmer':'cooler'}.</b> `,`<b>${wd(b.t,b.k)} fica ${dd}° mais ${warmer?'quente':'frio'}.</b> `)+
    (b.calm?L('Winds are light, so the change comes mostly from sunshine and cloud rather than a new air mass.','O vento é fraco, por isso a mudança vem sobretudo do sol e das nuvens, não de uma nova massa de ar.')
    :ang(a.dir,b.dir)>=45&&!a.calm?L(`The wind swings from the ${dirN(a)} to the ${dirN(b)} and starts pulling in ${air(b)} air from ${reg(b)}.`,`O vento roda de ${dirN(a)} para ${dirN(b)} e passa a trazer ar ${air(b)} vindo de ${reg(b)}.`)
    :L(`The wind keeps blowing from the ${dirN(b)}, but the air coming in from ${reg(b)} is now ${air(b)}.`,`O vento continua de ${dirN(b)}, mas o ar que chega de ${reg(b)} é agora ${air(b)}.`)));
  }else{
   const cnt={};D.forEach(x=>{if(!x.calm){const k=whyCompass(x.dir)[0];cnt[k]=(cnt[k]||0)+1}});
   const top=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0],x=D.find(y=>!y.calm&&whyCompass(y.dir)[0]===top);
   say('🌡️',x?L(`<b>Little change in temperature (${T(tmin)}° to ${T(tmax)}°).</b> The wind keeps coming from the ${dirN(x)}, so the same ${air(x)} air from ${reg(x)} stays in charge all week.`,`<b>Pouca variação de temperatura (${T(tmin)}° a ${T(tmax)}°).</b> O vento mantém-se de ${dirN(x)}, por isso o mesmo ar ${air(x)} vindo de ${reg(x)} manda na semana toda.`)
    :L(`<b>Little change in temperature (${T(tmin)}° to ${T(tmax)}°).</b> Winds stay light, so the sun, not a new air mass, sets the rhythm.`,`<b>Pouca variação de temperatura (${T(tmin)}° a ${T(tmax)}°).</b> O vento fica fraco, por isso é o sol, e não uma nova massa de ar, que dita o ritmo.`));
  }

  // 2) pressão e chuva
  const wi=D.findIndex(x=>x.wet>=2||x.rain>=60);
  if(wi>=0){
   const w=D[wi],i1=w.ix.find(i=>{const c=h.weather_code[i];return c>=51&&c<=67||c>=80&&c<=82||c>=95})??w.ix[Math.floor(w.ix.length/2)],i0=Math.max(0,i1-24);
   const dpv=h.pressure_msl[i1]-h.pressure_msl[i0],sh=ang(h.wind_direction_10m[i0],h.wind_direction_10m[i1]),pa=Math.round(h.pressure_msl[i1]);
   if(w.snow>=2)say('❄️',L(`<b>Snow is possible on ${wd(w.t,w.k)}.</b> Moist air is lifted by an approaching system while temperatures sit around freezing (${T(w.tmin)}° to ${T(w.tmax)}°).`,`<b>Pode nevar ${w.k===0?'hoje':'em '+wd(w.t,w.k)}.</b> Ar húmido é empurrado para cima por um sistema que se aproxima, com temperaturas perto de zero (${T(w.tmin)}° a ${T(w.tmax)}°).`));
   else if(dpv<=-4)say('🌧️',L(`<b>${wd(w.t,w.k)} brings rain from an approaching front.</b> Pressure falls ${Math.abs(Math.round(dpv))} hPa in 24 hours (down to ${pa} hPa)${sh>=40?` and the wind swings from the ${whyCompass(h.wind_direction_10m[i0])[0]} to the ${whyCompass(h.wind_direction_10m[i1])[0]}`:''}: the classic sign of a low-pressure system pushing a band of cloud and moisture${w.reg?` in from ${reg(w)}`:''}.`,
     `<b>${w.k===0?'Hoje':wd(w.t,w.k)} traz chuva de uma frente que se aproxima.</b> A pressão cai ${Math.abs(Math.round(dpv))} hPa em 24 horas (até ${pa} hPa)${sh>=40?` e o vento roda de ${whyCompass(h.wind_direction_10m[i0])[1]} para ${whyCompass(h.wind_direction_10m[i1])[1]}`:''}: o sinal clássico de uma depressão a empurrar uma faixa de nuvens e humidade${w.reg?` vinda de ${reg(w)}`:''}.`));
   else if(w.conv>=1)say('⛈️',L(`<b>${wd(w.t,w.k)}: showers or thunderstorms.</b> Pressure barely moves (${pa} hPa), so no front is needed: strong daytime heating plus humid air (dew point only ${Math.round(w.dep)}° below the temperature) builds towering clouds in the afternoon.`,`<b>${w.k===0?'Hoje':wd(w.t,w.k)}: aguaceiros ou trovoada.</b> A pressão quase não muda (${pa} hPa), por isso não é preciso uma frente: o forte aquecimento do dia mais ar húmido (ponto de orvalho só ${Math.round(w.dep)}° abaixo da temperatura) forma nuvens de grande desenvolvimento à tarde.`));
   else say('☁️',L(`<b>${wd(w.t,w.k)}: a weak disturbance.</b> Pressure is steady (${pa} hPa), so there is no strong front. The rain comes from ${air(w)} air from ${w.reg?reg(w):'nearby'} being lifted over the area.`,`<b>${w.k===0?'Hoje':wd(w.t,w.k)}: uma perturbação fraca.</b> A pressão está estável (${pa} hPa), por isso não há frente forte. A chuva vem de ar ${air(w)} de ${w.reg?reg(w):'perto'} que é forçado a subir sobre a região.`));
   const lastI=(()=>{let j=wi;D.forEach((x,k)=>{if(x.wet>=2||x.rain>=60)j=k});return j})(),e=D[lastI];
   if(lastI<D.length-1){const nx=D[lastI+1],rise=nx.p1-e.p0;if(rise>=5)say('⛅',L(`<b>Clearing from ${wd(nx.t,nx.k)}.</b> Pressure climbs ${Math.round(rise)} hPa as high pressure rebuilds behind the system, and the air turns ${air(nx)}.`,`<b>A abrir a partir de ${wd(nx.t,nx.k)}.</b> A pressão sobe ${Math.round(rise)} hPa à medida que a alta pressão se reconstrói atrás do sistema, e o ar passa a ser ${air(nx)}.`))}
  }else{
   const pm=Math.round(D.reduce((s,x)=>s+x.p,0)/D.length),pl=Math.round(Math.min(...D.map(x=>x.p)));
   say(pm>=1017?'☀️':'🌤️',pm>=1017?L(`<b>No rain in the forecast.</b> Pressure stays high (around ${pm} hPa, never below ${pl}): an anticyclone keeps air sinking, which dries it out and suppresses cloud.`,`<b>Sem chuva prevista.</b> A pressão mantém-se alta (cerca de ${pm} hPa, nunca abaixo de ${pl}): um anticiclone mantém o ar a descer, o que o seca e impede a formação de nuvens.`)
    :L(`<b>No rain in the forecast.</b> Pressure is only moderate (around ${pm} hPa) but nothing organised, no front or deep low, reaches the area this week.`,`<b>Sem chuva prevista.</b> A pressão é só moderada (cerca de ${pm} hPa), mas nenhum sistema organizado, frente ou depressão cavada, chega à região esta semana.`));
  }

  // 3) vento
  const wi2=D.reduce((m,x,k)=>x.gu>D[m].gu?k:m,0),g=D[wi2],dpd=Math.abs(g.p1-g.p0);
  if(g.gu>=50)say('💨',L(`<b>Windiest on ${wd(g.t,g.k)}, gusts up to ${W(g.gu)}.</b> ${dpd>=6?`Pressure changes ${Math.round(dpd)} hPa that day: a tight pressure gradient around the passing system squeezes the isobars and speeds up the air.`:`The wind is stronger because ${air(g)} air from ${g.reg?reg(g):'upwind'} flows in with little to slow it down.`}`,`<b>Mais vento ${g.k===0?'hoje':'em '+wd(g.t,g.k)}, rajadas até ${W(g.gu)}.</b> ${dpd>=6?`A pressão muda ${Math.round(dpd)} hPa nesse dia: o gradiente de pressão à volta do sistema que passa é forte e acelera o ar.`:`O vento é mais forte porque o ar ${air(g)} de ${g.reg?reg(g):'barlavento'} chega com pouco que o trave.`}`));
  else say('🍃',L(`<b>Light winds all week</b> (gusts stay under ${W(Math.ceil((g.gu+1)/5)*5)}). No strong pressure gradient is in range.`,`<b>Vento fraco a semana toda</b> (rajadas abaixo de ${W(Math.ceil((g.gu+1)/5)*5)}). Não há nenhum gradiente de pressão forte no alcance.`));

  // 4) amplitude dia/noite
  const rg=D.reduce((s,x)=>s+(x.tmax-x.tmin),0)/D.length,dep=D.reduce((s,x)=>s+x.dep,0)/D.length;
  if(rg>=12&&dep>=6)say('🌗',L(`<b>Big swing between day and night (about ${Math.round(rg)}°).</b> Dry air and clear skies let the heat escape after dark.`,`<b>Grande diferença entre dia e noite (cerca de ${Math.round(rg)}°).</b> O ar seco e o céu limpo deixam o calor escapar depois de escurecer.`));
  else if(rg<=6&&dep<5)say('🌫️',L(`<b>Only about ${Math.round(rg)}° between day and night.</b> Humid, cloudy air acts like a blanket: it blocks the sun by day and holds the heat at night.`,`<b>Só cerca de ${Math.round(rg)}° entre dia e noite.</b> O ar húmido e nublado funciona como um cobertor: tapa o sol de dia e retém o calor à noite.`));

  const rows=D.map(x=>{const dpr=x.p1-x.p0,ar=Math.abs(dpr)<2?'→':dpr>0?'↑':'↓';
   return`<div class="why-r"><b>${new Date(x.t+'T12:00').toLocaleDateString(LOC(),{weekday:'short'})}</b><span class="why-a" style="transform:rotate(${Math.round(x.dir+180)}deg);${x.calm?'opacity:.25':''}" aria-label="${dirN(x)}">↑</span><span class="why-s">${x.calm?L('light winds','vento fraco'):reg(x)}</span><span class="why-n">${T(x.tmax)}°/${T(x.tmin)}° · ${Math.round(x.p)} hPa ${ar}</span></div>`}).join('');
  return`<section class="card why"><h3>${L('Why the week looks like this','Porque é que a semana vai ser assim')}</h3>${P.join('')}<div class="why-g" role="table" aria-label="${L('Where the air comes from, day by day','De onde vem o ar, dia a dia')}"><div class="why-h">${L('Where the air comes from','De onde vem o ar')}</div>${rows}</div><p class="why-f">${L('Interpretation based on the forecast’s wind, pressure and humidity; it is not an official synoptic analysis.','Interpretação feita a partir do vento, da pressão e da humidade da previsão; não é uma análise sinótica oficial.')}</p></section>`;
 }catch(e){console.warn('[weekWhy]',e);return''}
}
async function weekPaneAsync(){
  const d=data.daily,h=data.hourly,i0=idx0();
  const c=data.current;
  const inPT=place&&isPortugal(place.lat,place.lon);
  if(inPT&&!data.__noIpma){
    const ip=await ipmaDaily(place.lat,place.lon);
    if(ip&&ip.daily.length){
      const days=ip.daily.slice(0,7);
      const mn=Math.min(...days.map(x=>x.tMin)),mx=Math.max(...days.map(x=>x.tMax)),sp=mx-mn||1;
      const cols=days.map((x,i)=>{
        const lo=(x.tMin-mn)/sp*100,ht=Math.max(10,(x.tMax-x.tMin)/sp*100);
        const code=IPMA_TO_WMO[x.code]??2;
        const isToday=i===0;
        return`<div class="dcol" style="--n:${i}"><b>${isToday?'Today':new Date(x.date+'T12:00').toLocaleDateString(LOC(),{weekday:'short'})}</b><span class="dic">${emoji(code,1)}</span><span class="hi">${T(x.tMax)}°</span><div class="dbar"><i style="--lo:${lo}%;--h:${ht}%;--n:${i};background:linear-gradient(${tempColor(x.tMax)},${tempColor(x.tMin)})"></i></div><span class="lo">${T(x.tMin)}°</span><small>${x.rain>=20?x.rain+'%':'&nbsp;'}</small></div>`;
      }).join('');
      const hrs=h.time.slice(i0,i0+24).map((t,j)=>{const i=i0+j;return`<div class="hr" style="--n:${j}"><div class="t">${j?t.slice(11,13)+'h':'Now'}</div><div class="e">${emoji(h.weather_code[i],h.is_day[i])}</div><div>${T(h.temperature_2m[i])}°</div><div class="p">${h.precipitation_probability[i]>=20?h.precipitation_probability[i]+'%':''}</div></div>`}).join('');
      return`<div class="pane"><section class="card"><p class="story">${story()}</p><div class="wk">${cols}</div><p class="note" style="margin-top:10px;font-size:12px">${tr('Forecast by')} <a href="https://www.ipma.pt/" target="_blank" rel="noopener" style="color:var(--acc)">IPMA</a> · ${tr('based on')} ECMWF + AROME</p></section>
      <section class="card"><h3>Next 24 hours</h3><div class="hours">${hrs}</div></section>${weekWhy()}</div>`;
    }
  }
  // fallback: Open-Meteo (resto do mundo)
  const mn=Math.min(...d.temperature_2m_min),mx=Math.max(...d.temperature_2m_max),sp=mx-mn||1;
  const cols=d.time.map((t,i)=>{
    const lo=(d.temperature_2m_min[i]-mn)/sp*100,ht=Math.max(10,(d.temperature_2m_max[i]-d.temperature_2m_min[i])/sp*100);
    const rp=d.precipitation_probability_max?d.precipitation_probability_max[i]:0;
    return`<div class="dcol" style="--n:${i}"><b>${i?new Date(t+'T12:00').toLocaleDateString('en',{weekday:'short'}):'Today'}</b><span class="dic">${emoji(d.weather_code[i])}</span><span class="hi">${T(d.temperature_2m_max[i])}°</span><div class="dbar"><i style="--lo:${lo}%;--h:${ht}%;--n:${i};background:linear-gradient(${tempColor(d.temperature_2m_max[i])},${tempColor(d.temperature_2m_min[i])})"></i></div><span class="lo">${T(d.temperature_2m_min[i])}°</span><small>${rp>=20?rp+'%':'&nbsp;'}</small></div>`;
  }).join('');
  const hrs=h.time.slice(i0,i0+24).map((t,j)=>{const i=i0+j;return`<div class="hr" style="--n:${j}"><div class="t">${j?t.slice(11,13)+'h':'Now'}</div><div class="e">${emoji(h.weather_code[i],h.is_day[i])}</div><div>${T(h.temperature_2m[i])}°</div><div class="p">${h.precipitation_probability[i]>=20?h.precipitation_probability[i]+'%':''}</div></div>`}).join('');
  return`<div class="pane"><section class="card"><p class="story">${story()}</p><div class="wk">${cols}</div></section>
  <section class="card"><h3>Next 24 hours</h3><div class="hours">${hrs}</div></section>${weekWhy()}</div>`;
}
function weekPane(){
  setTimeout(async()=>{
    const pane=$('#pane');if(!pane||tab!=='week')return;
    let html;
    try{
      html=await weekPaneAsync();
    }catch(e){
      console.warn('[Week]',e);
      data.__noIpma=1;
      html=await weekPaneAsync().catch(()=>'');
    }
    if(tab!=='week'||!$('#pane'))return;
    $('#pane').innerHTML=html;
    moveInd();
  },0);

  // Match the min-height to a typical full week layout (e.g. 500px instead of 260px)
  return `<div class="pane sk" style="min-height:520px"></div>`;
}

/* --- Sea & surf + "Is today unusual?" (cartões da aba Hoje, iguais no PC e no telemóvel) ---
   Tudo passa pelo worker, com cache:  /marine → Open-Meteo Marine API  ·  /normals → Open-Meteo Historical Weather API (ERA5, 1991–2020).
   XT.sea / XT.norm:  undefined = a carregar · false = sem dados neste local (ex.: interior) · null = erro (tenta de novo passados 5 min) · objeto = dados. */
let XT={key:'',normMd:'',sea:undefined,norm:undefined,t:{},busy:{}};
const xtKey=()=>place?(+place.lat).toFixed(3)+','+(+place.lon).toFixed(3):'';
const xtGet=f=>XT.key===xtKey()?XT[f]:undefined;
const xtCompass=d=>(LANG==='pt'?['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']:['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'])[Math.round((((d%360)+360)%360)/22.5)%16];

function loadXtra(){
 if(!data||!place)return;
 const key=xtKey(),md=data.current.time.slice(5,10),now=Date.now();
 if(XT.key!==key)XT={key,normMd:md,sea:undefined,norm:undefined,t:{},busy:{}};
 if(XT.normMd!==md){XT.normMd=md;XT.norm=undefined;XT.busy.norm=false}   // passou a meia-noite: outra data
 const q=`lat=${(+place.lat).toFixed(3)}&lon=${(+place.lon).toFixed(3)}`;
 const run=(f,url,fix)=>{
  const v=XT[f];
  if(XT.busy[f]||(v!==undefined&&!(v===null&&now-(XT.t[f]||0)>3e5)))return;
  XT.busy[f]=true;
  fetchJSON(url,undefined,22000).then(fix).catch(e=>{console.info('['+f+']',e.message);return null}).then(v=>{
   if(XT.key!==key||(f==='norm'&&XT.normMd!==md))return;
   XT.busy[f]=false;XT[f]=v;XT.t[f]=Date.now();paintXtra();
  });
 };
 run('sea',`${WORKER}/marine?${q}`,j=>{if(j&&j.available)return seaPrep(j);console.info('[sea] sem dados do mar para este local:',j&&j.why);return false});
 run('norm',`${WORKER}/normals?${q}&md=${md}`+(isFinite(data.elevation)?`&elev=${Math.round(data.elevation)}`:''),j=>j&&j.available&&Array.isArray(j.q)&&j.q.length===21?j:false);
}

/* próximas 24 h (a partir da hora actual) das séries do mar */
function seaPrep(j){
 const h=j.hourly,from=data.current.time.slice(0,13)+':00';
 let i0=h.time.findIndex(t=>t>=from);if(i0<0)i0=0;
 const cut=k=>(h[k]||[]).slice(i0,i0+25).map(v=>v==null?null:+v);
 const a0=Math.max(0,i0-3),o={km:+j.km||0,tl:{t:h.time.slice(a0,i0+50),v:(h.sea_level_height_msl||[]).slice(a0,i0+50).map(v=>v==null?null:+v)},t:h.time.slice(i0,i0+25),wh:cut('wave_height'),wp:cut('wave_period'),wd:cut('wave_direction'),sh:cut('swell_wave_height'),sp:cut('swell_wave_period'),sd:cut('swell_wave_direction'),ww:cut('wind_wave_height'),sst:cut('sea_surface_temperature'),cv:cut('ocean_current_velocity')};
 return o.wh.some(v=>v!=null)?o:false;
}
const xtDist=km=>unit=='c'?Math.round(km)+' km':Math.round(km*.621371)+' mi';
const xtFirst=a=>{const v=a.find(x=>x!=null&&isFinite(x));return v==null?null:v};

/* altura: metros (°C) ou pés (°F), como o resto da app liga as unidades */
const xtLen=m=>unit=='c'?dcm(m,1)+' m':(m*3.28084<10?dcm(m*3.28084,1):String(Math.round(m*3.28084)))+' ft';
const SEA_STATE=[[.1,'Calm','Calmo'],[.5,'Smooth','Chão'],[1.25,'Slight','Pouco agitado'],[2.5,'Moderate','Agitado'],[4,'Rough','Muito agitado'],[6,'Very rough','Alteroso'],[9,'High','Montanhoso'],[14,'Very high','Enorme'],[1e9,'Phenomenal','Fenomenal']];   // escala Douglas / OMM
const seaState=h=>{const r=SEA_STATE.find(x=>h<x[0]);return T2(r[1],r[2])};
const swellType=p=>p>=12?T2('Long-period groundswell','Mar de fundo de longo período'):p>=9?T2('Groundswell','Mar de fundo'):p>=6?T2('Wind swell','Ondulação de vento'):T2('Wind chop','Mar picado');
const xtArrow=d=>`<svg class="xt-arr" style="--r:${Math.round(d)+180}deg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 9h-4v9h-2v-9H7z" fill="currentColor"/></svg>`;


/* Marés a partir do nível do mar horário (Open-Meteo: sea_level_height_msl). Preia-mar/baixa-mar = máximos/mínimos locais,
   com o instante refinado por uma parábola nos 3 pontos à volta (precisão de minutos, não de horas). Modelo global: orientativo, não serve para navegação. */
function tideInfo(s){
 const L=s&&s.tl;if(!L||!L.v||L.v.filter(v=>v!=null).length<12)return{none:'data'};
 const v=L.v,ms=L.t.map(t=>Date.parse(t+':00Z')),now=Date.parse(data.current.time.slice(0,16)+':00Z'),ok=v.filter(x=>x!=null);
 if(Math.max(...ok)-Math.min(...ok)<.15)return{none:'flat'};     // sem maré apreciável (mar quase sem amplitude)
 const ex=[];
 for(let k=1;k<v.length-1;k++){
  const a=v[k-1],b=v[k],c=v[k+1];if(a==null||b==null||c==null)continue;
  const hi=b>a&&b>=c,lo=b<a&&b<=c;if(!hi&&!lo)continue;
  const den=a-2*b+c,x=den?Math.max(-.5,Math.min(.5,(a-c)/(2*den))):0;   // vértice da parábola
  ex.push({hi,t:ms[k]+x*36e5,h:den?b-(a-c)*(a-c)/(8*den):b});
 }
 const nxt=ex.filter(e=>e.t>now),h=nxt.find(e=>e.hi),l=nxt.find(e=>!e.hi);
 if(!nxt.length||(!h&&!l))return{none:'data'};
 return{rising:nxt[0].hi,high:h||null,low:l||null,now};
}
/* Se o worker não trouxer o nível do mar (ex.: /marine ainda sem sea_level_height_msl), pede-o 1 vez ao Open-Meteo Marine e guarda em XT.tide */
const tideOk=s=>!!(s&&s.tl&&s.tl.v&&s.tl.v.filter(v=>v!=null).length>=12);
function tideFallback(){
 const s=xtGet('sea');if(!s||!data||!place||tideOk(s)||xtGet('tide')!==undefined||XT.busy.tide)return;
 const key=XT.key,from=data.current.time.slice(0,13)+':00';
 XT.busy.tide=true;
 fetchJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${(+place.lat).toFixed(3)}&longitude=${(+place.lon).toFixed(3)}&hourly=sea_level_height_msl&timezone=auto&forecast_days=3`,undefined,15000)
  .then(j=>{const h=j&&j.hourly;if(!h||!h.sea_level_height_msl)return false;
   let i0=h.time.findIndex(t=>t>=from);if(i0<0)i0=0;const a0=Math.max(0,i0-3);
   return{t:h.time.slice(a0,i0+50),v:h.sea_level_height_msl.slice(a0,i0+50).map(v=>v==null?null:+v)}})
  .catch(e=>{console.info('[tide]',e.message);return false})
  .then(v=>{if(XT.key!==key)return;XT.busy.tide=false;XT.tide=v;XT.t.tide=Date.now();paintXtra()});
}
const xtSigned=m=>(m<0?'−':'+')+xtLen(Math.abs(m));
function xtWhen(t,now){                                         // "hoje 14:32" / "amanhã 02:14" (hora local do ponto)
 const iso=new Date(t).toISOString(),dd=Math.floor(t/864e5)-Math.floor(now/864e5);   // ambos em "hora local escrita como UTC"
 const day=dd<=0?T2('today','hoje'):dd===1?T2('tomorrow','amanhã'):new Date(iso.slice(0,10)+'T12:00:00').toLocaleDateString(LOC(),{weekday:'short',day:'numeric'});
 return{hm:iso.slice(11,16),day};
}
function tideRow(td){                                            // linha "Maré" da lista de factos (sem cartões)
 if(!td)return'';
 const L=T2('Tide','Maré');
 if(td.none){
  const m=td.none==='load'?T2('loading tide data','a carregar dados de maré'):td.none==='flat'?T2('no noticeable tide here','sem maré apreciável aqui'):T2('no tide data for this point','sem dados de maré para este ponto');
  return`<div class="sv-r sv-wide"><dt>${L}</dt><dd>${td.none==='load'?'…':'—'}</dd><dd class="sv-s">${m}</dd></div>`;
 }
 const up=td.rising,arrow=`<svg class="xt-arr" style="--r:${up?0:180}deg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 9h-4v9h-2v-9H7z" fill="currentColor"/></svg>`;
 const evs=[[td.high,T2('High tide','Preia-mar')],[td.low,T2('Low tide','Baixa-mar')]].filter(x=>x[0]).sort((a,b)=>a[0].t-b[0].t).map(([e,l])=>{
  const w=xtWhen(e.t,td.now),m=Math.max(0,Math.round((e.t-td.now)/6e4));
  return l+' <b>'+w.hm+'</b> ('+xtSigned(e.h)+') · '+(w.day===T2('today','hoje')?'':w.day+' · ')+T2('in ','em ')+hm(m)});
 return`<div class="sv-r sv-wide"><dt>${L}</dt><dd>${arrow}${up?T2('Rising','A encher'):T2('Falling','A vazar')}</dd><dd class="sv-s">${evs.join('<br>')}</dd></div>`;
}
/* Completa a última linha do grid: o último cartão estica-se até ao fim (nº de colunas lido do CSS, PC e telemóvel) */
function xtFill(){
 $$('#sea .xt-grid').forEach(g=>{
  const t=[...g.children].filter(x=>x.classList.contains('xt-m'));
  t.forEach(x=>{x.style.gridColumn=''});
  if(t.length<2||!g.clientWidth)return;
  const cols=(getComputedStyle(g).gridTemplateColumns||'').split(/\s+(?![^(]*\))/).filter(x=>x&&x!=='none').length,rem=cols>1?t.length%cols:0;
  if(rem)t[t.length-1].style.gridColumn='span '+(cols-rem+1);
 });
}
const xtRO=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{clearTimeout(xtRO._t);xtRO._t=setTimeout(xtFill,30)}):null;
function xtWatch(){const e=$('#sea');if(e){if(xtRO){xtRO.disconnect();xtRO.observe(e)}xtFill()}}

/* Mar e surf v2 — sem cartões: cabeçalho + bússola da ondulação, UM gráfico (ondas + maré, com preia/baixa-mar marcadas) e uma lista de factos com linhas finas. */
function svCSS(){
 if(document.getElementById('sv-css'))return;
 const st=document.createElement('style');st.id='sv-css';
 st.textContent=`
.xt{--svl:rgba(20,49,79,.13);--svc:var(--acc,#2f6db5)}
@supports(color:color-mix(in srgb,red,blue)){.xt{--svl:color-mix(in srgb,currentColor 14%,transparent)}}
#xtra .xt{display:flex;flex-direction:column}
#xtra .xt .xt-src{margin-top:auto;padding-top:12px}
.xt .sv-top{display:flex;align-items:center;justify-content:space-between;gap:14px}
.xt .sv-top>div:first-child{min-width:0}
.xt .sv-top .xt-head{flex-wrap:wrap;row-gap:6px}
.xt .sv-top .xt-big{white-space:nowrap}
.xt .sv-sub{margin:6px 0 0;font-size:13.5px;opacity:.72}
.xt .sv-dial{flex:none;text-align:center;font-size:11px;font-weight:600;letter-spacing:.05em;line-height:1.2;opacity:.9}
.xt .sv-dial svg{display:block;width:62px;height:62px;margin:0 auto 3px}
.xt .sv-cap{display:flex;justify-content:space-between;gap:10px;margin:22px 0 0;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;opacity:.62}
.xt .sv-tide{position:relative;padding:20px 0 0}
.xt .sv-plot{position:relative;height:92px;margin-bottom:22px}
.xt .sv-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.xt .sv-ta{fill:url(#svTg);stroke:none}
.xt .sv-tl{fill:none;stroke:var(--svc);stroke-width:2.5;stroke-linecap:round;vector-effect:non-scaling-stroke}
.xt .sv-zero{fill:none;stroke:currentColor;stroke-opacity:.28;stroke-width:1;stroke-dasharray:3 4;vector-effect:non-scaling-stroke}
.xt .sv-pin{position:absolute;width:0;height:0}
.xt .sv-pin i{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#fff;border:2.5px solid var(--svc);box-sizing:border-box}
.xt .sv-pin.now i{left:-4px;top:-4px;width:8px;height:8px;border-width:2px}
.xt .sv-pin em{position:absolute;font-style:normal;font-size:11.5px;font-weight:600;white-space:nowrap;line-height:1}
.xt .sv-pin.hi em{bottom:9px}
.xt .sv-pin.lo em{top:9px}
.xt .sv-pin .c{left:0;transform:translateX(-50%)}
.xt .sv-pin .l{left:-4px}
.xt .sv-pin .r{right:-4px}
.xt .sv-bars{position:relative;display:flex;align-items:flex-end;gap:3px;height:54px;margin-top:24px}
.xt .sv-bars i{flex:1;min-width:0;min-height:3px;border-radius:3px 3px 2px 2px;background:currentColor;opacity:.2}
.xt .sv-bars i.pk{opacity:.55}
.xt .sv-bv{position:absolute;top:-19px;font-size:11.5px;font-weight:600;white-space:nowrap;line-height:1}
.xt .sv-bv.a{transform:none}.xt .sv-bv.z{transform:translateX(-100%)}.xt .sv-bv.c{transform:translateX(-50%)}
.xt .sv-ax{position:relative;height:14px;margin-top:7px;font-size:11.5px;opacity:.65}
.xt .sv-ax span{position:absolute;top:0;white-space:nowrap;transform:translateX(-50%)}
.xt .sv-ax span.a{transform:none}.xt .sv-ax span.z{transform:translateX(-100%)}
.xt .sv-rg{position:relative;height:12px;margin:40px 0 34px;border-radius:99px;background:var(--svl)}
.xt .sv-rg i{position:absolute;top:0;bottom:0;border-radius:99px;background:currentColor}
.xt .sv-rg i.a{opacity:.13}.xt .sv-rg i.b{opacity:.22}.xt .sv-rg i.c{opacity:.36}
.xt .sv-rg i.m{width:2px;top:-4px;bottom:-4px;border-radius:1px;opacity:.65}
.xt .sv-rg b{position:absolute;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--svc);border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.xt .sv-rl{position:absolute;font-size:11.5px;white-space:nowrap;line-height:1.25;opacity:.75}
.xt .sv-rl.up{bottom:20px;opacity:1;font-weight:700;font-size:12.5px}
.xt .sv-rl.dn{top:20px}
.xt .sv-rl.a{transform:none}.xt .sv-rl.z{transform:translateX(-100%)}.xt .sv-rl.c{transform:translateX(-50%)}
.xt .sv-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:22px;margin:16px 0 0}
.xt .sv-r{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:3px 12px;padding:11px 0;border-top:1px solid var(--svl)}
.xt .sv-wide{grid-column:1/-1}
.xt .sv-r:not(.sv-wide){display:block;padding:10px 0 11px}
.xt .sv-r:not(.sv-wide) dd{text-align:left;font-size:18px;margin-top:4px;line-height:1.2}
.xt .sv-r:not(.sv-wide) dd small{display:block;margin:3px 0 0;font-size:12px}
.xt .sv-dens{position:relative;height:112px;margin:30px 0 0}
#xtra #anom .sv-dens{flex:1 1 112px;height:auto;min-height:112px;max-height:300px}
.xt .sv-dens svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.xt .sv-da{fill:url(#svDg);fill-opacity:.10;stroke:none}
.xt .sv-db{fill:url(#svDg);fill-opacity:.14;stroke:none}
.xt .sv-dl{fill:none;stroke:url(#svDg);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.xt .sv-dn{stroke:currentColor;stroke-opacity:.7;stroke-width:1.8;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.xt .sv-meter{display:flex;gap:5px;margin:10px 0 0}
.xt .sv-meter i{flex:1;height:10px;border-radius:99px;background:currentColor;opacity:.12}
.xt .sv-meter i.on{opacity:.95}
.xt .sv-mt{margin:9px 0 0;font-size:13.5px;line-height:1.5;opacity:.82}
.xt .sv-dd{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:var(--svc);border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.xt .sv-dv{position:absolute;top:-26px;font-size:12.5px;font-weight:700;white-space:nowrap;line-height:1}
.xt .sv-dv.a{transform:none}.xt .sv-dv.z{transform:translateX(-100%)}.xt .sv-dv.c{transform:translateX(-50%)}
.xt .sv-dx{position:relative;height:14px;margin-top:8px;font-size:11.5px;opacity:.7}
.xt .sv-dx span{position:absolute;top:0;white-space:nowrap}
.xt .sv-dx .a{transform:none}.xt .sv-dx .z{transform:translateX(-100%)}.xt .sv-dx .c{transform:translateX(-50%)}
.xt .sv-r dt{margin:0;font-size:12px;letter-spacing:.07em;text-transform:uppercase;opacity:.65}
.xt .sv-r dd{margin:0;text-align:right;font-size:17px;font-weight:700}
.xt .sv-r dd small{font-size:12.5px;font-weight:400;opacity:.7;margin-left:4px}
.xt .sv-r dd.sv-s{grid-column:1/-1;text-align:left;font-size:13px;font-weight:400;line-height:1.55;opacity:.8}
.xt .sv-r dd.sv-s b{font-weight:700}
.xt .sv-r .xt-arr{display:inline-block;width:14px;height:14px;margin-right:6px;vertical-align:-1px;transform:rotate(var(--r,0deg))}
`;
 document.head.appendChild(st);
}
const svRow=(l,v)=>`<div class="sv-r"><dt>${l}</dt><dd>${v}</dd></div>`;
const svAl=x=>x<14?'a':x>86?'z':'c';
function svPath(p){                                              // curva suave (Catmull-Rom → Bézier) por pontos [x,y]
 if(p.length<2)return'';
 const f=n=>n.toFixed(2);let d='M'+f(p[0][0])+','+f(p[0][1]);
 for(let i=0;i<p.length-1;i++){
  const a=p[i-1]||p[i],b=p[i],c=p[i+1],e=p[i+2]||c;
  d+='C'+f(b[0]+(c[0]-a[0])/6)+','+f(b[1]+(c[1]-a[1])/6)+' '+f(c[0]-(e[0]-b[0])/6)+','+f(c[1]-(e[1]-b[1])/6)+' '+f(c[0])+','+f(c[1]);
 }
 return d;
}

function seaInner(){
 const s=xtGet('sea');if(!s)return'';
 const H=xtFirst(s.wh);if(H==null)return'';
 svCSS();
 const Tm=xtFirst(s.wp),Hs=s.sh[0]!=null?s.sh[0]:xtFirst(s.sh),Ts=s.sp[0]!=null?s.sp[0]:xtFirst(s.sp),Ds=s.sd[0]!=null?s.sd[0]:xtFirst(s.sd),sst=xtFirst(s.sst),Hw=s.ww[0]!=null?s.ww[0]:xtFirst(s.ww),Cv=s.cv?xtFirst(s.cv):null;
 // período que descreve o mar: o da ondulação, se ela domina; senão o das ondas de vento
 const swellRules=Hs!=null&&Ts!=null&&Hs>=.6*H,Tk=swellRules?Ts:Tm;
 const P=Tm!=null?.49*H*H*Tm:null;                     // fluxo de energia das ondas em águas profundas: P ≈ ρg²/(64π)·H²·T ≈ 0,49·H²·T  [kW/m]
 const mx=Math.max(...s.wh.filter(v=>v!=null)),iMx=s.wh.indexOf(mx);
 tideFallback();
 const pend=!tideOk(s)&&xtGet('tide')===undefined,src=tideOk(s)?s:{tl:xtGet('tide')||null},td=pend?{none:'load'}:tideInfo(src);
 const N=Math.max(1,s.t.length-1),M=N+1,X=i=>(i+.5)/M*100;       // mesmas colunas para a maré e para as barras das ondas

 /* ---- maré: curva com água por baixo, preia-mar/baixa-mar marcadas ---- */
 let tide='';
 if(td&&!td.none&&src.tl){
  const Lt=src.tl,mp=new Map(Lt.t.map((t,i)=>[t,Lt.v[i]])),ser=s.t.map(t=>{const v=mp.get(t);return v==null?null:v});
  const t0=Date.parse(s.t[0]+':00Z'),evs=[td.high,td.low].filter(e=>e&&e.t>=t0&&e.t<=t0+N*36e5);
  const all=ser.filter(v=>v!=null).concat(evs.map(e=>e.h));
  if(all.length>2){
   const lo=Math.min(...all),hi=Math.max(...all),rg=Math.max(hi-lo,.05),ty=v=>100-(v-lo)/rg*100;
   const tp=ser.map((v,i)=>v==null?null:[X(i),ty(v)]).filter(Boolean);
   if(tp.length>1){
    const ln=svPath(tp),ar=ln+'L'+tp[tp.length-1][0].toFixed(2)+',100L'+tp[0][0].toFixed(2)+',100Z';
    const z=lo<0&&hi>0?`<path class="sv-zero" d="M0,${ty(0).toFixed(1)}L100,${ty(0).toFixed(1)}"/>`:'';
    let pins=`<span class="sv-pin now" style="left:${tp[0][0].toFixed(1)}%;top:${tp[0][1].toFixed(1)}%"><i></i></span>`;
    evs.forEach(e=>{
     const x=((e.t-t0)/36e5+.5)/M*100,hiT=e===td.high;
     pins+=`<span class="sv-pin ${hiT?'hi':'lo'}" style="left:${x.toFixed(1)}%;top:${ty(e.h).toFixed(1)}%"><i></i><em class="${x<20?'l':x>80?'r':'c'}">${hiT?T2('High','Preia-mar'):T2('Low','Baixa-mar')} ${xtWhen(e.t,td.now).hm}</em></span>`;
    });
    tide=`<div class="sv-cap"><span>${T2('Tide','Maré')}</span><span>${td.rising?T2('rising','a encher'):T2('falling','a vazar')}</span></div>
 <div class="sv-tide" role="img" aria-label="${T2('Tide level, next 24 hours','Nível da maré, próximas 24 horas')}"><div class="sv-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="svTg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--svc)" stop-opacity=".34"/><stop offset="1" style="stop-color:var(--svc)" stop-opacity=".04"/></linearGradient></defs>${z}<path class="sv-ta" d="${ar}"/><path class="sv-tl" d="${ln}"/></svg>${pins}</div></div>`;
   }
  }
 }

 /* ---- ondas: barras das próximas 24 h, com o pico assinalado ---- */
 const vmax=Math.max(mx,.5),bars=s.wh.map((v,i)=>`<i${i===iMx?' class="pk"':''} style="height:${v==null?0:Math.max(4,v/vmax*100).toFixed(1)}%"></i>`).join('');
 const px=X(iMx),pk=`<span class="sv-bv ${svAl(px)}" style="left:${px.toFixed(1)}%">${xtLen(mx)}${iMx?' · '+s.t[iMx].slice(11,13)+'h':''}</span>`;
 const ax=[0,6,12,18,24].filter(i=>i<=N).map(i=>`<span class="${i===0?'a':i===N?'z':''}" style="left:${i===0?0:i===N?100:X(i).toFixed(1)}%">${i?s.t[i].slice(11,13)+'h':T2('Now','Agora')}</span>`).join('');
 const dial=Ds!=null?`<div class="sv-dial" title="${T2('Direction the swell comes from','Direção de onde vem a ondulação')}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/><text x="32" y="11" text-anchor="middle" font-size="7.5" fill="currentColor" fill-opacity=".55">N</text><g transform="rotate(${Math.round(Ds)+180} 32 32)"><path d="M32 17l8 15h-5.5v15h-5V32H24z" fill="currentColor"/></g></svg>${xtCompass(Ds)} ${Math.round(Ds)}°</div>`:'';

 /* ---- lista de factos ---- */
 const cur=Cv!=null&&Cv>=.1?svRow(T2('Current','Corrente'),unit=='c'?dcm(Cv,1)+'<small>km/h</small>':dcm(Cv*.621371,1)+'<small>mph</small>'):'';
 const facts=[
  Hs!=null&&Ts!=null?svRow(T2('Swell','Ondulação'),xtLen(Hs)+' · '+dcm(Ts,0)+' s'+(Ds!=null?'<small>'+T2('from ','de ')+xtCompass(Ds)+'</small>':'')):'',
  Hw!=null&&Hw>0?svRow(T2('Wind sea','Mar de vento'),xtLen(Hw)):'',
  sst!=null?svRow(T2('Sea temperature','Temp. do mar'),T(sst)+'°'):'',
  P!=null?svRow(T2('Wave power','Energia das ondas'),'≈ '+(P<10?dcm(P,1):String(Math.round(P)))+'<small>kW/m</small>'):'',
  cur,
  s.km!=null?svRow(T2('Model point','Ponto do modelo'),s.km<1?T2('at the spot','no local'):xtDist(s.km)+'<small>'+T2('open sea','mar aberto')+'</small>'):'',
  tideRow(td)
 ].join('');

 return`<h3>${T2('Sea & surf','Mar e surf')}</h3>
 <div class="sv-top"><div><div class="xt-head"><b class="xt-big">${xtLen(H)}</b><span class="xt-tag t-sea">${seaState(H)}</span></div>${Tk!=null?`<p class="sv-sub">${swellType(Tk)} · ${T2('period','período')} ${dcm(Tk,0)} s</p>`:''}</div>${dial}</div>
 ${tide}
 <div class="sv-cap"><span>${T2('Wave height','Altura das ondas')}</span><span>${T2('next 24 h','próximas 24 h')}</span></div>
 <div class="sv-bars" role="img" aria-label="${T2('Wave height, next 24 hours','Altura das ondas, próximas 24 horas')}">${bars}${pk}</div>
 <div class="sv-ax">${ax}</div>
 <dl class="sv-facts">${facts}</dl>
 <p class="note">${T2('Direction is where the swell comes from.','A direção indica de onde vem a ondulação.')}</p>
 <p class="xt-src">${T2('Waves and sea temperature: Open-Meteo Marine API, which blends wave models (Météo-France MFWAM ≈8 km, ECMWF WAM, NCEP GFS Wave, DWD EWAM over Europe). Values are for the nearest open-sea grid cell shown above, not a buoy or beach measurement, so surf at your beach can differ. Tides: modelled sea level (tide + air pressure), heights relative to mean sea level; indicative only, not for navigation.','Ondas e temperatura do mar: Open-Meteo Marine API, que junta modelos de ondas (MFWAM da Météo-France ≈8 km, ECMWF WAM, NCEP GFS Wave e DWD EWAM na Europa). Os valores são da célula de mar aberto mais próxima indicada acima, não de uma bóia nem da tua praia, por isso a rebentação aí pode ser diferente. Marés: nível do mar modelado (maré + pressão atmosférica), alturas relativas ao nível médio; apenas indicativo, não serve para navegação.')}</p>`;
}

/* temperatura média de hoje (24 h locais) comparada com a normal 1991–2020 */
function anomInner(){
 const n=xtGet('norm'),ttl=`<h3>${T2('Is today unusual?','Hoje é invulgar?')}</h3>`;
 if(n===undefined)return ttl+'<p class="note sk">'+T2('Loading…','A carregar…')+'</p>';
 const day=data.current.time.slice(0,10),h=data.hourly;let sum=0,k=0;
 for(let i=0;i<h.time.length&&k<24;i++)if(h.time[i].startsWith(day)&&h.temperature_2m[i]!=null){sum+=h.temperature_2m[i];k++}
 if(!n||k<20)return ttl+`<p class="note">${T2('Not available for this place right now.','Indisponível para este local de momento.')}</p>`;
 
 const tm=sum/k,q=n.q,d=tm-n.mean;
 let p; // percentil de hoje na distribuição da data (interpolado entre os 21 quantis)
 if(tm<=q[0])p=0;else if(tm>=q[20])p=100;else{let j=0;while(q[j+1]<tm)j++;p=(j+(q[j+1]>q[j]?(tm-q[j])/(q[j+1]-q[j]):0))*5}
 
 const lv=p>=98?[3,'Exceptionally warm','Excecionalmente quente']:p>=90?[2,'Much warmer than usual','Muito mais quente do que o normal']:p>=70?[1,'Warmer than usual','Mais quente do que o normal']
  :p>30?[0,'Typical for this date','Típico para esta data']:p>10?[-1,'Cooler than usual','Mais fresco do que o normal']:p>2?[-2,'Much cooler than usual','Muito mais frio do que o normal']:[-3,'Exceptionally cold','Excecionalmente frio'];
  
 const num=x=>parseFloat(x.replace(',','.')),sT=decT(tm),sN=decT(n.mean),dd=Math.round((num(sT)-num(sN))*10)/10,sg=dd===0?'±':dd>0?'+':'−',pc=Math.round(p>=50?p:100-p);
 
 const rank=tm>q[20]?T2('Warmer than any day around this date in 1991–2020.','Mais quente do que qualquer dia desta época em 1991–2020.')
  :tm<q[0]?T2('Colder than any day around this date in 1991–2020.','Mais frio do que qualquer dia desta época em 1991–2020.')
  :p>=50?T2(`Warmer than about ${pc}% of days around this date in 1991–2020.`,`Mais quente do que cerca de ${pc}% dos dias desta época em 1991–2020.`)
  :T2(`Cooler than about ${pc}% of days around this date in 1991–2020.`,`Mais fresco do que cerca de ${pc}% dos dias desta época em 1991–2020.`);
  
 svCSS();
 
 const mn=Math.min(q[0],tm),mx=Math.max(q[20],tm),pd=Math.max(.6,(mx-mn)*.1),lo=mn-pd,hi=mx+pd,X=v=>+((v-lo)/(hi-lo)*100).toFixed(1);
 const dt=new Date(day+'T12:00:00').toLocaleDateString(LOC(),{day:'numeric',month:'long'});
 const bar=(a,b,c)=>`<i class="${c}" style="left:${X(a)}%;width:${(X(b)-X(a)).toFixed(1)}%"></i>`;
 const lab=(v,txt,cls)=>`<span class="sv-rl ${cls} ${svAl(X(v))}" style="left:${X(v)}%">${txt}</span>`;

const numPts = 80;
const rawD = [];
for (let i = 0; i <= numPts; i++) {
    const x = (i / numPts) * 100;
    const T = lo + (x / 100) * (hi - lo);
    let d = 0;
    if (T >= q[0] && T <= q[20]) {
        let j = 0;
        while (j < 19 && T > q[j+1]) j++;
        d = 0.05 / Math.max(q[j+1] - q[j], 0.05);
    }
    rawD.push({ x, d });
}
// Aplicar um filtro Gaussiano mais largo para uma curva super suave
const dSm = rawD.map((p, i) => {
    let sum = 0, wsum = 0;
    for (let j = -8; j <= 8; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < rawD.length) {
            const w = Math.exp(-0.5 * Math.pow(j / 3, 2));
            sum += rawD[idx].d * w;
            wsum += w;
        }
    }
    return [p.x, sum / wsum];
});
const dmax = Math.max(...dSm.map(p=>p[1]));
const dy = v => 100 - Math.min(1, v/dmax)*85;
const dpts = dSm.map(p => [p[0], dy(p[1])]);

const dL = svPath(dpts);
const dA = dL + `L100,100L0,100Z`;
const clipW = Math.max(0, X(q[18]) - X(q[2]));
 
 const yT=(()=>{let k=0;while(k<dpts.length-2&&dpts[k+1][0]<X(tm))k++;const p=dpts[k],r=dpts[k+1],f=r[0]>p[0]?Math.min(1,Math.max(0,(X(tm)-p[0])/(r[0]-p[0]))):0;return p[1]+(r[1]-p[1])*f})();
 
 const tcol=v=>typeof tempColor==='function'?tempColor(v):'#2f6db5';
 const gstops=q.map(v=>`<stop offset="${(X(v)/100).toFixed(3)}" style="stop-color:${tcol(v)}"/>`).join('');
 
 const rr=Math.max(.5,Math.min(100,Math.min(p,100-p)*2)),lvR=rr>60?0:rr>30?1:rr>10?2:rr>4?3:4,beyond=tm>q[20]||tm<q[0];
 const rN=[T2('Typical','Típico'),T2('Slightly unusual','Pouco invulgar'),T2('Unusual','Invulgar'),T2('Rare','Raro'),T2('Exceptional','Excepcional')][lvR],nn=Math.max(2,Math.round(100/rr));
 const rTxt=beyond?T2('More extreme than any day around this date in 1991–2020.','Mais extremo do que qualquer dia desta época em 1991–2020.')
  :rr>50?T2(`A typical day: about ${Math.round(rr)}% of days around this date are as extreme or more.`,`Um dia típico: cerca de ${Math.round(rr)}% dos dias desta época são tão extremos ou mais.`)
  :T2(`A day like this, or more extreme, happens about 1 in ${nn} days around this date.`,`Um dia assim, ou mais extremo, acontece em cerca de 1 em ${nn} dias nesta época.`);
  
 const meter=[0,1,2,3,4].map(i=>`<i${i<=lvR?` class="on" style="background:${tcol(tm)}"`:''}></i>`).join('');
 const out=tm>q[20]?T2('above the 1991–2020 range','acima do intervalo de 1991–2020'):tm<q[0]?T2('below the 1991–2020 range','abaixo do intervalo de 1991–2020'):'';
 
 return ttl+`<div class="xt-head"><b class="xt-big">${sg}${dec1(Math.abs(dd))}°</b><span class="xt-tag t-${lv[0]>0?'hot':lv[0]<0?'cold':'mid'}${Math.abs(lv[0])}">${T2(lv[1],lv[2])}</span></div>
 <p class="note">${T2(`Today averages ${sT}°. The 1991–2020 normal for ${dt} is ${sN}°.`,`Hoje a média é ${sT}°. A normal de 1991–2020 para ${dt} é ${sN}°.`)} ${rank}</p>
 <div class="sv-cap"><span>${T2('Today vs. 30 years of this date','Hoje vs. 30 anos desta data')}</span><span>${out}</span></div>
 <div class="sv-dens" role="img" aria-label="${T2('Today compared with the usual range','Hoje comparado com o intervalo habitual')}">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
   <defs>
    <linearGradient id="svDg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">${gstops}</linearGradient>
    <clipPath id="svClip"><rect x="${X(q[2])}" y="0" width="${clipW}" height="100"/></clipPath>
   </defs>
   <path class="sv-da" d="${dA}"/>
   <path class="sv-db" d="${dA}" clip-path="url(#svClip)"/>
   <path class="sv-dl" d="${dL}"/>
   <path class="sv-dn" d="M${X(tm)},${(yT+2).toFixed(1)}L${X(tm)},100"/>
  </svg>
  <i class="sv-dd" style="left:${X(tm)}%;top:${yT.toFixed(1)}%;background:${tcol(tm)}"></i>
  <span class="sv-dv ${svAl(X(tm))}" style="left:${X(tm)}%;top:calc(${yT.toFixed(1)}% - 30px)">${T2('Today','Hoje')} ${sT}°</span>
 </div>
 <div class="sv-dx"><span class="${svAl(X(q[0]))}" style="left:${X(q[0])}%">${T(q[0])}°</span><span class="${svAl(X(q[10]))}" style="left:${X(q[10])}%">${T2('normal','normal')} ${T(q[10])}°</span><span class="${svAl(X(q[20]))}" style="left:${X(q[20])}%">${T(q[20])}°</span></div>
 <div class="sv-cap"><span>${T2('How unusual','Quão invulgar')}</span><span>${rN}</span></div>
 <div class="sv-meter" role="img" aria-label="${rN}">${meter}</div>
 <p class="sv-mt">${rTxt}</p>
 <dl class="sv-facts">${svRow(T2('Today (mean)','Hoje (média)'),sT+'°')}${svRow(T2('Normal','Normal da data'),sN+'°')}${svRow(T2('Usual (80%)','Habitual (80%)'),T(q[2])+'° – '+T(q[18])+'°')}${svRow(T2('Record range','Extremos'),T(q[0])+'° / '+T(q[20])+'°')}</dl>
 <p class="xt-src">${T2('Normal = 1991–2020 daily mean, ±7 days around the date. ERA5 reanalysis (Copernicus / ECMWF) via Open-Meteo Historical Weather API.','Normal = média diária de 1991–2020, ±7 dias em torno da data. Reanálise ERA5 (Copernicus / ECMWF) via Open-Meteo Historical Weather API.')}</p>`;
}
const xtSea=()=>{const i=seaInner();return i?`<section class="card xt" id="sea">${i}</section>`:''};
function xtraHTML(){
 if(!data||!place)return'';
 requestAnimationFrame(()=>requestAnimationFrame(xtWatch));
 return`<div class="pane xtra" id="xtra"><section class="card xt" id="anom">${anomInner()}</section>${xtSea()}</div>`;
}
function paintXtra(){
 const box=$('#xtra');if(!box||!data)return;
 const a=$('#anom');if(a)a.innerHTML=anomInner();
 const i=seaInner(),sc=$('#sea');
 if(!i){if(sc)sc.remove()}
 else if(sc)sc.innerHTML=i;
 else box.insertAdjacentHTML('beforeend',`<section class="card xt" id="sea">${i}</section>`);
 xtWatch();
 try{skyPaint()}catch(e){}
}

/* --- Air & pollen --- */
let extras={key:'',air:'',pol:''};
const LOADING=t=>`<h3>${t}</h3><p class="note sk">Loading…</p>`;
function airPane(){return`<div class="pane g2e"><section class="card" id="aq">${extras.air||LOADING('Air quality')}</section><section class="card" id="pol">${extras.pol||LOADING('Pollen & allergies')}</section></div>`}
function putExtra(id,html){const el=$('#'+id);if(el){el.innerHTML=html;runCounters(el)}}
function loadExtras(){
 const key=place.lat+','+place.lon;
 if(extras.key===key&&extras.air&&extras.pol)return;
 extras={key,air:'',pol:''};sig.aqi=null;sig.pollen=null;
 loadAir().then(h=>{if(extras.key!==key)return;extras.air=h;putExtra('aq',h);
  const m=h.match(/data-cu="(\d+)"/);sig.aqi=m?+m[1]:null;checkAlerts()});
 loadPollen().then(h=>{if(extras.key!==key)return;extras.pol=h;putExtra('pol',h);checkAlerts()});
}
async function loadAir(){
 try{
  const r=await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=european_aqi,pm2_5,pm10`);
  const j=(await r.json()).current;if(!j||j.european_aqi==null)throw 0;
  const a=Math.round(j.european_aqi),pct=Math.max(3,Math.min(100,a)),rot=-90+Math.min(100,a)*1.8;
  const lv=a<=20?['Good','Air is clean. Enjoy the outdoors.']:a<=40?['Fair','Fine for most people.']:a<=60?['Moderate','Sensitive people may notice effects.']:a<=80?['Poor','Consider shorter time outside.']:a<=100?['Very poor','Limit strenuous outdoor activity.']:['Extremely poor','Stay indoors if you can.'];
  return`<h3>Air quality</h3><div class="gauge"><svg viewBox="0 0 200 112" role="img" aria-label="Air quality index ${a}"><defs><linearGradient id="gg" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0"><stop offset="0" stop-color="#4fd18b"/><stop offset=".4" stop-color="#f3d34a"/><stop offset=".7" stop-color="#f59a3a"/><stop offset="1" stop-color="#e5652e"/></linearGradient></defs><path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="rgba(20,49,79,.1)" stroke-width="14" stroke-linecap="round"/><path class="gfill" d="M20,100 A80,80 0 0 1 180,100" pathLength="100" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="${100-pct}"/><g class="needle" style="--r:${rot}deg"><line x1="100" y1="100" x2="100" y2="34" stroke="#14314f" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="#14314f"/></g></svg></div>
  <div class="aq"><span data-cu="${a}">0</span><small>${lv[0]}</small></div><p class="note" style="text-align:center">${lv[1]}</p><p class="note" style="text-align:center;font-size:13px">PM2.5 ${j.pm2_5} µg/m³ · PM10 ${j.pm10} µg/m³</p>`;
 }catch(e){return`<h3>Air quality</h3><p class="note">Not available for this place right now.</p>`}
}

/* Pollen: Atmospore first, Open-Meteo as fallback */
const POLLEN_RX=/pollen|tree|grass|weed|birch|alder|oak|olive|ragweed|mugwort|hazel|cypress|pine|plane|poplar|ash|elm|nettle|plantain|cedar|maple|mold|mould|spore|fungi|alternaria|cladosporium/i;
const CATS={none:0,'very low':0,low:0,moderate:1,medium:1,high:2,'very high':3,extreme:3,severe:3};
const numOf=o=>{for(const k of['index','level','value','count','concentration','risk','score']){const v=o[k];if(typeof v=='number')return v;if(typeof v=='string'&&v.trim()!==''&&!isNaN(+v))return+v}return null};
const catOf=o=>{for(const k of['category','label','risk','level','status','description']){const v=o[k];if(typeof v=='string'&&CATS[v.toLowerCase()]!==undefined)return v.toLowerCase()}return null};
function harvest(node,out,depth=0){
 if(node==null||depth>7)return;
 if(Array.isArray(node)){node.forEach(n=>harvest(n,out,depth+1));return}
 if(typeof node!='object')return;
 const nm=['name','type','plant','species','allergen','displayName','display_name','code'].map(k=>node[k]).find(v=>typeof v=='string');
 if(nm&&POLLEN_RX.test(nm)){const v=numOf(node),c=catOf(node);if(v!==null||c){out.push({n:nm,v,c});return}}
 for(const[k,v]of Object.entries(node)){
  if(typeof v=='number'&&POLLEN_RX.test(k)&&!/lat|lon|time/i.test(k))out.push({n:k,v,c:null});
  else if(typeof v=='string'&&POLLEN_RX.test(k)&&CATS[v.toLowerCase()]!==undefined)out.push({n:k,v:null,c:v.toLowerCase()});
  else if(v&&typeof v=='object'&&!Array.isArray(v)&&POLLEN_RX.test(k)&&(numOf(v)!==null||catOf(v)))out.push({n:k,v:numOf(v),c:catOf(v)});
  else harvest(v,out,depth+1);
 }
}
const pretty=s=>{s=s.replace(/[_-]+/g,' ').replace(/\bpollen\b/i,'').trim();return s?s[0].toUpperCase()+s.slice(1).toLowerCase():'Pollen'};
function pLevel(v){if(v<=20)return 0;if(v<=50)return 1;if(v<=100)return 2;return 3}
const LVL=['Low','Moderate','High','Very high'];
function normalize(list){
 const m=new Map();
 list.forEach(x=>{const k=pretty(x.n).toLowerCase(),o=m.get(k);if(!o||(x.v??-1)>(o.v??-1))m.set(k,{...x,n:pretty(x.n)})});
 const arr=[...m.values()],vals=arr.map(x=>x.v).filter(v=>v!==null),mx=vals.length?Math.max(...vals):0,scale=mx<=5?5:mx<=10?10:null;
 return arr.map(x=>{
  let lvl,pct,label;
  if(x.v!==null){
   if(scale){const f=x.v/scale;lvl=f<=.3?0:f<=.6?1:f<=.8?2:3;pct=f*100}
   else{lvl=pLevel(x.v);pct=Math.min(100,x.v/1.2)}
   label=x.v===0?'None':LVL[lvl];
  }else{lvl=CATS[x.c];label=x.c[0].toUpperCase()+x.c.slice(1);pct=[18,45,75,100][lvl]}
  return{n:x.n,label,lvl,pct:Math.max(pct,5)};
 }).sort((a,b)=>b.lvl-a.lvl||b.pct-a.pct);
}
async function fetchJSON(url, headers, timeoutMs = 12000) {
    const ac = new AbortController();
    const t = setTimeout(() => {
        try {
            ac.abort(new DOMException('Timeout', 'TimeoutError'));
        } catch (_) {
            ac.abort();
        }
    }, timeoutMs);

    try {
        const r = await fetch(url, { headers, signal: ac.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
    } finally {
        clearTimeout(t);
    }
}
let speciesMeta=lsGet('speciesMeta');
const RISK={low:0,moderate:1,high:2,'very high':3};
const sig={aqi:null,pollen:null};

async function getSpeciesMeta(){
 if(speciesMeta&&speciesMeta.t>Date.now()-6048e5)return speciesMeta.d;
 try{
  const j=await fetchJSON(ATMO.base+'/species');
  speciesMeta={t:Date.now(),d:j.data||{}};lsSet('speciesMeta',speciesMeta);return speciesMeta.d;
 }catch(e){return{}}
}
let pollenOutlook=null;
const BAR_BASE=[12,38,62,85],BAR_SPAN=[24,24,23,15];
function speciesBar(s,lims){
 const risk=String(s.risk_level||'low').toLowerCase(),lvl=RISK[risk]??0,v=+s.value||0;
 const lowEdge=lvl>0?(lims[lvl-1]||0):0,highEdge=lims[lvl]||lims[lims.length-1]||1;
 const frac=lvl>=3?Math.min(1,v/highEdge):Math.max(0,Math.min(1,(v-lowEdge)/((highEdge-lowEdge)||1)));
 return{risk,lvl,v,pct:v===0?5:BAR_BASE[lvl]+BAR_SPAN[lvl]*frac};
}
async function pollenAtmospore(){
 if(atmoDead)return null;
 try{
  const dt=data.current.time.slice(0,10);
  const[j,meta]=await Promise.all([
   fetchJSON(`${ATMO.base}/pollen?lat=${place.lat}&lon=${place.lon}&dt=${dt}&forecast_days=5`),
   getSpeciesMeta()
  ]);
  //console.info('[Atmospore]',j);
  const days=j.data||[],day=days[0];
  if(!day||!day.species)return null;
  const limsOf=id=>(meta[id]&&meta[id].risk_thresholds)||[];
  const nameOf=(id,s)=>s.display_name||(meta[id]&&meta[id].display_name)||id;

  let rows=Object.entries(day.species).map(([id,s])=>{
   const b=speciesBar(s,limsOf(id));
   return{n:nameOf(id,s),v:b.v,lvl:b.lvl,pct:b.pct,label:b.v===0?'None':b.risk[0].toUpperCase()+b.risk.slice(1)};
  }).sort((a,b)=>b.lvl-a.lvl||b.v-a.v);
  if(rows.some(r=>r.v>0))rows=rows.filter(r=>r.v>0);

  pollenOutlook=days.slice(0,5).map((d,i)=>{
   const list=Object.entries(d.species||{}).map(([id,s])=>({id,s,b:speciesBar(s,limsOf(id))})).sort((a,b)=>b.b.lvl-a.b.lvl||b.b.v-a.b.v);
   const top=list[0],ov=RISK[String(d.overall_risk||'low').toLowerCase()]??0;
   const lvl=Math.max(ov,top?top.b.lvl:0),none=!top||top.b.v===0;
   return{
    day:i?new Date(d.date+'T12:00').toLocaleDateString('en',{weekday:'short'}):'Today',
    lvl,pct:none?8:Math.max(top.b.pct,BAR_BASE[lvl]),
    label:none?'None':['Low','Moderate','High','Very high'][lvl]
   };
  });

  sig.pollen={risk:String(day.overall_risk||'low').toLowerCase(),top:rows[0]&&rows[0].n};
  return rows;
 }catch(e){
  //console.warn('[Atmospore] failed:',e.message);
  atmoDead=true;
  return null;
 }
}
async function pollenOpenMeteo(){
 const keys=[['alder_pollen','Alder'],['birch_pollen','Birch'],['grass_pollen','Grass'],['mugwort_pollen','Mugwort'],['olive_pollen','Olive'],['ragweed_pollen','Ragweed']];
 const r=await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=${keys.map(k=>k[0]).join(',')}&timezone=auto`);
 const cur=(await r.json()).current||{};
 return keys.map(([k,n])=>{const v=cur[k];if(v==null)return null;const l=pLevel(v);return{n,label:v===0?'None':LVL[l],lvl:l,pct:Math.max(5,Math.min(100,v/1.2))}}).filter(Boolean).sort((a,b)=>b.lvl-a.lvl||b.pct-a.pct);
}
function pollenInsight(){
 const c=data.current,h=data.hourly,i0=idx0();
 const rain=Math.max(...h.precipitation_probability.slice(i0,i0+8)),v=c.wind_speed_10m,rh=c.relative_humidity_2m;
 if(rain>=60)return['drop','Rain is likely soon. It often rinses pollen out of the air, so levels can drop afterwards.'];
 if(v>=20&&rh<60)return['wind','Dry and windy: pollen travels far today, and levels can peak around midday.'];
 if(rh>=80)return['drop','Humid air makes pollen grains heavier, so they tend to settle closer to the ground.'];
 return['sun','Calm, dry weather: pollen usually peaks from late morning to the afternoon. Mornings are gentler.'];
}
function pollenHTML(rows,source,note){
 const w=rows[0],nm=w.n.toLowerCase();
 const adv=w.lvl>=2?`${nm[0].toUpperCase()+nm.slice(1)} pollen is running high. Keep windows closed, consider an antihistamine before symptoms start, and shower after time outdoors.`:w.lvl==1?`Pollen is moderate, led by ${nm}. Sensitive people may notice mild symptoms.`:'Pollen is low across the board. A good day for allergy sufferers to be outside.';
 const colors=['#4fd18b','#f0cf45','#f59a3a','#e5652e'];
 const grains=Array.from({length:6+w.lvl*6},()=>`<i style="--x:${Math.round(Math.random()*96)}%;--s:${(3+Math.random()*5).toFixed(1)}px;--d:${(7+Math.random()*7).toFixed(1)}s;--dl:-${(Math.random()*12).toFixed(1)}s;--pc:${colors[w.lvl]}"></i>`).join('');
 const[ii,it]=pollenInsight();
 const out=pollenOutlook&&pollenOutlook.length?`<div class="pout"><h4>Next ${pollenOutlook.length} days</h4><div class="pdays">${pollenOutlook.map((d,i)=>`<div class="pd" style="--n:${i}"><div class="pcol"><i class="lv${d.lvl}" style="--h:${d.pct}%"></i></div><b>${d.day}</b><small>${d.label}</small></div>`).join('')}</div></div>`:'';
 return`<div class="pdrift" aria-hidden="true">${grains}</div><h3>Pollen & allergies</h3><p class="note" style="margin:0 0 6px;font-size:15px">${adv}</p><div class="pl">${rows.slice(0,6).map((r,i)=>`<div class="pr"><span>${escH(r.n)}</span><div class="pb"><i class="lv${r.lvl}" style="--w:${r.pct}%;--n:${i}"></i></div><b>${escH(r.label)}</b></div>`).join('')}</div><div class="pins">${ic(ii)}<span>${it}</span></div>${out}<span class="src" style="align-self:flex-start;margin-top:14px">${source}</span>${note?`<p class="note" style="font-size:12px">${note}</p>`:''}`;
}
async function loadPollen(){
  pollenOutlook=null;
 try{
  const a=await pollenAtmospore();
  if(a&&a.length)return pollenHTML(a,'Atmospore');
  const o=await pollenOpenMeteo();
  if(o.length)return pollenHTML(o,'Open-Meteo fallback · Europe only','Atmospore didn’t return usable data for this request. Check the browser console for details.');
  return`<h3>Pollen & allergies</h3><p class="note">No pollen data is available for this location.</p>`;
 }catch(e){return`<h3>Pollen & allergies</h3><p class="note">Pollen data couldn’t be loaded right now.</p>`}
}

/* --- Science --- */
const dayN=()=>{const d=new Date();return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5)};   // nº do dia (hora local)
const dailyFact=()=>DAILY[((dayN()%DAILY.length)+DAILY.length)%DAILY.length];
function dailyHTML(isNew){
 const f=dailyFact(),dt=new Date().toLocaleDateString(LOC(),{day:'numeric',month:'long'});
 const title=LANG==='pt'&&f[3]?f[3][0]:f[1];
 const text=LANG==='pt'&&f[3]?f[3][1]:f[2];
 const cat=tr(f[0]);
 return`<div class="dayf${isNew?' new':''}" id="dayf" data-d="${dayN()}"><div class="dtag"><span>${tr('Fact of the day')} · ${cat}</span><em>${dt}</em></div><h3>${title}</h3><p>${text}</p></div>`;
}
let dayT=0;
function dayRefresh(){                       // troca o facto quando o dia muda
 const el=$('#dayf');
 if(el&&+el.dataset.d!==dayN())el.outerHTML=dailyHTML(true);
}
function dayArm(){                           // agenda a troca para as 0:00 (hora local)
 clearTimeout(dayT);
 const d=new Date(),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1,0,0,0,50);
 dayT=setTimeout(()=>{dayRefresh();dayArm()},Math.max(1000,next-d));
}
dayArm();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){dayRefresh();dayArm()}});   // separador em segundo plano

function quizCls(){
 if(sciMode!='quiz'||qs.a==null||qs.i>=qs.o.length)return'';
 return QZ[qs.o[qs.i]][1]==qs.a?' qok':' qbad';
}
function qMark(ok){
 const cf=ok?[...Array(14)].map((_,i)=>{const a=i/14*6.283+.2,d=40+(i%3)*10;
  return`<i class="cf" style="--dx:${(Math.cos(a)*d).toFixed(0)}px;--dy:${(Math.sin(a)*d).toFixed(0)}px;--r:${i*47}deg;--c:${['#22c55e','#facc15','#38bdf8','#fb7185'][i%4]}"></i>`}).join(''):'';
 const sym=ok?'<path class="qtick" d="M19 33.5l9 9 17.5-19.5"/>':'<path class="qx1" d="M22 22L42 42"/><path class="qx2" d="M42 22L22 42"/>';
 return`<div class="qm"><svg class="qmark" viewBox="0 0 64 64" aria-hidden="true"><circle class="qdisc" cx="32" cy="32" r="29"/><circle class="qring" cx="32" cy="32" r="29"/>${sym}</svg>${cf}</div>`;
}
function quizEnd(){
 const n=qs.o.length,r=qs.r,t=r==n?0:r>=25?1:r>=18?2:r>=10?3:4;
 const em=['🏆','🌟','👍','🌦️','🌱'][t];
 const vd=['Flawless. You could be on the forecasting desk.','Brilliant. Hardly any myth got past you.','Solid. A few myths slipped through, and now you know.','Not bad. Weather myths are sneaky.','The weather is full of surprises. Give it another go!'][t];
 return`<div class="qend"><div class="qem">${em}</div><div class="qscore"><b data-cu="${r}">0</b><span>/ ${n}</span></div><div class="qbar"><i style="width:${(r/n*100).toFixed(1)}%"></i></div><p class="qverdict">${vd}</p><button class="pill dk" data-qr>Play again</button></div>`;
}
function quizHTML(){
 const n=qs.o.length;
 if(qs.i>=n)return quizEnd();
 const z=QZ[qs.o[qs.i]],done=qs.a!=null,ok=done&&qs.a==z[1],last=qs.i+1>=n;
 const btn=(v,l)=>{let c='pill dk';if(done){if(v==z[1])c+=' qright';else if(v==qs.a)c+=' qwrong'}return`<button class="${c}" data-a="${v}"${done?' disabled':''}>${l}</button>`};
 const res=done?`<div class="qres">${qMark(ok)}<div class="qtxt"><b>${ok?'Correct.':'Not quite.'}</b> ${z[2]}<div><button class="pill dk" data-nq>${last?'See result':'Next question'}</button></div></div></div>`:'';
 return`<div class="qprog"><span>Question ${qs.i+1} of ${n}</span><div class="qbar"><i style="width:${((qs.i+(done?1:0))/n*100).toFixed(1)}%"></i></div></div>`
  +`<p class="qs">${z[0]}</p><div class="qb">${btn(0,'Myth')}${btn(1,'Fact')}</div>`
  +`<div class="qr" aria-live="polite">${res}</div><div class="sc" id="sc">${qs.r} right of ${qs.i+(done?1:0)}</div>`;
}
function sciBody() {
 if (sciMode == 'quiz') return quizHTML();
 const pool = factPool(), f = pool[((factI % pool.length) + pool.length) % pool.length];
 const imgHTML = f[4] ? `<img class="fimg" src="${IMG_DIR}${f[4]}" data-n="${f[4]}" 
alt="${tr(f[1]).replace(/"/g,'&quot;')}" loading="lazy" decoding="async" 
data-fbok data-fb="Gen">` : '';
 return `<span class="tag">${f[3]}</span><h2 class="fh">${f[1]}</h2>${imgHTML}
<p class="fp">${f[2]}</p><div class="fnav"><button class="pill dk" data-f="-1">Previous</button><button class="pill dk" data-f="1">Another</button></div>`;
}
function sciPane(){
 return`<div class="pane g2e"><section class="card${quizCls()}"><div class="sw"><button data-s="fact" aria-pressed="${sciMode=='fact'}">Did you know</button><button data-s="quiz" aria-pressed="${sciMode=='quiz'}">Myth or fact</button></div><div id="sbody">${sciBody()}</div></section>
 <section class="card"><h3>The physics right now</h3><div class="labgrid">${lab()}</div></section></div>`;
}
function drawSci(){
 const b=$('#sbody');if(!b)return;
 const n=b.cloneNode(false);n.innerHTML=sciBody();b.replaceWith(n);
 const c=n.closest('.card');
 if(c){c.classList.remove('qok','qbad','fresh');const k=quizCls();if(k){c.classList.add(k.trim());if(qFresh)c.classList.add('fresh')}}
 if(qFresh){const nb=n.querySelector('[data-nq]');if(nb)nb.focus({preventScroll:true})}
 qFresh=false;
 if(sciMode=='quiz')runCounters(n);
}

/* ============ count-up ============ */
function countUp(el,to,ms=1100){
 if(!el)return;if(still){el.textContent=to;return}
 const t0=performance.now(),f=t=>{const k=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-k,4);el.textContent=Math.round(to*e);if(k<1)requestAnimationFrame(f)};
 requestAnimationFrame(f);
}
const runCounters=(r=document)=>$$('[data-cu]',r).forEach(el=>{countUp(el,+el.dataset.cu);el.removeAttribute('data-cu')});

/* ============ ticker ============ */
let tI=0;