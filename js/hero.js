/* Skylab · hero.js — hero card · load order 10/28 (classic script, shared global scope) */
/* ============ hero ============ */
function nowcastHTML(){
 const m=data.minutely_15,p=m&&m.precipitation?m.precipitation.slice(0,8).map(x=>x||0):null;
 if(!p||!p.length){
  const i0=idx0(),r=Math.max(...data.hourly.precipitation_probability.slice(i0,i0+3));
  return`<div class="ncbox" id="ncbox">${ic('drop')}<span>${r}% rain chance in the next 3 hours</span></div>`;
 }
 const wet=x=>x>=.05,first=p.findIndex(wet),mx=Math.max(...p,.5),pk=Math.max(...p)*4;   // pico em mm/h
 const col=x=>!wet(x)?'rgba(255,255,255,.6)':x*4<.5?'#7fc1ff':x*4<4?'#3b8fe0':'#1d5fc4';
 const i0=idx0(),r3=Math.max(...data.hourly.precipitation_probability.slice(i0,i0+3));
 let head,sub;
 if(first<0){head='Dry for the next 2 hours';sub=`${r3}% rain chance in the next 3 hours`}
 else if(first==0){const end=p.findIndex(x=>!wet(x));head='Raining now';sub=end<0?'Rain for the next 2 hours':`Rain stops in about ${end*15} min`}
 else{head=`Rain in about ${first*15} min`;sub=pk<.5?'Light rain expected':pk<4?'Moderate rain expected':'Heavy rain expected'}
 return`<div class="ncbox" id="ncbox" title="Precipitation forecast for the next 2 hours"><div class="nb">${p.map((x,i)=>`<i class="${wet(x)?'w':''}" style="height:${Math.max(14,x/mx*100)}%;animation-delay:${i*60}ms;background:${col(x)}"></i>`).join('')}</div><div class="nct"><b>${head}</b><small>${sub}</small></div></div>`;
}
/* ---- nowcast de radar: substitui a caixa quando há chuva a caminho nos próximos 60 min ---- */
let ncHeroTok=0;
async function ncHero(){
 const box=$('#ncbox');
 if(!box||!data||!place||typeof NC==='undefined'||!navigator.onLine)return;
 const p=data.minutely_15&&data.minutely_15.precipitation;
 if(!p||!p.length||!p.some(x=>(x||0)>=.05))return;                 // nada a caminho: a API chega
 if(navigator.connection&&navigator.connection.saveData)return;
 const tok=++ncHeroTok,key=place.lat+','+place.lon;
 let res;
 try{res=await NC.forecast({lat:place.lat,lon:place.lon,grid:2,horizon:6,verify:true})}catch(e){return}
 if(tok!==ncHeroTok||!res||!res.ok)return;
 if(!place||place.lat+','+place.lon!==key)return;
 const b=$('#ncbox');if(!b)return;
 const r=NC.rainIn(res,place.lat,place.lon);
 if(!r.wetNow&&!r.startMin)return;                                  // sem chuva nos 60 min: fica a versão da API
 const vals=res.steps.map((s,i)=>{const v=NC.sampleArea(res,place.lat,place.lon,i);return v?v.mm:0});
 const wet=x=>x>=.15,mx=Math.max(...vals,.5);
 const col=x=>!wet(x)?'rgba(255,255,255,.6)':x<1?'#7fc1ff':x<4?'#3b8fe0':'#1d5fc4';
 const light=T2('Light rain expected','Chuva fraca prevista'),mod=T2('Moderate rain expected','Chuva moderada prevista'),heavy=T2('Heavy rain expected','Chuva forte prevista');
 let head,sub;
 if(r.wetNow){
  head=T2('Raining now','A chover agora');
  sub=r.stopMin&&r.stopMin<=60?`Rain stops in about ${r.stopMin} min`:T2('Rain for the next hour','Chuva na próxima hora');
 }else{
  head=`Rain in about ${r.startMin} min`;
  sub=r.peak<2?light:r.peak<10?mod:heavy;
 }
 b.title=T2('Precipitation forecast for the next 60 minutes, extrapolated from the radar with optical flow','Previsão de precipitação para os próximos 60 min, extrapolada do radar com fluxo ótico');
 b.innerHTML=`<div class="nb">${vals.map((x,i)=>`<i class="${wet(x)?'w':''}" style="height:${Math.max(14,x/mx*100)}%;animation-delay:${i*60}ms;background:${col(x)}"></i>`).join('')}</div><div class="nct"><b>${head}</b><small>${sub}</small><small class="ncsrc">${T2('radar nowcast','nowcast de radar')}</small></div>`;
}
function heroHTML(){
 const c=data.current,d=data.daily;
 const local=new Date(c.time).toLocaleString('en',{weekday:'long',hour:'numeric',minute:'2-digit'});
 return`<section class="hero" id="hero">
<div class="now">
 <div class="place"><h1>${escH(place.name)}</h1><button class="star" id="fav" aria-label="Save place"></button><button class="share" id="shareBtn" type="button" aria-label="${T2('Share this place','Partilhar este local')}" title="${T2('Share link','Partilhar ligação')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button></div>
 <div class="sub">${place.sub?escH(place.sub)+' · ':''}${local}</div>
 <div class="temp"><span id="tn">${T(c.temperature_2m)}</span><sup>°</sup></div>
 <div class="cond" id="cond"><span class="em">${emoji(c.weather_code,c.is_day)}</span>
${LABEL[c.weather_code]||'—'}</div>
 <div class="feels" id="feels">Feels like ${T(c.apparent_temperature)}° · High ${T(d.temperature_2m_max[0])}° · Low ${T(d.temperature_2m_min[0])}°</div>
 <p class="lede">${heroLine()}</p>
 <div class="tt"><input type="range" id="tr" min="0" max="24" value="0" aria-label="Travel through the next 24 hours"><div class="tl" id="tlab" aria-live="polite">Drag to travel through the next 24 hours</div></div>
<div class="m-stats"><div><span class="k"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>${T2('Humidity','Humidade')}</span><b>${Math.round(c.relative_humidity_2m)}%</b></div><div><span class="k"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>${T2('UV index','Índice UV')}</span><b>${Math.round(d.uv_index_max[0])}</b></div><div><span class="k"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16a4 4 0 0 1-.9-7.9A6 6 0 0 1 17.6 9 3.5 3.5 0 0 1 17 16z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/></svg>${T2('Rain','Chuva')}</span><b>${Math.round(d.precipitation_probability_max[0]||0)}%</b></div><div><span class="k"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/></svg>${T2('Wind','Vento')}</span><b>${W(c.wind_speed_10m)}</b></div></div>
<div class="m-pill"><span>${T2('Today','Hoje')} <i class="u">↑${T(d.temperature_2m_max[0])}°</i> <i class="d">↓${T(d.temperature_2m_min[0])}°</i></span><span class="sep"></span><span>${T2('Tomorrow','Amanhã')} <i class="u">↑${T(d.temperature_2m_max[1])}°</i> <i class="d">↓${T(d.temperature_2m_min[1])}°</i></span></div>
</div>
<div class="scene"><div class="bigwrap"><i class="halo"></i><div class="bigic" id="bigic">
${emoji(c.weather_code,c.is_day)}</div></div>${nowcastHTML()}
</div>
</section>`;
}
function timeTravel(){
 const c=data.current,h=data.hourly,i0=idx0(),base=cat(c.weather_code,c.is_day),tr=$('#tr'),lab=$('#tlab');
 const f0=$('#feels').innerHTML,c0=$('#cond').innerHTML,b0=$('#bigic').innerHTML;
 const stops=h.temperature_2m.slice(i0,i0+25).map((t,i,a)=>`${tempColor(t)} ${(i/(a.length-1)*100).toFixed(1)}%`).join(',');
 tr.style.background=`linear-gradient(90deg,${stops})`;
 const apply=(t,k,ts)=>{theme(t,k);if(mode!==k)fxSet(k);orbAt(ts,k)};
 tr.oninput=()=>{
  const v=+tr.value,j=i0+v;
  if(!v){$('#tn').textContent=T(c.temperature_2m);$('#cond').innerHTML=c0;$('#feels').innerHTML=f0;$('#bigic').innerHTML=b0;lab.textContent='Now';apply(c.temperature_2m,base,c.time);return}
  const code=h.weather_code[j],day=h.is_day[j],k=cat(code,day),t=h.temperature_2m[j];
  $('#tn').textContent=T(t);$('#cond').innerHTML=`<span class="em">${emoji(code,day)}</span>${LABEL[code]||''}`;
  $('#bigic').innerHTML=emoji(code,day);$('#feels').textContent=`${h.precipitation_probability[j]}% chance of rain`;
  lab.textContent=new Date(h.time[j]).toLocaleString('en',{weekday:'short',hour:'numeric'});
  apply(t,k,h.time[j]);
 };
 orbAt(c.time,base);
}
function paintFav(){
 const b=$('#fav');if(!b)return;
 const on=favs().some(f=>f.name==place.name&&f.sub==place.sub);
 b.textContent=on?'★':'☆';b.title=on?'Remove from saved places':'Save this place';
}
