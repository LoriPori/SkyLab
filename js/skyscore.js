/* Skylab · skyscore.js — SkyScore engine + climate diary · load order 27/28 (classic script, shared global scope) */
/* ═══════════ SKYSCORE — motor de pontuação (colar IGUAL no app.js e no worker.js) ═══════════ */
const SKY_ACTS=['run','bike','hike','allergy','photo','surf','stars'];
const SKY_ICONS={
 run:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4a2 2 0 1 0-4 0 2 2 0 0 0 4 0z"/><path d="M14 8l-4 3 3 4-2 5M10 11l-3 4-4-1M13 15l4 4 4-2"/></svg>',
 bike:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5l3.5-7.5H19M12 17.5l-3-6 4-3.5 2 2M5.5 17.5l4-8"/></svg>',
 hike:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M18 10l-2 3M7 16l3-2"/></svg>',
 allergy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2a4 4 0 0 0-4 4c0 2 2 3 4 5 2-2 4-3 4-5a4 4 0 0 0-4-4zM12 22a4 4 0 0 0 4-4c0-2-2-3-4-5-2 2-4 3-4 5a4 4 0 0 0 4 4zM2 12a4 4 0 0 0 4 4c2 0 3-2 5-4-2-2-3-4-5-4a4 4 0 0 0-4 4zM22 12a4 4 0 0 0-4-4c-2 0-3 2-5 4 2 2 3 4 5 4a4 4 0 0 0 4-4z"/></svg>',
 photo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
 surf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18c3-3 6-3 9 0 3 3 6 3 9 0 1-1 1.5-1.5 2-1.5M2 12c3-3 6-3 9 0 3 3 6 3 9 0 1-1 1.5-1.5 2-1.5M2 6c3-3 6-3 9 0 3 3 6 3 9 0 1-1 1.5-1.5 2-1.5"/></svg>',
 stars:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 2.4 5 5.6.8-4 4 1 5.7-5-2.6-5 2.6 1-5.7-4-4 5.6-.8z"/><path d="M19 17v4M17 19h4M5 5v2M4 6h2"/></svg>'
};
const SKY_NAME={run:['Running','Corrida'],bike:['Cycling','Ciclismo'],hike:['Hiking','Caminhada'],allergy:['Allergies','Alergias'],photo:['Photography','Fotografia'],surf:['Surf','Surf'],stars:['Stargazing','Astronomia']};
const SKY_WHY={cold:['Too cold','Frio demais'],hot:['Too hot','Calor a mais'],humid:['Muggy air','Ar abafado'],rain:['Rain risk','Risco de chuva'],storm:['Thunderstorms','Trovoadas'],wind:['Strong wind','Vento forte'],air:['Poor air quality','Ar poluído'],pollen:['Pollen','Pólen'],dispersal:['Dry wind spreads pollen','Vento seco espalha pólen'],mold:['Damp air (mould)','Ar húmido (bolores)'],dark:['Outside the best light','Fora da melhor luz'],cloud:['Cloud cover','Nebulosidade'],haze:['Hazy air','Ar enevoado'],small:['Waves too small','Ondas pequenas'],big:['Waves too big','Ondas grandes'],short:['Short-period swell','Período curto'],moon:['Bright moon','Lua brilhante'],daylight:['Not dark yet','Ainda não é de noite']};
const SKY_POS={temp:['Ideal temperature','Temperatura ideal'],dry:['Dry','Sem chuva'],calm:['Light wind','Vento fraco'],air:['Clean air','Ar limpo'],pol:['Low pollen','Pólen baixo'],waves:['Good waves','Boas ondas'],sky:['Good light','Boa luz'],dark:['Dark sky','Céu escuro']};
const SKY_SAY={
 run:[[90,'A day for personal bests.','Dia para bater recordes.'],[75,'Great running weather.','Ótimo tempo para correr.'],[55,'Fine for a run, with a catch.','Dá para correr, com um senão.'],[35,'Not ideal for running.','Não é o ideal para correr.'],[0,'Skip the run today.','Hoje é melhor não correr.']],
 bike:[[90,'Perfect ride.','Passeio perfeito.'],[75,'Great day to ride.','Ótimo dia para pedalar.'],[55,'Rideable.','Dá para pedalar.'],[35,'Tough ride.','Pedalada difícil.'],[0,'Leave the bike home.','Deixa a bicicleta em casa.']],
 hike:[[90,'Trail day of the year.','Dia de trilho por excelência.'],[75,'Great hiking weather.','Ótimo tempo para caminhar.'],[55,'Fine for an easy hike.','Dá para uma caminhada leve.'],[35,'Not great on the trail.','Fraco para o trilho.'],[0,'Stay off the trail.','Fica longe do trilho.']],
 allergy:[[85,'An easy day for allergies.','Dia tranquilo para alergias.'],[65,'Mild: carry your meds.','Moderado: leva a medicação.'],[40,'Tough day for allergies.','Dia difícil para alergias.'],[0,'Rough: limit time outside.','Duro: reduz o tempo no exterior.']],
 photo:[[85,'Golden light with character.','Luz dourada com carácter.'],[65,'Decent light.','Luz razoável.'],[40,'Flat light.','Luz sem graça.'],[0,'Nothing to shoot today.','Hoje não há luz para fotografar.']],
 surf:[[85,'Session of the week.','A sessão da semana.'],[65,'Good waves.','Boas ondas.'],[40,'Marginal surf.','Surf marginal.'],[0,'Not worth paddling out.','Não compensa ir à água.']],
 stars:[[85,'Superb dark sky.','Céu escuro e limpo.'],[65,'Good for stargazing.','Bom para observar estrelas.'],[40,'Patchy sky.','Céu irregular.'],[0,'Nothing to see tonight.','Hoje não há nada para ver.']]};
const skyClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const skyHM=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const skyMin=s=>+s.slice(11,13)*60+ +s.slice(14,16);
function skyMoon(ds){const age=(((Date.parse(ds.slice(0,10)+'T12:00:00Z')-Date.UTC(2000,0,6,18,14))/864e5)%29.530588+29.530588)%29.530588;return Math.round((1-Math.cos(2*Math.PI*age/29.530588))/2*100)}
function skySay(a,s,pt){const L=SKY_SAY[a];for(const r of L)if(s>=r[0])return pt?r[2]:r[1];return''}
function skyHour(a,f){
 const p={},add=(k,v)=>{if(v>0.01)p[k]=(p[k]||0)+v};
 const t=f.t,pop=f.pop||0,g=Math.max(f.gust||0,f.wind||0),c=f.code,storm=c>=95,wet=(c>=51&&c<=67)||(c>=80&&c<=86);
 if(a==='run'||a==='bike'||a==='hike'){
  const lo={run:5,bike:12,hike:8}[a],hi={run:17,bike:25,hike:23}[a];
  if(!f.day)add('dark',a==='hike'?60:25);
  if(t<lo)add('cold',(lo-t)*(a==='bike'?4:3.5));else if(t>hi)add('hot',(t-hi)*(a==='run'?3.5:3));
  if(f.dp!=null&&f.dp>16)add('humid',(f.dp-16)*3);
  add('rain',pop*(a==='hike'?.45:.55)+(wet?15:0));
  if(storm)add('storm',60);
  add('wind',Math.max(0,g-(a==='bike'?18:30))*(a==='bike'?1.4:.9));
  if(f.aqi!=null)add('air',Math.max(0,f.aqi-30)*(a==='hike'?.4:.7));
  if(f.allergy&&f.pol!=null)add('pollen',[0,6,16,30][f.pol]);
 }else if(a==='allergy'){
  if(f.pol==null&&f.aqi==null)return null;
  if(f.pol!=null){
   let pp=[0,22,50,78][f.pol];
   if(f.pol>0){
    if(f.hr>=11&&f.hr<=17)pp+=8;                                   // o pólen costuma ter o pico a meio do dia
    if(pop>=60||wet)pp*=.6;                                        // a chuva "lava" o ar
    else if(g>=25&&(f.rh||0)<60)add('dispersal',12);               // vento seco espalha-o
   }
   add('pollen',pp);
  }
  if(f.aqi!=null)add('air',Math.max(0,f.aqi-25)*.8);
  if((f.rh||0)>=85)add('mold',6);
 }else if(a==='photo'){
  if(!f.gold)add('dark',70);
  if(storm)add('storm',50);
  if(wet||pop>=60)add('rain',45);
  add('cloud',c===2?0:c===1?4:c===0?14:c===3?38:(c===45||c===48)?30:0);
  add('haze',Math.max(0,(f.rh||0)-85)*.8);
  add('wind',Math.max(0,g-35)*.6);
 }else if(a==='surf'){
  if(f.wh==null)return null;
  const h=f.wh,pr=f.wp||0;
  if(h<1.2)add('small',h<.4?70:h<.8?48:25);else if(h>2.5)add('big',h<=3.5?18:h<=4.5?40:65);
  if(pr&&pr<7)add('short',(7-pr)*5);
  add('wind',Math.max(0,(f.wind||0)-18)*1.6);
  add('rain',pop*.15);
  if(storm)add('storm',40);
  if(!f.day)add('dark',40);
 }else if(a==='stars'){
  if(f.day)add('daylight',80);
  add('cloud',c===0?0:c===1?6:c===2?25:c===3?60:(c===45||c===48)?55:(wet||storm)?70:0);
  add('moon',(f.moon||0)*.28);
  add('humid',Math.max(0,(f.rh||0)-75)*.5);
  add('wind',Math.max(0,g-30)*.4);
 }
 let sum=0;for(const k in p)sum+=p[k];
 let s=skyClamp(Math.round(100-sum),0,100);
 if(storm&&a!=='allergy'&&s>15)s=15;
 return{s,p};
}
/* H: {time,t,pop,code,day,wind,gust,rh,dp}; ctx: {today,nowIdx,sr[],ss[],pol[],aqi,allergy,sea}; d = 0..6 */
function skyDay(a,H,d,ctx){
 const dates=[];for(const x of H.time){const k=x.slice(0,10);if(dates[dates.length-1]!==k)dates.push(k)}
 const di=Math.max(0,dates.indexOf(ctx.today))+d,date=dates[di];if(!date)return null;
 const idx=[];for(let j=0;j<H.time.length;j++)if(H.time[j].slice(0,10)===date&&(d>0||j>=ctx.nowIdx))idx.push(j);
 const sr=ctx.sr&&ctx.sr[d]?skyMin(ctx.sr[d]):null,ss=ctx.ss&&ctx.ss[d]?skyMin(ctx.ss[d]):null,moon=skyMoon(date);
 const pol=ctx.pol&&ctx.pol[d]!=null?ctx.pol[d]:null,aqi=d===0?ctx.aqi:null;
 const over=a!=='stars'&&a!=='allergy'&&d===0&&!idx.some(j=>H.day[j]);
 const rows=[];
 for(const j of idx){
  const hr=+H.time[j].slice(11,13);
  const gold=ss!=null&&sr!=null&&(hr===Math.floor((ss-25)/60)||hr===Math.floor((sr+20)/60));
  let wh=null,wp=null;
  if(a==='surf'&&ctx.sea){const k=ctx.sea.idx[H.time[j]];if(k!=null){wh=ctx.sea.wh[k];wp=ctx.sea.wp[k]}}
  const r=skyHour(a,{t:H.t[j],pop:H.pop[j],code:H.code[j],day:!!H.day[j],wind:H.wind[j],gust:H.gust[j],rh:H.rh[j],dp:H.dp[j],hr,aqi,pol,allergy:ctx.allergy,moon,gold,wh,wp});
  if(r&&!(a==='photo'&&!gold)&&!(a==='allergy'&&!H.day[j]))rows.push({j,hr,r});
 }
 if(!rows.length)return{a,d,date,s:null,over};
 const W=a==='photo'?1:2;let best=null;
 for(let i=0;i<rows.length;i++){
  const win=rows.slice(i,i+W);if(win.length<W&&rows.length>=W)continue;
  const avg=win.reduce((x,y)=>x+y.r.s,0)/win.length;
  if(!best||avg>best.avg)best={avg,win};
 }
 const p={};for(const w of best.win)for(const k in w.r.p)p[k]=(p[k]||0)+w.r.p[k]/best.win.length;
 const why=Object.entries(p).filter(e=>e[1]>=5).sort((x,y)=>y[1]-x[1]).slice(0,3).map(e=>e[0]);
 const pos=[];
 if(a==='run'||a==='bike'||a==='hike'){
  if(!p.cold&&!p.hot)pos.push('temp');if((p.rain||0)<8)pos.push('dry');if((p.wind||0)<3)pos.push('calm');if(aqi!=null&&(p.air||0)<2)pos.push('air');
 }else if(a==='allergy'){if(pol===0)pos.push('pol');if(aqi!=null&&(p.air||0)<2)pos.push('air');if((p.rain||0)<8&&pol==null)pos.push('dry')}
 else if(a==='photo'){if(!p.cloud&&!p.rain&&!p.storm)pos.push('sky')}
 else if(a==='surf'){if(!p.small&&!p.big&&!p.short)pos.push('waves');if(!p.wind)pos.push('calm')}
 else if(a==='stars'){if(!p.cloud&&!p.daylight)pos.push('dark')}
 const h0=best.win[0],h1=best.win[best.win.length-1];
 const win=a==='photo'&&ss!=null?[skyHM(ss-45),skyHM(ss)]:[String(h0.hr).padStart(2,'0')+':00',String((h1.hr+1)%24).padStart(2,'0')+':00'];
 const s=Math.round(best.avg);
 const pts={};for(const k of why)pts[k]=Math.round(p[k]);
 return{a,d,date,s,win,t:H.t[h0.j],pop:H.pop[h0.j],why:why.filter(k=>!(s>=90)),pts,pos:pos.slice(0,2),over,pol,hrs:rows.map(x=>[x.hr,x.r.s])};
}

