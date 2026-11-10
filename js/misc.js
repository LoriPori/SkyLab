/* Skylab · misc.js — programmer mode, favourites, push, PWA install, auto storms · load order 24/28 (classic script, shared global scope) */
/* ═══════════ APP — programmer mode, favourites, push, PWA, boot, mobile v2 ═══════════ */
/* ============ Modo programador + Favoritos (só com sessão iniciada) ============ */
const progOn=()=>isUserAuth()&&lsGet('progMode')===true;
function imgFBCode(el){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  svg.style.width='22px';svg.style.height='22px';
  svg.innerHTML='<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>';
  el.replaceWith(svg);
}
function progUI(){
  const on=progOn(),tb=$('#termBtn');
  if(tb)tb.hidden=!on;                                              // o botão Terminal só existe com o modo programador ligado
  if(!on&&termIsOpen)termClose();
  const b=$('#progBtn');
  if(b){
    b.setAttribute('aria-pressed',on);
    $('#progLbl').textContent=T2('Programmer mode','Modo programador');
    $('#progDesc').textContent=T2('Terminal, raw data and technical detail','Terminal, dados em bruto e detalhe técnico');
    $('#progState').textContent=on?'ON':'OFF';
  }
  document.documentElement.classList.toggle('prog',on);
}
function progToggle(){
  if(!isUserAuth())return;
  const on=!progOn();
  lsSet('progMode',on);
  progUI();
  if(tab==='sky'&&data)skyRepaint();                                // mostra / esconde os números da análise sinóptica
  toast(on?T2('Programmer mode on — Terminal unlocked in the top bar.','Modo programador ativo — Terminal desbloqueado na barra superior.')
          :T2('Programmer mode off.','Modo programador desligado.'));
}
{const pb=$('#progBtn');if(pb)pb.onclick=progToggle}

