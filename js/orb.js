/* Skylab · orb.js — clothing-advisor 3D orb · load order 26/28 (classic script, shared global scope) */
/* ============ ORBE · conselheiro de roupa (esfera 3D em canvas) ============
   Diz o que vestir e QUANDO (a partir da previsão hora a hora). Ao toque: muda de cor,
   "pensa" (cores a rodopiar) e diz uma coisa — do tempo ou uma curiosidade verdadeira.
   Se o picarem demais, fica vermelho e zangado. */
function orbHTML(){return(typeof data!=='undefined'&&data&&window.SkyOrb)?SkyOrb.html():''}
(function(){
 const P=()=>LANG==='pt';
 const reduced=()=>typeof still!=='undefined'&&!!still;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const esc=s=>String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

 /* ---------- o que vestir, e quando ---------- */
 // temperatura aparente (Steadman / BoM, sem radiação): AT = Ta + 0,33·e − 0,70·ws − 4,00
 const apT=(t,rh,kmh)=>{const e=rh/100*6.105*Math.exp(17.27*t/(237.7+t));return t+.33*e-.7*(kmh/3.6)-4};
 const lvl=a=>a>=27?0:a>=20?1:a>=13?2:a>=6?3:4;
 const NM={en:['shorts and a light tee','a t-shirt','long sleeves','a warm jacket','a heavy coat, hat and gloves'],
           pt:['calções e t-shirt leve','uma t-shirt','roupa de manga comprida','um casaco quente','casaco grosso, gorro e luvas']};
 function plan(){
  const c=data.current,h=data.hourly,i0=idx0(),pt=P(),nm=NM[pt?'pt':'en'];
  const hr=i=>+h.time[i].slice(11,13),H=i=>pt?hr(i)+'h':hr(i)+':00',dt=i=>h.time[i].slice(0,10);
  // depois das 21 h o conselho é para amanhã (7 h–21 h); antes, vai até às 23 h de hoje. Nunca mistura a madrugada.
  const tom=hr(i0)>=21,ix=[];
  if(tom){for(let i=i0;i<h.time.length&&ix.length<15;i++)if(dt(i)>dt(i0)&&hr(i)>=7&&hr(i)<=21)ix.push(i)}
  else{for(let i=i0;i<h.time.length&&i<i0+17;i++)if(dt(i)===dt(i0))ix.push(i)}
  if(!ix.length)ix.push(i0);
  const N=ix.length,L=ix.map((i,k)=>lvl(apT(h.temperature_2m[i],h.relative_humidity_2m[i],h.wind_speed_10m[i])));
  const segs=[{k:0,l:L[0]}];
  for(let k=1;k<N;k++){const cur=segs[segs.length-1].l;if(L[k]!==cur&&(k+1>=N||L[k+1]===L[k]))segs.push({k,l:L[k]})}
  const out=segs.slice(0,3).map((s,j)=>j===0?(tom?(pt?`Amanhã, veste ${nm[s.l]}.`:`Tomorrow, wear ${nm[s.l]}.`):(pt?`Agora veste ${nm[s.l]}.`:`Right now, wear ${nm[s.l]}.`))
    :(pt?`A partir das ${H(ix[s.k])}, passa para ${nm[s.l]}.`:`From ${H(ix[s.k])}, switch to ${nm[s.l]}.`));
  const ex=[],pp=k=>h.precipitation_probability[ix[k]]||0;
  let a=-1,b=-1;for(let k=0;k<N;k++){if(pp(k)>=50){if(a<0)a=k;b=k}else if(a>=0)break}
  if(a>=0){const e=H(ix[b]+1);ex.push(a===0&&!tom?(pt?`Leva guarda-chuva: deve chover até às ${e}.`:`Take an umbrella: rain is likely until ${e}.`)
                       :(pt?`Leva guarda-chuva entre as ${H(ix[a])} e as ${e}.`:`Take an umbrella from ${H(ix[a])} to ${e}.`))}
  const uv=data.daily.uv_index_max[tom?1:0]||0,sw=h.shortwave_radiation||[],day=dt(ix[0]);
  if(uv>=3&&sw.length){let mx=0;for(let i=0;i<h.time.length;i++)if(dt(i)===day)mx=Math.max(mx,sw[i]||0);
   let s=-1,e=-1;for(let i=0;i<h.time.length;i++){if(dt(i)!==day)continue;if((sw[i]||0)>=mx*.5&&h.is_day[i]){if(s<0)s=i;e=i}}
   if(s>=0&&e>=ix[0])ex.push(pt?`Protetor solar e óculos das ${H(Math.max(s,ix[0]))} às ${H(e+1)}.`:`Sunscreen and sunglasses ${H(Math.max(s,ix[0]))}–${H(e+1)}.`)}
  let wi=-1;for(let k=0;k<N;k++){const g=h.wind_gusts_10m?h.wind_gusts_10m[ix[k]]:h.wind_speed_10m[ix[k]];if(g>=50){wi=k;break}}
  if(wi>=0)ex.push(pt?`Leva um corta-vento: rajadas fortes por volta das ${H(ix[wi])}.`:`Bring a windproof layer: strong gusts around ${H(ix[wi])}.`);
  const tv=ix.map(i=>h.temperature_2m[i]);
  if(Math.max(...tv)>=28)ex.push(pt?'Leva água contigo.':'Carry water with you.');
  if(Math.min(...tv)<=2)ex.push(pt?'Cuidado com gelo no chão.':'Watch for ice underfoot.');
  if(!ex.length&&L[0]<=2)ex.push(pt?'Boa altura para um passeio.':'A good time for a walk.');
  return{text:out.concat(ex.slice(0,2)).join(' '),segs,ex}
 }

 /* ---------- o que o orbe diz quando lhe tocam ---------- */
 const CUR={en:['Octopuses have three hearts.','Honey found in ancient Egyptian tombs was still edible.','Bananas are berries, but strawberries are not.','Wombat droppings are cube-shaped.','Sharks are older than trees.','The Eiffel Tower grows by up to 15 cm in summer, because metal expands in the heat.','A day on Venus is longer than its year.','Sound travels about four times faster in water than in air.','A group of flamingos is called a flamboyance.','Hummingbirds are the only birds that can fly backwards.','The shortest war in history, in 1896, lasted around 40 minutes.','I am just a sphere with opinions about jackets.'],
  pt:['Os polvos têm três corações.','O mel encontrado em túmulos do antigo Egito ainda estava comestível.','As bananas são bagas, mas os morangos não.','O cocó do wombat tem forma de cubo.','Os tubarões são mais antigos do que as árvores.','A Torre Eiffel cresce até 15 cm no verão, porque o metal dilata com o calor.','Em Vénus, um dia é mais longo do que um ano.','O som viaja cerca de quatro vezes mais depressa na água do que no ar.','Um grupo de flamingos chama-se «flamboyance».','Os colibris são as únicas aves que voam para trás.','A guerra mais curta da história, em 1896, durou cerca de 40 minutos.','Sou só uma esfera com opiniões sobre casacos.']};
 const MAD={en:['Hey! Stop poking me!','I am getting red in the face here…','Last warning. I mean it.','GRRR! Hands off the orb!','Do I look like a button to you?!','That is it. I am boiling.'],
  pt:['Eh! Pára de me picar!','Estou a ficar vermelho…','Último aviso. Estou a falar a sério.','GRRR! Larga o orbe!','Parece-te que sou um botão?!','Já chega. Estou a ferver.']};
 const CALM={en:'Okay… I am calm now. Please do not push it.',pt:'Pronto… já passou. Mas não abuses.'};
 function weatherLines(){
  const c=data.current,h=data.hourly,d=data.daily,i0=idx0(),pt=P(),L=[];
  const hr=i=>+h.time[i].slice(11,13),H=i=>pt?hr(i)+'h':hr(i)+':00';
  L.push(pt?`Estão ${T(c.temperature_2m)}° agora, com sensação de ${T(c.apparent_temperature)}°.`:`It is ${T(c.temperature_2m)}° now and feels like ${T(c.apparent_temperature)}°.`);
  const pr=h.precipitation_probability.slice(i0,i0+12),m=Math.max(...pr),at=pr.indexOf(m);
  L.push(m<20?(pt?'Sem chuva à vista nas próximas horas.':'No rain in sight for the next few hours.'):(pt?`${m}% de probabilidade de chuva por volta das ${H(i0+at)}.`:`${m}% chance of rain around ${H(i0+at)}.`));
  const ss=new Date(d.sunset[0]),now=new Date(c.time);
  if(ss>now){const mn=Math.round((ss-now)/6e4);L.push(pt?`Faltam ${Math.floor(mn/60)}h${String(mn%60).padStart(2,'0')} para o pôr do sol, às ${d.sunset[0].slice(11,16)}.`:`${Math.floor(mn/60)}h${String(mn%60).padStart(2,'0')} until sunset at ${d.sunset[0].slice(11,16)}.`)}
  else L.push(pt?`O sol nasce amanhã às ${d.sunrise[1].slice(11,16)}.`:`The Sun rises tomorrow at ${d.sunrise[1].slice(11,16)}.`);
  L.push(pt?`O índice UV máximo de hoje é ${Math.round(d.uv_index_max[0])}.`:`Today’s peak UV index is ${Math.round(d.uv_index_max[0])}.`);
  L.push(pt?`Vento a ${W(c.wind_speed_10m)}.`:`Wind at ${W(c.wind_speed_10m)}.`);
  return L
 }

 /* ---------- paletas ---------- */
 const hsl=(h,s,l)=>{h=((h%360)+360)%360;s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return[f(0)*255,f(8)*255,f(4)*255]};
 const palHue=h=>[hsl(h,82,60),hsl(h+38,86,52),hsl(h-34,92,74)];
 function basePal(){
  const c=data.current,t=c.temperature_2m;
  const h=!c.is_day?250:t<=6?212:t<=14?192:t<=21?160:t<=28?36:14;
  return{hue:h,pal:palHue(h)}
 }
 const RED=[[255,52,36],[168,6,10],[255,128,64]];
 const mixC=(a,b,k)=>a.map((v,i)=>v+(b[i]-v)*k);
 const ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;

 /* ---------- motor 3D: esfera iluminada com textura em rodopio ---------- */
 function engine(cv){
  const S=cv.width,ctx=cv.getContext('2d'),img=ctx.createImageData(S,S),D=img.data,R=S/2;
  const idx=[],NX=[],NY=[],NZ=[],DIF=[],SPEC=[],RIM=[],ALP=[];
  let Lx=-.46,Ly=-.58,Lz=.67;const ln=Math.hypot(Lx,Ly,Lz);Lx/=ln;Ly/=ln;Lz/=ln;
  let hx=Lx,hy=Ly,hz=Lz+1;const hn=Math.hypot(hx,hy,hz);hx/=hn;hy/=hn;hz/=hn;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
   const nx=(x+.5-R)/R,ny=(y+.5-R)/R,r2=nx*nx+ny*ny;if(r2>1)continue;
   const nz=Math.sqrt(1-r2),r=Math.sqrt(r2);
   idx.push((y*S+x)*4);NX.push(nx);NY.push(ny);NZ.push(nz);
   DIF.push(.38+.82*Math.max(0,nx*Lx+ny*Ly+nz*Lz));
   SPEC.push(Math.pow(Math.max(0,nx*hx+ny*hy+nz*hz),56));
   RIM.push(Math.pow(1-nz,2.4));
   ALP.push(clamp((1-r)*R/1.4,0,1));
  }
  const n=idx.length,LR=new Float32Array(256),LG=new Float32Array(256),LB=new Float32Array(256);
  const E={pal:basePal().pal,from:null,to:null,t0:0,dur:1,mode:'idle',think:0,sw:1,spd:.35,rot:0,alive:true,vis:true,last:0,glow:0};
  E.set=(pal,ms)=>{E.from=E.cur||E.pal;E.to=pal;E.t0=performance.now();E.dur=Math.max(1,ms||800)};
  E.cur=E.pal;
  function lut(tt){
   const p=E.cur,k=E.think;
   for(let i=0;i<256;i++){
    const f=i/255,a=f<.5?mixC(p[0],p[1],f*2):mixC(p[1],p[2],(f-.5)*2);
    let c=a;if(k>.01){const rb=hsl(f*320+tt*130,88,60);c=mixC(a,rb,k*.9)}
    LR[i]=c[0];LG[i]=c[1];LB[i]=c[2];
   }
  }
  function draw(ts){
   const tt=ts/1000;
   if(E.to){const k=clamp((ts-E.t0)/E.dur,0,1),e=ease(k);E.cur=E.from.map((c,i)=>mixC(c,E.to[i],e));if(k>=1){E.pal=E.to;E.cur=E.to;E.to=null}}
   const tgtT=E.mode==='think'?1:0,tgtS=E.mode==='think'?3.9:E.mode==='angry'?2.4:1,tgtV=E.mode==='think'?1.9:E.mode==='angry'?2.8:.34;
   E.think+=(tgtT-E.think)*.12;E.sw+=(tgtS-E.sw)*.1;E.spd+=(tgtV-E.spd)*.1;
   E.rot+=E.spd*(1/30);
   lut(tt);
   const ca=Math.cos(E.rot),sa=Math.sin(E.rot),sw=E.sw,rimC=E.cur[2];
   for(let k=0;k<n;k++){
    const nx=NX[k],ny=NY[k],nz=NZ[k],px=nx*ca+nz*sa,pz=-nx*sa+nz*ca;
    const w=Math.sin(px*3.2+tt*.9+Math.sin(ny*2.6+tt*.6)*sw)+Math.sin(ny*3.6-tt*.7+Math.sin(pz*3.1+tt*.8)*sw)+Math.sin((pz+px)*2.7+tt*.5+Math.sin(px*2.1-ny*1.7)*sw*.5);
    const li=clamp(((w/3+1)/2*255)|0,0,255),d=DIF[k],rm=RIM[k]*.55,sp=SPEC[k]*190,o=idx[k];
    D[o]=clamp(LR[li]*d+rimC[0]*rm+sp,0,255);D[o+1]=clamp(LG[li]*d+rimC[1]*rm+sp,0,255);D[o+2]=clamp(LB[li]*d+rimC[2]*rm+sp,0,255);D[o+3]=ALP[k]*255;
   }
   ctx.putImageData(img,0,0);
   if(ts-E.glow>120){E.glow=ts;const c=E.cur[0],host=cv.closest('.orb');if(host){host.style.setProperty('--oc',`rgb(${c.map(Math.round)})`);host.style.setProperty('--og',`rgba(${c.map(Math.round)},.5)`)}}
  }
  E.frame=ts=>{
   if(!E.alive)return;
   if(!document.body.contains(cv)){E.alive=false;return}
   E.raf=requestAnimationFrame(E.frame);
   if(document.hidden||!E.vis)return;
   if(ts-E.last<33)return;E.last=ts;draw(ts);
  };
  E.once=()=>draw(performance.now());
  E.stop=()=>{E.alive=false;cancelAnimationFrame(E.raf)};
  if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>{E.vis=es[0].isIntersecting});io.observe(cv)}
  return E
 }

 /* ---------- estado e interação ---------- */
 let eng=null,clicks=[],bag=[],thinking=false,angry=false,calmT=0,thinkT=0,hue=0,madN=0,lastTxt='',boomS=false,boomT=0;
 function say(txt,mad){
  const b=$('#orbB'),p=$('#orbT');if(!b||!p)return;
  p.textContent=txt;b.classList.toggle('mad',!!mad);b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');lastTxt=txt
 }
 function dots(){const p=$('#orbT');if(p)p.innerHTML='<span class="orb-dots" aria-label="…"><i></i><i></i><i></i></span>'}
 function nextLine(){
  if(!bag.length){bag=[plan().text,...weatherLines(),...CUR[P()?'pt':'en'],...(window.SkyXmas?window.SkyXmas.lines(P()?'pt':'en'):[])];for(let i=bag.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[bag[i],bag[j]]=[bag[j],bag[i]]}}
  let s=bag.pop();if(s===lastTxt&&bag.length)s=bag.pop();return s
 }
 function fx(cls,ms){const o=$('#orb');if(!o)return;o.classList.remove(cls);void o.offsetWidth;o.classList.add(cls);setTimeout(()=>o&&o.classList.remove(cls),ms)}
 function think(){
  if(thinking)return;thinking=true;
  const base=basePal().hue;hue=(hue||base)+137.5;
  eng.mode='think';fx('ping',900);fx('squish',520);dots();
  if(reduced()){eng.once()}
  clearTimeout(thinkT);
  thinkT=setTimeout(()=>{
   eng.set(palHue(hue),900);eng.mode='idle';thinking=false;
   if(!angry){say(nextLine());fx('ping',900)}
  },1000+Math.random()*500);
 }
 function shards(o,inward){
  o.querySelectorAll('.orb-sh').forEach(n=>n.remove());
  const N=inward?14:28;
  for(let i=0;i<N;i++){
   const s=document.createElement('i'),a=Math.PI*2*i/N+Math.random()*.3,d=inward?55+Math.random()*35:70+Math.random()*110,z=inward?4+Math.random()*5:6+Math.random()*10;
   s.className='orb-sh'+(inward?' in':'');
   s.style.cssText=`--dx:${Math.cos(a)*d|0}px;--dy:${Math.sin(a)*d|0}px;--r:${Math.random()*720-360|0}deg;--s:${z|0}px;animation-delay:${Math.random()*70|0}ms`;
   o.appendChild(s)
  }
  if(!inward){const w=document.createElement('i');w.className='orb-wave';o.appendChild(w)}
 }
 function explode(){      // passou o limite da paciência: incha, rebenta e renasce
  if(boomS)return;boomS=true;clearTimeout(calmT);clearTimeout(thinkT);thinking=false;
  const o=$('#orb'),pt=P(),fast=reduced();if(!o){boomS=false;return}
  say(pt?'Avisei-te…':'I warned you…',true);
  o.classList.add('swell');
  boomT=setTimeout(()=>{
   o.classList.remove('swell','angry');o.classList.add('boom');
   if(!fast)shards(o,false);
   say(pt?'BUM!':'BOOM!',true);
   boomT=setTimeout(()=>{
    if(!fast)shards(o,true);
    boomT=setTimeout(respawn,fast?250:650)
   },fast?900:1500)
  },fast?400:900)
 }
 function respawn(){
  const o=$('#orb'),pt=P();
  angry=false;clicks=[];madN=0;hue=basePal().hue;
  if(eng){eng.mode='idle';eng.set(palHue(hue),1);if(reduced())eng.once()}
  if(o){o.querySelectorAll('.orb-sh,.orb-wave').forEach(n=>n.remove());o.classList.remove('boom','swell','angry');o.classList.add('respawn');fx('ping',900)}
  say(pt?'Voltei! Sê simpático desta vez.':'I am back! Be nice this time.');
  boomT=setTimeout(()=>{const x=$('#orb');if(x)x.classList.remove('respawn');boomS=false},1000)
 }
 function goAngry(){
  if(boomS)return;
  if(angry&&madN>=MAD[P()?'pt':'en'].length)return explode();
  if(!angry){angry=true;clearTimeout(thinkT);thinking=false;eng.mode='angry';eng.set(RED,500);$('#orb').classList.add('angry');madN=0}
  const L=MAD[P()?'pt':'en'];say(L[Math.min(madN,L.length-1)],true);madN++;fx('ping',700);
  clearTimeout(calmT);calmT=setTimeout(calm,6500);
 }
 function calm(){
  angry=false;clicks=[];madN=0;const o=$('#orb');if(o)o.classList.remove('angry');
  eng.mode='idle';eng.set(palHue(hue||basePal().hue),1400);say(CALM[P()?'pt':'en']);
 }
 function onClick(){
  if(boomS)return;
  const now=Date.now();clicks=clicks.filter(t=>now-t<4000);clicks.push(now);
  if(angry||clicks.length>=6)return goAngry();
  think();
 }
 function mount(){
  const cv=$('#orbCv');if(!cv)return;
  if(eng)eng.stop();
  clicks=[];bag=[];thinking=false;angry=false;clearTimeout(calmT);clearTimeout(thinkT);clearTimeout(boomT);boomS=false;hue=0;madN=0;lastTxt='';
  eng=engine(cv);hue=basePal().hue;
  const o=$('#orb');if(o)o.onclick=onClick;
  eng.once();if(!reduced())requestAnimationFrame(eng.frame);
 }
 function html(){
  const a=plan(),pt=P();
  return`<section class="card orbcard" id="orbCard" aria-label="${pt?'Conselheiro de roupa':'Clothing advisor'}">
 <button type="button" class="orb" id="orb" aria-label="${pt?'Conselheiro de roupa. Toca para ouvir outra coisa.':'Clothing advisor. Tap to hear something else.'}"><span class="orb-in"><canvas id="orbCv" width="168" height="168"></canvas></span><i class="orb-ring"></i></button>
 <div class="orb-b pop" id="orbB" role="status" aria-live="polite"><p id="orbT">${esc(a.text)}</p></div></section>`
 }
 window.SkyOrb={html,mount};
 /* mount() para e recria o motor 3D do orbe (rAF, canvas, paleta). Antes
    corria em cada setTab('today') — incluindo o re-tap no separador "Agora"
    que o handler da nav móvel faz para fazer scroll-to-top, e as várias
    chamadas a setTab() dentro de render(). Cada rebuild reiniciava o rAF
    e reaquecia o orbe sem necessidade. Agora o motor só é reconstruído
    quando o `data.current.time` muda (ou seja, quando chega uma previsão
    nova), que é a única coisa que o plan() precisa de recalcular. */
 let _orbCv = null;
 const _st = setTab;
 setTab = function (k) {
   _st(k);
   if (k !== 'today') return;
   const cv = $('#orbCv');
   if (!cv || cv === _orbCv) return;   // mesmo canvas → motor já ligado
   _orbCv = cv;
   mount();
 };
})();
