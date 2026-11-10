/* Skylab · warnings.js — IPMA warnings + hurricane tracker · load order 21/28 (classic script, shared global scope) */
/* ═══════════ WARNINGS — IPMA warnings and hurricane tracker ═══════════ */
/* ============ IPMA warnings (topbar) ============ */
const IPMA_LV={red:3,orange:2,yellow:1},IPMA_COL={red:'#e0352b',orange:'#f28c1f',yellow:'#f5c400',green:'#2fb34a'};
let ipmaAreas=null,ipmaWarn=null,ipmaT=0,ipmaTok=0,ipmaCur=null,ipmaPl=null;
const hav=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
const escH=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function ipmaLoad(){
 if(!ipmaAreas){
  const j=await fetchJSON(WORKER+'/ipma-areas');
  ipmaAreas=(j.data||j).map(a=>({id:a.idAreaAviso,name:a.local,lat:+a.latitude,lon:+a.longitude})).filter(a=>a.id&&isFinite(a.lat)&&isFinite(a.lon));
 }
 if(!ipmaWarn||Date.now()-ipmaT>6e5){ipmaWarn=await fetchJSON(WORKER+'/ipma-warnings');ipmaT=Date.now()}
}
function ipmaClose(){const p=$('#wpop'),b=$('#wrn');if(p)p.hidden=true;if(b)b.setAttribute('aria-expanded','false');document.documentElement.classList.remove('wpop-open')}
function ipmaPaint(){
 const p=$('#wpop');if(!p||!ipmaCur)return;
 const fmt=s=>new Date(s).toLocaleString(LANG=='pt'?'pt-PT':'en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit'})
 const L=ipmaCur.list;
 p.innerHTML=`<div class="wh"><b>IPMA warnings</b><span>${escH(ipmaCur.area)}</span></div>`+
  (L.length?L.map((w,i)=>`<div class="wi" style="--wc:${IPMA_COL[w.awarenessLevelID]||'#999'};--n:${i}"><i class="wdot"></i><div><b>${escH(w.awarenessTypeName)}</b><em>${escH(w.awarenessLevelID)}</em><p>${escH(w.text)}</p><small>${fmt(w.startTime)} → ${fmt(w.endTime)}</small></div></div>`).join(''):'<p class="wnone">No active warnings for this area. ☀️</p>')+
  '<a class="wsrc" href="https://www.ipma.pt/pt/otempo/prev.significativa/" target="_blank" rel="noopener">Source: IPMA ↗</a>';
}
async function ipmaUpdate(pl){
 const btn=$('#wrn'),tok=++ipmaTok;if(!btn)return;
 ipmaPl=pl;
 if(!pl||!/portugal/i.test(pl.sub||'')){btn.hidden=true;ipmaClose();return}   // só para locais em Portugal
 try{
  await ipmaLoad();
  if(tok!==ipmaTok)return;
  const a=ipmaAreas.reduce((m,x)=>{const d=hav(pl.lat,pl.lon,x.lat,x.lon);return d<m.d?{d,a:x}:m},{d:1e9,a:null}).a;
  if(!a)throw new Error('no area');
  const now=Date.now();
  const list=(Array.isArray(ipmaWarn)?ipmaWarn:[]).filter(w=>w.idAreaAviso==a.id&&w.awarenessLevelID&&w.awarenessLevelID!='green'&&Date.parse(w.endTime)>now)
   .sort((x,y)=>(IPMA_LV[y.awarenessLevelID]||0)-(IPMA_LV[x.awarenessLevelID]||0)||Date.parse(x.startTime)-Date.parse(y.startTime));
  ipmaCur={area:a.name,list};
  const top=list.length?list[0].awarenessLevelID:'green';
  btn.style.setProperty('--wc',IPMA_COL[top]||IPMA_COL.green);
  btn.className='pill warn'+(top=='red'||top=='orange'?' hot':'');
  btn.innerHTML=`<i class="wdot"></i>${list.length?`${list.length} warning${list.length>1?'s':''}`:'No warnings'}`;
  btn.hidden=false;
  if(!$('#wpop').hidden)ipmaPaint();
 }catch(e){btn.hidden=true;console.warn('[IPMA]',e.message)}
}
$('#wrn').onclick=e=>{
 e.stopPropagation();
 const p=$('#wpop'),open=p.hidden;
 /* No telemóvel o painel é uma folha fixa em baixo: tem de viver no <body>. Dentro do <header> (sticky, z-index 50) ficava presa
    ao contexto de empilhamento do cabeçalho e a barra inferior tapava-o. No ecrã grande volta ao cabeçalho (posição absoluta). */
 const mob=document.documentElement.classList.contains('is-mobile'),hd=$('#hd');
 if(mob&&p.parentNode!==document.body)document.body.appendChild(p);
 else if(!mob&&hd&&p.parentNode===document.body)hd.appendChild(p);
 if(open)ipmaPaint();
 p.hidden=!open;$('#wrn').setAttribute('aria-expanded',open);
 document.documentElement.classList.toggle('wpop-open',open&&mob);
};
addEventListener('click',e=>{if(!e.target.closest('#wpop,#wrn'))ipmaClose()});
addEventListener('keydown',e=>{if(e.key=='Escape')ipmaClose()});
setInterval(()=>{if(ipmaPl)ipmaUpdate(ipmaPl)},6e5);
/* ============ Seguimento de furacões (botão na topbar + cartão com a página desfocada) ============ */
const hT=(en,pt)=>LANG=='pt'?pt:en;
Object.assign(PT,{'Hurricane tracker':'Seguimento de furacões'});
const HC=['#5aa7ff','#4fd18b','#f0cf45','#f59a3a','#e5652e','#e0352b','#b4208f'],HS=[9,9,7,6,5,4,3.2,2.6],HGREY='#8aa0b5';
let hurrD=null,hurrAt=0,hurrP=null,hOpen=false,hView='load',hSel=0,hMap=null,hMk=[],hTok=0,hFocus=null;