/* ═══════════ SKYSCORE + DIÁRIO CLIMÁTICO (cartão da aba Hoje + página do diário) ═══════════ */
const SKY_JOURNAL_API=AUTH_CONFIG.apiUrl.replace('/auth','/journal');
let skyEdit=false,skyDraft=null,skySel=null,skyDay0=0;
const skyCfg=()=>{const c=lsGet('skyInterests');return c&&Array.isArray(c.acts)&&c.acts.length?{acts:c.acts.filter(a=>SKY_ACTS.includes(a)),main:c.main||c.acts[0],notif:c.notif||{on:false,hour:7}}:{acts:['run','bike','hike','allergy','photo','surf','stars'],main:'run',notif:{on:false,hour:7}}};
const skyCol=s=>s>=75?'#2fb34a':s>=55?'#c4952c':s>=35?'#e08a2c':'#d4553a';
const skyLabel=(a,s)=>a==='allergy'?(s>=85?T2('Easy','Tranquilo'):s>=65?T2('Mild','Moderado'):s>=40?T2('Tough','Difícil'):T2('Rough','Duro')):(s>=90?T2('Epic','Épico'):s>=75?T2('Great','Ótimo'):s>=55?T2('Good','Bom'):s>=35?T2('Meh','Fraco'):T2('Skip','Evita'));
function skyCompute(a){
 const h=data.hourly,H={time:h.time,t:h.temperature_2m,pop:h.precipitation_probability,code:h.weather_code,day:h.is_day,wind:h.wind_speed_10m,gust:h.wind_gusts_10m,rh:h.relative_humidity_2m,dp:h.dew_point_2m};
 const sea=xtGet('sea'),pol=[];
 if(pollenOutlook&&pollenOutlook.length)pollenOutlook.forEach((o,i)=>pol[i]=o.lvl);else if(sig.pollen&&RISK[sig.pollen.risk]!=null)pol[0]=RISK[sig.pollen.risk];
 const ctx={today:data.current.time.slice(0,10),nowIdx:idx0(),sr:data.daily.sunrise,ss:data.daily.sunset,pol,aqi:sig.aqi,allergy:skyCfg().acts.includes('allergy'),
  sea:sea&&sea.t&&sea.wh?{idx:Object.fromEntries(sea.t.map((x,i)=>[x,i])),wh:sea.wh,wp:sea.wp||[]}:null};
 const out=[];for(let d=0;d<7;d++)out.push(skyDay(a,H,d,ctx));return out;
}
function skyBook(all){                                  // sequência de dias e recordes (guardados e sincronizados)
 const n=new Date(),k=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
 const y=new Date(n-864e5),yk=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
 let st=lsGet('skyStreak')||{last:'',n:0,best:0};
 if(st.last!==k){st={last:k,n:st.last===yk?st.n+1:1,best:Math.max(st.best||0,st.last===yk?st.n+1:1)};lsSet('skyStreak',st)}
 const bk=lsGet('skyBest')||{};let ch=false,rec=null;
 for(const a in all){const r=all[a][0];if(r&&r.s!=null&&!r.over&&(!bk[a]||r.s>bk[a].s)){if(bk[a]&&r.s>=80)rec=a;bk[a]={s:r.s,d:k};ch=true}}
 if(ch)lsSet('skyBest',bk);
 return{st,bk,rec};
}
function skyHrsHTML(r,act){                                // pontuação hora a hora do dia escolhido
 const h=r.hrs;if(!h||h.length<4)return'';
 const bars=h.map(([hr,sc])=>`<i style="--h:${Math.max(6,sc)}%;--c:${skyCol(sc)}" title="${String(hr).padStart(2,'0')}:00 · ${sc}"${r.win&&hr>=+r.win[0].slice(0,2)&&hr<(+r.win[1].slice(0,2)||24)?' class="in"':''}></i>`).join('');
 return`<div class="sk-hrs" role="img" aria-label="${T2('Score hour by hour','Pontuação hora a hora')}"><div class="sk-hb">${bars}</div><div class="sk-hx"><span>${String(h[0][0]).padStart(2,'0')}h</span><span>${T2('hour by hour','hora a hora')}</span><span>${String(h[h.length-1][0]).padStart(2,'0')}h</span></div></div>`;
}
function skyInner(){
 const cfg=skyCfg();
 if(skyEdit||!cfg.acts.length)return skyEditHTML(cfg);
 const all={};for(const a of cfg.acts)all[a]=skyCompute(a);
 const bk=skyBook(all);
 const act=cfg.acts.includes(skySel)?skySel:(cfg.acts.includes(cfg.main)?cfg.main:cfg.acts[0]);
 const days=all[act],head=days[0]&&days[0].over?1:0,di=skyDay0>0?skyDay0:head,r=days[di];
 const wdn=(i,f)=>days[i]?new Date(days[i].date+'T12:00').toLocaleDateString(LOC(),{weekday:f}):'–';
 const dn=i=>i===0?T2('Today','Hoje'):i===1?T2('Tomorrow','Amanhã'):wdn(i,'long');
 const pt=LANG==='pt',nm=SKY_NAME[act][pt?1:0];

 // Lateral-scrolling topic cards
 const topicCards=cfg.acts.map(a=>{
  const d0=all[a][head];
  const s=d0&&d0.s!=null?d0.s:null;
  const col=s!=null?skyCol(s):'rgba(20,49,79,.3)';
  const win=d0&&d0.win?`${d0.win[0]}–${d0.win[1]}`:'—';
  const ic=SKY_ICONS[a]||'';
  const label=s!=null?skyLabel(a,s):'–';
  const isSel=a===act;
  return`<button type="button" class="sk-topic-card${isSel?' active':''}" data-sk="act" data-v="${a}" aria-pressed="${isSel}" style="--c:${col}">
   <div class="sk-tc-top">
    <span class="sk-tc-ico">${ic}</span>
    <span class="sk-tc-score">${s!=null?s:'–'}</span>
   </div>
   <div class="sk-tc-name">${SKY_NAME[a][pt?1:0]}</div>
   <div class="sk-tc-lbl">${label}</div>
   <div class="sk-tc-win"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg><span>${win}</span></div>
   ${d0&&d0.t!=null?`<div class="sk-tc-meta">${T(d0.t)}° · ${Math.round(d0.pop||0)}% ${T2('rain','chuva')}</div>`:''}
  </button>`;
 }).join('');

 const scrollTrack=`<div class="sk-topics-wrap"><div class="sk-topics-scroll" role="tablist" aria-label="${T2('Activities & outdoor scores','Atividades e pontuações')}">${topicCards}</div></div>`;

 let body;
 if(!r||r.s==null){
  const loading=act==='surf'&&xtGet('sea')===undefined||act==='allergy'&&!extras.pol;
  body=`<p class="note">${loading?T2('Loading the data this score needs…','A carregar os dados de que esta pontuação precisa…')
   :act==='surf'?T2('No sea data for this place, so there is no surf score here.','Sem dados do mar neste local, por isso não há pontuação de surf.')
   :act==='allergy'?T2('No pollen or air-quality data for this place.','Sem dados de pólen ou qualidade do ar neste local.')
   :T2('Nothing to score for this day.','Nada para pontuar neste dia.')}</p>`;
 }else{
  const C=2*Math.PI*30,col=skyCol(r.s);
  const why=[...r.why.map(k=>`<span class="sk-r neg">${SKY_WHY[k][pt?1:0]}${r.pts&&r.pts[k]?` <b>−${r.pts[k]}</b>`:''}</span>`),...r.pos.map(k=>`<span class="sk-r pos">${SKY_POS[k][pt?1:0]}</span>`)].join('');
  const winL=act==='photo'?T2('Golden hour','Hora dourada'):act==='allergy'?T2('Gentlest window','Melhor janela'):T2('Best window','Melhor janela');
  body=`<div class="sk-main"><div class="sk-ring" style="--c:${col}"><svg viewBox="0 0 76 76" width="84" height="84" role="img" aria-label="SkyScore ${r.s}"><circle cx="38" cy="38" r="30" fill="none" stroke="rgba(20,49,79,.12)" stroke-width="7"/><circle cx="38" cy="38" r="30" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${(C*(1-r.s/100)).toFixed(1)}" transform="rotate(-90 38 38)"/></svg><b data-cu="${r.s}">0</b></div>
  <div class="sk-txt"><div class="sk-day">${dn(di)} · ${nm} · <em style="color:${col}">${skyLabel(act,r.s)}</em></div><p class="sk-say">${skySay(act,r.s,pt)}</p><p class="sk-win">${winL}: <b>${r.win[0]}–${r.win[1]}</b>${act!=='stars'&&act!=='photo'?` · ${T(r.t)}° · ${Math.round(r.pop)}% ${T2('rain','chuva')}`:''}</p></div></div>
  ${why?`<div class="sk-rs">${why}</div>`:''}
  ${skyHrsHTML(r,act)}
  <p class="sk-how">${T2('It starts at 100 (nothing in the way) and every factor takes points off; the tags show what cost the most.','Começa nos 100 (nada atrapalha) e cada fator tira pontos; as etiquetas mostram o que pesou mais.')}</p>`;
 }
 const best=days.reduce((b,x,i)=>x&&x.s!=null&&(!b||x.s>b.s)?{...x,i}:b,null);
 const week=`<div class="sk-wk" role="group" aria-label="${T2('Next days','Próximos dias')}">${days.map((x,i)=>{const s=x&&x.s!=null?x.s:null;return`<button type="button" class="sk-d" data-sk="day" data-v="${i}" aria-pressed="${i===di}" ${s==null?'disabled':''}><i style="--h:${s==null?4:Math.max(6,s)}%;--c:${s==null?'rgba(20,49,79,.2)':skyCol(s)}"></i><b>${s==null?'–':s}</b><small>${i===0?T2('Today','Hoje'):wdn(i,'short')}</small></button>`}).join('')}</div>`;
 const bestL=best&&best.i!==di?`<p class="sk-note">${T2('Best day this week','Melhor dia da semana')}: <b>${dn(best.i)} · ${best.s}</b></p>`:'';
 const st=bk.st,rec=bk.bk[act];
 const foot=`<div class="sk-ft"><span class="sk-st" title="${T2('Days in a row you opened Skylab','Dias seguidos em que abriste o Skylab')}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2s5 4.5 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5s1.5 1 2 2c0-3 1-5.5 2-8z"/></svg>${st.n} ${st.n===1?T2('day','dia'):T2('days','dias')}${st.best>st.n?` · ${T2('best','recorde')} ${st.best}`:''}</span>${rec?`<span class="sk-rec">${T2('Your best','O teu recorde')}: ${rec.s}</span>`:''}${location.hash!=='#diario'&&!document.documentElement.classList.contains('sj-open')?`<button type="button" class="sk-jb" data-sk="journal">${T2('My climate journal','O meu diário climático')} →</button>`:''}</div>`;
 return`<div class="sk-h"><div><h3>SkyScore</h3><small class="sk-sub">${T2('Personalised activity forecast','Previsão personalizada de atividades')}</small></div><button type="button" class="sk-gear" data-sk="edit" aria-label="${T2('Customise','Personalizar')}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg></button></div>${scrollTrack}${body}${week}${bestL}${foot}`;
}
function skyEditHTML(cfg){
 const d=skyDraft||(skyDraft={acts:[...cfg.acts],hour:cfg.notif.hour||7,on:!!cfg.notif.on}),pt=LANG==='pt';
 const desc={run:T2('Temperature, rain, wind, air','Temperatura, chuva, vento, ar'),bike:T2('Wind and rain weigh more','Vento e chuva pesam mais'),hike:T2('Trail conditions and storms','Condições do trilho e trovoadas'),allergy:T2('Pollen and air quality','Pólen e qualidade do ar'),photo:T2('Golden hour and clouds','Hora dourada e nuvens'),surf:T2('Wave height and period','Altura e período das ondas'),stars:T2('Clouds, moon and humidity','Nuvens, Lua e humidade')};
 const list=SKY_ACTS.map(a=>`<button type="button" class="sk-opt" data-sk="tog" data-v="${a}" aria-pressed="${d.acts.includes(a)}"><b>${SKY_NAME[a][pt?1:0]}</b><small>${desc[a]}</small></button>`).join('');
 const notif=isUserAuth()?`<div class="sk-nt"><button type="button" class="sk-sw" data-sk="ntog" aria-pressed="${d.on}"><i></i></button><div><b>${T2('Morning SkyScore','SkyScore da manhã')}</b><small>${T2('A notification with your score and best window','Uma notificação com a tua pontuação e a melhor janela')}</small></div><span class="sk-hr"><button type="button" data-sk="hr" data-v="-1" aria-label="-">‹</button><b>${String(d.hour).padStart(2,'0')}:00</b><button type="button" data-sk="hr" data-v="1" aria-label="+">›</button></span></div>`
  :`<p class="sk-note">${T2('Create a free account to get your score as a morning notification and to keep your climate journal.','Cria uma conta gratuita para receberes a pontuação numa notificação de manhã e para guardares o teu diário climático.')} <button type="button" class="sk-link" data-sk="auth">${T2('Sign up','Criar conta')}</button></p>`;
 return`<div class="sk-h"><h3>SkyScore</h3></div><p class="note">${T2('Pick what you do outside. Every day Skylab turns the forecast, pollen, air and sea into a score for each activity: the higher, the better.','Escolhe o que fazes ao ar livre. Todos os dias o Skylab transforma a previsão, o pólen, o ar e o mar numa pontuação por atividade: quanto mais alta, melhor.')}</p><div class="sk-opts">${list}</div>${notif}<div class="sk-act"><button type="button" class="sk-go" data-sk="save" ${d.acts.length?'':'disabled'}>${T2('Save','Guardar')}</button>${cfg.acts.length?`<button type="button" class="sk-ca" data-sk="cancel">${T2('Cancel','Cancelar')}</button>`:''}</div>`;
}
function skyCardHTML(id){return data?`<section class="card xt sky" id="${id||'sky'}">${skyInner()}</section>`:''}
function skyPaint(){if(!data)return;['sky','skySj'].forEach(id=>{const el=document.getElementById(id);if(el){el.innerHTML=skyInner();runCounters(el)}})}   // #sky = cartão da aba Hoje · #skySj = cópia dentro do diário (antes ambos eram #sky e só o primeiro era repintado)
/* checkAlerts() corre em cada render. skyPaint() reconstrói o cartão SkyScore
   inteiro (7 atividades × 7 dias × 24 h ≈ 1 200 iterações + rebuild do DOM),
   o que dava ~80–150 ms de main-thread em Android médio a cada refresh.
   Debounce de 350 ms + só quando a aba Hoje está visível: quando o utilizador
   está noutra aba o cartão não está no DOM, e quando está nela o rebuild só
   é preciso uma vez por render. */
{
  const _ca = checkAlerts;
  let _skyT = 0;
  checkAlerts = function () {
    _ca.apply(this, arguments);
    clearTimeout(_skyT);
    _skyT = setTimeout(() => {
      if (!data || tab !== 'today' || document.hidden) return;
      const el = $('#sky');
      if (!el) return;                       // cartão já saiu do DOM
      try { skyPaint(); } catch (e) { console.warn('[skyPaint]', e); }
    }, 350);
  };
}

