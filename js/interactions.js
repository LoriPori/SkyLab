/* Skylab · interactions.js — ambient sound, toast, search box, global events, share link · load order 18/28 (classic script, shared global scope) */
/* ============ ambient sound (Web Audio) ============ */
let ac,flt,gn,lfo,soundOn=false;
const SND={rain:['highpass',1400,.11],storm:['highpass',800,.17],snow:['lowpass',380,.045],cloud:['lowpass',520,.05],fog:['lowpass',420,.045],clear:['lowpass',320,.03],night:['lowpass',240,.022]};
function tune(k){if(!soundOn||!ac)return;const[t,f,g]=SND[k]||SND.clear;flt.type=t;flt.frequency.setTargetAtTime(f,ac.currentTime,.6);gn.gain.setTargetAtTime(g,ac.currentTime,.8)}
function startSound(){
 ac=ac||new(window.AudioContext||window.webkitAudioContext)();
 if(!flt){
  const b=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const s=ac.createBufferSource();s.buffer=b;s.loop=true;flt=ac.createBiquadFilter();gn=ac.createGain();gn.gain.value=0;
  lfo=ac.createOscillator();lfo.frequency.value=.13;const dp=ac.createGain();dp.gain.value=90;lfo.connect(dp);dp.connect(flt.frequency);
  s.connect(flt);flt.connect(gn);gn.connect(ac.destination);s.start();lfo.start();
 }
 ac.resume();soundOn=true;tune(mode||'clear');
}
$('#snd').onclick=()=>{
 const b=$('#snd');
 if(soundOn){soundOn=false;gn.gain.setTargetAtTime(0,ac.currentTime,.3);toast('Ambient sound off')}
 else{startSound();toast('Ambient sound matches the weather')}
 b.setAttribute('aria-pressed',soundOn);
};

/* ============ toast ============ */
let toastT;
function toast(m){
 let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.setAttribute('role','status');document.body.appendChild(t)}
 t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),Math.min(8000,Math.max(2200,m.length*55)));
}

/* ============ search ============ */
let timer,items=[],sel=-1,sgTok=0;
const favs=()=>lsGet('favs')||[];
const openSg=h=>{sg.innerHTML=h;sg.classList.add('on')};
const closeSg=()=>{sg.classList.remove('on');sel=-1};
function recents(){
 const f=favs(),r=(lsGet('recent')||[]).filter(x=>!f.some(y=>y.name==x.name&&y.sub==x.sub));
 items=[...f,...r];if(!items.length)return closeSg();
 openSg(items.map((p,i)=>`<button role="option" data-i="${i}">${i<f.length?'★ ':''}${escH(p.name)}<small>${escH(p.sub||'')}</small></button>`).join(''));
}
q.addEventListener('focus',()=>{if(!q.value)recents()});
q.addEventListener('input',()=>{
 clearTimeout(timer);sel=-1;const v=q.value.trim();if(v.length<2)return v?void(sel=-1):recents();
 timer=setTimeout(async()=>{
  sgTok++;const tk=sgTok;
  try{
   const res=await geo(v);
   if(tk!=sgTok)return;
   items=res;sel=-1;
   openSg(items.length?items.map((p,i)=>`<button role="option" data-i="${i}">${escH(p.name)}<small>${escH(p.sub)}</small></button>`).join(''):'<div class="hd">No matches. Check the spelling.</div>');
  }catch(e){if(tk===sgTok)openSg('<div class="hd">Search is unavailable right now.</div>')}
 },250);
});
sg.addEventListener('click',e=>{const b=e.target.closest('button');if(b)pick(+b.dataset.i)});
function pick(i){
  const p=items[i];if(!p)return;closeSg();q.value='';q.blur();
  window.scrollTo({ top: 0, behavior: 'smooth' }); // <--- Add this line
  lsSet('recent',[p,...(lsGet('recent')||[]).filter(r=>r.name!==p.name||r.sub!==p.sub)].slice(0,5));
  show(p.lat,p.lon,p.name,p.sub);
}
q.addEventListener('keydown',e=>{
 const bs=[...sg.querySelectorAll('button')];if(!bs.length)return;
 if(e.key=='ArrowDown'||e.key=='ArrowUp'){e.preventDefault();sel=(sel+(e.key=='ArrowDown'?1:-1)+bs.length)%bs.length;bs.forEach((b,i)=>b.setAttribute('aria-selected',i==sel))}
 else if(e.key=='Enter'){ e.preventDefault(); handleSearchEnter(); }
 else if(e.key=='Escape')closeSg();
});
document.addEventListener('click',e=>{if(!e.target.closest('.search'))closeSg()});

/* ============ events ============ */
main.addEventListener('click',e=>{
 const t=e.target.closest('.tab');if(t)return setTab(t.dataset.t);
  const uvType=e.target.closest('[data-uv-type]');if(uvType){lsSet('uvPhototype',+uvType.dataset.uvType);return setTab('uv')}
 const s=e.target.closest('[data-s]');if(s){sciMode=s.dataset.s;$$('.sw button').forEach(b=>b.setAttribute('aria-pressed',b===s));return drawSci()}
 const f=e.target.closest('[data-f]');if(f){factI+=+f.dataset.f;return drawSci()}
 const a=e.target.closest('[data-a]');
 if(a&&!a.disabled){
  if(qs.a!=null||qs.i>=qs.o.length)return;
  const id=qs.o[qs.i],z=QZ[id];qs.a=+a.dataset.a;if(qs.a==z[1])qs.r++;
  if(!qs.seen.includes(id))qs.seen.push(id);
  qSave();qFresh=true;return drawSci();
 }
 if(e.target.closest('[data-nq]')){qs.i++;qs.a=null;qSave();return drawSci()}
 if(e.target.closest('[data-qr]')){qs=qNew(qs);qSave();return drawSci()}
 if(e.target.closest('#tk')&&data){factI=+$('#tk').dataset.i;sciMode='fact';setTab('sci');$('#tabs').scrollIntoView({behavior:'smooth',block:'start'});return}
 if(e.target.closest('#fav')){
  const same=x=>x.name==place.name&&x.sub==place.sub;
  lsSet('favs',favs().some(same)?favs().filter(x=>!same(x)):[place,...favs()].slice(0,20));paintFav();
 }
 if(e.target.closest('#shareBtn'))sharePlace();
});