/* categoria pelo vento sustentado (nós): -1 desconhecida, 0 DT, 1 TS, 2..6 = cat. 1..5 */
const hCat=kt=>kt==null||!isFinite(kt)?-1:kt<34?0:kt<64?1:kt<83?2:kt<96?3:kt<113?4:kt<137?5:6;
const hCol=c=>c<0?HGREY:HC[c];
const hKind=s=>s.lat<0?'cy':s.lon>=100&&s.lon<180?'ty':s.lon>=30&&s.lon<100?'cy':'hu';   // tufão / ciclone / furacão
function hLabel(s){
 const c=hCat(s.windKt);
 if(c<0)return hT('Tropical cyclone','Ciclone tropical');
 if(c==0)return hT('Tropical depression','Depressão tropical');
 if(c==1)return hT('Tropical storm','Tempestade tropical');
 const k={hu:['Hurricane','Furacão'],ty:['Typhoon','Tufão'],cy:['Cyclone','Ciclone']}[hKind(s)];
 return hT(k[0],k[1])+' · Cat. '+(c-1);
}
const hWind=kt=>kt==null?'—':unit=='c'?Math.round(kt*1.852).toLocaleString(LOC())+' km/h':Math.round(kt*1.15078)+' mph';
const hDist=km=>unit=='c'?Math.round(km).toLocaleString(LOC())+' km':Math.round(km*.621371).toLocaleString(LOC())+' mi';
const hDir=d=>hT('N,NE,E,SE,S,SW,W,NW','N,NE,E,SE,S,SO,O,NO').split(',')[Math.round((((d%360)+360)%360)/45)%8];
function hMove(s){
 if(s.moveDir==null||s.moveMph==null)return'—';
 if(s.moveMph<1)return hT('Stationary','Quase parado');
 return hDir(s.moveDir)+' · '+(unit=='c'?Math.round(s.moveMph*1.609)+' km/h':Math.round(s.moveMph)+' mph');
}
function hAgo(ms){
 const m=Math.max(0,Math.round((Date.now()-ms)/6e4));
 if(m<2)return hT('just now','agora mesmo');
 if(m<90)return hT(m+' min ago','há '+m+' min');
 const h=Math.round(m/60);return hT(h+' h ago','há '+h+' h');
}
function hDest(lat,lon,brg,km){       // onde estaria a tempestade se mantivesse rumo e velocidade
 const r=Math.PI/180,d=km/6371,b=brg*r,la=lat*r;
 const la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(b));
 const dl=Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));
 return[la2/r,lon+dl/r];             // longitude contínua: não salta no meridiano 180
}
function hSpiral(col,c,nh){           // espiral que roda: anti-horário no hemisfério norte, horário no sul
 const arm=a0=>{let d='';for(let k=0;k<=24;k++){const t=k/24,r=3+17*t,a=a0+t*3.4;d+=(k?'L':'M')+(24+r*Math.cos(a)).toFixed(1)+' '+(24+r*Math.sin(a)).toFixed(1)}return d};
 const p=arm(0)+arm(Math.PI);
 return`<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="${col}" opacity=".2"/><g${nh?'':' transform="translate(48 0) scale(-1 1)"'}><g class="hspin" style="--hs:${HS[c+1]}s"><path d="${p}" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/><path d="${p}" fill="none" stroke="${col}" stroke-width="3.6" stroke-linecap="round"/></g></g><circle cx="24" cy="24" r="3.4" fill="#fff" stroke="${col}" stroke-width="1.6"/></svg>`;
}
const hImg=()=>`<img src="hurricane.png" alt="" data-fb="Hurr">`;