/* ---- painel de cidades favoritas (estilo AccuWeather) ---- */
let favOpen=false,favRows=null,favT=0,favKey='',favBusy=false;
const homeCity=()=>lsGet('homeCity')||null;
const sameP=(a,b)=>!!a&&!!b&&a.name==b.name&&a.sub==b.sub;
const favSorted=()=>{const f=favs(),h=homeCity();return h?[...f.filter(x=>sameP(x,h)),...f.filter(x=>!sameP(x,h))]:f};
async function favLoad(force){
  const list=favSorted(),key=list.map(p=>p.lat+','+p.lon).join('|');
  if(!list.length){favRows={};return}
  if(!force&&favRows&&key===favKey&&Date.now()-favT<6e5)return;     // 10 min de cache
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${list.map(p=>(+p.lat).toFixed(3)).join(',')}&longitude=${list.map(p=>(+p.lon).toFixed(3)).join(',')}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`;
  const r=await fetch(u);if(!r.ok)throw new Error(r.status==429?'429':'HTTP '+r.status);   // 1 pedido para todas as cidades
  const j=await r.json(),arr=Array.isArray(j)?j:[j];
  favRows={};list.forEach((p,i)=>favRows[p.lat+','+p.lon]=arr[i]||null);favT=Date.now();favKey=key;
}
function favCard(p,i){
  const d=favRows&&favRows[p.lat+','+p.lon],c=d&&d.current,dy=d&&d.daily,home=sameP(p,homeCity());
  const lt=d&&isFinite(d.utc_offset_seconds)?new Date(Date.now()+d.utc_offset_seconds*1e3).toISOString().slice(11,16):'';
  const rain=dy&&dy.precipitation_probability_max?dy.precipitation_probability_max[0]:null;
  const body=c?`<div class="fav-mid"><span class="fav-ic">${emoji(c.weather_code,c.is_day)}</span><span class="fav-t">${T(c.temperature_2m)}°</span></div>
 <div class="fav-cond">${tr(LABEL[c.weather_code]||'')} · ${T2('Feels','Sensação')} ${T(c.apparent_temperature)}°</div>
 <div class="fav-row"><span>${T2('H','Máx')} ${T(dy.temperature_2m_max[0])}° / ${T2('L','Mín')} ${T(dy.temperature_2m_min[0])}°</span><span>${W(c.wind_speed_10m)}</span></div>
 ${rain!=null?`<div class="fav-row"><span>${T2('Rain','Chuva')} ${rain}%</span></div><div class="fav-rain"><i style="--w:${rain}%"></i></div>`:''}`
   :`<div class="fav-cond">${T2('Loading…','A carregar…')}</div>`;
  return`<div class="fav-c${home?' home':''}" role="link" tabindex="0" data-i="${i}" style="--n:${i};--fc:${c?tempColor(c.temperature_2m):'#33b0ea'}">
 <div class="fav-top"><div><div class="fav-nm">${escH(p.name)}</div><div class="fav-sb">${escH(p.sub||'')}${lt?' · '+lt:''}</div></div>
 <div class="fav-acts"><button type="button" data-act="home" aria-pressed="${home}" title="${T2('Set as home city','Definir como cidade principal')}">⌂</button><button type="button" data-act="rm" title="${T2('Remove','Remover')}">✕</button></div></div>
 ${body}</div>`;
}
function favPaint(anim){
  if(!$('#favOv'))return;
  const list=favSorted(),n=list.length,on=!!place&&list.some(x=>sameP(x,place));
  $('#favTitle').textContent=T2('Favourite cities','Cidades favoritas');
  $('#favSub').textContent=n?T2(`${n} saved · synced to your account`,`${n} guardadas · sincronizadas com a tua conta`):T2('Synced to your account','Sincronizadas com a tua conta');
  $('#favBar').innerHTML=(place?`<button class="pill dk" id="favAdd" type="button">${on?'★ '+T2('Remove current city','Remover cidade atual'):'☆ '+T2('Add current city','Adicionar cidade atual')}</button>`:'')
    +(n?`<button class="pill dk" id="favRef" type="button">↻ ${T2('Refresh','Atualizar')}</button>`:'');
  $('#favBody').innerHTML=n?`<div class="fav-grid${anim?' in':''}">${list.map(favCard).join('')}</div>`
    :`<div class="fav-empty">${T2('No favourites yet. Open a city and tap its ★, or add it from here.','Ainda não tens favoritos. Abre uma cidade e carrega na ★, ou adiciona-a aqui.')}</div>`;
}
async function favRefresh(force){
  if(favBusy)return;favBusy=true;
  try{await favLoad(force)}
  catch(e){console.warn('[Favs]',e.message);toast(e.message==='429'?T2('Weather service is busy — showing the last data.','Serviço ocupado — a mostrar os últimos dados.'):T2('Could not refresh favourites.','Não foi possível atualizar os favoritos.'))}
  finally{favBusy=false}
  if(favOpen)favPaint(false);
}
function favToggleCurrent(){
  if(!place)return;
  const on=favs().some(x=>sameP(x,place));
  lsSet('favs',on?favs().filter(x=>!sameP(x,place)):[place,...favs()].slice(0,20));
  if(typeof paintFav==='function'&&place)paintFav();
  favPaint(false);favRefresh(false);
}
function favShell(){
  let o=$('#favOv');if(o)return o;
  o=document.createElement('div');o.className='hov';o.id='favOv';o.hidden=true;
  o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-labelledby','favTitle');
  o.innerHTML=`<div class="hcard fav-card"><div class="hh"><div class="hht"><div><h2 id="favTitle"></h2><p id="favSub"></p></div></div><button class="hx" id="favClose" type="button" aria-label="Close">✕</button></div><div class="fav-bar" id="favBar"></div><div id="favBody"></div></div>`;
  document.body.appendChild(o);
  o.addEventListener('click',e=>{
    if(e.target===o||e.target.closest('#favClose'))return favClose();
    if(e.target.closest('#favAdd'))return favToggleCurrent();
    if(e.target.closest('#favRef'))return favRefresh(true);
    const c=e.target.closest('.fav-c');if(!c)return;
    const p=favSorted()[+c.dataset.i];if(!p)return;
    const act=e.target.closest('[data-act]');
    if(act&&act.dataset.act==='rm'){
      lsSet('favs',favs().filter(x=>!sameP(x,p)));
      if(sameP(p,homeCity()))lsSet('homeCity',false);
      if(typeof paintFav==='function'&&place)paintFav();
      return favPaint(false);
    }
    if(act&&act.dataset.act==='home'){
      lsSet('homeCity',sameP(p,homeCity())?false:{lat:p.lat,lon:p.lon,name:p.name,sub:p.sub});
      return favPaint(false);
    }
    favClose();window.scrollTo({top:0,behavior:'smooth'});show(p.lat,p.lon,p.name,p.sub);
  });
  o.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('fav-c')){e.preventDefault();e.target.click()}});
  return o;
}
function favOpenDash(){
  if(!isUserAuth()){
    authOpen();
    toast(T2('The favourites dashboard is for registered users. Please sign in.','O painel de favoritos é para utilizadores registados. Inicia sessão.'));
    return;
  }
  const o=favShell();
  favOpen=true;closeSg();if(typeof ipmaClose==='function')ipmaClose();
  favPaint(true);
  o.hidden=false;document.documentElement.classList.add('hlock');
  void o.offsetWidth;o.classList.add('on');
  $('#favBtn').setAttribute('aria-expanded','true');
  favRefresh(false);
  setTimeout(()=>{const x=$('#favClose');if(x&&favOpen)x.focus()},60);
}
function favClose(){
  const o=$('#favOv');if(!o||o.hidden)return;
  favOpen=false;o.classList.remove('on');document.documentElement.classList.remove('hlock');
  $('#favBtn').setAttribute('aria-expanded','false');
  setTimeout(()=>{if(!favOpen)o.hidden=true},360);
}
document.addEventListener('keydown',e=>{if(favOpen&&e.key==='Escape'){e.stopPropagation();favClose()}},true);
function favUI(){
  const b=$('#favBtn');if(!b)return;
  b.title=b.ariaLabel=T2('Favourite cities','Cidades favoritas');
  if(favOpen)favPaint(false);
}
(function(){
  const b=document.createElement('button');
  b.className='pill hbtn';b.id='favBtn';b.type='button';
  b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');
  b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  b.onclick=favOpenDash;
  $('#termBtn').before(b);                                          // botão ★ na topbar, antes do Terminal
})();

/* ---- ligar tudo ao ciclo de vida da conta ---- */
const _updateAuthUI=updateAuthUI;
updateAuthUI=function(){_updateAuthUI();progUI();favUI()};
const _authOpen=authOpen;
authOpen=function(){_authOpen();progUI()};
new MutationObserver(()=>{progUI();favUI()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
progUI();favUI();

/* ============ Notificações push do sistema (só com sessão iniciada) ============ */
const VAPID_PUBLIC='BEi3m1XgxB1Euxl0vZvvr2qBs2-YC9aOIAGY6hbzcE87F7t7wbbfI92nzogYBV5NUleOfPqATyfiG3JKoW0hEyg';                       // a mesma chave pública guardada no worker
const PUSH_API=AUTH_CONFIG.apiUrl.replace('/auth','/push');
const pushOk=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const b64uBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));

/* local de destino: cidade principal; se não houver, a mais visitada */
const visitSeen=new Set();
function visitBump(p){                                                // conta 1 visita por local e por sessão
  if(!isUserAuth()||!p)return;
  const k=p.name+'|'+(p.sub||'');
  if(visitSeen.has(k))return;visitSeen.add(k);
  const v=lsGet('visits')||{},e=v[k]||{name:p.name,sub:p.sub,lat:p.lat,lon:p.lon,n:0};
  e.n++;e.lat=p.lat;e.lon=p.lon;v[k]=e;
  const ks=Object.keys(v);
  if(ks.length>30)ks.sort((a,b)=>v[a].n-v[b].n).slice(0,ks.length-30).forEach(x=>delete v[x]);
  lsSet('visits',v);
}
function pushTarget(){
  const h=homeCity();
  if(h)return{lat:h.lat,lon:h.lon,name:h.name,sub:h.sub,src:'home'};
  const v=Object.values(lsGet('visits')||{}).sort((a,b)=>b.n-a.n)[0];
  return v?{lat:v.lat,lon:v.lon,name:v.name,sub:v.sub,src:'visited'}:null;
}
async function pushSend(path,sub,tok){
  const t=pushTarget();
  const r=await fetch(`${PUSH_API}/${path}`,{method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${tok||currentToken}`},
    body:JSON.stringify({subscription:sub,loc:t,lang:LANG,unit:unit=='f'?'f':'c'})});
  if(!r.ok){let m='';try{m=(await r.text()).slice(0,120)}catch(e){}throw new Error('servidor '+r.status+' '+m)}
  return true;
}
const pushIsOn=()=>isUserAuth()&&pushOk()&&Notification.permission==='granted'&&localStorage.getItem('pushOn')==='1';
async function pushEnable(){
  if(!isUserAuth())return false;
  if(!pushOk()){toast(T2('Push notifications are not supported here. On iPhone, add Skylab to the Home Screen first.','Notificações push não são suportadas aqui. No iPhone, adiciona primeiro o Skylab ao Ecrã principal.'));return false}
  if(!pushTarget()){toast(T2('Pick a home city (★ → ⌂) or visit a place first.','Escolhe uma cidade principal (★ → ⌂) ou visita um local primeiro.'));return false}
  if(await Notification.requestPermission()!=='granted'){toast(T2('Notifications are blocked for this site in your browser settings.','As notificações estão bloqueadas para este site nas definições do navegador.'));return false}
  try{
    const reg=await navigator.serviceWorker.ready;
    const key=b64uBytes(VAPID_PUBLIC);
    let sub=await reg.pushManager.getSubscription();
    if(sub&&sub.options&&sub.options.applicationServerKey){               // subscrição antiga com outra chave VAPID → recomeçar
      const cur=new Uint8Array(sub.options.applicationServerKey);
      if(cur.length!==key.length||cur.some((v,i)=>v!==key[i])){try{await sub.unsubscribe()}catch(_){}sub=null}
    }
    if(!sub){
      for(let n=0;;n++){
        try{sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});break}
        catch(e){if(e.name!=='AbortError'||n>=2)throw e;await new Promise(r=>setTimeout(r,1500*(n+1)))}   // falha transitória do serviço push: tenta de novo
      }
    }
    if(!await pushSend('subscribe',sub.toJSON()))throw new Error('server');
    localStorage.setItem('pushOn','1');
    toast(T2('Weather notifications on for this device.','Notificações do tempo ativas neste dispositivo.'));
    return true;
  }catch(e){
    console.warn('[Push]',e);
    if(e&&e.name==='AbortError'){
      let brave=false;try{brave=!!(navigator.brave&&await navigator.brave.isBrave())}catch(_){}
      toast(brave
        ?T2('Brave blocks push by default: Settings → Privacy → turn on “Use Google services for push messaging”, then restart Brave.','O Brave bloqueia o push por defeito: Definições → Privacidade → ativa «Usar serviços Google para mensagens push» e reinicia o Brave.')
        :T2('Your browser’s push service did not respond. Check VPN / private DNS / data saver and Google Play services, or try Chrome.','O serviço push do navegador não respondeu. Verifica VPN / DNS privado / poupança de dados e os serviços Google Play, ou experimenta o Chrome.'));
    }else toast(T2('Could not turn on notifications.','Não foi possível ativar as notificações.')+' ('+(e.name||'erro')+': '+String(e.message||e).slice(0,90)+')');
    return false}
}
/* Notificação de teste: pede ao servidor um push real e, se falhar, mostra uma local para isolar o problema */
async function pushTest(){
  let msg='';
  try{
    let ep=null;
    try{const reg=await navigator.serviceWorker.ready,sb=await reg.pushManager.getSubscription();ep=sb&&sb.endpoint}catch(e){}
    if(!ep){msg=T2('This device is not subscribed — turn notifications on here first.','Este dispositivo não está subscrito — ativa aqui primeiro as notificações.');console.info('[Push test]',msg);toast(msg);return msg}
    const r=await fetch(`${PUSH_API}/test`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${currentToken}`},body:JSON.stringify({endpoint:ep})});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.success){
      msg=T2('Test push sent — it should arrive in a few seconds.','Push de teste enviado — deve chegar dentro de alguns segundos.')+(j.status?` (push ${j.status})`:'');
    }else{
      msg=T2('Server could not send the push: ','O servidor não conseguiu enviar o push: ')+(j.error||('HTTP '+r.status));
      await skyNotify('Skylab · '+T2('Local test','Teste local'),{body:T2('Local notifications work; the problem is on the push server side.','As notificações locais funcionam; o problema está no envio push do servidor.'),tag:'skylab-test-local'});
    }
  }catch(e){msg=T2('Test failed: ','Teste falhou: ')+String(e.message||e).slice(0,100)}
  console.info('[Push test]',msg);toast(msg);
  return msg;
}
window.pushTest=pushTest;
async function pushDisable(tok){                                      // tok: usado no logout, antes de o token ser apagado
  localStorage.removeItem('pushOn');
  if(!pushOk())return;
  try{
    const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
    if(sub){
      await fetch(`${PUSH_API}/unsubscribe`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${tok||currentToken}`},body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
      await sub.unsubscribe();
    }
  }catch(e){}
}
let pushLocT=0;
function pushSyncLoc(){                                               // reenvia local / idioma / unidade quando mudam (chamado pelo prefsPush)
  clearTimeout(pushLocT);
  pushLocT=setTimeout(async()=>{
    pushUI();
    if(!pushIsOn())return;
    try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(sub&&pushTarget())await pushSend('subscribe',sub.toJSON())}catch(e){}
  },1500);
}
function pushUI(){
  const b=$('#pushBtn');if(!b)return;
  const on=pushIsOn(),t=pushTarget();
  b.setAttribute('aria-pressed',on);
  $('#pushLbl').textContent=T2('Weather notifications','Notificações do tempo');
  $('#pushState').textContent=on?'ON':'OFF';
  $('#pushDesc').textContent=!pushOk()?T2('Not supported on this device or browser','Não suportado neste dispositivo ou navegador')
    :!t?T2('Pick a home city or visit a place first','Escolhe uma cidade principal ou visita um local primeiro')
    :t.src==='home'?T2(`Now and what’s coming · ${t.name} (home city)`,`Agora e o que aí vem · ${t.name} (cidade principal)`)
    :T2(`Now and what’s coming · ${t.name} (most visited)`,`Agora e o que aí vem · ${t.name} (mais visitada)`);
}
async function pushToggle(){
  if(!isUserAuth())return;
  if(pushIsOn()){await pushDisable();toast(T2('Weather notifications off for this device.','Notificações do tempo desligadas neste dispositivo.'))}
  else await pushEnable();
  pushUI();
}
{const pb=$('#pushBtn');if(pb)pb.onclick=pushToggle}
const _uai2=updateAuthUI;updateAuthUI=function(){_uai2();pushUI()};
const _ao2=authOpen;authOpen=function(){_ao2();pushUI()};
new MutationObserver(()=>pushUI()).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
pushUI();
if(pushIsOn())pushSyncLoc();                                          // ao abrir o site, garante que o servidor tem o local atual

/* ============ PWA install ============ */
let installEv=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEv=e;$('#inst').hidden=false});
$('#inst').onclick=async()=>{
 if(!installEv)return;
 installEv.prompt();
 const r=await installEv.userChoice;
 installEv=null;$('#inst').hidden=true;
 toast(r.outcome=='accepted'?'Installing Skylab…':'No problem, maybe later');
};
addEventListener('appinstalled',()=>{installEv=null;$('#inst').hidden=true;toast('Skylab installed')});
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('[SW Registration Error]', e));
}
/* ============ Carregamento Automático de Tempestades ============ */
function initAutoStorms(){
 hurrGet().then(() => {
   hurrBadge();
 }).catch(e => {
   if (e.name !== 'AbortError' && e.name !== 'TimeoutError') {
     console.warn('[AutoStorms]', e);
   }
 });
  // Atualiza automaticamente a cada 10 minutos
  setInterval(() => {
    hurrGet(true).then(() => hurrBadge()).catch(() => {});
  }, 10 * 60 * 1000);
}
('requestIdleCallback' in window?requestIdleCallback(initAutoStorms,{timeout:4000}):setTimeout(initAutoStorms,2500));   // fora do caminho crítico; só um pedido