/* ============ ligação partilhável: #p=lat,lon,nome,região ============ */
function shareURL(){return location.origin+location.pathname+'#p='+[(+place.lat).toFixed(3),(+place.lon).toFixed(3),encodeURIComponent(place.name||''),encodeURIComponent(place.sub||'')].join(',')}
async function sharePlace(){
 if(!place)return;
 const url=shareURL(),title='Skylab · '+place.name;
 if(navigator.share){try{await navigator.share({title,text:T2(`Weather in ${place.name}`,`Tempo em ${place.name}`),url});return}catch(e){if(e&&e.name==='AbortError')return}}
 try{await navigator.clipboard.writeText(url);toast(T2('Link copied','Ligação copiada'))}
 catch(e){window.prompt(T2('Copy this link','Copia esta ligação'),url)}
}
function sharedPlace(){
 const m=/^#p=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),([^,]*),([^,]*)$/.exec(location.hash);if(!m)return null;
 const lat=+m[1],lon=+m[2];if(!(Math.abs(lat)<=90)||!(Math.abs(lon)<=180))return null;
 const dec=t=>{try{return decodeURIComponent(t).replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,80)}catch(e){return''}};
 return{lat,lon,name:dec(m[3]),sub:dec(m[4])};
}
const clearHash=()=>{try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}};
addEventListener('hashchange',()=>{const p=sharedPlace();if(p){clearHash();show(p.lat,p.lon,p.name,p.sub)}});
document.addEventListener('click',e=>{const r=e.target.closest('.msg [data-act="retry"]');if(r&&lastTry)show(lastTry.lat,lastTry.lon,lastTry.name,lastTry.sub)});
$('#loc').onclick=locate;$('#sur').onclick=surprise;
function setUnit(u,manual,skipRender){
 unit=u;if(manual)lsSet('unitPick',u);
 $$('.seg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.u==unit));
 if(skipRender)return;
 if(data)render();
 else if(!place&&$('#hero')&&$('#hero').classList.contains('land'))landing();   // landing: cidades/ticker usam T() — refaz com as novas unidades
}
$$('.seg button').forEach(b=>{
 b.setAttribute('aria-pressed',b.dataset.u==unit);
 b.onclick=()=>setUnit(b.dataset.u,true);
});
$('#logo').onclick=()=>{
  lsSet('place',null);
  closeSg();
  landing();
  window.scrollTo(0,0);
};
let hgStuck=null,hgRaf=0;
function syncHeaderGlass(){
  hgRaf=0;
  const stuck = scrollY > 20; // same condition the glass card uses
  if(stuck===hgStuck)return;
  hgStuck=stuck;
  $('#hd').classList.toggle('stuck', stuck);
}
addEventListener('scroll', ()=>{if(!hgRaf)hgRaf=requestAnimationFrame(syncHeaderGlass)}, {passive:true});
syncHeaderGlass(); // run once on load too (fixes refresh mid-scroll / back-nav)

let pmE=null,pmRaf=0;
document.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||document.documentElement.classList.contains('is-mobile'))return;   // sem rato não há parallax/brilho: evita trabalho (e layout) a cada toque
 pmE=e;if(pmRaf)return;
 pmRaf=requestAnimationFrame(()=>{
  pmRaf=0;const e=pmE;if(!e)return;
  const hero=$('#hero');if(hero){hero.style.setProperty('--px',((e.clientX/innerWidth-.5)*2).toFixed(2));hero.style.setProperty('--py',((e.clientY/innerHeight-.5)*2).toFixed(2))}
  const el=e.target.closest&&e.target.closest('.card');
  if(el){const r=el.getBoundingClientRect();el.style.setProperty('--mx',(e.clientX-r.left)+'px');el.style.setProperty('--my',(e.clientY-r.top)+'px')}
 });
},{passive:true});
document.addEventListener('keydown',e=>{
 if(e.key=='Escape')closeSg();
 if(e.target.matches('input')||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key=='/'){e.preventDefault();q.focus()}
 if(e.key=='u'){$(`.seg button[data-u="${unit=='c'?'f':'c'}"]`).click();toast('Units: '+deg())}
 if(e.key=='r'&&place){toast('Refreshing…');show(place.lat,place.lon,place.name,place.sub)}
 if(e.key=='l')locate();
 if(e.key=='h'){lsSet('place',null);landing()}
 if(data&&'1234567'.includes(e.key)&&e.key)setTab(TABS[+e.key-1][0]);
});
addEventListener('load',moveInd);
setInterval(()=>{if(place&&!document.hidden&&navigator.onLine&&tab!='radar')show(place.lat,place.lon,place.name,place.sub)},6e5);   // não reconstrói o radar a meio
addEventListener('online',()=>{if(place)show(place.lat,place.lon,place.name,place.sub)});
