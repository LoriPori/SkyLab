/* Skylab · sky-fx.js — sky canvas particles + sun/moon orb · load order 17/28 (classic script, shared global scope) */
/* ============ sky canvas: rain, snow, stars, drifting clouds, motes, lightning ============ */
const fx=$('#fx'),cx=fx.getContext('2d');
let parts=[],splashes=[],shoot=null,mode='',flash=0;
function fxSize(){fx.width=innerWidth;fx.height=innerHeight}
addEventListener('resize',()=>{fxSize();fxSet(mode);moveInd()});
function fxSet(k){
 mode=k;const n={rain:170,storm:230,snow:130,night:110,clear:34,cloud:14,fog:12}[k]||0;
 const nn=IS_MOBILE?Math.ceil(n*.6):n;
 parts=Array.from({length:nn},()=>({x:Math.random()*fx.width,y:Math.random()*fx.height,z:Math.random()*.8+.4,t:Math.random()*6}));
 splashes=[];tune(k);
}
let fxLast=0;
function fxBusy(){const h=document.documentElement.classList;return document.hidden||h.contains('hlock')||h.contains('pv-open')}
function fxLoop(t){
 if(fxBusy()){requestAnimationFrame(fxLoop);return}              // nada a desenhar por baixo de um painel ou com o separador escondido
 if(IS_MOBILE&&t-fxLast<30){requestAnimationFrame(fxLoop);return}  // ~33 fps no telemóvel: metade do trabalho, sem diferença visível
 fxLast=t;
 cx.clearRect(0,0,fx.width,fx.height);
 if(mode=='rain'||mode=='storm'){
  cx.strokeStyle='rgba(235,245,255,.55)';cx.lineWidth=1;cx.beginPath();
  for(const p of parts){cx.moveTo(p.x,p.y);cx.lineTo(p.x-2*p.z,p.y+14*p.z)}
  cx.stroke();
  for(const p of parts){p.y+=17*p.z;p.x-=2*p.z;
   if(p.y>fx.height*(.93+p.t/100)){if(splashes.length<60&&Math.random()<.5)splashes.push({x:p.x,y:p.y,r:1,a:.5});p.y=-20;p.x=Math.random()*fx.width}}
 }
 for(const p of (mode=='rain'||mode=='storm')?[]:parts){
  if(mode=='snow'){
   cx.fillStyle='rgba(255,255,255,.92)';cx.beginPath();cx.arc(p.x,p.y,1.5*p.z+.5,0,7);cx.fill();
   p.y+=.8*p.z;p.x+=Math.sin(t/900+p.t)*.5;if(p.y>fx.height+10){p.y=-10;p.x=Math.random()*fx.width}
  }else if(mode=='night'){
   cx.fillStyle=`rgba(255,255,255,${.3+.65*Math.abs(Math.sin(t/1300+p.t))})`;cx.beginPath();cx.arc(p.x,p.y,p.z*1.2,0,7);cx.fill();
  }else if(mode=='clear'){
   cx.fillStyle=`rgba(255,255,255,${.12+.1*Math.sin(t/1500+p.t)})`;cx.beginPath();cx.arc(p.x,p.y,p.z*(8+p.t*3),0,7);cx.fill();
   p.y-=.18*p.z;p.x+=Math.sin(t/3000+p.t)*.2;if(p.y<-60){p.y=fx.height+60;p.x=Math.random()*fx.width}
  }else{
   const r=p.z*(mode=='fog'?170:130),g=cx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
   g.addColorStop(0,`rgba(255,255,255,${mode=='fog'?.22:.3})`);g.addColorStop(1,'rgba(255,255,255,0)');
   cx.fillStyle=g;cx.beginPath();cx.arc(p.x,p.y,r,0,7);cx.fill();
   p.x+=.25*p.z;if(p.x>fx.width+r)p.x=-r;
  }
 }
 for(let i=splashes.length-1;i>=0;i--){
  const s=splashes[i];cx.strokeStyle=`rgba(235,245,255,${s.a})`;cx.lineWidth=1;cx.beginPath();cx.ellipse(s.x,s.y,s.r*2.4,s.r*.8,0,0,7);cx.stroke();
  s.r+=.5;s.a-=.035;if(s.a<=0)splashes.splice(i,1);
 }
 if(mode=='night'){
  if(!shoot&&Math.random()<.004)shoot={x:Math.random()*fx.width*.8,y:Math.random()*fx.height*.35,vx:9,vy:4,l:1};
  if(shoot){cx.strokeStyle=`rgba(255,255,255,${shoot.l})`;cx.lineWidth=2;cx.beginPath();cx.moveTo(shoot.x,shoot.y);cx.lineTo(shoot.x-shoot.vx*7,shoot.y-shoot.vy*7);cx.stroke();shoot.x+=shoot.vx;shoot.y+=shoot.vy;shoot.l-=.03;if(shoot.l<=0)shoot=null}
 }
 if(mode=='storm'&&Math.random()<.004)flash=1;
 if(flash>.02){cx.fillStyle=`rgba(255,255,255,${flash*.3})`;cx.fillRect(0,0,fx.width,fx.height);flash*=.86}
 requestAnimationFrame(fxLoop);
}
fxSize();if(!still)requestAnimationFrame(fxLoop);

/* ============ sun / moon orb follows the time ============ */
const orb=$('#orb');
function setOrb(cls,l,t,o){if(!orb)return;orb.className=cls;orb.style.left=l+'vw';orb.style.top=t+'vh';orb.style.opacity=o}
function orbAt(ts,k){
 const d=data.daily,t=new Date(ts),i=Math.max(0,d.time.indexOf(ts.slice(0,10)));
 const sr=new Date(d.sunrise[i]),ss=new Date(d.sunset[i]),sun=t>=sr&&t<=ss;let f;
 if(sun)f=(t-sr)/(ss-sr);
 else{const a=t<sr?new Date(ss-864e5):ss,b=t<sr?sr:new Date(sr.getTime()+864e5);f=Math.min(1,Math.max(0,(t-a)/(b-a)))}
 setOrb(sun?'sun':'moon',6+f*88,78-Math.sin(Math.PI*f)*62,(k=='clear'||k=='night')?.95:.35);
}