document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-sk]');if(!b)return;
 const k=b.dataset.sk,v=b.dataset.v;
 if(k==='act'){skySel=v;skyDay0=0;skyPaint()}
 else if(k==='day'){skyDay0=+v;skyPaint()}
 else if(k==='edit'){skyEdit=true;skyDraft=null;skyPaint()}
 else if(k==='cancel'){skyEdit=false;skyDraft=null;skyPaint()}
 else if(k==='tog'){const d=skyDraft,i=d.acts.indexOf(v);if(i<0)d.acts.push(v);else d.acts.splice(i,1);skyPaint()}
 else if(k==='ntog'){skyDraft.on=!skyDraft.on;skyPaint()}
 else if(k==='hr'){skyDraft.hour=Math.max(5,Math.min(11,skyDraft.hour+(+v)));skyPaint()}
 else if(k==='auth'){authOpen()}
 else if(k==='journal'){skjOpen()}
 else if(k==='save'){
  const d=skyDraft;if(!d||!d.acts.length)return;
  let on=d.on&&isUserAuth();
  if(on&&!pushIsOn()){on=await pushEnable();if(!on)toast(T2('Notifications are off on this device, so the morning score will not arrive.','As notificações estão desligadas neste dispositivo, por isso a pontuação da manhã não vai chegar.'))}
  const old=skyCfg();
  lsSet('skyInterests',{acts:d.acts,main:d.acts.includes(old.main)?old.main:d.acts[0],notif:{on,hour:d.hour}});
  skyEdit=false;skyDraft=null;skySel=null;skyPaint();
 }
});