/* ---- dados: worker /storms (NHC + GDACS) e, se faltar, GDACS diretamente ---- */
const hNum=v=>v==null||v===''||!isFinite(+v)?null:+v;
const hName=n=>String(n||'').replace(/-\d{2}$/,'').toLowerCase().replace(/(^|[\s-])\w/g,m=>m.toUpperCase());
const hSafe=u=>/^https:\/\/([a-z0-9-]+\.)*(nhc\.noaa\.gov|hurricanes\.gov|gdacs\.org)\//i.test(u||'')?u:null;
function hClean(s){
 if(!s||!isFinite(+s.lat)||!isFinite(+s.lon)||Math.abs(+s.lat)>90)return null;
 return{id:String(s.id||s.name),name:s.name?String(s.name):hT('Unnamed','Sem nome'),lat:+s.lat,lon:+s.lon,windKt:hNum(s.windKt),pressure:hNum(s.pressure),moveDir:hNum(s.moveDir),moveMph:hNum(s.moveMph),src:String(s.src||''),url:hSafe(s.url),updated:s.updated||null};
}
async function hurrFetch() {
    // 1. Try Worker with 8s timeout
    try {
        const j = await fetchJSON(WORKER + '/storms', undefined, 8000);
        if (j && Array.isArray(j.storms)) {
            return { storms: j.storms.map(hClean).filter(Boolean), at: Date.parse(j.updated) || Date.now() };
        }
    } catch (e) {
        console.info('[Hurricanes] rota /storms indisponível no worker (' + (e.name === 'AbortError' || e.name === 'TimeoutError' ? 'timeout' : e.message) + '); a tentar o GDACS diretamente');
    }

    // 2. Fallback to GDACS with 15s timeout
    try {
        const j = await fetchJSON('https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP', undefined, 15000);
        const by = new Map();
        for (const f of (j && j.features) || []) {
            const p = f.properties || {}, g = f.geometry && f.geometry.coordinates;
            if (p.eventtype !== 'TC' || String(p.iscurrent) !== 'true' || !g) continue;
            const old = by.get(p.eventid); if (old && old.ep >= p.episodeid) continue;
            const sv = p.severitydata || {};
            by.set(p.eventid, {
                ep: p.episodeid, s: {
                    id: 'gdacs' + p.eventid, name: hName(p.eventname || p.name), lat: g[1], lon: g[0],
                    windKt: hNum(sv.severity) == null ? null : sv.severity / 1.852,
                    src: 'GDACS', url: p.url && p.url.report,
                    updated: p.datemodified ? p.datemodified + 'Z' : null
                }
            });
        }
        return { storms: [...by.values()].map(x => hClean(x.s)).filter(Boolean).sort((a, b) => (b.windKt || 0) - (a.windKt || 0)), at: Date.now() };
      } catch (err) {
        if (hurrD) return hurrD;                  // stale cache is OK
        throw err;                                // ✅ UI shows "couldn't load, retry"
      }
}
function hurrGet(force){
 if(!force&&hurrD&&Date.now()-hurrAt<6e5)return Promise.resolve(hurrD);
 return hurrP||(hurrP=hurrFetch().then(d=>{hurrD=d;hurrAt=Date.now();return d}).finally(()=>{hurrP=null}));
}
function hurrBadge(){                  // contador no botão (e anel a pulsar se houver furacão a sério)
 const b=$('#hbtn');if(!b)return;
 const n=hurrD?hurrD.storms.length:0;
 b.dataset.n=n||'';
 b.classList.toggle('hot',!!(hurrD&&hurrD.storms.some(s=>hCat(s.windKt)>=2)));
 const t=n?hT(n+(n==1?' active tropical cyclone':' active tropical cyclones'),n+(n==1?' ciclone tropical ativo':' ciclones tropicais ativos')):hT('Hurricane tracker','Seguimento de furacões');
 b.title=t;b.setAttribute('aria-label',t);
}

