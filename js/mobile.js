/* Skylab · mobile.js — mobile v2 UI (only runs with html.is-mobile) · load order 25/28 (classic script, shared global scope) */
/* ============ MOBILE v2 · "instrumento de bolso" (só corre com html.is-mobile) ============
   O resto da app (dados, rádar, conta, favoritos, furacões…) fica intacto: esta camada só
   reorganiza o ecrã e faz "proxy" para os controlos que já existem. */
function mobileSheetHTML(){return(IS_MOBILE&&data&&window.SkyM)?SkyM.sheet():''}
function mobileCities(){if(window.SkyM)SkyM.cities()}
if(IS_MOBILE)(function(){
 const svg=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
 const P={
  now:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  week:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  map:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
   uv:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  air:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
  sci:'<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pin:'<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
  swap:'<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  hur:'<path d="M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M12 6c4 0 7 2 6 5M12 18c-4 0-7-2-6-5M6 12c0-4 2-7 5-6M18 12c0 4-2 7-5 6"/>',
  warn:'<path d="M12 3 2 20h20z"/><path d="M12 10v5M12 18v.01"/>',
  term:'<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  dl:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  gauge:'<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 14l4-5"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  rain:'<path d="M7 16a4 4 0 0 1-.9-7.9A6 6 0 0 1 17.6 9 3.5 3.5 0 0 1 17 16z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
  dew:'<path d="M12 3s5 5.5 5 9.5a5 5 0 0 1-10 0C7 8.5 12 3 12 3z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  nav:'<path d="M12 3l5 9h-4v9h-2v-9H7z"/>'
 };
 const fN=(v,d=1)=>{const s=(+v).toFixed(d);return LANG==='pt'?s.replace('.',','):s};
 const G={today:'now',week:'week',radar:'map',uv:'uv',air:'air',sky:'sci',sci:'sci'};
 const NAV_L=()=>[T2('Now','Agora'),T2('Week','Semana'),T2('Maps','Mapas'),'UV',T2('Air','Ar'),T2('Science','Ciência')];
 const NAV=[['now','today'],['week','week'],['map','radar'],['uv','uv'],['air','air'],['sci','sky']];
 const root=document.documentElement;

 /* ---------- séries e matemática ---------- */
 const ser=k=>{const h=data.hourly,a=idx0();return(h[k]||[]).slice(a,a+25).map(v=>v==null?NaN:+v)};
 const BF=[1,6,12,20,29,39,50,62,75,89,103,118];
 const BFN=[['Calm','Calmo'],['Light air','Aragem'],['Light breeze','Brisa fraca'],['Gentle breeze','Brisa suave'],['Moderate breeze','Brisa moderada'],['Fresh breeze','Brisa fresca'],['Strong breeze','Brisa forte'],['Near gale','Vento forte'],['Gale','Ventania'],['Strong gale','Ventania forte'],['Storm','Tempestade'],['Violent storm','Tempestade violenta'],['Hurricane force','Força de furacão']];
 const beau=k=>{let n=0;while(n<BF.length&&k>=BF[n])n++;return n};
 const esat=T=>6.112*Math.exp(17.67*T/(T+243.5));
 const tdew=(T,RH)=>{const g=Math.log(Math.max(RH,.01)/100)+17.625*T/(243.04+T);return 243.04*g/(17.625-g)};
 const CARD=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'],CARDE=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
 const card=d=>(LANG==='pt'?CARD:CARDE)[Math.round((((d%360)+360)%360)/22.5)%16];
 const uvCat=u=>u<3?T2('Low','Baixo'):u<6?T2('Moderate','Moderado'):u<8?T2('High','Alto'):u<11?T2('Very high','Muito alto'):T2('Extreme','Extremo');
 const dewCat=t=>t<10?T2('Dry','Seco'):t<16?T2('Pleasant','Agradável'):t<19?T2('Humid','Húmido'):t<22?T2('Muggy','Abafado'):T2('Oppressive','Opressivo');
 const rhCat=r=>r<30?T2('Dry air','Ar seco'):r<60?T2('Comfortable','Confortável'):r<80?T2('Humid','Húmido'):T2('Very humid','Muito húmido');
 function ptend(){const p=ser('pressure_msl'),a=idx0(),h=data.hourly.pressure_msl,b=Math.max(0,a-3),n=a-b;if(!n)return{d:0,t:T2('Steady','Estável')};
  const d=(h[a]-h[b])*3/n,ad=Math.abs(d);
  const t=ad<.5?T2('Steady','Estável'):(d>0?T2('Rising','A subir'):T2('Falling','A descer'))+(ad<1.6?' '+T2('slowly','devagar'):ad>3.5?' '+T2('quickly','depressa'):'');
  return{d,t}}

 /* ---------- mini-gráficos (Tufte) ---------- */
 function spark(v,bars){
  const w=150,h=30,p=3,f=v.filter(isFinite);if(f.length<2)return'';
  const lo=Math.min(...f),hi=Math.max(...f),sp=hi-lo||1,n=v.length-1;
  const X=i=>p+i*(w-2*p)/n,Y=x=>h-p-(x-lo)/sp*(h-2*p);
  if(bars){const bw=(w-2*p)/v.length;return`<svg class="m-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">${v.map((x,i)=>{const hh=Math.max(1.2,(x||0)/100*(h-2*p));return`<rect x="${(p+i*bw+.7).toFixed(1)}" y="${(h-p-hh).toFixed(1)}" width="${(bw-1.4).toFixed(1)}" height="${hh.toFixed(1)}" rx="1"/>`}).join('')}</svg>`}
  const d=v.map((x,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(isFinite(x)?x:lo).toFixed(1)).join('');
  return`<svg class="m-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="a" d="${d}L${X(n)} ${h}L${X(0)} ${h}Z"/><path class="l" d="${d}"/><circle cx="${X(0).toFixed(1)}" cy="${Y(v[0]).toFixed(1)}" r="3"/></svg>`}
 function bigChart(v,o){
  o=o||{};const w=340,h=112,l=6,r=6,t=14,b=22,f=v.filter(isFinite);if(f.length<2)return'';
  let lo=o.bars?0:Math.min(...f),hi=o.bars?100:Math.max(...f);if(hi-lo<1e-6){hi+=1;lo-=1}
  const pad=o.bars?0:(hi-lo)*.12;lo-=pad;hi+=pad;const sp=hi-lo,n=v.length-1;
  const X=i=>l+i*(w-l-r)/n,Y=x=>t+(hi-x)/sp*(h-t-b);
  const hrs=data.hourly.time.slice(idx0(),idx0()+25);
  const tick=[0,6,12,18,24].filter(i=>i<=n).map(i=>`<text x="${X(i).toFixed(1)}" y="${h-6}" text-anchor="${i==0?'start':i==n?'end':'middle'}" font-size="10.5" fill="#4a617e">${i?hrs[i].slice(11,13)+'h':T2('Now','Agora')}</text><line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${t}" y2="${h-b}" stroke="rgba(16,41,74,.08)"/>`).join('');
  let body;
  if(o.bars){const bw=(w-l-r)/v.length;body=v.map((x,i)=>{const hh=Math.max(1.5,(x||0)/100*(h-t-b));return`<rect x="${(l+i*bw+1).toFixed(1)}" y="${(h-b-hh).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${hh.toFixed(1)}" rx="2" fill="var(--ac)" opacity=".8"/>`}).join('')}
  else{const d=v.map((x,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(x).toFixed(1)).join('');
   const iMax=v.indexOf(Math.max(...f)),iMin=v.indexOf(Math.min(...f));
   const lab=(i,dy)=>`<text x="${Math.min(w-18,Math.max(18,X(i))).toFixed(1)}" y="${(Y(v[i])+dy).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#10294a">${o.fmt?o.fmt(v[i]):v[i].toFixed(0)}</text>`;
   body=`<path d="${d}L${X(n)} ${h-b}L${X(0)} ${h-b}Z" fill="var(--ac)" opacity=".12"/><path d="${d}" fill="none" stroke="var(--ac)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${X(0)}" cy="${Y(v[0]).toFixed(1)}" r="4.5" fill="#fff" stroke="var(--ac)" stroke-width="2.5"/>${lab(iMax,-8)}${iMin!==iMax?lab(iMin,16):''}`}
  return`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${o.label||''}">${tick}${body}</svg>`}

 /* ---------- instrumentos: valores + ciência ---------- */
 function dataFor(k){
  const c=data.current,d=data.daily,i=idx0(),h=data.hourly;
  if(k==='wind'){const v=c.wind_speed_10m,g=c.wind_gusts_10m,b=beau(v),kt=unit!=='c';
   return{v:kt?Math.round(v*.539957):Math.round(v),u:kt?'kt':'km/h',tag:BFN[b][LANG==='pt'?1:0],sub:T2('From','De')+' '+card(c.wind_direction_10m)+(isFinite(g)?' · '+T2('gusts','rajadas')+' '+(kt?Math.round(g*.539957):Math.round(g)):''),s:ser('wind_speed_10m'),dir:c.wind_direction_10m,fmt:x=>Math.round(kt?x*.539957:x)}}
  if(k==='humidity'){const r=c.relative_humidity_2m;return{v:Math.round(r),u:'%',tag:rhCat(r),sub:rhCat(r),s:ser('relative_humidity_2m'),fmt:x=>Math.round(x)+'%'}}
  if(k==='pressure'){const p=pMSL(),t=ptend();const f=unit!=='c',q=f?HPA_INHG:1;return{v:f?+(p*q).toFixed(2):Math.round(p),u:pU(),tag:t.t,sub:t.t+(t.d?' · '+(t.d>0?'+':'')+pdS(t.d)+'/3h':''),s:ser('pressure_msl').map(x=>x==null?x:x*q),fmt:x=>f?x.toFixed(2):Math.round(x)}}
  if(k==='uv'){const u=d.uv_index_max[0];return{v:Math.round(u),u:'',tag:uvCat(u),sub:uvCat(u)+' · '+T2('peak today','máx. hoje'),uv:u}}
  if(k==='rain'){const s=ser('precipitation_probability'),m=Math.max(...s.filter(isFinite)),at=s.indexOf(m);
   return{v:Math.round(m),u:'%',tag:m<20?T2('Unlikely','Improvável'):m<50?T2('Possible','Possível'):m<80?T2('Likely','Provável'):T2('Very likely','Muito provável'),sub:m<20?T2('Dry next 24 h','Seco nas próximas 24 h'):T2('Peak around','Pico por volta das')+' '+h.time[idx0()+at].slice(11,13)+'h',s,bars:1,fmt:x=>Math.round(x)+'%'}}
  if(k==='dew'){const t=c.dew_point_2m;return{v:T(t),u:'°',tag:dewCat(t),sub:dewCat(t),s:ser('dew_point_2m').map(x=>unit=='c'?x:x*9/5+32),fmt:x=>Math.round(x)+'°'}}
 }
 const mkINS=()=>[
  ['wind','nav',T2('Wind','Vento'),'#2f7fd6'],['humidity','drop',T2('Humidity','Humidade'),'#1f9a8e'],
  ['pressure','gauge',T2('Pressure','Pressão'),'#6a56c9'],['uv','sun',T2('UV index','Índice UV'),'#d9822b'],
  ['rain','rain',T2('Rain','Chuva'),'#2468c9'],['dew','dew',T2('Dew point','Orvalho'),'#c4458f']];
 function tile([k,ic,name,ac]){
  const x=dataFor(k);
  const vis=k==='uv'?`<div class="m-uvbar" aria-hidden="true"><i style="left:${Math.min(100,x.uv/12*100)}%"></i></div>`:spark(x.s,x.bars);
  const cmp=k==='wind'?`<span class="cmp" style="transform:rotate(${(x.dir||0)+180}deg)">${svg(P.nav).replace('<svg','<svg fill="currentColor" stroke="none"')}</span>`:'';
  return`<button type="button" class="m-it" data-sci="${k}" style="--ac:${ac}" aria-label="${name}: ${x.v}${x.u?' '+x.u:''}, ${x.tag}. ${T2('Tap for the science','Toca para ver a ciência')}">
 <span class="m-il">${svg(P[ic])}${name}<i class="q">?</i></span>
 <span class="m-iv"><b>${x.v}</b><small>${x.u}</small>${cmp}</span><span class="m-is">${x.sub}</span>${vis}</button>`}

 /* ---------- ecrã Agora ---------- */
 function hoursHTML(){
  const h=data.hourly,a=idx0(),n=Math.min(25,h.time.length-a);let cells='';
  for(let k=0;k<n;k++){const j=a+k,p=h.precipitation_probability[j]||0,hh=h.time[j].slice(11,13);
   cells+=`<button type="button" class="m-hc${k?'':' on'}" data-v="${k}" aria-label="${k?hh+'h':T2('Now','Agora')}: ${T(h.temperature_2m[j])}°, ${p}% ${T2('rain','chuva')}"><span class="t">${k?hh+'h':T2('Now','Agora')}</span><span class="e">${emoji(h.weather_code[j],h.is_day[j])}</span><b>${T(h.temperature_2m[j])}°</b><span class="r" style="--p:${p}"><i></i></span><em>${p>=20?p+'%':''}</em></button>`}
  return`<section class="m-card m-hours" aria-label="${T2('Next 24 hours','Próximas 24 horas')}"><div class="m-ch"><h2>${T2('Next 24 hours','Próximas 24 horas')}</h2><span class="m-hint" id="mSel">${T2('Tap to time-travel','Toca para viajar no tempo')}</span></div><div class="m-hs" id="mHS">${cells}</div></section>`}
 function sheet(){
  return hoursHTML()+`<section class="m-card m-inst" aria-label="${T2('Instruments','Instrumentos')}"><div class="m-ch"><h2>${T2('Instruments','Instrumentos')}</h2><span class="m-hint">${T2('Tap for the science','Toca para ver a ciência')}</span></div><div class="m-ig">${mkINS().map(tile).join('')}</div></section>`}

 /* ---------- "porquê?" — a ciência por trás de cada número ---------- */
 function sciText(k){
  const c=data.current,E=data.elevation||0,Tt=c.temperature_2m,RH=c.relative_humidity_2m;
  const es=esat(Tt),e=RH/100*es,td=tdew(Tt,RH);
  if(k==='wind'){const v=c.wind_speed_10m,ms=v/3.6,B=Math.pow(ms/.836,2/3);return{
   what:T2('Air in motion. It blows from high pressure towards low pressure, bent sideways by the Earth’s rotation (the Coriolis effect).','Ar em movimento. Sopra das zonas de alta pressão para as de baixa, desviado pela rotação da Terra (efeito de Coriolis).'),
   why:T2('Gusts are turbulence near the ground: friction with buildings and terrain makes the wind pulse. Beaufort turns speed into effects you can see and feel.','As rajadas são turbulência junto ao solo: o atrito com edifícios e relevo faz o vento pulsar. A escala de Beaufort traduz a velocidade em efeitos que se veem e sentem.'),
   how:T2('Beaufort: B = (v / 0.836)^(2/3), v in m/s','Beaufort: B = (v / 0,836)^(2/3), v em m/s')+`\n${T2('Now','Agora')}: v = ${fN(v,1)} km/h = ${fN(ms,1)} m/s → B ≈ ${fN(B,1)} → ${T2('force','força')} ${beau(v)}`}}
  if(k==='humidity')return{
   what:T2('How much water vapour the air holds compared with the most it could hold at that temperature.','Quanto vapor de água o ar tem, comparado com o máximo que aguentaria àquela temperatura.'),
   why:T2('Warm air holds more vapour. That is why relative humidity climbs at night as the air cools, even when no rain is added.','Ar quente aguenta mais vapor. Por isso a humidade relativa sobe à noite, quando o ar arrefece, mesmo sem chuva.'),
   how:'e_s = 6.112·exp(17.67·T/(T+243.5))  [hPa]\nHR = e / e_s\n'+`${T2('Now','Agora')}: T = ${fN(Tt,1)} °C → e_s = ${fN(es,1)} hPa\n${T2('vapour','vapor')} e = ${fN(e,1)} hPa → HR = ${Math.round(RH)} %`};
  if(k==='dew')return{
   what:T2('The temperature to which the air would have to cool for its vapour to start condensing into dew or fog.','A temperatura a que o ar teria de arrefecer para o vapor começar a condensar em orvalho ou nevoeiro.'),
   why:T2('It measures the real amount of moisture, so it says how muggy it feels better than relative humidity does. Above ~18 °C most people find the air sticky.','Mede a quantidade real de humidade, por isso diz melhor que a humidade relativa se o ar está abafado. Acima de ~18 °C a maioria das pessoas sente o ar pesado.'),
   how:'γ = ln(HR/100) + 17.625·T/(243.04+T)\nT_d = 243.04·γ / (17.625 − γ)   (Magnus)\n'+`${T2('Now','Agora')}: T = ${fN(Tt,1)} °C, HR = ${Math.round(RH)} %\nγ = ${fN(Math.log(RH/100)+17.625*Tt/(243.04+Tt),2)} → T_d ≈ ${fN(td,1)} °C`};
  if(k==='pressure'){const ps=c.surface_pressure,p0=ps*Math.pow(1-.0065*E/(Tt+.0065*E+273.15),-5.257),t=ptend();return{
   what:T2('The weight of the column of air above you, converted to sea level so places at different heights can be compared.','O peso da coluna de ar por cima de ti, convertido para o nível do mar para comparar locais a alturas diferentes.'),
   why:T2('What matters is the trend: falling over 3 hours usually announces worse weather, rising means settling. '+'Now: '+t.t.toLowerCase()+'.','O que conta é a tendência: a descer durante 3 horas costuma anunciar pior tempo, a subir indica estabilização. Agora: '+t.t.toLowerCase()+'.'),
   how:'p₀ = p·(1 − 0.0065·h / (T + 0.0065·h + 273.15))^−5.257\n'+`${T2('Now','Agora')}: p = ${fN(ps,0)} hPa, h = ${Math.round(E)} m, T = ${fN(Tt,1)} °C\n→ p₀ ≈ ${fN(p0,0)} hPa (${T2('model value','valor do modelo')}: ${fN(pMSL(),0)} hPa)`}}
  if(k==='uv'){const u=data.daily.uv_index_max[0];return{
   what:T2('Ultraviolet radiation weighted by how much it harms skin (erythema), on the WHO scale from 0 to 11+.','Radiação ultravioleta ponderada pelo dano que causa na pele (eritema), na escala da OMS de 0 a 11+.'),
   why:T2('It depends on the Sun’s height, clouds and the ozone layer. From 3 upwards use protection; from 8, avoid the midday Sun. Clouds can still let most UV through.','Depende da altura do Sol, das nuvens e do ozono. A partir de 3 convém proteção; a partir de 8, evitar o sol do meio-dia. As nuvens podem deixar passar boa parte do UV.'),
   how:'UVI = 40 m²/W × E_eri\n'+`${T2('Today’s peak','Máximo de hoje')}: UVI ${Math.round(u)} → E_eri ≈ ${fN(u/40,2)} W/m²`}}
  if(k==='rain'){const s=ser('precipitation_probability'),m=Math.max(...s.filter(isFinite));return{
   what:T2('The share of weather-model scenarios (an ensemble) that put more than 0.1 mm of rain in that hour.','A fatia de cenários dos modelos de previsão (um conjunto) que põem mais de 0,1 mm de chuva nessa hora.'),
   why:T2('Probability is not amount: 80 % can still mean a few drops, and 20 % a short heavy shower. Check the nowcast bars for intensity.','Probabilidade não é quantidade: 80 % pode ser só uns pingos e 20 % um aguaceiro forte e curto. Vê as barras do nowcast para a intensidade.'),
   how:T2('P = scenarios with rain / total scenarios\n','P = cenários com chuva / total de cenários\n')+`${T2('Highest in 24 h','Máximo em 24 h')}: ${Math.round(m)} %`}}
 }
 let sciKey='';
 function sciOpen(k){
  const meta=mkINS().find(x=>x[0]===k);if(!meta||!data)return;sciKey=k;
  const x=dataFor(k),tx=sciText(k),ac=meta[3];
  const chart=k==='uv'?'':bigChart(x.s,{bars:x.bars,fmt:x.fmt,label:meta[2]});
  $('#mSciB').innerHTML=`<div style="--ac:${ac}"><div class="m-sci-h"><span class="ico">${svg(P[meta[1]])}</span><div><h3>${meta[2]}</h3><small>${place?escH(place.name):''}</small></div></div>
<div class="m-sci-val"><b>${x.v}</b><span>${x.u}</span><em>${x.tag}</em></div>
${k==='uv'?`<div class="m-uvbar" style="margin:14px 0 8px" aria-hidden="true"><i style="left:${Math.min(100,x.uv/12*100)}%"></i></div>`:`<div class="m-sci-chart">${chart}</div>`}
<div class="m-sci-p"><h4>${T2('What it is','O que é')}</h4><p>${tx.what}</p></div>
<div class="m-sci-p"><h4>${T2('Why it matters','Porque importa')}</h4><p>${tx.why}</p></div>
<div class="m-sci-p"><h4>${T2('How it is worked out','Como se calcula')}</h4><p>${T2('With your numbers, right now:','Com os teus números, agora:')}</p><code>${escH(tx.how)}</code></div>
<p class="m-sci-src">${T2('Data: Open-Meteo. Formulas: Bolton (1980), Magnus, WHO UV index, Beaufort scale.','Dados: Open-Meteo. Fórmulas: Bolton (1980), Magnus, índice UV da OMS, escala de Beaufort.')}</p></div>`;
  openSheet('mSci');
 }

 /* ---------- folhas ---------- */
 let scrim,menu,sci,openId='';
 function openSheet(id){closeSheets(true);openId=id;const s=$('#'+id);s.classList.add('on');scrim.classList.add('on');root.classList.add('m-lock');s.querySelector('.m-sbody').scrollTop=0}
 function closeSheets(quiet){if(!openId)return;const s=$('#'+openId);if(s){s.classList.remove('on');s.style.transform=''}scrim.classList.remove('on');root.classList.remove('m-lock');openId=''}
 function dragify(sheetEl){
  const g=sheetEl.querySelector('.m-grab');let y0=0,dy=0,on=false;
  g.addEventListener('touchstart',e=>{on=true;y0=e.touches[0].clientY;dy=0;sheetEl.classList.add('drag')},{passive:true});
  g.addEventListener('touchmove',e=>{if(!on)return;dy=Math.max(0,e.touches[0].clientY-y0);sheetEl.style.transform=`translateY(${dy}px)`},{passive:true});
  const end=()=>{if(!on)return;on=false;sheetEl.classList.remove('drag');if(dy>90)closeSheets();else sheetEl.style.transform=''};
  g.addEventListener('touchend',end);g.addEventListener('touchcancel',end);
 }
 function menuHTML(){
  const ab=$('#authBtn'),inn=!!(ab&&ab.classList.contains('is-in')),av=$('#authAv'),nm=$('#authTxt')?$('#authTxt').textContent.trim():'';
  const bg=inn&&av&&av.style.backgroundImage?`style="background-image:${av.style.backgroundImage}"`:'';
  const ini=inn&&av&&!av.style.backgroundImage?escH(av.textContent):'';
  const hb=$('#hbtn'),hn=hb&&hb.dataset.n,hot=hb&&hb.classList.contains('hot');
  const wr=$('#wrn'),wOn=wr&&!wr.hidden&&/\d/.test(wr.textContent);
  const row=(act,ic,txt,extra,cls)=>`<button type="button" class="m-row${cls||''}" data-act="${act}">${svg(P[ic])}<span>${txt}</span>${extra||''}</button>`;
  const snd=$('#snd'),sOn=snd&&snd.getAttribute('aria-pressed')==='true';
  return`<button type="button" class="m-acc" data-act="auth"><span class="av" ${bg}>${inn?ini:svg(P.user)}</span><span><b>${inn?escH(nm):T2('Sign in','Iniciar sessão')}</b><small>${inn?T2('Account and sync','Conta e sincronização'):T2('Save favourites and sync them','Guarda favoritos e sincroniza-os')}</small></span><span class="go">›</span></button>
<div class="m-qa"><button type="button" data-act="loc">${svg(P.pin)}${T2('Locate me','Localizar-me')}</button><button type="button" data-act="sur">${svg(P.swap)}${T2('Surprise me','Surpresa')}</button></div>
<div class="m-list">${row('fav','star',T2('Favourite cities','Cidades favoritas'))}${row('hur','hur',T2('Hurricane tracker','Seguimento de furacões'),hn?`<span class="bd">${hn}</span>`:'',hot?' hot':'')}${row('skj','gauge',T2('SkyScore & Climate journal','SkyScore e Diário climático'))}${wOn?row('wrn','warn',escH(wr.textContent.trim()),'<span class="em">IPMA</span>',' hot'):''}${$('#termBtn')&&!$('#termBtn').hidden?row('term','term',T2('Terminal','Terminal')):''}${$('#inst')&&!$('#inst').hidden?row('inst','dl',T2('Install app','Instalar app')):''}</div>
<div class="m-h">${T2('Preferences','Preferências')}</div>
<div class="m-pref"><span>${T2('Units','Unidades')}</span><div class="m-seg" role="group"><button type="button" data-u="c" aria-pressed="${unit==='c'}">°C</button><button type="button" data-u="f" aria-pressed="${unit==='f'}">°F</button></div></div>
<div class="m-pref"><span>${T2('Language','Idioma')}</span><div class="m-seg" role="group"><button type="button" data-l="pt" aria-pressed="${LANG==='pt'}">PT</button><button type="button" data-l="en" aria-pressed="${LANG==='en'}">EN</button></div></div>
<div class="m-pref"><span>${T2('Ambient sound','Som ambiente')}<small>${T2('Weather sounds that follow the sky','Sons do tempo que acompanham o céu')}</small></span><button type="button" class="m-sw" data-act="snd" role="switch" aria-pressed="${!!sOn}" aria-label="${T2('Ambient sound','Som ambiente')}"></button></div>
<p class="m-credits">${T2('Weather by','Tempo por')} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · ${T2('Places by','Locais por')} <a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener">BigDataCloud</a> · ${T2('Pollen by','Pólen por')} <a href="https://atmospore.ai/" target="_blank" rel="noopener">Atmospore</a> · ${T2('Pressure & isobars by','Pressão e isóbaras por')} <a href="https://www.nco.ncep.noaa.gov/pmb/products/gfs/" target="_blank" rel="noopener">NOAA/NCEP GFS</a> · ${T2('Waves & climate normals by','Ondas e normais climatológicas por')} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (<a href="https://climate.copernicus.eu/climate-reanalysis" target="_blank" rel="noopener">ERA5</a>) · ${T2('Portugal forecasts and warnings by','Previsões e avisos de Portugal pelo')} <a href="https://www.ipma.pt/" target="_blank" rel="noopener">IPMA</a> · <a href="mailto:${CONTACT_EMAIL}">${T2('Contact','Contacto')}</a> · <button type="button" class="priv-link" data-priv>${T2('Privacy','Privacidade')}</button></p>`}
 function menuOpen(){$('#mMenuB').innerHTML=menuHTML();openSheet('mMenu')}
 const PROXY={auth:'#authBtn',fav:'#favBtn',hur:'#hbtn',term:'#termBtn',inst:'#inst'};
 function menuClick(e){
  const u=e.target.closest('[data-u]'),l=e.target.closest('[data-l]'),a=e.target.closest('[data-act]');
  if(u){setUnit(u.dataset.u,true);if(openId==='mMenu')$('#mMenuB').innerHTML=menuHTML();return}
  if(l){setLang(l.dataset.l);setTimeout(()=>{if(openId==='mMenu')$('#mMenuB').innerHTML=menuHTML()},60);return}
  if(!a)return;const k=a.dataset.act;
  if(k==='snd'){const s=$('#snd');if(s)s.click();a.setAttribute('aria-pressed',s&&s.getAttribute('aria-pressed')==='true');return}
   if(k==='skj'){skjOpen();return}
  closeSheets();
  if(k==='loc')return locate();
  if(k==='sur')return surprise();
  if(k==='wrn'){const w=$('#wrn');if(w)setTimeout(()=>w.click(),120);return}
  const t=PROXY[k]&&$(PROXY[k]);if(t)setTimeout(()=>t.click(),120);
 }

 /* ---------- navegação inferior ---------- */
 let nav;
 function navBuild(){
  nav=document.createElement('nav');nav.className='m-nav';nav.id='mNav';nav.setAttribute('aria-label','Skylab');
  nav.innerHTML='<span class="m-ind"><i></i></span>'+NAV.map(([g,t],n)=>`<button type="button" data-g="${g}" data-t="${t}">${svg(P[g])}<span>${NAV_L()[n]}</span></button>`).join('');
  document.body.appendChild(nav);
  nav.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||!data)return;
   const g=root.dataset.mt;
   if(g===b.dataset.g){scrollTo({top:0,behavior:'smooth'});return}
   setTab(b.dataset.t);scrollTo(0,0);
  });
 }
 function navSync(){
  if(!nav)return;
  const city=!!(data&&place&&$('#hero:not(.land)'));
  nav.classList.toggle('show',city);
  const g=G[tab]||'now',i=Math.max(0,NAV.findIndex(n=>n[0]===g));
  nav.style.setProperty('--i',i);
  $$('#mNav button span').forEach((sp,n)=>sp.textContent=NAV_L()[n]);
  $$('#mNav button').forEach(b=>b.setAttribute('aria-current',b.dataset.g===g?'page':'false'));
 }

 /* ---------- avatar / menu ---------- */
 function avatarSync(){
  const m=$('#mMenuBtn'),ab=$('#authBtn'),av=$('#authAv');if(!m||!ab)return;
  const inn=ab.classList.contains('is-in'),im=m.querySelector('.im');
  m.classList.toggle('in',inn);
  if(inn&&av){im.textContent=av.style.backgroundImage?'':av.textContent;im.style.backgroundImage=av.style.backgroundImage}
  const wr=$('#wrn');m.classList.toggle('alert',!!(wr&&!wr.hidden&&wr.classList.contains('hot')));
 }

 /* ---------- Agora: ajustes depois de cada render ---------- */
 function alertSync(){
  const b=$('#mAlert'),w=$('#wrn');if(!b)return;
  const on=!!(w&&!w.hidden&&/\d/.test(w.textContent));
  b.hidden=!on;if(!on)return;
  b.style.setProperty('--wc',getComputedStyle(w).getPropertyValue('--wc')||'#e5532d');
  b.querySelector('b').textContent=w.textContent.trim();
 }
 function hoursSync(){
  const tr=$('#tr');if(!tr)return;const v=+tr.value;
  $$('.m-hc').forEach(c=>c.classList.toggle('on',+c.dataset.v===v));
  const c=$('.m-hc.on'),hs=$('#mHS'),sel=$('#mSel');
  if(c&&hs){const l=c.offsetLeft-(hs.clientWidth-c.offsetWidth)/2;hs.scrollTo({left:Math.max(0,l),behavior:still?'auto':'smooth'})}
  if(sel){if(!v)sel.textContent=T2('Tap to time-travel','Toca para viajar no tempo');
   else{const j=idx0()+v,h=data.hourly;sel.innerHTML=`<span class="m-sel">${h.time[j].slice(11,13)}h · ${T(h.temperature_2m[j])}° · ${h.precipitation_probability[j]||0}%</span>`}}
 }
 function stripBuild(){
  const c=data.current,d=data.daily;
  const b=document.createElement('button');b.type='button';b.className='m-strip';b.id='mStrip';
  b.setAttribute('aria-label',place.name+' — '+T2('back to Now','voltar ao Agora'));
  b.innerHTML=`<span class="l"><b>${escH(place.name)}</b><small>${place.sub?escH(place.sub):''}</small></span><span class="r"><i>${emoji(c.weather_code,c.is_day)}</i><strong>${T(c.temperature_2m)}°</strong><small>↑${T(d.temperature_2m_max[0])}° ↓${T(d.temperature_2m_min[0])}°</small></span>`;
  return b;
 }
 function afterRender(){
  if(!data||!place)return;
  main.insertBefore(stripBuild(),main.firstChild);
  const al=document.createElement('button');al.type='button';al.id='mAlert';al.className='m-alert';al.hidden=true;
  al.innerHTML=`${svg(P.warn)}<span><b></b><small>${T2('Official warning for your area','Aviso oficial para a tua zona')}</small></span><span class="go">›</span>`;
  main.insertBefore(al,$('#hero'));alertSync();
  const pl=$('.hero .place');
  if(pl){const r=document.createElement('button');r.type='button';r.className='m-ref';r.id='mRef';
   r.setAttribute('aria-label',T2('Refresh forecast','Atualizar previsão'));
   r.innerHTML=`${svg(P.refresh)}<span>${data.current.time.slice(11,16)}</span>`;pl.appendChild(r)}
  const tt=$('.hero .tt');
  if(tt)tt.insertAdjacentHTML('beforeend',`<div class="m-ticks" aria-hidden="true"><span>${T2('Now','Agora')}</span><span>+6 h</span><span>+12 h</span><span>+18 h</span><span>+24 h</span></div>`);
  const tr=$('#tr');if(tr)tr.addEventListener('input',()=>{hoursSync();if(navigator.vibrate&&!still)try{navigator.vibrate(3)}catch(e){}});
  navSync();avatarSync();
 }
 function afterLanding(){
  root.dataset.mt='land';
  const m=main;if(!m.querySelector('.m-eyebrow'))m.insertAdjacentHTML('afterbegin',`<p class="m-eyebrow">${T2('Weather & science','Meteorologia e ciência')}</p>`);
  navSync();
 }

 /* ---------- Semana: lista com barras de amplitude ---------- */
 function weekConvert(){
  const wk=$('#pane .wk');if(!wk||wk.dataset.m)return false;
  const d=data.daily;
  const rows=$$('.dcol',wk).map((c,i)=>{
   const day=c.querySelector('b').textContent,ic=c.querySelector('.dic').innerHTML,hi=c.querySelector('.hi').textContent,lo=c.querySelector('.lo').textContent,rn=c.querySelector('small').textContent.trim();
   const bar=c.querySelector('.dbar i'),s=bar?bar.style:null,L=s?parseFloat(s.getPropertyValue('--lo')):0,H=s?parseFloat(s.getPropertyValue('--h')):0;
   const m=s&&(s.background||s.backgroundImage||'').match(/hsl\([^)]*\)/g),cHi=m?m[0]:'#f08a2c',cLo=m&&m[1]?m[1]:'#2f8df0';
   const det=d.time[i]?`<div class="m-wd"><span>${svg(P.sun)}UV ${Math.round(d.uv_index_max[i]||0)}</span><span>↑ ${d.sunrise[i].slice(11,16)}</span><span>↓ ${d.sunset[i].slice(11,16)}</span><span>${svg(P.drop)}${Math.round((d.precipitation_probability_max||[])[i]||0)}%</span></div>`:'';
   return`<button type="button" class="m-wr" style="--n:${i}" aria-expanded="false"><span class="d">${day}</span><span class="e">${ic}</span><span class="p">${rn}</span><span class="lo">${lo}</span><span class="bar"><i style="left:${L}%;width:${H}%;background:linear-gradient(90deg,${cLo},${cHi})"></i></span><span class="hi">${hi}</span></button>${det}`;
  }).join('');
  wk.dataset.m=1;wk.classList.add('m-week');wk.innerHTML=rows;
  wk.onclick=e=>{const b=e.target.closest('.m-wr');if(!b)return;const o=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',o);b.nextElementSibling&&b.nextElementSibling.classList.toggle('open',o)};
  return true;
 }
 let wkObs=null;
 function afterTab(k){
  const g=G[k]||'now';root.dataset.mt=g;navSync();
  const pane=$('#pane');if(!pane)return;
  if(g==='sci'&&!pane.querySelector('.m-segw')){
   pane.insertAdjacentHTML('afterbegin',`<div class="m-segw"><div class="m-seg2" role="tablist"><button type="button" role="tab" data-sg="sky" aria-selected="${k==='sky'}">${T2('Sky explained','Céu explicado')}</button><button type="button" role="tab" data-sg="sci" aria-selected="${k==='sci'}">${T2('Laboratory','Laboratório')}</button></div></div>`);
  }
  if(wkObs){wkObs.disconnect();wkObs=null}
  if(k==='week'&&!weekConvert()){wkObs=new MutationObserver(()=>{if(weekConvert()){wkObs.disconnect();wkObs=null}});wkObs.observe(pane,{childList:true,subtree:true})}
  if(pane.firstElementChild)pane.classList.remove('m-in'),void pane.offsetWidth,pane.classList.add('m-in');
 }

 /* ---------- cidades do mundo (landing) ---------- */
  function cities(){
  const el=$('#mcl');if(!el)return;
  const hc=homeCity(),home=hc&&isFinite(hc.lat)&&isFinite(hc.lon)?[{n:hc.name,s:hc.sub||'',lat:+hc.lat,lon:+hc.lon,home:1}]:[];
  const mapC=c=>({n:c[0],s:c[1],lat:c[2],lon:c[3],tag:c[4]});
  const Wd=home.concat(CITIES.filter(c=>!c[4]).map(mapC)),X=CITIES.filter(c=>c[4]).map(mapC),L=Wd.concat(X);
  if(X.length&&!$('#mXt'))$('#mCities').insertAdjacentHTML('afterend',`<section class="m-cities m-xt" id="mXt"><h2 class="m-h2">${T2('Extremes of the Earth','Extremos da Terra')}</h2><div class="m-xs" id="mxs" role="list"></div></section>`);
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${L.map(c=>c.lat.toFixed(3)).join(',')}&longitude=${L.map(c=>c.lon.toFixed(3)).join(',')}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2&timezone=auto`;
  el.innerHTML=Wd.map(()=>'<div class="m-cc sk"></div>').join('');
  const xs=$('#mxs');if(xs)xs.innerHTML=X.map(()=>'<div class="m-cc m-xc sk"></div>').join('');
  const card=(x,i)=>{const c=L[i],cu=x.current,d=x.daily,t=cu.temperature_2m,tone=t<=12?'cold':t<=24?'mild':'warm',tg=c.tag?c.tag[LANG==='pt'?1:0]:'';
    return`<button type="button" class="m-cc${c.tag?' m-xc':''} ${tone}" data-ci="${i}" role="listitem"><b>${escH(c.n)}</b><small class="hm">${c.home?T2('My city','A minha cidade'):tg?escH(tg):''}</small>${c.home||!tg?`<small>${c.home?'':escH(c.s)}</small>`:`<small>${escH(c.s)}</small>`}<span class="mid"><i>${emoji(cu.weather_code,cu.is_day)}</i><span>${T(t)}<sup>°</sup></span></span><span class="lo"><em class="d">${T(d.temperature_2m_min[0])}°</em><em class="u">${T(d.temperature_2m_max[0])}°</em><em class="r">${Math.round(d.precipitation_probability_max[0]||0)}%</em></span></button>`};
  fetch(u).then(r=>r.json()).then(j=>{
    const arr=Array.isArray(j)?j:[j],e2=$('#mcl'),x2=$('#mxs');if(!e2)return;
    e2.innerHTML=arr.slice(0,Wd.length).map((x,i)=>card(x,i)).join('');
    if(x2)x2.innerHTML=arr.slice(Wd.length).map((x,i)=>card(x,i+Wd.length)).join('');
    const go=ev=>{const b=ev.target.closest('[data-ci]');if(b){const c=L[+b.dataset.ci];show(c.lat,c.lon,c.n,c.s)}};
    e2.onclick=go;if(x2)x2.onclick=go;
  }).catch(()=>{const e2=$('#mcl');if(e2)e2.innerHTML=`<p class="m-err">${T2('World conditions are unavailable right now. Search for a city above.','Condições do mundo indisponíveis de momento. Pesquisa uma cidade acima.')}</p>`});
  }

 /* ---------- arranque ---------- */
 scrim=document.createElement('div');scrim.className='m-scrim';scrim.id='mScrim';
 const mk=(id,label)=>{const s=document.createElement('div');s.className='m-sheet';s.id=id;s.setAttribute('role','dialog');s.setAttribute('aria-modal','true');s.setAttribute('aria-label',label);
  s.innerHTML=`<div class="m-grab" aria-hidden="true"></div><div class="m-sbody" id="${id}B"></div>`;return s};
 menu=mk('mMenu',T2('Menu','Menu'));sci=mk('mSci',T2('The science behind the number','A ciência por trás do número'));
 document.body.append(scrim,menu,sci);dragify(menu);dragify(sci);
 scrim.addEventListener('click',()=>closeSheets());
 menu.addEventListener('click',menuClick);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheets()});
 navBuild();
 {const lg=$('#logo');if(lg){lg.setAttribute('role','button');lg.setAttribute('tabindex','0');lg.setAttribute('aria-label',T2('Home','Início'))}}
 {const hd=$('#hd'),b=document.createElement('button');b.type='button';b.id='mMenuBtn';b.className='m-avatar';b.setAttribute('aria-label',T2('Menu and account','Menu e conta'));b.setAttribute('aria-haspopup','dialog');
  b.innerHTML=`${svg(P.user)}<span class="im"></span><i class="dot"></i>`;hd.appendChild(b);b.addEventListener('click',menuOpen);
  const ab=$('#authBtn');if(ab)new MutationObserver(avatarSync).observe(ab,{attributes:true,childList:true,subtree:true,characterData:true});
  const wr=$('#wrn');if(wr)new MutationObserver(()=>{alertSync();avatarSync()}).observe(wr,{attributes:true,childList:true,characterData:true});
  const q=$('#q');if(q){q.addEventListener('focus',()=>root.classList.add('m-typing'));q.addEventListener('blur',()=>setTimeout(()=>root.classList.remove('m-typing'),150))}
  avatarSync()}
 document.addEventListener('click',e=>{
  const s=e.target.closest('[data-sci]');if(s){sciOpen(s.dataset.sci);return}
  const hc=e.target.closest('.m-hc');if(hc){const tr=$('#tr');if(tr){tr.value=hc.dataset.v;if(tr.oninput)tr.oninput();hoursSync()}return}
  const sg=e.target.closest('[data-sg]');if(sg){setTab(sg.dataset.sg);return}
  const go=e.target.closest('[data-go]');if(go){setTab(go.dataset.go);scrollTo(0,0);return}
  const st=e.target.closest('#mStrip');if(st){setTab('today');scrollTo(0,0);return}
  const rf=e.target.closest('#mRef');if(rf&&place){rf.classList.add('spin');show(place.lat,place.lon,place.name,place.sub);return}
  const al=e.target.closest('#mAlert');if(al){e.stopPropagation();const w=$('#wrn');if(w)w.click();return}
 });
 window.addEventListener('pagehide',()=>closeSheets());
 const _render=render;render=function(){_render();afterRender()};
 const _setTab=setTab;setTab=function(k){_setTab(k);afterTab(k)};
 const _landing=landing;landing=function(){_landing();afterLanding()};
 window.SkyM={sheet,cities,afterRender,afterTab};
 if(!data&&$('#hero.land'))afterLanding();
})();