/* estilos do SkyScore reformulado e do diário (injetados uma vez; usam currentColor para servir em claro/escuro) */
(function(){
 if(document.getElementById('skCss'))return;
 const st=document.createElement('style');st.id='skCss';
 st.textContent=`
.sk-r b{font-weight:700;margin-left:2px}
.sk-how{font-size:.72rem;opacity:.65;margin:8px 0 0;line-height:1.35}
.sk-hrs{margin:10px 0 2px}.sk-hb{display:flex;align-items:flex-end;gap:2px;height:38px}
.sk-hb i{flex:1;height:var(--h);background:var(--c);opacity:.4;border-radius:2px 2px 0 0;min-height:3px}.sk-hb i.in{opacity:1}
.sk-hx{display:flex;justify-content:space-between;font-size:.68rem;opacity:.6;margin-top:2px}
.sj2-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 6px}
.sj2-nav h3{margin:0;font-size:1.05rem;text-transform:capitalize;text-align:center;flex:1}
.sj2-nav button{width:34px;height:34px;border-radius:50%;border:1px solid color-mix(in srgb,currentColor 20%,transparent);background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
.sj2-nav button:disabled{opacity:.28;cursor:default}
.sj2-hl{list-style:none;margin:8px 0;padding:0;display:grid;gap:8px}
.sj2-hl li{padding:9px 11px;border-radius:12px;background:color-mix(in srgb,currentColor 7%,transparent)}
.sj2-hl li b{display:block;font-weight:700;line-height:1.3}
.sj2-hl li small{display:block;opacity:.7;margin-top:3px;line-height:1.35}
.sj2-hl li.w{opacity:.8}.sj2-hl li.w b{font-weight:500}
.sj2-wd,.sj2-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.sj2-wd{margin-top:10px}.sj2-wd span{font-size:.66rem;text-align:center;opacity:.6;text-transform:uppercase}
.sj2-cal i.e{display:block}
.sj2-c{position:relative;aspect-ratio:1/1.05;border-radius:9px;border:2px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;margin:0;color:#10263f;font:inherit;cursor:pointer;min-width:0}
.sj2-c b{font-size:.8rem;line-height:1}.sj2-c small{font-size:.62rem;line-height:1;opacity:.8}
.sj2-c u{position:absolute;top:3px;right:4px;width:6px;height:6px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1b5fb0}
.sj2-c.n{background:transparent;border:1px dashed color-mix(in srgb,currentColor 25%,transparent);color:inherit;opacity:.5;cursor:default}
.sj2-c.n.f{opacity:.22}
.sj2-c.td{box-shadow:0 0 0 2px color-mix(in srgb,currentColor 55%,transparent)}
.sj2-c.on{border-color:#10263f;box-shadow:0 0 0 2px #fff,0 0 0 4px #10263f}
.sj2-leg{display:flex;align-items:center;gap:8px;font-size:.72rem;margin:10px 0 2px}.sj2-leg i{flex:1;height:8px;border-radius:4px}
.sj2-cap{font-size:.72rem;opacity:.65;margin:5px 0 0;line-height:1.35}
.sj2-hint{font-size:.8rem;opacity:.65;margin:10px 0 0}
.sj2-dd{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,currentColor 7%,transparent)}
.sj2-dd>b{text-transform:capitalize;display:block}
.sj2-dv{display:flex;gap:18px;margin:6px 0 2px;flex-wrap:wrap}.sj2-dv span{font-size:.74rem;opacity:.85}.sj2-dv span b{font-size:1.1rem;display:block;opacity:1}
.sj2-dd small{display:block;opacity:.7;margin-top:3px;line-height:1.35}
.sj2-ch{margin:14px 0 2px}.sj2-ch svg{width:100%;height:auto;display:block;overflow:visible}.sj2-ch text{fill:currentColor;opacity:.6;font-size:8px}
.sj2-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0 6px}
.sj2-t{padding:9px 8px;border-radius:12px;background:color-mix(in srgb,currentColor 7%,transparent);min-width:0}
.sj2-t>small{display:block;font-size:.68rem;opacity:.65;margin-bottom:3px;line-height:1.2}
.sj2-t b{font-size:.98rem;line-height:1.2}.sj2-t b small{font-size:.66rem;opacity:.7;font-weight:400}
.sj2-ym{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:7px}
.sj2-ym li{display:grid;grid-template-columns:5.6em 3em 1fr 4.2em;gap:8px;align-items:center;font-size:.8rem}
.sj2-ym li i{height:8px;border-radius:4px;background:#4a90d9;opacity:.8;display:block}.sj2-ym li span:first-child{text-transform:capitalize}.sj2-ym li span:last-child{text-align:right;opacity:.75}
`;
 document.head.appendChild(st);
})();