/* ---- cartão ---- */
function hurrShell(){
 let o=$('#hov');if(o)return o;
 o=document.createElement('div');o.id='hov';o.className='hov';o.hidden=true;
 o.innerHTML='<div class="hcard" role="dialog" aria-modal="true" aria-labelledby="htt"><div id="hbody"></div></div>';
 document.body.appendChild(o);
 o.addEventListener('click',e=>{
  if(e.target===o||e.target.closest('[data-hx]'))return hurrClose();      // clicar no fundo desfocado também fecha
  const r=e.target.closest('[data-hi]');if(r)return hurrSel(+r.dataset.hi,true);
  if(e.target.closest('[data-hr]'))return hurrRetry();
 });
 return o;
}
function hurrPaint(){
 const b=$('#hbody');if(!b)return;
 hTok++;
 if(hMap){try{hMap.remove()}catch(e){}hMap=null}hMk=[];
 const D=hurrD,list=D?D.storms:[];
 if(hSel>=list.length)hSel=0;
 const staleNote = D && D.stale
  ? ' · ' + hT('stale, '+Math.round(D.staleAge/6e4)+' min old','desatualizado, há '+Math.round(D.staleAge/6e4)+' min')
  : '';
 const partialNote = D && D.partial
  ? ' · ' + (D.partial === 'nhc-only' ? hT('GDACS unreachable','GDACS inacessível')
       : D.partial === 'gdacs-only' ? hT('NHC unreachable','NHC inacessível')
       : hT('partial data','dados parciais'))
  : '';
 const sub=!D?(hView=='load'?hT('Loading storms…','A carregar tempestades…'):hT('Storm data unavailable','Dados indisponíveis')):
  list.length?`${list.length} ${list.length==1?hT('active storm','tempestade ativa'):hT('active storms','tempestades ativas')} · ${hT('updated','atualizado')} ${hAgo(D.at)}${staleNote}${partialNote}`:hT('All quiet for now','Tudo calmo por agora');
 let h=`<div class="hh"><div class="hht"><span class="hico">${hImg()}</span><div><h2 id="htt">${hT('Hurricane tracker','Seguimento de furacões')}</h2><p>${sub}</p></div></div><button class="hx" data-hx aria-label="${hT('Close','Fechar')}">✕</button></div>`;
 if(!D&&hView=='load')h+=`<p class="note sk">${hT('Fetching the latest advisories…','A obter os boletins mais recentes…')}</p>`;
 else if(!D)h+=`<div class="hempty"><span class="hico">${hImg()}</span><h3>${hT('Couldn’t load the storms','Não foi possível carregar as tempestades')}</h3><p>${hT('The data sources didn’t answer. Check your connection and try again.','As fontes de dados não responderam. Verifica a ligação e tenta outra vez.')}</p><button class="pill dk" data-hr>${hT('Try again','Tentar outra vez')}</button></div>`;
 else if(!list.length)h+=`<div class="hempty"><span class="hico">${hImg()}</span><h3>${hT('No active tropical cyclones','Sem ciclones tropicais ativos')}</h3><p>${hT('The oceans are quiet right now. When a new storm forms it shows up here and the button gets a counter.','Os oceanos estão calmos por agora. Quando se formar uma nova tempestade aparece aqui e o botão ganha um contador.')}</p></div>`;
 else{
  const here=place&&isFinite(place.lat)?place:null,proj=list.some(s=>s.moveDir!=null&&s.moveMph>=1);
  h+=`<div id="hmap" role="application" aria-label="${hT('Map of active tropical cyclones','Mapa dos ciclones tropicais ativos')}">${hT('Loading map…','A carregar o mapa…')}</div><div class="hdet" id="hdet"></div><div class="hlist">`+
  list.map((s,i)=>{
   const c=hCat(s.windKt),col=hCol(c);
   const dist=here?`${hDist(hav(here.lat,here.lon,s.lat,s.lon))} ${hT('from','de')} ${escH(here.name)}`:'';
   return`<button class="hrow${i==hSel?' on':''}" data-hi="${i}" style="--hc:${col};--n:${i}"><span class="hsp">${hSpiral(col,c,s.lat>=0)}</span><span class="hmain"><b>${escH(s.name)}</b><em>${hLabel(s)}</em>${dist?`<small>${dist}</small>`:''}</span><span class="hstat"><span><i>${hT('Winds','Ventos')}</i>${hWind(s.windKt)}</span><span><i>${hT('Pressure','Pressão')}</i>${s.pressure!=null?s.pressure+' hPa':'—'}</span><span><i>${hT('Moving','Movimento')}</i>${hMove(s)}</span></span></button>`;
  }).join('')+
  `</div><p class="hnote">${hT('Category from sustained wind only (Saffir–Simpson scale).','Categoria só pelo vento sustentado (escala Saffir–Simpson).')}${proj?' '+hT('The dashed line shows where the storm would be in 24 h if it kept its current heading and speed. It is not an official forecast.','A linha tracejada mostra onde estaria a tempestade daqui a 24 h se mantivesse o rumo e a velocidade atuais. Não é uma previsão oficial.'):''}</p>`+
  `<div class="hfoot"><span>${hT('Sources','Fontes')}:</span><a href="https://www.nhc.noaa.gov/" target="_blank" rel="noopener">NHC / CPHC ↗</a><a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS ↗</a></div>`;
 }
 b.innerHTML=h;
 if(list.length){hurrDet();hurrMap()}
 const fx=$('#hbody [data-hx]');if(fx&&!$('#hov').contains(document.activeElement))fx.focus({preventScroll:true});
}
function hurrDet(){
 const el=$('#hdet'),s=hurrD&&hurrD.storms[hSel];if(!el||!s)return;
 const t=Date.parse(s.updated),when=isFinite(t)?' · '+hAgo(t):'';
 el.innerHTML=`<span><b>${escH(s.name)}</b> · ${hT('source','fonte')} ${escH(s.src||'—')}${when}</span>`+(s.url&&/^https:\/\//i.test(s.url)?`<a href="${escH(s.url)}" target="_blank" rel="noopener">${/^NHC/.test(s.src)?hT('Official advisory ↗','Boletim oficial ↗'):hT('Event report ↗','Relatório do evento ↗')}</a>`:'');
}
async function hurrMap(){
 const list=hurrD?hurrD.storms:[];if(!$('#hmap')||!list.length)return;
 const tok=hTok;
 try{await loadLeaflet()}catch(e){const m=$('#hmap');if(m)m.textContent=hT('The map library couldn’t load.','Não foi possível carregar o mapa.');return}
 const box=$('#hmap');if(tok!==hTok||!hOpen||!box)return;
 box.textContent='';if(box._leaflet_id)delete box._leaflet_id;
 hMap=L.map(box,{minZoom:2,maxZoom:8,worldCopyJump:true,scrollWheelZoom:false,maxBounds:[[-85,-Infinity],[85,Infinity]],maxBoundsViscosity:1.0});
 L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_4644_2_e1ddc0590e0bf3595329dba5',{maxZoom:19}).addTo(hMap);
 hMap.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/">CARTO</a>');
 hMap.on('click focus',()=>hMap.scrollWheelZoom.enable());
 hMap.on('mouseout',()=>hMap.scrollWheelZoom.disable());
 const pts=[],OFF=[-360,0,360];                                   // cópias do mundo: aparecem de ambos os lados
 list.forEach((s,i)=>{
  const c=hCat(s.windKt),col=hCol(c);
  const e=(s.moveDir!=null&&s.moveMph>=1)?hDest(s.lat,s.lon,s.moveDir,s.moveMph*1.609*24):null;
  OFF.forEach(o=>{
   if(e){
    L.polyline([[s.lat,s.lon+o],[e[0],e[1]+o]],{color:col,weight:3,opacity:.9,dashArray:'6 9',interactive:false}).addTo(hMap);
    L.circleMarker([e[0],e[1]+o],{radius:4,color:'#fff',weight:2,fillColor:col,fillOpacity:1,interactive:false}).addTo(hMap);
   }
   const m=L.marker([s.lat,s.lon+o],{icon:L.divIcon({className:'hmk',html:hSpiral(col,c,s.lat>=0),iconSize:[46,46],iconAnchor:[23,23]}),keyboard:false,riseOnHover:true}).addTo(hMap);
   m.bindTooltip(`<b>${escH(s.name)}</b> · ${hWind(s.windKt)}`,{direction:'top',offset:[0,-22]});
   m.on('click',()=>hurrSel(i,false));
   if(o===0)hMk[i]=m;
  });
  pts.push([s.lat,s.lon]);
 });
 if(place&&isFinite(place.lat))OFF.forEach(o=>L.marker([place.lat,place.lon+o],{keyboard:false,interactive:false,icon:L.divIcon({className:'rpin',html:'<i></i>',iconSize:[18,18]})}).addTo(hMap));
 if(pts.length==1)hMap.setView(pts[0],5);else hMap.fitBounds(pts,{padding:[50,50],maxZoom:5});
 setTimeout(()=>{if(hMap&&tok===hTok)hMap.invalidateSize()},450);   // o cartão ainda está a animar quando o mapa nasce
}
function hurrSel(i,fly){
 const s=hurrD&&hurrD.storms[i];if(!s)return;
 hSel=i;
 $$('#hov .hrow').forEach((r,j)=>r.classList.toggle('on',j==i));
 hurrDet();
 if(hMap){
  if(fly){still?hMap.setView([s.lat,s.lon],Math.max(hMap.getZoom(),4)):hMap.flyTo([s.lat,s.lon],Math.max(hMap.getZoom(),4),{duration:1.1});const m=$('#hmap');if(m)m.scrollIntoView({behavior:still?'auto':'smooth',block:'nearest'})}
  if(hMk[i])hMk[i].openTooltip();
 }
}
async function hurrOpen(){
 const o=hurrShell();
 hOpen=true;ipmaClose();closeSg();
 hFocus=document.activeElement;hSel=0;
 hView=hurrD?'ok':'load';
 hurrPaint();
 o.hidden=false;document.documentElement.classList.add('hlock');
 void o.offsetWidth;o.classList.add('on');
 $('#hbtn').setAttribute('aria-expanded','true');
 const prev=hurrD,pv=hView;
 try{await hurrGet();hView='ok'}catch(e){console.warn('[Hurricanes]',e.message);if(!hurrD)hView='err'}
 hurrBadge();
 if(hOpen&&(hurrD!==prev||hView!==pv))hurrPaint();
}
function hurrClose(){
 const o=$('#hov');if(!o||o.hidden)return;
 hOpen=false;hTok++;
 o.classList.remove('on');document.documentElement.classList.remove('hlock');
 $('#hbtn').setAttribute('aria-expanded','false');
 const done=()=>{if(!hOpen){o.hidden=true;if(hMap){try{hMap.remove()}catch(e){}hMap=null}}};
 still?done():setTimeout(done,360);
 if(hFocus&&hFocus.focus)hFocus.focus({preventScroll:true});
}
function hurrRetry(){
 hView='load';hurrPaint();
 hurrGet(true).then(()=>{hView='ok'}).catch(e=>{console.warn('[Hurricanes]',e.message);hView='err'}).finally(()=>{hurrBadge();if(hOpen)hurrPaint()});
}
$('#hbtn').onclick=()=>hOpen?hurrClose():hurrOpen();
addEventListener('keydown',e=>{        // captura: com o cartão aberto os atalhos do site (u, r, l, h, 1-5, /) não disparam
 if(!hOpen)return;
 if(e.key=='Escape'){e.preventDefault();e.stopPropagation();hurrClose();return}
 if(e.key=='Tab'){
  const f=$$('#hov button,#hov a[href]').filter(x=>!x.disabled&&x.getClientRects().length);
  if(!f.length)return;
  const a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
  else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
  return;
 }
 if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.key.length==1)e.stopPropagation();
},true);
document.addEventListener('keydown',e=>{      // atalho: T abre o seguimento de furacões
 if(hOpen||e.metaKey||e.ctrlKey||e.altKey||e.target.matches('input,textarea,select'))return;
 if(e.key=='t'||e.key=='T')hurrOpen();
});
new MutationObserver(()=>hurrBadge()).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});   // muda o idioma do tooltip do botão
