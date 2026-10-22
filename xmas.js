/* Skylab · xmas.js — tema de Natal. Só é carregado entre 1 de dezembro e 1 de janeiro (early.js decide).
   Não mexe no resto da app: acrescenta neve, luzes, faixa de frases, botão do Pai Natal, neve no globo e o chão de neve do rodapé. */
(function(){
 if(window.SkyXmas)return;
 var doc=document,html=doc.documentElement,mobile=function(){return html.classList.contains('is-mobile')};
 /* relógio (falso, se ?xmasdate=… estiver ativo) — serve para testar contagens e o Pai Natal fora de época */
 var SKEW=0;try{var fd=sessionStorage.getItem('xmasdate');if(fd&&!isNaN(Date.parse(fd)))SKEW=Date.parse(fd)-Date.now()}catch(e){}
 var NOW=function(){return Date.now()+SKEW};
 var still=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 function lang(){try{if(typeof LANG!=='undefined')return LANG}catch(e){}try{var l=JSON.parse(localStorage.getItem('lang'));if(l)return l}catch(e){}return(navigator.language||'').toLowerCase().indexOf('pt')===0?'pt':'en'}
 var T2=function(en,pt){return lang()==='pt'?pt:en};
 var HAT='<svg class="xm-ic" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 23C5 13 11 5 22 5c-1 3 0 6 3 8l2 10z" fill="#d6303a"/><path d="M5 22h22a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6z" fill="#fff" stroke="#c9d8e6" stroke-width="1"/><circle cx="24.500" cy="6" r="3.800" fill="#fff" stroke="#c9d8e6" stroke-width="1"/></svg>';
 function el(tag,cls,h){var e=doc.createElement(tag);if(cls)e.className=cls;if(h!=null)e.innerHTML=h;return e}

 /* ---------- frases ---------- */
 var LINES={en:['Cold outside? A perfect excuse for hot chocolate.','Somewhere, a very punctual sleigh is checking the forecast.','Every snowflake is unique. Santa checked.','Wrap up warm: the elves say it is mitten weather.','Cookies for Santa, carrots for the reindeer.','Snow muffles sound, which is why the world feels so quiet today.','North Pole forecast: festive, with a high chance of cheer.','Hanging lights outside? Check the wind first.','The first commercial Christmas card appeared in London in 1843.','Rudolph reports a 100% chance of a guiding light tonight.','Merry Christmas from all of us at Skylab!'],
  pt:['Frio lá fora? A desculpa perfeita para um chocolate quente.','Algures, um trenó muito pontual está a ver a previsão.','Cada floco de neve é único. O Pai Natal já confirmou.','Agasalha-te: os duendes dizem que é tempo de luvas.','Bolachas para o Pai Natal, cenouras para as renas.','A neve abafa o som, e é por isso que o mundo parece tão calmo hoje.','Previsão do Polo Norte: festiva, com grande probabilidade de alegria.','Vais pôr luzes na rua? Vê primeiro como está o vento.','O primeiro cartão de Natal comercial surgiu em Londres, em 1843.','O Rudolfo garante 100% de probabilidade de luz-guia esta noite.','Feliz Natal de toda a equipa do Skylab!']};
 function countdown(){
  var n=new Date(NOW()),y=n.getFullYear(),m=n.getMonth(),d=n.getDate(),pt=lang()==='pt';
  if(m===0&&d===1)return pt?'Feliz Ano Novo '+y+'!':'Happy New Year '+y+'!';
  if(m===11&&d===31)return pt?'Último dia do ano. Boas entradas!':'Last day of the year. Happy new year!';
  if(m===11&&d===25)return pt?'Feliz Natal!':'Merry Christmas!';
  if(m===11&&d===24)return pt?'Véspera de Natal: o Pai Natal parte esta noite!':'Christmas Eve: Santa takes off tonight!';
  if(m===11&&d>25){var k=Math.round((new Date(y+1,0,1)-new Date(y,m,d))/864e5);return pt?'Faltam '+k+' dias para '+(y+1):k+' days until '+(y+1)}
  var k2=Math.round((new Date(y,11,25)-new Date(y,m,d))/864e5);return pt?'Faltam '+k2+' dias para o Natal':k2+' days until Christmas';
 }
 var li=Math.floor(Math.random()*11);
 function lines(l){return LINES[l||lang()].slice()}

 /* ---------- neve (ecrã inteiro + globo da página inicial) ---------- */
 var cv,cx,flakes=[],W=0,H=0,gcv=null,gfl=[],last=0;
 function mk(w,h,top){return{x:Math.random()*w,y:top?-8:Math.random()*h,r:.8+Math.random()*2.4,v:18+Math.random()*34,p:Math.random()*6.28,s:.4+Math.random()*.9}}
 function resize(){
  if(!cv)return;var dpr=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0);
  var n=still?0:(mobile()?55:130);while(flakes.length<n)flakes.push(mk(W,H));flakes.length=n;
 }
 function paintFlakes(c,arr,w,h,dt,t,clip){
  for(var i=0;i<arr.length;i++){var f=arr[i];f.y+=f.v*dt*(clip?.55:1);f.x+=Math.sin(t*.9+f.p)*f.s*22*dt;
   if(f.y>h+6){arr[i]=mk(w,h,true);f=arr[i]}if(f.x<-6)f.x=w+6;if(f.x>w+6)f.x=-6;
   if(clip){var dx=f.x-w/2,dy=f.y-h/2;if(dx*dx+dy*dy>w*w/4)continue}
   c.globalAlpha=.55+f.r/6;c.beginPath();c.arc(f.x,f.y,f.r,0,6.283);c.fill()}
  c.globalAlpha=1;
 }
 function loop(ts){
  requestAnimationFrame(loop);
  if(doc.hidden||ts-last<33)return;var dt=Math.min(.1,(ts-last)/1000);last=ts;var t=ts/1000;
  cx.clearRect(0,0,W,H);cx.fillStyle='#fff';paintFlakes(cx,flakes,W,H,dt,t,false);
  var g=doc.getElementById('gwrap');
  if(g){
   if(!gcv||!g.contains(gcv)){gcv=el('canvas','xm-gs');gcv.setAttribute('aria-hidden','true');g.appendChild(gcv);gfl=[]}
   var r=g.getBoundingClientRect(),s=Math.round(r.width);
   if(s>20){if(gcv.width!==s){gcv.width=s;gcv.height=s;gfl=[];for(var i=0;i<(mobile()?26:42);i++)gfl.push(mk(s,s))}
    var c=gcv.getContext('2d');c.clearRect(0,0,s,s);
    var gr=c.createRadialGradient(s*.5,-s*.1,s*.05,s*.5,s*.1,s*.62);gr.addColorStop(0,'rgba(255,255,255,.85)');gr.addColorStop(.55,'rgba(255,255,255,.25)');gr.addColorStop(1,'rgba(255,255,255,0)');   // calote de neve no topo
    c.save();c.beginPath();c.arc(s/2,s/2,s/2,0,6.283);c.clip();c.fillStyle=gr;c.fillRect(0,0,s,s);c.fillStyle='#fff';paintFlakes(c,gfl,s,s,dt,t,true);c.restore()}
  }else gcv=null;
 }
 function startSnow(){
  cv=el('canvas');cv.id='xm-snow';cv.setAttribute('aria-hidden','true');doc.body.appendChild(cv);cx=cv.getContext('2d');
  resize();addEventListener('resize',resize);if(!still)requestAnimationFrame(loop);
 }

 /* ---------- personagens (SVG) ---------- */
 var SNOWMAN='<svg class="SZ" viewBox="0 0 60 100" aria-hidden="true"><circle cx="30" cy="72" r="24" fill="#fff" stroke="#c9dff0" stroke-width="1.5"/><circle cx="30" cy="42" r="17" fill="#fff" stroke="#c9dff0" stroke-width="1.5"/><circle cx="30" cy="20" r="13" fill="#fff" stroke="#c9dff0" stroke-width="1.5"/><path d="M14 40L2 29M46 40L58 29M8 33l-4-5M52 33l4-5" stroke="#6b4a2b" stroke-width="2.4" stroke-linecap="round"/><rect x="19" y="3" width="22" height="9" rx="1.5" fill="#26303b"/><rect x="15" y="10" width="30" height="4" rx="2" fill="#26303b"/><rect x="19" y="8" width="22" height="3" fill="HC"/><path d="M30 20L47 23L30 26z" fill="#ff8a1f"/><circle cx="25" cy="17" r="1.7" fill="#222"/><circle cx="35" cy="17" r="1.7" fill="#222"/><rect x="16" y="31" width="28" height="7" rx="3.5" fill="HC"/><rect x="36" y="34" width="7" height="17" rx="3" fill="HC"/><circle cx="30" cy="47" r="1.8" fill="#222"/><circle cx="30" cy="56" r="1.8" fill="#222"/><circle cx="30" cy="65" r="1.8" fill="#222"/></svg>';
 var DEER='<svg class="RC" viewBox="0 0 110 92" aria-hidden="true"><path d="M82 24l-6-16M76 8l-8-2M76 8l4-8M90 22l8-15M98 7l7-1M98 7l-2-8" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round" fill="none"/><ellipse cx="46" cy="52" rx="28" ry="16" fill="#a8693a"/><path d="M62 46L78 28" stroke="#a8693a" stroke-width="13" stroke-linecap="round"/><ellipse cx="86" cy="30" rx="12" ry="9.5" fill="#b87444"/><ellipse cx="82" cy="19" rx="4" ry="6.5" fill="#a8693a" transform="rotate(-25 82 19)"/><circle cx="85" cy="27" r="1.8" fill="#222"/><circle cx="97" cy="32" r="4.6" fill="NC"/><path d="M26 64v22M38 66v22M56 66v22M66 62v24" stroke="#8a5530" stroke-width="5.5" stroke-linecap="round"/><ellipse cx="20" cy="44" rx="6" ry="4" fill="#fff"/><path d="M60 40l10 12" stroke="#c0392b" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="40" r="2.4" fill="#ffd86b"/></svg>';
 var sm=function(cls,hc){return SNOWMAN.replace('SZ',cls).replace(/HC/g,hc)};
 var dr=function(cls,nc){return DEER.replace('RC',cls).replace('NC',nc)};

 function buildField(){
  var ft=doc.querySelector('footer');if(!ft||ft.parentNode.classList.contains('xm-field'))return;
  var f=el('div','xm-field');ft.parentNode.insertBefore(f,ft);
  f.appendChild(el('div','xm-bg'));
  f.appendChild(el('div','xm-chars',sm('s1','#c0392b')+dr('r1','#ff2a2a')+sm('s2','#1f7a4d')+dr('r2','#c0392b')+sm('s1','#2457c5')+dr('r1','#c0392b')));
  f.appendChild(ft);
 }

 /* ---------- faixa de frases (no topo do <main>, volta sempre que a app re-renderiza) ---------- */
 var bar=null,barT=0;
 function barText(){return'<b class="xm-gift"></b>'+(li%3===0?countdown():LINES[lang()][li%LINES[lang()].length])}
 function ensureBar(){
  var m=doc.getElementById('main');if(!m||(bar&&m.firstChild===bar))return;
  if(!bar){bar=el('div','xm-bar','<span></span>');bar.setAttribute('role','status');bar.firstChild.innerHTML=barText();
   barT=setInterval(function(){bar.classList.add('f');setTimeout(function(){li++;bar.firstChild.innerHTML=barText();bar.classList.remove('f')},500)},9000)}
  m.insertBefore(bar,m.firstChild);
 }

 /* ---------- Pai Natal: simulação (a rota segue a meia-noite local de dia 24 para 25) ---------- */
 var modal=null,raf=0,preview=null,tick=0;
 function xmasYear(){var n=new Date(NOW());return n.getMonth()===0?n.getFullYear()-1:n.getFullYear()}
 function startMs(){return Date.UTC(xmasYear(),11,24,10,0,0)}
 var wrapLon=function(x){return((x+540)%360)-180};
 function pos(th){var t=Math.max(0,Math.min(26,th));return{lon:wrapLon(210-15*t),lat:34*Math.sin(t*.85)*Math.cos(t*.11)+6*Math.sin(t*2.1)}}
 function myLon(){try{var p=JSON.parse(localStorage.getItem('place'));if(p&&isFinite(p.lon))return{lon:+p.lon,lat:+p.lat,name:p.name}}catch(e){}return{lon:-new Date().getTimezoneOffset()/4,lat:null,name:null}}
 function fmtDur(ms){var s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),pt=lang()==='pt';
  return(d?d+(pt?' d ':'d '):'')+h+(pt?' h ':'h ')+String(m).padStart(2,'0')+(pt?' min':'m')}
 function thNow(){return preview!==null?preview:(NOW()-startMs())/3.6e6}
 function draw(){
  var c=doc.getElementById('xm-g');if(!c)return;var dpr=Math.min(2,devicePixelRatio||1),S=Math.round(c.clientWidth*dpr);if(!S)return;
  if(c.width!==S){c.width=S;c.height=S}
  var g=c.getContext('2d'),R=S/2,th=thNow(),p=th<0?{lon:0,lat:90}:pos(th);
  g.clearRect(0,0,S,S);
  var ok=typeof d3!=='undefined'&&d3.geoOrthographic&&typeof landGeo!=='undefined'&&landGeo;
  var oc=g.createRadialGradient(R*.7,R*.6,R*.1,R,R,R);oc.addColorStop(0,'#2b6cb0');oc.addColorStop(1,'#0b2a52');g.fillStyle=oc;g.beginPath();g.arc(R,R,R-1,0,6.283);g.fill();
  var proj=null;
  if(ok){
   proj=d3.geoOrthographic().scale(R-3).translate([R,R]).rotate([-p.lon,-(th<0?60:p.lat*.55)]).clipAngle(90);
   var path=d3.geoPath(proj,g);
   g.beginPath();path(d3.geoGraticule10());g.strokeStyle='rgba(255,255,255,.16)';g.lineWidth=1;g.stroke();
   g.beginPath();path(landGeo);g.fillStyle='#f3faff';g.fill();g.strokeStyle='rgba(120,170,210,.7)';g.stroke();
   if(th>0){var co=[];for(var k=0;k<=40;k++){var q=pos(th-k*.16);if(th-k*.16<0)break;co.push([q.lon,q.lat])}
    if(co.length>1){g.beginPath();path({type:'LineString',coordinates:co});g.strokeStyle='#ffd86b';g.lineWidth=2.4*dpr;g.setLineDash([5*dpr,4*dpr]);g.stroke();g.setLineDash([])}}
   var me=myLon();if(me.lat!=null&&d3.geoDistance([p.lon,p.lat],[me.lon,me.lat])<1.5){var pp=proj([me.lon,me.lat]);if(pp){g.fillStyle='#c0392b';g.strokeStyle='#fff';g.lineWidth=2*dpr;g.beginPath();g.arc(pp[0],pp[1],5*dpr,0,6.283);g.fill();g.stroke()}}
  }else{
   g.strokeStyle='rgba(255,255,255,.2)';for(var i=1;i<6;i++){g.beginPath();g.arc(R,R,R*i/6,0,6.283);g.stroke()}
  }
  var sx=R,sy=R;
  if(th<0){sx=R;sy=R*.28}
  var gl=g.createRadialGradient(sx,sy,0,sx,sy,34*dpr);gl.addColorStop(0,'rgba(255,230,140,.9)');gl.addColorStop(1,'rgba(255,230,140,0)');g.fillStyle=gl;g.beginPath();g.arc(sx,sy,34*dpr,0,6.283);g.fill();
  var k=1.1*dpr;g.save();g.translate(sx-16*k,sy-16*k);g.scale(k,k);
  g.fillStyle='#d6303a';g.fill(new Path2D('M5 23C5 13 11 5 22 5c-1 3 0 6 3 8l2 10z'));
  g.fillStyle='#fff';g.strokeStyle='#9fb6cc';g.lineWidth=1;var br=new Path2D('M5 22h22a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6z');g.fill(br);g.stroke(br);
  g.beginPath();g.arc(24.5,6,3.8,0,6.283);g.fill();g.stroke();g.restore();
  if(preview!==null){preview+=.045;if(preview>26){preview=null;status()}}
 }
 function status(){
  var s=doc.getElementById('xm-s');if(!s)return;var pt=lang()==='pt',now=NOW(),th=(now-startMs())/3.6e6,me=myLon(),eta=Date.UTC(xmasYear(),11,25,0,0,0)-me.lon/15*3.6e6,html='';
  var tl=T2('your location','a tua localização'),where=me.name||tl;
  if(preview!==null){var q=pos(preview);html='<div class="xm-n">'+T2('Route preview','Pré-visualização da rota')+'</div>'+T2('Santa is over','O Pai Natal está sobre')+' <b>'+q.lat.toFixed(1)+'°, '+q.lon.toFixed(1)+'°</b>';}
  else if(th<0){html='<div class="xm-n">'+T2('Santa is at the North Pole','O Pai Natal está no Polo Norte')+'</div>'+T2('Take-off in','Descola daqui a')+' <b>'+fmtDur(startMs()-now)+'</b><br>'+T2('He reaches','Chega a')+' '+where+' '+T2('in','daqui a')+' <b>'+fmtDur(eta-now)+'</b>'}
  else if(th<=26){var q2=pos(th),n=Math.floor(th/26*2.4e9);html='<div class="xm-n">'+T2('Santa is on his way!','O Pai Natal vai a caminho!')+'</div>'+T2('Now over','Agora sobre')+' <b>'+q2.lat.toFixed(1)+'°, '+q2.lon.toFixed(1)+'°</b><br>'+T2('Presents delivered (estimate)','Prendas entregues (estimativa)')+': <b>'+n.toLocaleString(pt?'pt-PT':'en')+'</b><br>'+(eta>now?T2('Reaches','Chega a')+' '+where+' '+T2('in','daqui a')+' <b>'+fmtDur(eta-now)+'</b>':T2('He already visited','Já passou por')+' '+where+' ')}
  else html='<div class="xm-n">'+T2('Santa is back home!','O Pai Natal já voltou a casa!')+'</div>'+T2('All the presents are delivered. See you next year!','Todas as prendas foram entregues. Até para o ano!');
  s.innerHTML=html;
 }
 function frame(){raf=requestAnimationFrame(frame);if(!still||preview!==null)draw()}
 function openSanta(){
  if(!modal){
   modal=el('div','xm-modal');modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Santa tracker');
   modal.innerHTML='<div class="xm-box"><button class="xm-x" type="button" aria-label="Close">×</button><h2></h2><canvas id="xm-g" role="img" aria-label="Santa position on a globe"></canvas><div class="xm-st" id="xm-s" aria-live="polite"></div><a class="xm-no" id="xm-no" href="https://www.noradsanta.org/" target="_blank" rel="noopener"></a><div class="xm-btns"><button type="button" id="xm-pv"></button></div><p class="xm-note" id="xm-nt"></p></div>';
   doc.body.appendChild(modal);
   modal.addEventListener('click',function(e){if(e.target===modal||e.target.closest('.xm-x'))closeSanta()});
   modal.querySelector('#xm-pv').onclick=function(){preview=0;status();if(still)draw()};
   addEventListener('keydown',function(e){if(e.key==='Escape'&&modal&&!modal.hidden)closeSanta()});
  }
  modal.querySelector('h2').innerHTML=T2('Track Santa','Segue o Pai Natal')+HAT;
  modal.querySelector('#xm-pv').textContent=T2('Preview the route','Ver a rota');
  modal.querySelector('#xm-no').innerHTML='<b>'+T2('Live Santa tracker (NORAD) ↗','Rastreio ao vivo do Pai Natal (NORAD) ↗')+'</b><small>'+T2('The real thing: live map, Santa Cams and a phone hotline on Dec 24','O oficial: mapa ao vivo, Santa Cams e linha telefónica no dia 24 de dezembro')+'</small>';
  modal.querySelector('#xm-nt').textContent=T2('The globe above is our own playful simulation (Santa follows midnight around the world on Dec 24–25). It is not real tracking data: for that, use NORAD Tracks Santa.','O globo acima é uma simulação nossa, para brincar (o Pai Natal segue a meia-noite à volta do mundo nos dias 24 e 25 de dezembro). Não são dados reais: para isso, usa o NORAD Tracks Santa.');
  modal.hidden=false;html.classList.add('m-lock');
  try{if(typeof globeLoad==='function')globeLoad().then(function(){draw()}).catch(function(){})}catch(e){}
  status();draw();cancelAnimationFrame(raf);frame();clearInterval(tick);tick=setInterval(status,1000);
  modal.querySelector('.xm-x').focus();
 }
 function closeSanta(){if(!modal)return;modal.hidden=true;preview=null;html.classList.remove('m-lock');cancelAnimationFrame(raf);clearInterval(tick)}

 /* ---------- botões ---------- */
 function addButtons(){
  var ha=doc.querySelector('.header-actions');
  if(ha&&!doc.getElementById('xmSanta')){var b=el('button','pill xm-santa',HAT+'<span class="xm-l"></span>');b.id='xmSanta';b.type='button';b.querySelector('.xm-l').textContent=T2('Track Santa','Pai Natal');b.onclick=openSanta;ha.insertBefore(b,doc.getElementById('hbtn')||ha.firstChild)}
  if(!doc.getElementById('xmFab')){var f=el('button','xm-fab',HAT+'<span></span>');f.id='xmFab';f.type='button';f.lastChild.textContent=T2('Track Santa','Pai Natal');f.onclick=openSanta;doc.body.appendChild(f)}
 }
 function relabel(){var a=doc.querySelector('#xmSanta .xm-l'),b=doc.querySelector('#xmFab span:last-child');if(a)a.textContent=T2('Track Santa','Pai Natal');if(b)b.textContent=T2('Track Santa','Pai Natal');if(bar)bar.firstChild.innerHTML=barText()}

 function init(){
  html.classList.add('xmas');
  doc.body.appendChild(el('div','xm-lights'));
  startSnow();buildField();addButtons();ensureBar();
  var m=doc.getElementById('main');if(m)new MutationObserver(ensureBar).observe(m,{childList:true});
  new MutationObserver(relabel).observe(html,{attributes:true,attributeFilter:['lang']});
 }
 /* ---------- depuração: ?xmasdebug=1 (ou SkyXmas.debug() na consola) ---------- */
 var dbg=null,dbgT=0,errs=[];
 addEventListener('error',function(e){errs.push((e.message||'erro')+' @'+String(e.filename||'').split('/').pop()+':'+(e.lineno||0));errs=errs.slice(-3)});
 function debug(on){
  if(on===false){if(dbg){dbg.remove();dbg=null;clearInterval(dbgT)}return}
  if(dbg)return;dbg=el('pre','xm-dbg');doc.body.appendChild(dbg);var f=0,t0=performance.now(),fps=0;
  (function c(){f++;var t=performance.now();if(t-t0>=1000){fps=Math.round(f*1000/(t-t0));f=0;t0=t}if(dbg)requestAnimationFrame(c)})();
  function upd(){var q=function(s){return doc.querySelector(s)?'✔':'✘'},tm=new Date(NOW());
   dbg.textContent=['xmas.js activo · '+(mobile()?'mobile':'desktop')+' · lang '+lang(),'data usada: '+tm.toISOString().slice(0,16)+'Z'+(SKEW?' (FALSA)':' (real)'),'sessionStorage xmas='+(sessionStorage.getItem('xmas')||'-')+' xmasdate='+(sessionStorage.getItem('xmasdate')||'-'),
    'neve '+q('#xm-snow')+' · luzes '+q('.xm-lights')+' · faixa '+q('.xm-bar')+' · botão '+q('#xmSanta')+'/'+q('#xmFab'),'rodapé enterrado '+q('.xm-field footer')+' · neve no globo '+q('.xm-gs')+' · fonte '+(document.fonts&&document.fonts.check('700 20px "Mountains of Christmas"')?'✔':'✘'),
    'fps '+fps+' · flocos '+flakes.length,'erros: '+(errs.length?errs.join(' | '):'nenhum')].join('\n')}
  upd();dbgT=setInterval(upd,1000);
 }
 try{if(/[?&]xmasdebug=1/.test(location.search))addEventListener('DOMContentLoaded',function(){debug()});if(doc.readyState!=='loading'&&/[?&]xmasdebug=1/.test(location.search))debug()}catch(e){}
 window.SkyXmas={lines:lines,open:openSanta,debug:debug,now:function(){return new Date(NOW())}};
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
})();