/* ---------- Diário climático ---------- */
const SKJ={cfg:undefined,days:[],per:null,rep:null,busy:false,err:'',sel:null};
async function skjApi(path,opt){
 const r=await fetch(SKY_JOURNAL_API+path,{...opt,headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentToken}});
 if(r.status===401){authSessionDead();throw new Error('auth')}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'HTTP '+r.status);return j;
}
const skjMon=ym=>new Date(ym+'-15T12:00').toLocaleDateString(LOC(),{month:'long',year:'numeric'});
const skjPerName=p=>p.length===4?T2('year '+p,'ano '+p):skjMon(p);
function skjOpen(){
 let el=$('#sj');if(!el){el=document.createElement('div');el.id='sj';el.className='sj';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',T2('Climate journal','Diário climático'));document.body.appendChild(el)}
 document.documentElement.classList.add('sj-open');el.hidden=false;skjPaint();
 if(isUserAuth())skjLoad();
}
function skjClose(){const el=$('#sj');if(el)el.hidden=true;document.documentElement.classList.remove('sj-open');if(location.hash==='#diario')history.replaceState(null,'',location.pathname+location.search)}
async function skjLoad(){
 SKJ.busy=true;SKJ.err='';skjPaint();
 try{
  const j=await skjApi('');SKJ.cfg=j.cfg;SKJ.days=j.days||[];
  if(SKJ.cfg){
   const now=new Date(),cur=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'),pm=new Date(now.getFullYear(),now.getMonth()-1,1),prev=pm.getFullYear()+'-'+String(pm.getMonth()+1).padStart(2,'0');
   const n=ym=>SKJ.days.filter(d=>d[0].startsWith(ym)).length;
   await skjReport(SKJ.per||(n(prev)>=10?prev:cur));
  }
 }catch(e){if(e.message!=='auth')SKJ.err=e.message}
 SKJ.busy=false;skjPaint();
}
async function skjReport(p){SKJ.per=p;try{SKJ.rep=await skjApi('/report?p='+p)}catch(e){SKJ.rep=null;SKJ.err=e.message}}
/* ---------- Diário climático: dados por dia = [data, máx, mín, chuva mm, …] ---------- */
const skjKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const skjMName=p=>new Date(p+'-15T12:00').toLocaleDateString(LOC(),{month:'long'});
const skjMm=v=>unit=='c'?(v<10?dcm(v,1):String(Math.round(v)))+' mm':dcm(v/25.4,v/25.4<1?2:1)+' in';
const skjRows=p=>SKJ.days.filter(d=>d[0].startsWith(p)).sort((a,b)=>a[0]<b[0]?-1:1);
const skjMonths=()=>[...new Set(SKJ.days.map(d=>d[0].slice(0,7)))].sort();
/* frases: cada uma diz o que se comparou (o mesmo mês dos anos anteriores) e o valor concreto */
function skjHeads(r){
 const out=[],c=r.cmp||{},yr=r.p.length===4,n=c.n||0,span=n+1;
 const per=yr?T2('year','ano'):skjMName(r.p),pl=yr?T2('years','anos'):per+'s';
 const ord=k=>k===2?T2('2nd ','2.º '):'';
 const ctx={sun:()=>dcm(r.sun_avg,1)+' h '+T2('of sun a day','de sol por dia'),
  rain:()=>skjMm(r.precip)+' · '+r.rain_days+' '+(r.rain_days===1?T2('rainy day','dia de chuva'):T2('rainy days','dias de chuva')),
  temp:()=>T2('average ','média de ')+T(r.tmean)+'°'};
 const base=n>=2?T2(`compared with the ${n} previous ${pl}`,`comparado com os ${n} ${pl} anteriores`)+' '+T2('in your city','na tua cidade'):'';
 const line=(m,hi,lo)=>{
  const x=c[m];if(!x||n<2||x.lower==null)return;const L=x.lower;let k=0,dir=0;
  if(L===n){k=1;dir=1}else if(L===0){k=1;dir=-1}else if(n>=3&&L===n-1){k=2;dir=1}else if(n>=3&&L===1){k=2;dir=-1}
  if(!dir)return;const w=dir>0?hi:lo;
  out.push({t:T2(`The ${ord(k)}${w[0]} ${per} of the last ${span} years`,`O ${ord(k)}${per} ${w[1]} dos últimos ${span} anos`),c:ctx[m]()+(base?' · '+base:'')});
 };
 line('sun',['sunniest','mais soalheiro'],['greyest','mais cinzento']);
 line('rain',['wettest','mais chuvoso'],['driest','mais seco']);
 line('temp',['warmest','mais quente'],['coldest','mais frio']);
 if(!out.length){
  if(n>=2)out.push({t:T2(`Nothing unusual compared with other ${pl}`,`Nada de invulgar face a outros ${pl}`),c:base});
  else out.push({t:T2('Not enough history yet to compare with other years.','Ainda sem histórico suficiente para comparar com outros anos.'),c:''});
 }
 if(r.pol_n>0){
  if(r.pol_high>0)out.push({t:T2(`${r.pol_high} day${r.pol_high===1?'':'s'} of high or extreme pollen`+(r.pol_ext?` (${r.pol_ext} extreme)`:''),`${r.pol_high} dia${r.pol_high===1?'':'s'} de pólen alto ou extremo`+(r.pol_ext?` (${r.pol_ext} extremo${r.pol_ext===1?'':'s'})`:'')),c:T2(`out of ${r.pol_n} days with pollen recorded`,`em ${r.pol_n} dias com pólen registado`)});
  else out.push({t:T2('No high-pollen days recorded.','Nenhum dia de pólen alto registado.'),c:''});
 }
 const now=new Date(),cur=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 if(!yr&&r.p===cur){const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  if(now.getDate()<dim)out.push({w:1,t:T2(`Month in progress (day ${now.getDate()} of ${dim}): comparisons may change by the end.`,`Mês em curso (dia ${now.getDate()} de ${dim}): as comparações podem mudar até ao fim do mês.`),c:''})}
 return out;
}
/* calendário do mês: cor = máxima do dia, gota = chuva (≥ 1 mm), toca num dia para ver os detalhes */
function skjCalHTML(p){
 const m=new Map(SKJ.days.map(d=>[d[0],d])),y=+p.slice(0,4),mo=+p.slice(5,7),dim=new Date(y,mo,0).getDate(),pad=(new Date(y,mo-1,1,12).getDay()+6)%7,tk=skjKey(new Date());
 const wd=Array.from({length:7},(_,i)=>`<span>${new Date(2024,0,1+i,12).toLocaleDateString(LOC(),{weekday:'short'}).replace('.','').slice(0,3)}</span>`).join('');
 const rows=skjRows(p);let cells='';for(let i=0;i<pad;i++)cells+='<i class="e"></i>';
 for(let d=1;d<=dim;d++){
  const k=p+'-'+String(d).padStart(2,'0'),x=m.get(k),rain=x&&x[3]>=1;
  if(x){const lbl=new Date(k+'T12:00').toLocaleDateString(LOC(),{day:'numeric',month:'long'})+': '+T2('high','máx.')+' '+T(x[1])+'°, '+T2('low','mín.')+' '+T(x[2])+'°, '+(x[3]>0?skjMm(x[3]):T2('no rain','sem chuva'));
   cells+=`<button type="button" class="sj2-c${rain?' r':''}${SKJ.sel===k?' on':''}${k===tk?' td':''}" data-sj="day" data-v="${k}" aria-pressed="${SKJ.sel===k}" aria-label="${escH(lbl)}" style="background:${tempColor(x[1])}"><b>${d}</b><small>${T(x[1])}°</small>${rain?'<u></u>':''}</button>`}
  else cells+=`<span class="sj2-c n${k>tk?' f':''}${k===tk?' td':''}"><b>${d}</b></span>`;
 }
 let leg='';
 if(rows.length){const lo=Math.min(...rows.map(d=>d[1])),hi=Math.max(...rows.map(d=>d[1])),mid=(lo+hi)/2;
  leg=`<div class="sj2-leg"><span>${T(lo)}°</span><i style="background:linear-gradient(90deg,${tempColor(lo)},${tempColor(mid)},${tempColor(hi)})"></i><span>${T(hi)}°</span></div>`}
 return`<div class="sj2-wd">${wd}</div><div class="sj2-cal">${cells}</div>${leg}<p class="sj2-cap">${T2('Colour = the day’s high · drop = rain of 1 mm or more · dashed = no record','Cor = máxima do dia · gota = chuva de 1 mm ou mais · tracejado = sem registo')}</p>`;
}
function skjDayHTML(p){
 const x=SKJ.sel&&SKJ.sel.startsWith(p)?SKJ.days.find(d=>d[0]===SKJ.sel):null;
 if(!x)return`<p class="sj2-hint">${T2('Tap a day to see its details.','Toca num dia para ver os detalhes.')}</p>`;
 const rows=skjRows(p),n=rows.length,rk=(i,desc)=>1+rows.filter(d=>desc?d[i]>x[i]:d[i]<x[i]).length;
 const dt=new Date(x[0]+'T12:00').toLocaleDateString(LOC(),{weekday:'long',day:'numeric',month:'long'});
 const hs=rk(1,true),cs=rk(2,false),rs=rk(3,true),ex=[];
 if(n>=5){
  if(hs<=3)ex.push(hs===1?T2(`Warmest of the ${n} recorded days`,`O dia mais quente dos ${n} registados`):T2(`${hs===2?'2nd':'3rd'} warmest of ${n} recorded days`,`${hs}.º dia mais quente dos ${n} registados`));
  if(cs<=3)ex.push(cs===1?T2(`Coldest of the ${n} recorded days`,`O dia mais frio dos ${n} registados`):T2(`${cs===2?'2nd':'3rd'} coldest of ${n} recorded days`,`${cs}.º dia mais frio dos ${n} registados`));
  if(x[3]>=1&&rs<=3)ex.push(rs===1?T2('The wettest day of the period','O dia mais chuvoso do período'):T2(`${rs===2?'2nd':'3rd'} wettest day`,`${rs}.º dia mais chuvoso`));
 }
 const rain=x[3]>=1?skjMm(x[3]):x[3]>0?T2('traces','vestígios'):'0';
 return`<div class="sj2-dd"><b>${dt}</b><div class="sj2-dv"><span>${T2('High','Máx.')}<b>${T(x[1])}°</b></span><span>${T2('Low','Mín.')}<b>${T(x[2])}°</b></span><span>${T2('Rain','Chuva')}<b>${rain}</b></span></div>${ex.length?`<small>${ex.join(' · ')}</small>`:''}</div>`;
}
/* gráfico do mês: barras = mín→máx de cada dia (cor da máxima) · colunas azuis = chuva */
function skjChartHTML(p){
 const rows=skjRows(p);if(rows.length<3)return'';
 const y=+p.slice(0,4),mo=+p.slice(5,7),dim=new Date(y,mo,0).getDate(),L=26,x1=314,bw=(x1-L)/dim;
 const tmin=Math.min(...rows.map(d=>d[2])),tmax=Math.max(...rows.map(d=>d[1])),a=Math.floor(tmin)-1,b=Math.ceil(tmax)+1,ty=v=>8+(b-v)/(b-a)*80;
 const pm=Math.max(5,...rows.map(d=>d[3])),py=v=>130-v/pm*28;
 let g='';
 for(const d of rows){
  const dn=+d[0].slice(8,10),cx=L+(dn-.5)*bw,sel=SKJ.sel===d[0];
  if(d[3]>0)g+=`<rect x="${(cx-bw*.3).toFixed(1)}" y="${py(d[3]).toFixed(1)}" width="${(bw*.6).toFixed(1)}" height="${(130-py(d[3])).toFixed(1)}" fill="#4a90d9" opacity=".8"/>`;
  g+=`<rect x="${(cx-bw*.3).toFixed(1)}" y="${ty(d[1]).toFixed(1)}" width="${(bw*.6).toFixed(1)}" height="${Math.max(2,ty(d[2])-ty(d[1])).toFixed(1)}" rx="1.5" fill="${tempColor(d[1])}"${sel?' stroke="currentColor" stroke-width="1.2"':''}/>`;
 }
 const xt=[1,8,15,22,dim].map(dn=>`<text x="${(L+(dn-.5)*bw).toFixed(1)}" y="144" text-anchor="middle">${dn}</text>`).join('');
 return`<div class="sj2-ch"><svg viewBox="0 0 320 148" role="img" aria-label="${T2('Daily highs, lows and rain this month','Máximas, mínimas e chuva de cada dia neste mês')}"><line x1="${L}" x2="${x1}" y1="96" y2="96" stroke="currentColor" opacity=".15"/><text x="22" y="${ty(tmax)+3}" text-anchor="end">${T(tmax)}°</text><text x="22" y="${ty(tmin)+3}" text-anchor="end">${T(tmin)}°</text><text x="22" y="${py(pm)+3}" text-anchor="end">${skjMm(pm)}</text>${g}${xt}</svg><p class="sj2-cap">${T2('Each bar spans the day’s low to high · blue columns = rain','Cada barra vai da mínima à máxima do dia · colunas azuis = chuva')}</p></div>`;
}
const skjCalBlock=p=>skjCalHTML(p)+`<div id="sjDay">${skjDayHTML(p)}</div>`+skjChartHTML(p);
function skjYearHTML(p){
 const g={};for(const d of skjRows(p)){const k=d[0].slice(0,7);(g[k]=g[k]||[]).push(d)}
 const ks=Object.keys(g).sort(),mx=Math.max(1,...ks.map(k=>g[k].reduce((s,d)=>s+d[3],0)));
 return`<ul class="sj2-ym">${ks.map(k=>{const r=g[k],tm=r.reduce((s,d)=>s+(d[1]+d[2])/2,0)/r.length,pr=r.reduce((s,d)=>s+d[3],0);
  return`<li><span>${skjMName(k)}</span><b>${T(tm)}°</b><i style="width:${Math.max(2,pr/mx*100).toFixed(0)}%"></i><span>${skjMm(pr)}</span></li>`}).join('')}</ul><p class="sj2-cap">${T2('Average temperature · rain total, per month','Temperatura média · chuva total, por mês')}</p>`;
}
function skjExtra(rows){
 let best=0,run=0,prev=null;
 for(const d of rows){const t=Date.parse(d[0]+'T12:00Z');
  if(d[3]<1){run=(prev!=null&&t-prev===864e5)||run===0?run+1:1;best=Math.max(best,run)}else run=0;prev=t}
 const wet=rows.reduce((b,d)=>(!b||d[3]>b[3])?d:b,null);
 return{dry:best,wet:wet&&wet[3]>=1?wet:null,lowAvg:rows.length?rows.reduce((s,d)=>s+d[2],0)/rows.length:null};
}
function skjRepHTML(r){
 const yr=r.p.length===4,rows=skjRows(r.p),ex=skjExtra(rows),ms=skjMonths(),i=ms.indexOf(r.p);
 const hs=skjHeads(r).map(h=>`<li${h.w?' class="w"':''}><b>${escH(h.t)}</b>${h.c?`<small>${escH(h.c)}</small>`:''}</li>`).join('');
 const dd=x=>x?new Date(x.day+'T12:00').toLocaleDateString(LOC(),{day:'numeric',month:'short'}):'–';
 const tile=(l,v)=>`<div class="sj2-t"><small>${l}</small><b>${v}</b></div>`;
 const nav=yr?`<div class="sj2-nav"><h3>${T2('Your','O teu')} ${skjPerName(r.p)}</h3></div>`:`<div class="sj2-nav"><button type="button" data-sj="nav" data-v="-1" aria-label="${T2('Previous month','Mês anterior')}" ${i<=0?'disabled':''}>‹</button><h3>${T2('Your','O teu')} ${skjPerName(r.p)}</h3><button type="button" data-sj="nav" data-v="1" aria-label="${T2('Next month','Mês seguinte')}" ${i<0||i>=ms.length-1?'disabled':''}>›</button></div>`;
 const wetT=ex.wet?`${skjMm(ex.wet[3])} <small>${dd({day:ex.wet[0]})}</small>`:'–';
 return`<div class="sj-rep">${nav}${r.n<(yr?300:20)?`<p class="sk-note">${T2(`Based on ${r.n} recorded days.`,`Com base em ${r.n} dias registados.`)}</p>`:''}${hs?`<ul class="sj2-hl">${hs}</ul>`:''}
  <div id="sjCalBox">${yr?skjYearHTML(r.p):skjCalBlock(r.p)}</div>
  <div class="sj2-tiles">${tile(T2('Average temp','Temp. média'),T(r.tmean)+'°')}${tile(T2('Rainy days','Dias de chuva'),r.rain_days)}${tile(T2('Rain total','Chuva total'),skjMm(r.precip))}${tile(T2('Sun per day','Sol por dia'),dcm(r.sun_avg,1)+' h')}${tile(T2('Warmest day','Dia mais quente'),r.hot?`${T(r.hot.tmax)}° <small>${dd(r.hot)}</small>`:'–')}${tile(T2('Coldest day','Dia mais frio'),r.cold?`${T(r.cold.tmin)}° <small>${dd(r.cold)}</small>`:'–')}${tile(T2('Longest dry spell','Maior período seco'),ex.dry?ex.dry+' '+(ex.dry===1?T2('day','dia'):T2('days','dias')):'–')}${tile(T2('Wettest day','Dia mais chuvoso'),wetT)}${r.pol_n>0?tile(T2('High-pollen days','Dias de pólen alto'),r.pol_high):tile(T2('Average low','Mínima média'),ex.lowAvg!=null?T(ex.lowAvg)+'°':'–')}</div></div>`;
}
function skjPaint(){
 const el=$('#sj');if(!el)return;
 const head=`<div class="sj-top"><h2>${T2('Climate journal','Diário climático')}</h2><button type="button" class="sj-x" data-sj="close" aria-label="${T2('Close','Fechar')}">✕</button></div>`;
 let body='';
 if(!isUserAuth())body=`<div class="sj-box"><p>${T2('Your journal remembers the weather you lived through: monthly reports, comparisons with the last 5 years and “this day, years ago”. It needs a free account.','O teu diário guarda o tempo que viveste: relatórios mensais, comparações com os últimos 5 anos e «neste dia, há anos». Precisa de uma conta gratuita.')}</p><button type="button" class="sk-go" data-sj="auth">${T2('Create account / Sign in','Criar conta / Entrar')}</button></div>`;
 else if(SKJ.busy&&SKJ.cfg===undefined)body=`<p class="note sk">${T2('Loading…','A carregar…')}</p>`;
 else if(SKJ.err&&SKJ.cfg===undefined)body=`<p class="note">${escH(SKJ.err)}</p><button type="button" class="sk-go" data-sj="retry">${T2('Try again','Tentar outra vez')}</button>`;
 else if(!SKJ.cfg){
  const t=pushTarget()||(place?{name:place.name,lat:place.lat,lon:place.lon,sub:place.sub}:null),al=skyCfg().acts.includes('allergy');
  body=t?`<div class="sj-box"><p>${T2(`Skylab will keep a daily summary of the weather in <b>${escH(t.name)}</b>: highs and lows, rain, sunshine and (optionally) pollen. It starts with the last 2 months, so your first report is ready now.`,`O Skylab vai guardar um resumo diário do tempo em <b>${escH(t.name)}</b>: máximas e mínimas, chuva, sol e (opcionalmente) pólen. Começa com os últimos 2 meses, por isso o primeiro relatório fica logo pronto.`)}</p><label class="sj-ck"><input type="checkbox" id="sjPol" ${al?'checked':''}> ${T2('Also record daily pollen level','Registar também o nível de pólen diário')}</label><button type="button" class="sk-go" data-sj="start" ${SKJ.busy?'disabled':''}>${SKJ.busy?T2('Starting…','A começar…'):T2('Start my journal','Começar o meu diário')}</button><p class="sk-note">${T2('You can delete the journal at any time. The city is your home city (or the one you visit most).','Podes apagar o diário quando quiseres. A cidade é a tua cidade principal (ou a que mais visitas).')}</p></div>`
   :`<div class="sj-box"><p>${T2('Pick a home city or look up a place first.','Escolhe uma cidade principal ou pesquisa um local primeiro.')}</p></div>`;
 }else{
  const c=SKJ.cfg,r=SKJ.rep,months=[...skjMonths()].reverse().slice(0,6),yrs=[...new Set(SKJ.days.map(d=>d[0].slice(0,4)))];
  const chips=[...months,...(SKJ.days.length>=300?yrs:[])].map(p=>`<button type="button" class="sk-chip" data-sj="per" data-v="${p}" aria-pressed="${p===SKJ.per}">${p.length===4?p:skjMon(p)}</button>`).join('');
  let rep='';
  if(SKJ.busy)rep=`<p class="note sk">${T2('Loading…','A carregar…')}</p>`;
  else if(r&&r.n>0)rep=skjRepHTML(r);
  else rep=`<p class="note">${T2('Not enough data for this period yet.','Ainda não há dados suficientes para este período.')}</p>`;
  const otd=r&&r.otd&&r.otd.length?`<div class="sj-rep"><h3>${T2('This day, years ago','Neste dia, há anos')}</h3><ul class="sj-otd">${r.otd.map(o=>`<li><b>${o.y}</b><span>${T(o.tmean)}° ${T2('avg','média')} · ${o.precip>=1?dcm(o.precip,1)+' mm':T2('dry','seco')}${o.sun!=null?' · '+dcm(o.sun,1)+' h '+T2('sun','sol'):''}</span></li>`).join('')}</ul></div>`:'';
  body=`<p class="sj-loc">${escH(c.name)} · ${T2('since','desde')} ${new Date(c.since).toLocaleDateString(LOC(),{day:'numeric',month:'long',year:'numeric'})}</p><div class="sk-chips">${chips}</div>${rep}${otd}<button type="button" class="sk-ca sj-del" data-sj="del">${T2('Delete my journal','Apagar o meu diário')}</button>`;
 }
 el.innerHTML=`<div class="sj-in">${head}${data?skyCardHTML('skySj'):''}${body}</div>`;
 // o número do cartão SkyScore nasce como "0" para a animação de contagem; aqui (redesenho do diário) mostra logo o valor real
 $$('[data-cu]',el).forEach(b=>{b.textContent=b.dataset.cu;b.removeAttribute('data-cu')});
}

document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-sj]');if(!b)return;const k=b.dataset.sj;
 if(k==='close')skjClose();
 else if(k==='auth'){skjClose();authOpen()}
 else if(k==='retry')skjLoad();
 else if(k==='per'){SKJ.sel=null;SKJ.busy=true;skjPaint();await skjReport(b.dataset.v);SKJ.busy=false;skjPaint()}
 else if(k==='nav'){const ms=skjMonths(),i=ms.indexOf(SKJ.per)+(+b.dataset.v),t=ms[i];if(!t)return;SKJ.sel=null;SKJ.busy=true;skjPaint();await skjReport(t);SKJ.busy=false;skjPaint()}
 else if(k==='day'){SKJ.sel=SKJ.sel===b.dataset.v?null:b.dataset.v;const box=$('#sjCalBox');if(box&&SKJ.per)box.innerHTML=skjCalBlock(SKJ.per)}
 else if(k==='start'){
  const t=pushTarget()||(place?{name:place.name,lat:place.lat,lon:place.lon}:null);if(!t)return;
  SKJ.busy=true;skjPaint();
  try{const j=await skjApi('',{method:'PUT',body:JSON.stringify({name:t.name,lat:+t.lat,lon:+t.lon,pol:$('#sjPol')&&$('#sjPol').checked?1:0})});SKJ.cfg=j.cfg;SKJ.days=j.days||[];SKJ.per=null;SKJ.busy=false;await skjLoad();return}
  catch(er){SKJ.err=er.message;toast(er.message)}
  SKJ.busy=false;skjPaint();
 }else if(k==='del'){
  if(!confirm(T2('Delete your climate journal? This cannot be undone.','Apagar o teu diário climático? Não é possível desfazer.')))return;
  try{await skjApi('',{method:'DELETE'});SKJ.cfg=null;SKJ.days=[];SKJ.rep=null;SKJ.per=null;toast(T2('Journal deleted.','Diário apagado.'));skjPaint()}catch(er){toast(er.message)}
 }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.documentElement.classList.contains('sj-open'))skjClose()});
if(location.hash==='#diario')setTimeout(()=>{if(isUserAuth())skjOpen()},1800);
{const _u=updateAuthUI;updateAuthUI=function(){_u();const l=$('#skjRow b'),d=$('#skjDesc');if(l&&d){l.textContent=T2('SkyScore & Climate journal','SkyScore e Diário climático');d.textContent=T2('Outdoor scores & the weather you lived through','Pontuações ao ar livre e o tempo que viveste')}}}
