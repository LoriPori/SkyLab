/* Skylab · globe.js — landing globe · load order 16/28 (classic script, shared global scope) */
/* ============ landing globe ============ */
const GLOBE_JS=['https://cdn.jsdelivr.net/npm/d3-array@3.2.4/dist/d3-array.min.js','https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/dist/d3-geo.min.js','https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js'];
let globeP=null,landGeo=null;
const addScript=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('script '+src));document.head.appendChild(s)});
function globeLoad(){
 return globeP||(globeP=(async()=>{
  for(const s of GLOBE_JS)await addScript(s);            // por ordem: o d3-geo precisa do d3-array
  const t=await fetchJSON('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json');
  landGeo=topojson.feature(t,t.objects.land);
 })().catch(e=>{globeP=null;throw e}));
}
/* onde estás: GPS se já deste permissão; senão cidade deduzida do fuso horário */
async function guessHome(){
 try{
  if(navigator.permissions&&navigator.geolocation){
   const st=await navigator.permissions.query({name:'geolocation'});
   if(st.state=='granted'){
    const p=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:6000,maximumAge:6e5}));
    const lat=+p.coords.latitude.toFixed(3),lon=+p.coords.longitude.toFixed(3),r=await reverse(lat,lon);
    return{lat,lon,name:r.name,sub:r.sub};
   }
  }
 }catch(e){}
 try{
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
  if(tz.includes('/')){const r=await geo(tz.split('/').pop().replace(/_/g,' '),1);if(r[0])return{...r[0],approx:true}}
 }catch(e){}
 return null;
}
function subsolar(d=new Date()){                          // ponto onde o Sol está a pino
 const n=(d-Date.UTC(d.getUTCFullYear(),0,0))/864e5,h=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
 return[(12-h)*15,-23.44*Math.cos(2*Math.PI/365*(n+10))];
}
async function globeStart(){
 const homeP=guessHome();
 try{await globeLoad()}catch(e){console.warn('[globe]',e.message);return}   // sem rede: fica o ícone
 const cv=$('#globe'),wrap=$('#gwrap'),pinEl=$('#gpin');
 if(!cv||!wrap)return;                                    // saiu da landing entretanto
 wrap.classList.add('ready');
 const ctx=cv.getContext('2d'),proj=d3.geoOrthographic().clipAngle(90).precision(.5),path=d3.geoPath(proj,ctx),
  grat=d3.geoGraticule10(),circ=d3.geoCircle(),FONT='600 13px "Schibsted Grotesk",system-ui,sans-serif';
 let rot=[Math.random()*360-180,-15],base=rot.slice(),fly=null,state='spin',home=null,drag=null,vel=0,backAt=0,
  hover=-1,W=0,dpr=1,last=performance.now(),holdT=0,zoomK=1,pts=[];
 const ease=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
 const vis=(lon,lat)=>d3.geoDistance([lon,lat],[-rot[0],-rot[1]])<1.45;

 function flyTo(lon,lat){
  const to=[-lon,Math.max(-70,Math.min(70,-lat*.85))];
  base=to.slice();
  if(still){rot=to.slice();state='hold';holdT=performance.now();return}
  fly={t0:performance.now(),dur:2800,from:rot.slice(),dl:(((to[0]-rot[0]+180)%360)+360)%360-180,dp:to[1]-rot[1]};
  state='fly';
 }
 function step(now,dt){
  if(state=='fly'){
   const k=Math.min(1,(now-fly.t0)/fly.dur),e=ease(k);
   rot=[fly.from[0]+fly.dl*e,fly.from[1]+fly.dp*e];zoomK=1-.08*Math.sin(Math.PI*e);   // afasta a meio do voo
   if(k>=1){state='hold';holdT=now;fly=null;zoomK=1}
  }else if(state=='hold'){
   if(!still){const t=now-holdT,a=Math.min(1,t/1500);rot=[base[0]+Math.sin(t/2600)*3.5*a,base[1]+Math.sin(t/3300)*1.4*a]}
  }else if(state=='coast'){
   rot[0]+=vel*dt;vel*=Math.pow(.94,dt/16);if(Math.abs(vel)<.004)state='spin';
  }else if(state=='spin'&&!still)rot[0]+=dt*.005;
  if((state=='spin'||state=='coast')&&home&&backAt&&now>backAt){backAt=0;flyTo(home.lon,home.lat)}   // volta a casa
 }
 function draw(now){
  const w=wrap.clientWidth;if(!w)return;
  if(w!==W){W=w;dpr=Math.min(devicePixelRatio||1,2);cv.width=cv.height=Math.round(W*dpr)}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,W);
  const c=W/2,R=W/2*.86*zoomK;
  proj.translate([c,c]).scale(R).rotate([rot[0],rot[1],0]);
  let g=ctx.createRadialGradient(c,c,R*.97,c,c,R*1.17);                     // atmosfera
  g.addColorStop(0,'rgba(200,235,255,.6)');g.addColorStop(1,'rgba(200,235,255,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(c,c,R*1.17,0,7);ctx.fill();
  g=ctx.createRadialGradient(c-R*.35,c-R*.4,R*.1,c,c,R);                    // oceano
  g.addColorStop(0,'#5fbdf3');g.addColorStop(.6,'#2b86c8');g.addColorStop(1,'#14558f');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(c,c,R,0,7);ctx.fill();
  ctx.lineWidth=.7;ctx.strokeStyle='rgba(255,255,255,.14)';ctx.beginPath();path(grat);ctx.stroke();
  ctx.beginPath();path(landGeo);ctx.fillStyle='#e3f4e6';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=.6;ctx.stroke();
  const ss=subsolar(),anti=[ss[0]+180,-ss[1]];                              // noite em tempo real
  for(const[r,a]of[[100,.1],[90,.24]]){ctx.beginPath();path(circ.center(anti).radius(r)());ctx.fillStyle=`rgba(4,16,44,${a})`;ctx.fill()}
  ctx.save();ctx.beginPath();ctx.arc(c,c,R,0,7);ctx.clip();                 // sombra nas bordas + brilho
  g=ctx.createRadialGradient(c,c,R*.55,c,c,R);g.addColorStop(0,'rgba(0,25,60,0)');g.addColorStop(1,'rgba(0,25,60,.4)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,W);
  g=ctx.createRadialGradient(c-R*.4,c-R*.45,0,c-R*.4,c-R*.45,R*.75);g.addColorStop(0,'rgba(255,255,255,.3)');g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,W);ctx.restore();

  pts=CITIES.map(ct=>vis(ct[3],ct[2])?proj([ct[3],ct[2]]):null);           // cidades clicáveis
  pts.forEach((p,i)=>{if(!p)return;const h=i==hover;
   ctx.beginPath();ctx.arc(p[0],p[1],h?5.5:3,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='rgba(20,49,79,.35)';ctx.stroke()});
  if(hover>=0&&pts[hover]){
   const p=pts[hover],t=CITIES[hover][0];ctx.font=FONT;const tw=ctx.measureText(t).width+20;
   ctx.fillStyle='rgba(255,255,255,.95)';ctx.beginPath();ctx.roundRect(p[0]-tw/2,p[1]-36,tw,24,12);ctx.fill();
   ctx.fillStyle='#14314f';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,p[0],p[1]-24);
  }
  if(home){                                                                   // marcador avermelhado
   const p=proj([home.lon,home.lat]),on=!!p&&vis(home.lon,home.lat);
   if(on){
    if(!still){const ph=(now/1700)%1;for(const o of[0,.5]){const k=(ph+o)%1;
     ctx.beginPath();ctx.arc(p[0],p[1],5+k*24,0,7);ctx.strokeStyle=`rgba(255,82,70,${.7*(1-k)})`;ctx.lineWidth=2;ctx.stroke()}}
    g=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],18);g.addColorStop(0,'rgba(255,82,70,.6)');g.addColorStop(1,'rgba(255,82,70,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(p[0],p[1],18,0,7);ctx.fill();
    ctx.beginPath();ctx.arc(p[0],p[1],6,0,7);ctx.fillStyle='#ff5246';ctx.fill();ctx.lineWidth=2.4;ctx.strokeStyle='#fff';ctx.stroke();
    pinEl.style.transform=`translate(${p[0]}px,${p[1]}px) translate(-50%,-100%) translateY(-14px)`;
   }
   pinEl.classList.toggle('off',!on);
  }
 }
 function loop(now){
  if(!cv.isConnected)return;                                                  // saiu da landing: pára
  if(document.hidden||document.documentElement.classList.contains('hlock')||document.documentElement.classList.contains('pv-open')){last=now;requestAnimationFrame(loop);return}
  const dt=Math.min(64,now-last);last=now;step(now,dt);draw(now);requestAnimationFrame(loop);
 }
 const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
 cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);const[x,y]=pos(e);drag={x,y,sx:x,sy:y,t:performance.now(),moved:false}});
 cv.addEventListener('pointermove',e=>{
  const[x,y]=pos(e);
  if(drag){
   if(!drag.moved&&Math.hypot(x-drag.sx,y-drag.sy)>5){drag.moved=true;state='drag';fly=null;zoomK=1;vel=0;backAt=0}
   if(drag.moved){
    const t=performance.now(),dtm=Math.max(8,t-drag.t),dx=x-drag.x,dy=y-drag.y;
    rot[0]+=dx*.4;rot[1]=Math.max(-75,Math.min(75,rot[1]-dy*.4));vel=dx*.4/dtm;
    drag.x=x;drag.y=y;drag.t=t;
   }
  }else{
   let best=-1,bd=144;pts.forEach((p,i)=>{if(!p)return;const d=(p[0]-x)**2+(p[1]-y)**2;if(d<bd){bd=d;best=i}});
   hover=best;cv.style.cursor=best>=0?'pointer':'';
  }
 });
 const end=()=>{
  if(!drag)return;const d=drag;drag=null;
  if(!d.moved){if(hover>=0){const c=CITIES[hover];show(c[2],c[3],c[0],c[1])}return}
  state=Math.abs(vel)>.01?'coast':'spin';backAt=performance.now()+6000;
 };
 cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
 cv.addEventListener('pointerleave',()=>{if(!drag)hover=-1});

 homeP.then(h=>{
  if(!h||!cv.isConnected)return;
  home=h;
  pinEl.innerHTML=`<span class="gpc"><small>${h.approx?'Near you':'You’re here'}</small><b></b></span>`;
  pinEl.querySelector('b').textContent=h.name;
  pinEl.title=h.approx?'Approximate, from your time zone. Use “Use my location” for the exact spot.':'Open the forecast for '+h.name;
  pinEl.hidden=false;pinEl.onclick=()=>show(h.lat,h.lon,h.name,h.sub);
  flyTo(h.lon,h.lat);ipmaUpdate(h);
 });
 requestAnimationFrame(loop);
}
