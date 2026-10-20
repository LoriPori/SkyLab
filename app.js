/* Skylab · app.js — single script (classic, global scope). Sections in load order:
   boot → core → landing → radar → warnings → account → terminal → app */

/* ═══════════ BOOT — early mobile/desktop detection + delegated handlers (must stay first) ═══════════ */
/* Deteção de telemóvel: não depende só da largura. Combina Client Hints, tipo de ponteiro, lado curto do ecrã físico e user-agent.
   Forçar: ?ui=mobile | ?ui=desktop | ?ui=auto  (fica guardado). Tablets e janelas estreitas de PC usam o layout de PC. */
(function(){
  var d=document.documentElement,mode='auto';
  try{var q=new URLSearchParams(location.search).get('ui');if(q==='mobile'||q==='desktop'||q==='auto'){localStorage.setItem('uiMode',q)}mode=localStorage.getItem('uiMode')||'auto'}catch(e){}
  var mob;
  if(mode==='mobile')mob=true;else if(mode==='desktop')mob=false;
  else{
    var ua=navigator.userAgent||'',uad=navigator.userAgentData,mm=function(x){try{return matchMedia(x).matches}catch(e){return false}};
    var uaMob=uad&&typeof uad.mobile==='boolean'?uad.mobile:/Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
    var touchOnly=mm('(pointer:coarse)')&&mm('(hover:none)');
    var shortSide=Math.min(screen.width||9999,screen.height||9999);
    mob=!!(uaMob&&shortSide<=600)||!!(touchOnly&&shortSide<=480);
  }
  d.classList.add(mob?'is-mobile':'is-desktop');
  d.dataset.ui=mob?'mobile':'desktop';
})();

/* Delegated fallbacks that replaced inline onerror/onload/onclick attributes (lets the CSP drop 'unsafe-inline' for scripts) */
(function(){
  var FB={Term:'imgFBTerm',Auth:'imgFBAuth',Code:'imgFBCode',Google:'imgFBGoogle',Email:'imgFBEmail',Lock:'imgFBLock',Gen:'imgFB'};
  document.addEventListener('error',function(e){
    var t=e.target;if(!t||t.tagName!=='IMG'||!t.dataset||!t.dataset.fb)return;
    if(t.dataset.fb==='Hurr'){t.replaceWith(document.createTextNode('\uD83C\uDF00'));return}
    var f=window[FB[t.dataset.fb]];if(typeof f==='function')f(t);
  },true);
  document.addEventListener('load',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&t.hasAttribute('data-fbok'))t.classList.add('ok')},true);
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest&&e.target.closest('[data-act="locate"]');
    if(b&&typeof window.locate==='function')window.locate();
  });
})();

/* ═══════════ CORE — config, i18n, data fetching, Sky Explained, hero, tabs, ephemeris, render ═══════════ */
/* ============ CONFIG: Atmospore ============
   I could not verify Atmospore's endpoint from here. Edit `candidates` to match
   their docs. Each candidate is tried in order; the first response that contains
   pollen-like fields wins. The raw response is logged in the console.
   NOTE: this key is visible to anyone who views the page source. */

const ATMO={ base:'https://aged-mountain-a883.lourencoalvesfonseca2011.workers.dev/v1' };
let atmoDead=false;
const SYNC_KEYS = ['favs','unitPick','lang','place','homeCity','progMode','termHist','termTheme','tabPick','recent'];// declared first so lsSet can reference it safely
/* ============ basics ============ */
const IS_MOBILE=document.documentElement.classList.contains('is-mobile');
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const main=$('#main'),q=$('#q'),sg=$('#sg');
const lsGet=k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}};
const lsSet=(k,v)=>{
  try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}
  if(typeof SYNC_KEYS!=='undefined' && SYNC_KEYS.includes(k) && !window.__prefsApplying){
    try{localStorage.setItem('prefsTs',String(Date.now()))}catch(e){}
    if(typeof prefsSchedulePush==='function') prefsSchedulePush();
  }
};
let LANG=lsGet('lang')||((navigator.language||'').toLowerCase().startsWith('pt')?'pt':'en');
const LOC=()=>LANG=='pt'?'pt-PT':'en';
document.documentElement.lang=LANG;
try{localStorage.removeItem('unit');localStorage.removeItem('unitManual')}catch(e){}   // limpa o estado antigo que bloqueava a mudança automática
let unit=lsGet('unitPick')||(LANG=='pt'?'c':'f'),data=null,place=null,tab=(['today','week','air','sky','sci'].includes(lsGet('tabPick'))?lsGet('tabPick'):'today'),lastKey='',tickT;
const still=matchMedia('(prefers-reduced-motion:reduce)').matches;
const T=c=>Math.round(unit=='c'?c:c*9/5+32);
const W=k=>unit=='c'?Math.round(k)+' km/h':Math.round(k*.539957)+' kt';
const deg=()=>unit=='c'?'°C':'°F';
/* pressão e chuva seguem o botão °C/°F: °C → hPa · mm ; °F → inHg · in (o mapa e as fórmulas científicas ficam em hPa) */
const HPA_INHG=.0295300;
const dcm=(v,n)=>{const t=v.toFixed(n);return LANG=='pt'?t.replace('.',','):t};
const pU=()=>unit=='c'?'hPa':'inHg';
const pN=h=>unit=='c'?String(Math.round(h)):dcm(h*HPA_INHG,2);                   // valor absoluto, sem unidade
const pf=h=>pN(h)+' '+pU();                                                          // valor absoluto com unidade
const pdS=d=>unit=='c'?dcm(d,1)+' hPa':dcm(d*HPA_INHG,2)+' inHg';                    // DIFERENÇA de pressão com unidade
const rateS=mm=>{if(unit=='c')return(mm<1?mm.toFixed(2):mm<10?mm.toFixed(1):String(Math.round(mm)))+' mm/h';
 const v=mm/25.4;return(v<.1?v.toFixed(3):v<1?v.toFixed(2):v.toFixed(1))+' in/h'};     // intensidade de chuva
const hm=m=>`${Math.floor(m/60)}h ${Math.round(m%60)}m`;
const fmtT=s=>s.slice(11,16);
const idx0=()=>Math.max(0,data.hourly.time.findIndex(t=>t>=data.current.time.slice(0,13)+':00'));

function cat(code,day){
 if(code>=95)return'storm';
 if(code>=71&&code<=77||code==85||code==86)return'snow';
 if(code>=51&&code<=67||code>=80&&code<=82)return'rain';
 if(code==45||code==48)return'fog';
 if(code==3||code==2)return'cloud';
 return day?'clear':'night';
}
const LABEL={0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Freezing fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',82:'Violent showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with hail'};
const IC={
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
cloud:'<path d="M17.5 19H9a5 5 0 1 1 4.8-6.4h3.7a3.2 3.2 0 0 1 0 6.4z"/>',
partly:'<circle cx="8" cy="8" r="2.6"/><path d="M8 2.5v1.2M2.5 8h1.2M4.1 4.1l.9.9M11.9 4.1l-.9.9M18 20H10.5a4.2 4.2 0 1 1 4-5.5H18a2.9 2.9 0 0 1 0 5.5z"/>',
fog:'<path d="M4 8h16M2 12h20M5 16h14M8 20h8"/>',
drizzle:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M8 17v.01M12 19v.01M16 17v.01M10 21v.01M14 21v.01"/>',
rain:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3"/>',
snow:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M8 17v.01M12 19v.01M16 17v.01M10 21v.01M14 21v.01"/>',
storm:'<path d="M17 13H8.5a4.6 4.6 0 1 1 4.4-5.9H17a3 3 0 0 1 0 5.9z"/><path d="M12.5 13.5L10 17.5h3.5L11 21.5"/>',
umbrella:'<path d="M12 3v1M3 13a9 9 0 0 1 18 0zM12 13v5a2 2 0 0 1-4 0"/>',
tshirt:'<path d="M8 3L3 6l2.5 4L8 9v12h8V9l2.5 1L21 6l-5-3a4 4 0 0 1-8 0z"/>',
layers:'<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
jacket:'<path d="M9 3L3 6v5l3 1v9h12v-9l3-1V6l-6-3-3 4zM12 7v14"/>',
flake:'<path d="M12 2v20M4.2 7l15.6 10M4.2 17L19.8 7"/>',
wind:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
walk:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'};
const ic=n=>`<svg class="ic i-${n}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]||''}</svg>`;
function emoji(code,day=1){
 let n;
 if(code<=1)n=day?'sun':'moon'; else if(code==2)n=day?'partly':'cloud'; else if(code==3)n='cloud';
 else if(code==45||code==48)n='fog'; else if(code<=57)n='drizzle';
 else if(code<=67||code>=80&&code<=82)n='rain'; else if(code<=77||code==85||code==86)n='snow'; else n='storm';
 return ic(n);
}
const IPMA_TO_WMO={
  1:0,2:2,3:3,4:3,5:3,6:3,7:3,8:3,9:3,10:3,11:3,12:3,13:3,
  14:51,15:61,16:45,17:61,18:65,19:95,20:95,21:95,22:95,
  23:71,24:71,25:75,26:75,27:77,28:85,29:86,30:95
};

/* ============ colour theme: cool blue -> teal -> gold -> orange (never red) ============ */
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const toHex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>{const x=hex(a),y=hex(b);return toHex(x.map((v,i)=>v+(y[i]-v)*t))};
const STOPS=[[-8,'#4d8dff'],[6,'#33b0ea'],[14,'#36c5b4'],[21,'#c4952c'],[28,'#c97a34'],[36,'#bf5a3a']];
function tempBase(t){
 if(t<=STOPS[0][0])return STOPS[0][1];
 for(let i=1;i<STOPS.length;i++){
  if(t<=STOPS[i][0]){const[t0,c0]=STOPS[i-1],[t1,c1]=STOPS[i];return mix(c0,c1,(t-t0)/(t1-t0))}
 }
 return STOPS[STOPS.length-1][1];
}
const COND_MIX={clear:null,cloud:['#8a9bb0',.36],rain:['#6f84a3',.42],snow:['#86a6c4',.38],fog:['#93a0ad',.48],storm:['#5d6391',.52],night:['#3d4394',.52]};
function theme(tC,k){
 let base=tempBase(tC);const m=COND_MIX[k];if(m)base=mix(base,m[0],m[1]);
 const w=m?0:Math.max(0,Math.min(1,(tC-16)/8));            // 0 = fresco/nublado, 1 = dia quente de céu limpo
 const s=document.documentElement.style;
 s.setProperty('--a',base);
 s.setProperty('--b',mix(mix(base,'#ffffff',.42),mix(base,'#4a2410',.34),w));   // quente: o fim do degradê escurece em vez de clarear
 s.setProperty('--acc',mix(base,'#0c2a52',.52));
}
function landTheme(night,k){                       // página inicial: cor própria, não depende da temperatura
 if(night){theme(10,k);return}                     // noite: igual ao que já tinhas
 const base='#2b8fd6',s=document.documentElement.style;
 s.setProperty('--a',base);
 s.setProperty('--b',mix(base,'#0c2a52',.30));     // o fim do degradê escurece em vez de clarear
 s.setProperty('--acc',mix(base,'#0c2a52',.52));
}
function tempColor(c){const t=Math.max(-10,Math.min(38,c)),hue=208-((t+10)/48)*182;return`hsl(${hue.toFixed(0)},72%,58%)`}

/* ============ science facts ============ */
const IMG_BASE='facts/';
const IMG_DIR=IMG_BASE&&!IMG_BASE.endsWith('/')?IMG_BASE+'/':IMG_BASE;   // garante a barra final
function imgFB(el){   // se falhar, tenta outros sítios antes de desistir
const n=el.dataset.n,tries=[IMG_DIR+n,n,'facts/'+n,'img/'+n],i=+(el.dataset.t||0)+1;
 if(i<tries.length){el.dataset.t=i;el.src=tries[i]}else el.remove();
}
const FACTS = [
  // Factos originais
  ['clear','Why the sky is blue','Air molecules scatter short wavelengths of sunlight far more than long ones (Rayleigh scattering). Violet scatters even more, but the Sun emits less of it and our eyes respond weakly to it, so we see blue.','Optics'],
  ['clear','Sunsets are red for a reason','At sunset, light crosses much more atmosphere. Most blue is scattered out of the beam on the way, leaving reds and oranges to reach your eyes.','Optics'],
  ['clear','Sunlight is 8 minutes old','Light from the Sun takes about 8 minutes and 20 seconds to reach Earth, so you always see the Sun as it was a little while ago.','Astronomy'],
  ['night','Starlight is old news','Light from the Moon takes about 1.3 seconds to reach you. Light from the nearest star beyond the Sun takes over four years, so you are seeing the past.','Astronomy'],
  ['night','Why stars twinkle','Turbulent air bends starlight on its way down, making the point of light flicker. Planets twinkle less because they are small discs, not points.','Optics'],
  ['night','The Moon is drifting away','It moves about 3.8 cm farther from Earth every year, roughly the speed fingernails grow.','Astronomy'],
  ['cloud','A cloud is heavy','A typical fair-weather cumulus holds roughly 500 tonnes of water, held up by rising air and droplets so tiny they fall extremely slowly.','Atmosphere'],
  ['cloud','Why clouds look white','Water droplets scatter all visible wavelengths about equally, so sunlight stays white. Thick clouds look grey because little light gets through their base.','Optics'],
  ['rain','Raindrops are not teardrops','Small drops are nearly spherical. Larger ones flatten into a shape like a hamburger bun as air pushes up on them.','Fluid dynamics'],
  ['rain','The smell of rain','Petrichor comes from oils released by plants and from geosmin, a compound made by soil bacteria. Raindrops hitting dry ground launch it into the air.','Chemistry'],
  ['rain','Raindrops fall fast','A large raindrop reaches about 9 m/s, roughly 30 km/h. Drizzle drifts down at under 1 m/s.','Fluid dynamics'],
  ['snow','Snow is white, ice is blue','Ice crystals scatter all colours equally, so snow looks white. Thick, clear ice absorbs a little red light and shows a faint blue.','Optics'],
  ['snow','No two snowflakes are exactly alike','Each crystal follows a slightly different path through temperature and humidity on the way down, shaping it uniquely.','Meteorology'],
  ['storm','Lightning is hotter than the Sun','A lightning channel briefly reaches about 30,000 °C, roughly five times hotter than the Sun’s surface. The air explodes outward: that is thunder.','Physics'],
  ['storm','Count to the thunder','Sound travels about 1 km in 3 seconds. Count the seconds between flash and bang, divide by three, and you have the distance in kilometres.','Physics'],
  ['fog','Fog is a cloud on the ground','It forms the same way as any cloud: air cools to its dew point and water vapour condenses onto tiny particles.','Atmosphere'],
  ['hot','Humid heat feels worse than dry heat','At the same temperature, high humidity slows sweat evaporation, so your body can’t shed heat as efficiently.','Physiology'],
  ['cold','Why cold air feels dry','Cold air can hold far less water vapour. Warm it indoors without adding moisture and its relative humidity drops sharply.','Thermodynamics'],
  ['uv','Clouds don’t block all UV','Up to 80% of UV rays pass through light cloud cover, which is why overcast days can still burn skin.','Radiation'],

    // Novos factos (5.º = imagem, 6.º = tradução PT)
  ['cold','Hair ice grows on dead wood','On cold, humid nights in some forests, thin silky strands of ice sprout from rotting branches. A fungus on the wood shapes them, which is why scientists took almost a century to explain hair ice.','Biology','air-ice.png',['O gelo capilar cresce em madeira morta','Em noites frias e húmidas, em algumas florestas, os ramos podres enchem-se de fios finos e sedosos de gelo. Um fungo na madeira molda-os, e foi por isso que a ciência demorou quase um século a explicá-lo.']],
  ['clear','Sunbeams are straight','Crepuscular rays look like they fan out, but they are parallel. Perspective makes them seem to spread from the Sun, and dust and moisture in the air make them visible.','Optics','crepuscular-rays.png',['Os raios de sol são retos','Os raios crepusculares parecem abrir-se em leque, mas são paralelos. A perspetiva faz com que pareçam sair do Sol, e a poeira e a humidade do ar tornam-nos visíveis.']],
  ['storm','It can rain frogs','Waterspouts and strong storm updrafts can lift small animals such as fish and frogs, then drop them far away. It is rare, but it is real.','Meteorology','frog.png',['Pode chover rãs','As trombas-d’água e as correntes ascendentes fortes das tempestades conseguem levantar pequenos animais, como peixes e rãs, e largá-los longe dali. É raro, mas acontece.']],
  ['fog','A rainbow halo around your shadow','A glory is a ring of colour around the shadow of your head, seen when you look down onto cloud or fog from a height. Droplets scatter the light straight back towards its source.','Optics','glory.png',['Um halo de arco-íris à volta da tua sombra','A glória é um anel de cores à volta da sombra da tua cabeça, visível quando olhas de um sítio alto para nuvens ou nevoeiro. As gotículas devolvem a luz diretamente para a sua origem.']],
  ['storm','Haboobs are walls of dust','When a thunderstorm collapses, the cold air rushing out can lift dust into a wall hundreds of metres high and many kilometres across. Haboobs are most common in North Africa and the American Southwest.','Atmosphere','haboob.png',['Os haboobs são muralhas de pó','Quando uma trovoada colapsa, o ar frio que sai disparado pode levantar o pó numa muralha com centenas de metros de altura e muitos quilómetros de largura. Os haboobs são mais comuns no Norte de África e no sudoeste dos Estados Unidos.']],
  ['cloud','Clouds make vortex streets','When wind-driven cloud flows around a tall island, it can peel off into long chains of swirling eddies called von Kármán vortices. Landsat 7 photographed them downwind of Alexander Selkirk Island in 1999.','Fluid dynamics','landsat_art_karman.png',['As nuvens formam ruas de vórtices','Quando as nuvens levadas pelo vento contornam uma ilha alta, podem desfazer-se em longas filas de remoinhos chamados vórtices de von Kármán. O Landsat 7 fotografou-os a sotavento da ilha Alexander Selkirk em 1999.']],
  ['cloud','Some clouds never move','Lenticular clouds form where stable air is pushed up and over a mountain, creating a standing wave. The cloud stays put while air streams through it, and it has often been mistaken for a flying saucer.','Atmosphere','lenticular-clouds.png',['Algumas nuvens não se movem','As nuvens lenticulares formam-se quando o ar estável é empurrado por cima de uma montanha, criando uma onda estacionária. A nuvem fica no mesmo sítio enquanto o ar passa através dela, e já foi muitas vezes confundida com um disco voador.']],
  ['cold','Light pillars stand on ice','Flat, hexagonal ice crystals drifting almost horizontally act like stacked mirrors. They stretch any strong light, from the Sun to street lamps, into a vertical column.','Optics','light-pillars.png',['Os pilares de luz assentam no gelo','Cristais de gelo hexagonais e achatados, a cair quase na horizontal, comportam-se como espelhos empilhados. Esticam qualquer luz forte, do Sol aos candeeiros de rua, numa coluna vertical.']],
  ['night','The Moon wears a ring','A 22° halo is a ring of light caused by ice crystals in thin, high cloud. Its radius spans about 22°, roughly your hand held at arm’s length, and it does not reliably predict rain.','Optics','lunar-halo.png',['A Lua usa um anel','O halo de 22° é um anel de luz causado por cristais de gelo numa nuvem fina e alta. O seu raio mede cerca de 22°, mais ou menos a mão aberta com o braço esticado, e não prevê a chuva de forma fiável.']],
  ['clear','The Sun can have fake twins','Mock suns, or sundogs, are bright spots on either side of the Sun. They appear when sunlight passes through hexagonal ice plates drifting nearly flat in high cloud.','Optics','mock-suns.png',['O Sol pode ter gémeos falsos','Os parélios, ou falsos sóis, são pontos brilhantes de cada lado do Sol. Aparecem quando a luz solar atravessa placas de gelo hexagonais que flutuam quase na horizontal em nuvens altas.']],
  ['snow','Ice spikes taller than you','Nieves penitentes are blades of snow and ice, from a few centimetres to several metres tall, that point towards the Sun. Dry, high-altitude air makes the ice sublimate straight to vapour, carving deeper and deeper dimples.','Meteorology','nieve-penitente.png',['Espigões de gelo mais altos do que tu','Os penitentes de neve (nieves penitentes) são lâminas de neve e gelo, de poucos centímetros a vários metros de altura, que apontam para o Sol. O ar seco de altitude faz o gelo sublimar diretamente em vapor, escavando covas cada vez mais fundas.']],
  ['snow','Snow can roll itself up','Snow rollers are little doughnut-like cylinders of snow, shaped by wind rolling sticky snow across a surface it will not cling to. They need just the right mix of moisture, wind and temperature.','Meteorology','snow-rolls.png',['A neve consegue enrolar-se sozinha','Os rolos de neve são pequenos cilindros em forma de donut, moldados pelo vento ao fazer rolar neve pegajosa sobre uma superfície a que ela não se agarra. Precisam de uma mistura certa de humidade, vento e temperatura.']],
  ['storm','Storms can line up for hundreds of kilometres','A squall line is a long row of thunderstorms, often pushed along by a cold front. Its outflow keeps triggering new storms, bringing strong straight-line winds, rain and hail.','Meteorology','squall-line.png',['As tempestades podem alinhar-se por centenas de quilómetros','Uma linha de instabilidade é uma longa fila de trovoadas, muitas vezes empurrada por uma frente fria. O ar que sai dela vai desencadeando novas tempestades, com ventos fortes em linha reta, chuva e granizo.']],
  ['fog','Rainbows can be white','A fogbow forms like a rainbow, but fog droplets are so tiny that they spread the colours out and wash them away. The result is a pale, ghostly arch.','Optics','strange-bows.png',['Os arco-íris podem ser brancos','Um arco de nevoeiro forma-se como um arco-íris, mas as gotículas do nevoeiro são tão pequenas que espalham as cores e as esbatem. O resultado é um arco pálido e fantasmagórico.']],
  ['clear','A halo around the Sun','The Sun can have a halo too, made by the same ice crystals as the lunar one. Red sits on the inner edge, but never look straight at the Sun to see it.','Optics','sun-halos.png',['Um halo à volta do Sol','O Sol também pode ter halo, criado pelos mesmos cristais de gelo do halo lunar. O vermelho fica no bordo interior, mas nunca olhes diretamente para o Sol para o ver.']],
  ['rain','Rain that never lands','Virga is rain or snow that evaporates in dry air before it reaches the ground. It looks like feathery streaks hanging under a cloud, and the evaporation chills the air around it.','Atmosphere','virga.png',['Chuva que nunca aterra','A virga é chuva ou neve que se evapora no ar seco antes de chegar ao chão. Parece fios plumosos pendurados sob uma nuvem, e a evaporação arrefece o ar à volta.']],
  ['storm','Volcanoes make lightning','Colliding ash and rock fragments in an eruption plume build up static charge, so lightning flashes through the ash cloud. The heat can melt ash into tiny glass spheres.','Physics','volcanic-lightning.png',['Os vulcões fazem relâmpagos','Fragmentos de cinza e rocha a chocar numa nuvem eruptiva acumulam carga estática, e os relâmpagos disparam através da nuvem de cinza. O calor pode fundir a cinza em minúsculas esferas de vidro.']],
  ['storm','Tornadoes over water','A waterspout is a rotating column of air over water. Fair-weather ones are usually weak and short-lived, rarely lasting beyond 20 minutes.','Meteorology','waterspouts.png',['Tornados sobre a água','Uma tromba-d’água é uma coluna de ar em rotação sobre a água. As de bom tempo costumam ser fracas e de curta duração, raramente passando dos 20 minutos.']],
  ['storm','Hurricanes can dance','When two hurricanes spinning the same way pass close, they orbit a shared centre in the Fujiwhara effect. A much weaker storm can be swallowed, while similar ones may merge into one big storm.','Meteorology','fujiwhara.gif',['Os furacões podem dançar','Quando dois furacões que rodam no mesmo sentido passam perto, orbitam um centro comum, no efeito Fujiwhara. Uma tempestade muito mais fraca pode ser engolida, e duas parecidas podem fundir-se numa só.']],
  ['hot','Night air can suddenly heat up','A heat burst happens when rain from a dying thunderstorm evaporates completely in hot, dry air. The dense air sinks and warms by compression, so temperatures can jump by many degrees within minutes and gusts can be strong.','Thermodynamics','heat-bursts.gif',['O ar da noite pode aquecer de repente','Uma explosão de calor acontece quando a chuva de uma trovoada em dissipação se evapora por completo em ar quente e seco. O ar denso desce e aquece por compressão, por isso a temperatura pode subir muitos graus em minutos e as rajadas podem ser fortes.']],

  // Sem imagem
  ['cold','The coldest air ever measured','The lowest officially recorded temperature on Earth is −89.2 °C, measured at Vostok Station in Antarctica in July 1983.','Climate',null,['O ar mais frio alguma vez medido','A temperatura mais baixa oficialmente registada na Terra é de −89,2 °C, medida na estação Vostok, na Antártida, em julho de 1983.']],
  ['storm','Fire can make tornadoes','Big wildfires can spin up fire whirls, rotating columns of flame and hot air. They can be about 30 m tall, with winds that can reach about 240 km/h.','Meteorology',null,['O fogo também faz tornados','Grandes incêndios podem gerar remoinhos de fogo, colunas rotativas de chamas e ar quente. Podem ter cerca de 30 m de altura, com ventos que chegam a cerca de 240 km/h.']],
  ['clear','The driest place on Earth is cold','The McMurdo Dry Valleys in Antarctica get only about 2 mm of precipitation a year. It is one of the most Mars-like places on our planet.','Climate',null,['O sítio mais seco da Terra é frio','Os Vales Secos de McMurdo, na Antártida, recebem apenas cerca de 2 mm de precipitação por ano. É um dos lugares mais parecidos com Marte no nosso planeta.']],
  ['storm','The longest lightning flash','A single lightning flash in April 2020 stretched about 768 km across the southern United States, the longest ever verified. That is roughly the distance from New York to Columbus, Ohio.','Meteorology',null,['O relâmpago mais comprido','Um único relâmpago em abril de 2020 estendeu-se por cerca de 768 km no sul dos Estados Unidos, o mais longo alguma vez verificado. É mais ou menos a distância de Nova Iorque a Columbus, no Ohio.']],
  ['rain','Diamond rain may fall on Saturn','Scientists think extreme pressure and heat deep in the atmospheres of Saturn and Jupiter could crush carbon from methane into diamonds that rain downward.','Planetary science',null,['Pode chover diamantes em Saturno','Os cientistas pensam que a pressão e o calor extremos nas profundezas das atmosferas de Saturno e Júpiter podem esmagar o carbono do metano em diamantes que caem como chuva.']],
  ['night','Auroras are solar wind collisions','When charged solar wind particles guided by Earth’s magnetic field collide with upper atmospheric gases, oxygen emits vibrant green and red light while nitrogen glows purple and crimson.','Astronomy',null,['As auroras são colisões do vento solar','Quando partículas carregadas do vento solar guiadas pelo campo magnético da Terra colidem com gases da alta atmosfera, o oxigénio emite luz verde e vermelha vibrantes e o azoto resplandece em tons violeta e carmesim.']],
  ['storm','Ball lightning: floating plasma spheres','Rarely observed during severe thunderstorms, ball lightning appears as a glowing sphere lasting several seconds. Physicists suggest the oxidation of vaporised silicon nanoparticles from soil may sustain the glow.','Physics',null,['Relâmpago globular: esferas flutuantes de plasma','Observado raramente durante trovoadas intensas, o relâmpago globular manifesta-se como uma esfera luminosa que dura vários segundos. Os físicos sugerem que a oxidação de nanopartículas de silício vaporizadas a partir do solo pode sustentar o brilho.']],
  ['cloud','Mammatus clouds hang like pouches','Unlike most clouds sculpted by rising air, mammatus clouds develop from sinking pockets of chilled, moisture-laden air beneath a thunderstorm’s anvil, creating smooth suspended pouch formations.','Atmosphere',null,['As nuvens mammatus penduram-se como bolsas','Ao contrário da maioria das nuvens geradas por ar ascendente, as mammatus resultam de bolsas de ar frio e húmido que descem sob a bigorna de trovoadas, desenhando saliências arredondadas e suspensas.']],
  ['storm','Catatumbo: the endless lightning hotspot','Above Lake Maracaibo in Venezuela, converging nocturnal breezes from the Andes generate thunderstorms on up to 300 nights a year, flashing up to 250 lightning bolts per hour.','Meteorology',null,['Catatumbo: o relâmpago perpétuo do planeta','Sobre o Lago de Maracaibo, na Venezuela, a convergência de brisas noturnas dos Andes desencadeia trovoadas em até 300 noites por ano, gerando até 250 descargas elétricas por hora.']],
  ['night','Clouds glowing on the edge of space','Noctilucent clouds hover in the mesosphere around 85 km altitude. Water vapour freezes onto microscopic meteor smoke particles at −120 °C, catching sunlight well after sunset below.','Atmosphere',null,['Nuvens que brilham na fronteira do espaço','As nuvens noctilucentes formam-se na mesosfera a cerca de 85 km de altitude. O vapor de água congela sobre poeira microscópica de meteoros a −120 °C, refletindo a luz solar muito após o anoitecer.']],
  ['snow','Graupel is rimed snow, not true hail','When supercooled water droplets freeze directly onto falling snowflakes, they build fragile, spongy white pellets known as graupel or soft hail, distinct from dense thunderstorm hailstones.','Meteorology',null,['O graupel é neve com gelo agregado, não granizo','Quando gotículas de água super-arrefecida congelam diretamente sobre flocos de neve em queda, formam grânulos brancos e porosos chamados graupel, distintos do granizo denso das trovoadas.']],
  ['hot','Dust storms can temporarily chill the surface','Colossal airborne dust plumes reflect and scatter incoming solar radiation so effectively that ground temperatures beneath the dust canopy can drop by 2 to 5 °C during daytime.','Thermodynamics',null,['Tempestades de poeira podem arrefecer o solo','Nuvens colossais de poeira mineral em suspensão refletem e dispersam a radiação solar com tanta eficácia que a temperatura do solo à superfície pode baixar entre 2 e 5 °C durante o dia.']],
  ['rain','Cloud seeding relies on ice nucleators','Silver iodide aerosols mimic the exact hexagonal crystalline geometry of natural ice, triggering rapid ice crystallization and precipitation cascades within supercooled clouds.','Chemistry',null,['A sementeira de nuvens usa núcleos de gelo','Aerossóis de iodeto de prata imitam a geometria cristalina hexagonal do gelo natural, desencadeando rápida cristalização e precipitação em nuvens com gotículas de água super-arrefecida.']]
];


function factKey(){
 const c=data.current,k=cat(c.weather_code,c.is_day);let key=k;
 if(k=='clear'||k=='cloud'){if(c.temperature_2m>=30)key='hot';else if(data.daily.uv_index_max[0]>=7&&c.is_day)key='uv'}
 if(c.temperature_2m<=0&&k!='snow')key='cold';
 return key;
}
function factPool(){
 if(!data)return FACTS;
 const m=factKey();
 return[...FACTS.filter(f=>f[0]==m),...FACTS.filter(f=>f[0]!=m)];
}
const QZ = [
  ['Highway overpasses are a safe place to shelter from a tornado.',0,'Myth. Overpasses can funnel and speed up tornado winds, and people sheltering under them have been killed. Get into a sturdy building instead.',['Os viadutos são um sítio seguro para te abrigares de um tornado.','Mito. Os viadutos podem canalizar e acelerar o vento do tornado, e já morreram pessoas que se abrigaram debaixo deles. Procura antes um edifício sólido.']],
  ['Opening windows before a tornado does nothing to save your house.',1,'Fact. Buildings are wrecked by violent winds and flying debris, not by a pressure difference. Skip the windows and take shelter at once.',['Abrir as janelas antes de um tornado não salva a tua casa.','Facto. Os edifícios são destruídos pelo vento violento e pelos destroços, não por uma diferença de pressão. Esquece as janelas e abriga-te logo.']],
  ['You can always spot a tornado by its funnel.',0,'Myth. Some tornadoes have no visible funnel, are wrapped in rain or strike at night. Act on the warning, not on what you can see.',['Consegues sempre detetar um tornado pelo seu funil.','Mito. Alguns tornados não têm funil visível, estão envoltos em chuva ou surgem de noite. Age pelo aviso, não pelo que consegues ver.']],
  ['Hills, rivers and big cities protect a place from tornadoes.',0,'Myth. Tornadoes have crossed mountains and hit city centres, and one can form over water and move ashore.',['Colinas, rios e grandes cidades protegem um local dos tornados.','Mito. Já houve tornados a atravessar montanhas e a atingir centros de cidades, e um tornado pode formar-se sobre a água e passar para terra.']],
  ['Lightning can strike when the sky overhead looks clear.',1,'Fact. A “bolt from the blue” can land 16–24 km (10–15 miles) from the storm, far outside the rain.',['Um relâmpago pode cair quando o céu por cima de ti parece limpo.','Facto. Um “raio vindo do azul” pode cair a 16–24 km (10–15 milhas) da tempestade, bem fora da chuva.']],
  ['Rubber tyres are what protect you from lightning inside a car.',0,'Myth. It is the metal body that carries the current around you and into the ground. Rubber gives no protection.',['São os pneus de borracha que te protegem de um relâmpago dentro de um carro.','Mito. É a carroçaria metálica que conduz a corrente à tua volta até ao chão. A borracha não protege.']],
  ['Benjamin Franklin’s famous kite was struck by lightning.',0,'Myth. According to NOAA, the kite was never actually struck.',['O famoso papagaio de Benjamin Franklin foi atingido por um relâmpago.','Mito. Segundo a NOAA, o papagaio nunca chegou a ser atingido.']],
  ['“Heat lightning” is just ordinary lightning from a storm too far away to hear.',1,'Fact. There is no special kind of heat lightning. You see the flash, but the thunder fades out before it reaches you.',['O “relâmpago de calor” é só um relâmpago normal de uma trovoada longe de mais para se ouvir.','Facto. Não existe um tipo especial de relâmpago de calor. Vês o clarão, mas o trovão perde-se antes de chegar até ti.']],
  ['It is safe to touch and give first aid to someone struck by lightning.',1,'Fact. A lightning victim carries no electrical charge, and quick first aid can save a life.',['É seguro tocar e prestar os primeiros socorros a alguém atingido por um relâmpago.','Facto. Uma vítima de relâmpago não fica carregada de eletricidade, e uns primeiros socorros rápidos podem salvar uma vida.']],
  ['Just 15 cm of fast-moving floodwater can knock an adult off their feet.',1,'Fact. Six inches is enough, and over half of flood drownings happen when a vehicle is driven into floodwater.',['Bastam 15 cm de água de cheia em movimento rápido para deitar um adulto ao chão.','Facto. Seis polegadas chegam, e mais de metade dos afogamentos em cheias acontecem quando um veículo entra em água de cheia.']],
  ['A car needs about a metre of floodwater before it starts to float.',0,'Myth. Just 30 cm (12 inches) of rushing water can carry away a small car, and 60 cm (2 ft) can carry away most vehicles.',['Um carro precisa de cerca de um metro de água para começar a flutuar.','Mito. Bastam 30 cm de água em movimento rápido para arrastar um carro pequeno, e 60 cm para levar a maioria dos veículos.']],
  ['You can get sunburned in winter.',1,'Fact. UV depends on the Sun’s height and cloud cover, not on how cold the air feels, and snow reflects a lot of it.',['Podes queimar-te com o sol no inverno.','Facto. Os UV dependem da altura do Sol e da nebulosidade, não do frio que sentes, e a neve reflete muita radiação.']],
  ['It can get too cold to snow.',0,'Myth. Snow only needs moisture in the air. Very cold air holds less of it, so heavy snow is less likely, but it is never impossible.',['Pode estar frio de mais para nevar.','Mito. A neve só precisa de humidade no ar. O ar muito frio comporta menos, por isso a neve forte é menos provável, mas nunca impossível.']],
  ['Cold weather by itself gives you a cold.',0,'Myth. Colds and flu are caused by viruses, not by the temperature itself.',['O frio, por si só, dá-te uma constipação.','Mito. As constipações e a gripe são causadas por vírus, não pela temperatura em si.']],
  ['Water swirls down a drain in opposite directions in the two hemispheres.',0,'Myth. The Coriolis effect is far too weak at that scale. The swirl depends on the sink’s shape and how the water was already moving.',['A água roda em sentidos opostos no ralo, consoante o hemisfério.','Mito. O efeito de Coriolis é fraco de mais a essa escala. O sentido da rotação depende da forma da pia e do movimento prévio da água.']],
  ['Hurricanes often form right on the equator.',0,'Myth. The Coriolis effect is close to zero there, so tropical cyclones almost never form within a few degrees of the equator.',['Os furacões formam-se muitas vezes mesmo em cima do equador.','Mito. Aí o efeito de Coriolis é quase nulo, por isso os ciclones tropicais quase nunca se formam a poucos graus do equador.']],
  ['The strongest winds of a hurricane blow in its calm eye.',0,'Myth. The eye is the calmest part, often clear. The strongest winds are in the eyewall around it.',['Os ventos mais fortes de um furacão sopram no seu olho calmo.','Mito. O olho é a parte mais calma, muitas vezes limpa. Os ventos mais fortes estão na parede do olho, à volta dele.']],
  ['A hurricane’s category, from 1 to 5, is based only on its wind speed.',1,'Fact. The Saffir-Simpson scale rates maximum sustained winds. Storm surge and rain can be deadly at any category.',['A categoria de um furacão, de 1 a 5, depende apenas da velocidade do vento.','Facto. A escala de Saffir-Simpson mede o vento máximo sustentado. A maré de tempestade e a chuva podem ser mortais em qualquer categoria.']],
  ['A tropical storm becomes a hurricane once its sustained winds reach 119 km/h.',1,'Fact. That is 74 mph. Below it, the system is a tropical storm or depression.',['Uma tempestade tropical passa a furacão quando o vento sustentado chega aos 119 km/h.','Facto. São 74 mph. Abaixo disso, o sistema é uma tempestade ou depressão tropical.']],
  ['A strong wind can freeze car radiators and water pipes even when the air stays above 0 °C.',0,'Myth. Wind chill measures heat loss from exposed skin. Objects cannot cool below the actual air temperature.',['Um vento forte pode congelar radiadores de carros e canos de água mesmo com o ar acima de 0 °C.','Mito. A sensação térmica mede a perda de calor da pele exposta. Os objetos não arrefecem abaixo da temperatura real do ar.']],
  ['The hottest air temperature ever officially recorded was in the Sahara.',0,'Myth. The WMO record is 56.7 °C at Furnace Creek, Death Valley, California, on 10 July 1913.',['A temperatura do ar mais alta alguma vez registada oficialmente foi no Sara.','Mito. O recorde da OMM é de 56,7 °C em Furnace Creek, no Vale da Morte, na Califórnia, a 10 de julho de 1913.']],
  ['The heaviest hailstone ever recorded weighed more than a kilogram.',1,'Fact. A stone of 1.02 kg fell in Gopalganj, Bangladesh, on 14 April 1986, the WMO record.',['O granizo mais pesado alguma vez registado pesou mais de um quilo.','Facto. Uma pedra de 1,02 kg caiu em Gopalganj, no Bangladesh, a 14 de abril de 1986, o recorde da OMM.']],
  ['The white trails behind high-flying jets are mostly water ice.',1,'Fact. Hot, humid exhaust meets very cold air, and the water vapour condenses and freezes into ice crystals.',['Os rastos brancos atrás dos aviões a grande altitude são sobretudo gelo de água.','Facto. O escape quente e húmido encontra ar muito frio, e o vapor de água condensa-se e congela em cristais de gelo.']],
  ['Every cold snap is caused by the polar vortex.',0,'Myth. Cold snaps have many causes. The polar vortex is only sometimes involved.',['Todas as vagas de frio são causadas pelo vórtice polar.','Mito. As vagas de frio têm muitas causas. O vórtice polar só por vezes está envolvido.']],
  ['Climate is usually defined from weather averaged over about 30 years.',1,'Fact. The WMO uses 30-year periods, such as 1991–2020, to smooth out year-to-year swings.',['O clima define-se normalmente pela média do tempo ao longo de cerca de 30 anos.','Facto. A OMM usa períodos de 30 anos, como 1991–2020, para atenuar as oscilações de ano para ano.']],
  ['Somewhere on Earth, there are more than 40 lightning flashes every second.',1,'Fact. NASA satellites count about 44 flashes a second, around 1.4 billion a year. The old estimate of 100 a second was too high.',['Algures na Terra, ocorrem mais de 40 relâmpagos por segundo.','Facto. Os satélites da NASA contam cerca de 44 clarões por segundo, perto de 1,4 mil milhões por ano. A velha estimativa de 100 por segundo era demasiado alta.']],
  ['Most lightning on Earth happens over land, not over the oceans.',1,'Fact. Roughly 90% of flashes occur over land, where thunderstorms are more favourable to lightning.',['A maior parte dos relâmpagos da Terra acontece em terra, não nos oceanos.','Facto. Cerca de 90% dos clarões ocorrem em terra, onde as trovoadas são mais favoráveis aos relâmpagos.']],
  ['Dust from the Sahara helps fertilise the Amazon rainforest.',1,'Fact. NASA’s CALIPSO satellite tracked about 27.7 million tonnes of dust a year reaching the Amazon, carrying roughly 22,000 tonnes of phosphorus.',['A poeira do Sara ajuda a fertilizar a floresta amazónica.','Facto. O satélite CALIPSO da NASA seguiu cerca de 27,7 milhões de toneladas de poeira por ano a chegar à Amazónia, com cerca de 22 000 toneladas de fósforo.']],
  ['On Saturn’s moon Titan, it rains liquid methane.',1,'Fact. Titan has clouds, rain and lakes of methane and ethane, in a cycle like Earth’s water cycle.',['Em Titã, a lua de Saturno, chove metano líquido.','Facto. Titã tem nuvens, chuva e lagos de metano e etano, num ciclo parecido com o ciclo da água da Terra.']],
  ['Mercury, the planet closest to the Sun, is also the hottest planet.',0,'Myth. Venus is hotter, around 465 °C, because its thick carbon dioxide atmosphere traps heat.',['Mercúrio, o planeta mais próximo do Sol, é também o mais quente.','Mito. Vénus é mais quente, cerca de 465 °C, porque a sua atmosfera espessa de dióxido de carbono retém o calor.']],
  ['Lightning is several times hotter than the surface of the Sun.',1,'Fact. A lightning channel heats the air to about 30,000 °C, around five times the Sun’s surface temperature of roughly 5,500 °C.',['Um relâmpago é várias vezes mais quente do que a superfície do Sol.','Facto. O canal de um relâmpago aquece o ar até cerca de 30 000 °C, umas cinco vezes a temperatura da superfície do Sol, de cerca de 5500 °C.']],
  ['Counting the seconds between a flash and its thunder tells you roughly how far away the storm is.',1,'Fact. Sound travels about 1 km in 3 seconds, so 9 seconds means the lightning struck roughly 3 km away.',['Contar os segundos entre o clarão e o trovão dá-te uma ideia da distância da tempestade.','Facto. O som percorre cerca de 1 km em 3 segundos, por isso 9 segundos significam que o relâmpago caiu a uns 3 km.']],
  ['Lightning never strikes the same place twice.',0,'Myth. Tall, pointed structures get hit again and again. The Empire State Building is struck around 20 times a year.',['Um relâmpago nunca cai duas vezes no mesmo sítio.','Mito. As estruturas altas e pontiagudas são atingidas vezes sem conta. O Empire State Building é atingido cerca de 20 vezes por ano.']],
  ['Raindrops are shaped like teardrops.',0,'Myth. Small drops are nearly round, and bigger ones flatten underneath as they fall, like a hamburger bun.',['As gotas de chuva têm forma de lágrima.','Mito. As gotas pequenas são quase redondas, e as maiores achatam-se por baixo ao cair, como um pão de hambúrguer.']],
  ['The classic snowflake has six arms because of how ice crystals are built.',1,'Fact. Water molecules lock into a hexagonal pattern as they freeze, which gives snow crystals their six-pointed shape.',['O floco de neve clássico tem seis braços por causa da estrutura dos cristais de gelo.','Facto. As moléculas de água encaixam-se num padrão hexagonal ao congelar, o que dá aos cristais de neve a sua forma de seis pontas.']],
  ['The old saying “red sky at night, shepherd’s delight” has some science behind it in mid-latitudes.',1,'Fact. Weather there mostly moves from west to east, and a red sunset suggests dry, settled air arriving from the west.',['O velho ditado inglês “céu vermelho à noite, delícia do pastor” tem alguma ciência por trás nas latitudes médias.','Facto. Aí o tempo desloca-se sobretudo de oeste para leste, e um pôr do sol vermelho sugere ar seco e estável a chegar do lado oeste.']],
  ['The sky is blue because it reflects the colour of the oceans.',0,'Myth. Air molecules scatter the short, blue wavelengths of sunlight far more than the red ones, so blue light reaches your eyes from every direction.',['O céu é azul porque reflete a cor dos oceanos.','Mito. As moléculas do ar dispersam muito mais os comprimentos de onda curtos, azuis, da luz solar do que os vermelhos, por isso a luz azul chega aos teus olhos de todas as direções.']],
  ['Clouds are made of water vapour.',0,'Myth. Water vapour is an invisible gas. Clouds are made of countless tiny liquid droplets or ice crystals.',['As nuvens são feitas de vapor de água.','Mito. O vapor de água é um gás invisível. As nuvens são feitas de incontáveis gotículas de água líquida ou cristais de gelo.']],
  ['A fluffy fair-weather cloud can weigh as much as hundreds of tonnes.',1,'Fact. A typical cumulus holds roughly 500 tonnes of water droplets, kept aloft by rising air and by the droplets being so tiny.',['Uma nuvem branca e fofa de bom tempo pode pesar centenas de toneladas.','Facto. Um cúmulo típico contém cerca de 500 toneladas de gotículas de água, mantidas no ar pela corrente ascendente e por serem tão minúsculas.']],
  ['Cold air can hold more water vapour than warm air.',0,'Myth. It is the other way round. Warm air can hold roughly 6–7% more water vapour for every degree Celsius it warms.',['O ar frio consegue conter mais vapor de água do que o ar quente.','Mito. É o contrário. O ar quente consegue conter cerca de 6 a 7% mais vapor de água por cada grau Celsius que aquece.']],
  ['Fog is simply a cloud that touches the ground.',1,'Fact. Fog and low cloud are the same thing. It is called fog when the cloud base is at ground level.',['O nevoeiro é simplesmente uma nuvem que toca no chão.','Facto. Nevoeiro e nuvem baixa são a mesma coisa. Chama-se nevoeiro quando a base da nuvem está ao nível do solo.']],
  ['If the relative humidity is 100%, it must be raining.',0,'Myth. It only means the air is saturated. Fog can sit at 100% with no rain at all.',['Se a humidade relativa for de 100%, tem de estar a chover.','Mito. Só quer dizer que o ar está saturado. O nevoeiro pode estar a 100% sem chuva nenhuma.']],
  ['Humid air is lighter than dry air.',1,'Fact. A water molecule is lighter than the nitrogen and oxygen molecules it displaces, so moist air is slightly less dense than dry air at the same temperature and pressure.',['O ar húmido é mais leve do que o ar seco.','Facto. Uma molécula de água é mais leve do que as moléculas de azoto e de oxigénio que desloca, por isso o ar húmido é ligeiramente menos denso do que o ar seco à mesma temperatura e pressão.']],
  ['Falling air pressure usually means the weather is about to get worse.',1,'Fact. Falling pressure often signals an approaching low, bringing more cloud, wind and rain. Rising pressure usually means settled weather.',['Uma descida da pressão atmosférica costuma indicar que o tempo vai piorar.','Facto. Uma descida da pressão sinaliza muitas vezes a aproximação de uma depressão, com mais nuvens, vento e chuva. Uma subida da pressão costuma significar tempo estável.']],
  ['Wind, not water, causes most deaths in US hurricanes.',0,'Myth. Studies of US tropical cyclones found that water causes the large majority of deaths, mainly storm surge and inland flooding.',['O vento, e não a água, causa a maioria das mortes nos furacões dos EUA.','Mito. Os estudos sobre os ciclones tropicais nos EUA concluíram que a água causa a grande maioria das mortes, sobretudo a maré de tempestade e as inundações no interior.']],
  ['The Sun warms the air mostly by heating the ground first.',1,'Fact. Sunlight passes through clear air with little warming. The ground absorbs it and then heats the air above.',['O Sol aquece o ar sobretudo por aquecer primeiro o chão.','Facto. A luz solar atravessa o ar limpo sem o aquecer muito. O chão absorve-a e depois aquece o ar por cima.']],
  ['It is warmer in summer because Earth is closer to the Sun.',0,'Myth. Seasons come from Earth’s tilt. Earth is actually closest to the Sun in early January, in the middle of the northern winter.',['O verão é mais quente porque a Terra está mais perto do Sol.','Mito. As estações do ano devem-se à inclinação da Terra. A Terra está, na verdade, mais perto do Sol no início de janeiro, em pleno inverno do hemisfério norte.']],
  ['A northerly wind blows towards the north.',0,'Myth. Winds are named after where they come from, so a northerly blows from the north towards the south.',['Um vento do norte sopra em direção ao norte.','Mito. Os ventos têm o nome da direção de onde vêm, por isso um vento do norte sopra do norte para o sul.']],
  ['A rainbow is really a full circle.',1,'Fact. From an aircraft or a high vantage point you can see the whole circle. On the ground, the horizon hides the lower part.',['Um arco-íris é, na verdade, um círculo completo.','Facto. De um avião ou de um ponto bem alto podes ver o círculo inteiro. No chão, o horizonte esconde a parte de baixo.']],
  ['The Sahara is the largest desert on Earth.',0,'Myth. Antarctica is, at about 14 million km². The Sahara, at roughly 9 million km², is the largest hot desert.',['O Sara é o maior deserto da Terra.','Mito. A Antártida é, com cerca de 14 milhões de km². O Sara, com cerca de 9 milhões de km², é o maior deserto quente.']],
  ['Air temperature has dropped below −89 °C on Earth.',1,'Fact. The WMO-recognised record is −89.2 °C at Vostok Station, Antarctica, on 21 July 1983.',['A temperatura do ar já desceu abaixo de −89 °C na Terra.','Facto. O recorde reconhecido pela OMM é de −89,2 °C na estação Vostok, na Antártida, a 21 de julho de 1983.']],
  ['Oxygen makes up most of the air we breathe.',0,'Myth. Air is about 78% nitrogen and 21% oxygen, with argon and traces of other gases making up the rest.',['O oxigénio é a maior parte do ar que respiramos.','Mito. O ar é cerca de 78% azoto e 21% oxigénio, e o resto é árgon e vestígios de outros gases.']],
  ['The hole in the ozone layer is the main cause of global warming.',0,'Myth. They are separate problems. Ozone depletion lets in more ultraviolet light, while global warming comes mainly from greenhouse gases such as carbon dioxide.',['O buraco na camada de ozono é a principal causa do aquecimento global.','Mito. São problemas diferentes. A destruição do ozono deixa passar mais radiação ultravioleta, enquanto o aquecimento global vem sobretudo de gases com efeito de estufa, como o dióxido de carbono.']],
  ['It can thunder while it snows.',1,'Fact. “Thundersnow” is rare but real. It needs unstable air, and it shows up in some winter storms and lake-effect snow.',['Pode haver trovoada enquanto neva.','Facto. A “trovoada com neve” é rara, mas existe. Precisa de ar instável e surge em algumas tempestades de inverno e em nevões de efeito de lago.']],
  ['In the Northern Hemisphere, every tornado spins counterclockwise.',0,'Myth. Most do, but a small fraction spin clockwise. Each tornado takes its spin from the storm that spawns it.',['No hemisfério norte, todos os tornados rodam no sentido contrário ao dos ponteiros do relógio.','Mito. A maioria sim, mas uma pequena parte roda no sentido dos ponteiros do relógio. Cada tornado herda a rotação da tempestade que o gera.']],
  ['A heat wave means the same temperature threshold everywhere.',0,'Myth. A heat wave is judged against the local climate, so a temperature that is ordinary in one place can count as a heat wave in another.',['Uma onda de calor significa o mesmo limite de temperatura em todo o lado.','Mito. Uma onda de calor mede-se em relação ao clima local, por isso uma temperatura normal num sítio pode ser onda de calor noutro.']],
  ['Fahrenheit and Celsius show the same number at −40 degrees.',1,'Fact. It is the one temperature where the two scales meet: −40 °C is exactly −40 °F.',['Fahrenheit e Celsius mostram o mesmo número aos −40 graus.','Facto. É a única temperatura em que as duas escalas coincidem: −40 °C são exatamente −40 °F.']],
  ['El Niño is a cooling of the tropical Pacific Ocean.',0,'Myth. El Niño is a warming of surface water in the central and eastern tropical Pacific. The cool phase is called La Niña.',['O El Niño é um arrefecimento do oceano Pacífico tropical.','Mito. O El Niño é um aquecimento da água à superfície no Pacífico tropical central e oriental. A fase fria chama-se La Niña.']],
  ['The smell of rain comes partly from bacteria in the soil.',1,'Fact. Soil bacteria make a compound called geosmin, and falling raindrops launch it into the air. Our noses detect it at tiny concentrations.',['O cheiro da chuva vem em parte de bactérias do solo.','Facto. As bactérias do solo produzem um composto chamado geosmina, e as gotas de chuva lançam-no para o ar. O nosso nariz deteta-o em concentrações minúsculas.']],
  ['A hurricane keeps getting stronger after it moves over land.',0,'Myth. Over land it loses its warm, moist ocean fuel and meets more friction, so it weakens, though the rain and flooding can last for days.',['Um furacão continua a ficar mais forte depois de passar para terra.','Mito. Em terra perde o combustível quente e húmido do oceano e encontra mais atrito, por isso enfraquece, embora a chuva e as inundações possam durar dias.']],
  ['Ball lightning is a scientifically proven phenomenon.',1,'Fact. Though rare and unpredictable, ball lightning has been captured on high-speed spectrometers and documented for centuries. Laboratory experiments have reproduced miniature glowing plasma spheres.',['O relâmpago globular é um fenómeno comprovado pela ciência.','Facto. Embora raro e imprevisível, o relâmpago globular já foi gravado por espetrómetros de alta velocidade e documentado ao longo de séculos. Experiências laboratoriais conseguiram reproduzir pequenas esferas de plasma brilhante.']],
  ['Lightning never strikes an airplane while in mid-air.',0,'Myth. Commercial airliners are struck by lightning on average once or twice each year. Their aluminium skins and conductive shielding allow the electrical discharge to pass safely around the cabin and exit without injuring passengers.',['Os relâmpagos nunca atingem aviões em pleno voo.','Mito. Os aviões comerciais são atingidos por relâmpagos em média uma ou duas vezes por ano. A fuselagem metálica conduz a corrente pelo exterior, sem perigo para os passageiros.']],
  ['Cirrus clouds are composed entirely of ice crystals.',1,'Fact. Cirrus clouds form in the upper troposphere at altitudes above 6,000 metres where temperatures are typically below −40 °C, so they consist entirely of suspended hexagonal ice crystals.',['As nuvens de cirros são formadas inteiramente por cristais de gelo.','Facto. Os cirros formam-se na alta troposfera a altitudes superiores a 6000 metros, onde as temperaturas estão abaixo de −40 °C, sendo compostos apenas por cristais de gelo em suspensão.']],
  ['Tsunamis are caused by violent hurricane storm surges.',0,'Myth. Tsunamis are generated by underwater earthquakes, submarine volcanic eruptions, or massive undersea landslides, not by weather or atmospheric winds.',['Os tsunamis são provocados pela maré de tempestade dos furacões.','Mito. Os tsunamis são gerados por sismos submarinos, erupções vulcânicas no fundo do oceano ou deslizamentos de terra submarinos, e não pelo tempo atmosférico nem pelo vento.']],
  ['Rain can cause joint pain in people with arthritis.',1,'Fact. A drop in barometric pressure before rain allows tissues and fluids around joints to slightly expand, irritating inflamed nerve endings in sensitive joints.',['A chuva pode provocar dores nas articulações de quem tem artrite.','Facto. A descida da pressão atmosférica antes da chuva permite que os tecidos e fluidos à volta das articulações se expandam ligeiramente, irritando as terminações nervosas inflamadas.']],
  ['The eye of a tropical cyclone is always cloud-free.',0,'Myth. While the calm eye often shows blue sky or stars, low stratocumulus clouds or high cirrus shields frequently linger within the eye.',['O olho de um ciclone tropical está sempre livre de nuvens.','Mito. Embora o olho calmo mostre muitas vezes céu azul ou estrelas, estratocúmulos baixos ou cirros altos permanecem frequentemente dentro do olho.']],
  ['Hail only forms during cold winter months.',0,'Myth. Hail develops most frequently in late spring and summer, because intense solar heating creates the violent updrafts required to keep ice stones suspended while growing.',['O granizo só se forma nos meses frios de inverno.','Mito. O granizo ocorre com mais frequência no final da primavera e no verão, pois o calor intenso do sol gera as correntes ascendentes fortes necessárias para manter as pedras de gelo suspensas enquanto crescem.']],
  ['A lightning flash can be hotter than the surface of the Sun.',1,'Fact. A lightning discharge heats its air channel to roughly 30,000 °C, about five times hotter than the surface of the Sun (5,500 °C).',['Um relâmpago pode ser mais quente do que a superfície do Sol.','Facto. Um canal de relâmpago atinge cerca de 30 000 °C, cerca de cinco vezes a temperatura da superfície solar (5500 °C).']],
  ['The Mariana Trench is deeper than Mount Everest is tall.',1,'Fact. Challenger Deep drops to nearly 11,000 metres below sea level, easily submerging Mount Everest (8,848 metres) with more than two kilometres of ocean to spare.',['A Fossa das Marianas é mais profunda do que o Monte Evereste é alto.','Facto. O abismo Challenger atinge quase 11 000 metros de profundidade, cobrindo o Monte Evereste (8848 metros) com mais de dois quilómetros de água por cima.']],
  ['Global sea level would rise over 60 metres if all Antarctic ice melted.',1,'Fact. The Antarctic ice sheet stores roughly 27 million cubic kilometres of ice. Complete melting would raise global oceans by approximately 58 to 65 metres.',['O nível do mar subiria mais de 60 metros se todo o gelo da Antártida derretesse.','Facto. O manto de gelo da Antártida contém cerca de 27 milhões de quilómetros cúbicos de gelo. Se derretesse por completo, o nível médio dos oceanos subiria entre 58 e 65 metros.']],
  ['Lightning bolts travel only downwards from cloud to ground.',0,'Myth. Lightning can travel cloud-to-cloud, cloud-to-air, and upward from tall skyscrapers or radio towers towards storm clouds as upward leaders.',['Os raios viajam apenas de cima para baixo, da nuvem para o solo.','Mito. Os relâmpagos podem viajar entre nuvens, da nuvem para o ar, ou disparar do solo para cima a partir de arranha-céus e antenas altas.']],
  ['The smell of ozone before a thunderstorm comes from split air molecules.',1,'Fact. High-voltage lightning discharges split diatomic oxygen (O₂) into single atoms, which rapidly bind with other O₂ to form ozone (O₃), giving pre-storm air a sharp, metallic aroma.',['O cheiro a ozono antes de uma trovoada vem de moléculas de ar divididas.','Facto. As descargas elétricas dividem as moléculas de oxigénio (O₂), que se recombinam formando ozono (O₃), conferindo ao ar pré-tempestade um aroma metálico e fresco.']],
  ['A sunset looks red because air molecules absorb red light.',0,'Myth. Air molecules scatter blue light away from your line of sight through Rayleigh scattering, letting the longer red and orange wavelengths pass through to your eyes.',['O pôr do sol parece vermelho porque as moléculas do ar absorvem a luz vermelha.','Mito. As moléculas do ar dispersam a luz azul para fora da linha de visão (dispersão de Rayleigh), deixando passar até aos teus olhos os comprimentos de onda vermelhos e laranjas.']],
  ['Snowflakes can clump together into clusters larger than dinner plates.',1,'Fact. Near 0 °C, sticky melting snowflakes collide and knit together into giant aggregate flakes. Clumps up to 38 cm (15 inches) wide have been officially documented.',['Os flocos de neve podem aglomerar-se em aglomerados maiores do que pratos.','Facto. Perto dos 0 °C, flocos húmidos e pegajosos colidem e fundem-se em aglomerados gigantes. Já foram registados aglomerados com até 38 cm de largura.']],
  ['Deserts are defined by how hot they get during the day.',0,'Myth. Deserts are defined strictly by annual precipitation (usually under 250 mm per year). Antarctica and parts of the Arctic are cold deserts.',['Os desertos definem-se pelo calor que atingem durante o dia.','Mito. Os desertos são definidos estritamente pela baixa precipitação anual (geralmente abaixo de 250 mm por ano). A Antártida e partes do Ártico são desertos frios.']],
  ['A solar flare can temporarily blind satellite navigation and radios on Earth.',1,'Fact. Solar flares emit powerful bursts of X-rays and extreme UV radiation that ionize Earth’s upper atmosphere, absorbing high-frequency radio signals and degrading GPS accuracy.',['Uma erupção solar pode perturbar temporariamente o GPS e o rádio na Terra.','Facto. As erupções solares emitem radiação X e ultravioleta que ionizam a alta atmosfera, absorvendo sinais de rádio de alta frequência e degradando a precisão do GPS.']],
  ['Standing under a tall isolated tree during a thunderstorm is safe if it is dry.',0,'Myth. Tall trees act as natural lightning rods. Ground currents and side flashes from the trunk kill many people who shelter under them.',['Ficar debaixo de uma árvore isolada durante uma trovoada é seguro se ela estiver seca.','Mito. Árvores altas atraem descargas elétricas. A corrente pelo solo e faíscas laterais que saltam do tronco causam frequentemente acidentes mortais.']],
  ['The ozone layer is located in the Earth’s stratosphere.',1,'Fact. About 90% of atmospheric ozone resides in the stratosphere between 15 and 35 km altitude, where it absorbs harmful solar ultraviolet radiation.',['A camada de ozono localiza-se na estratosfera da Terra.','Facto. Cerca de 90% do ozono atmosférico situa-se na estratosfera, entre 15 e 35 km de altitude, onde absorve a perigosa radiação ultravioleta do Sol.']],
  ['Mirages are optical illusions caused by hallucinations from extreme thirst.',0,'Myth. Mirages are real physical refraction phenomena caused by temperature gradients in the air bending light rays, and they can be photographed by cameras.',['As miragens são alucinações causadas pela sede extrema.','Mito. As miragens são fenómenos óticos reais causados pela refração da luz em camadas de ar com temperaturas diferentes, podendo ser fotografadas normalmente.']],
  ['Thunder can be heard more than 100 kilometres away.',0,'Myth. Under typical atmospheric conditions, thunder rarely travels more than 20 to 25 km before sound refraction and thermal scattering attenuate it completely.',['O trovão pode ouvir-se a mais de 100 quilómetros de distância.','Mito. Em condições normais, o trovão raramente se propaga além de 20 a 25 km antes de a refração do som e a turbulência atmosférica o dissiparem.']]
];

/* ---- Facto do dia: 31 factos, nenhum repete os do "Sabias que" nem as perguntas ---- */
const DAILY = [
  ['Climate','26 metres of rain in a single year','Cherrapunji, in India, received more than 26 metres of rain between August 1860 and July 1861, the highest twelve-month total in the WMO archive.',['26 metros de chuva num só ano','Cherrapunji, na Índia, recebeu mais de 26 metros de chuva entre agosto de 1860 e julho de 1861, o maior total de doze meses no arquivo da OMM.']],
  ['Atmosphere','Air has weight','At sea level, the air above every square centimetre weighs about a kilogram. The highest sea-level pressure ever recorded, 1,083.8 hPa at Agata, Russia, in December 1968, was only about 7% above normal.',['O ar tem peso','Ao nível do mar, o ar por cima de cada centímetro quadrado pesa cerca de um quilo. A pressão mais alta alguma vez registada ao nível do mar, 1083,8 hPa em Agata, na Rússia, em dezembro de 1968, ficou só cerca de 7% acima do normal.']],
  ['Meteorology','The fastest wind ever measured','A gust of 408 km/h hit Barrow Island, Australia, on 10 April 1996, during tropical cyclone Olivia. It is the strongest surface gust on record outside a tornado.',['O vento mais rápido alguma vez medido','Uma rajada de 408 km/h atingiu a ilha Barrow, na Austrália, a 10 de abril de 1996, durante o ciclone tropical Olivia. É a rajada à superfície mais forte registada fora de um tornado.']],
  ['Meteorology','Hailstones grow in rings','Cut a big hailstone open and you will find layers like an onion. Each trip up and down inside a storm’s updraft adds another coat of ice.',['O granizo cresce em anéis','Se cortares uma pedra de granizo grande, vês camadas como numa cebola. Cada viagem para cima e para baixo na corrente ascendente da tempestade acrescenta mais uma camada de gelo.']],
  ['Atmosphere','Weather lives in the bottom layer','The troposphere holds roughly three quarters of all the air in the atmosphere and nearly all of its clouds and weather. It is roughly 8 to 18 km thick, thinnest at the poles.',['O tempo vive na camada de baixo','A troposfera contém cerca de três quartos de todo o ar da atmosfera e quase todas as nuvens e o tempo. Tem entre 8 e 18 km de espessura, sendo mais fina nos polos.']],
  ['Meteorology','A millimetre of rain is a litre','One millimetre of rain falling on one square metre of ground is exactly one litre of water. That is how rain gauge totals translate into real water.',['Um milímetro de chuva é um litro','Um milímetro de chuva a cair sobre um metro quadrado de terreno equivale a exatamente um litro de água. É assim que os totais do udómetro se traduzem em água real.']],
  ['Meteorology','The Beaufort scale was born at sea','In 1805 the Royal Navy officer Francis Beaufort devised a way to rate wind by its effects on a ship’s sails. It was later adapted for waves and for land.',['A escala de Beaufort nasceu no mar','Em 1805, o oficial da Marinha Real Francis Beaufort criou uma forma de classificar o vento pelos seus efeitos nas velas de um navio. Mais tarde foi adaptada às ondas e à terra.']],
  ['Meteorology','Deadly storms lose their names','Atlantic hurricane names come from six lists that rotate year after year. When a storm is especially deadly or costly, as Katrina was, its name is retired for good.',['As tempestades mortais perdem o nome','Os nomes dos furacões do Atlântico vêm de seis listas que se repetem ano após ano. Quando uma tempestade é especialmente mortífera ou cara, como o Katrina, o nome é retirado para sempre.']],
  ['Physics','Celsius’s thermometer was upside down','In Anders Celsius’s original scale, water boiled at 0 and froze at 100. It was reversed soon after he died.',['O termómetro de Celsius estava ao contrário','Na escala original de Anders Celsius, a água fervia a 0 e congelava a 100. Foi invertida pouco depois da sua morte.']],
  ['Meteorology','Snow is mostly air','As a rough average, 10 cm of fresh snow melts down to about 1 cm of water, but the ratio swings a lot with temperature and the type of snow.',['A neve é sobretudo ar','Em média, 10 cm de neve fresca derretem em cerca de 1 cm de água, mas a proporção varia muito com a temperatura e o tipo de neve.']],
  ['Atmosphere','A river of wind high above','Jet streams are narrow bands of fast wind, mostly blowing west to east around 9 to 12 km up. Their speeds can top 300 km/h.',['Um rio de vento lá no alto','As correntes de jato são faixas estreitas de vento rápido, que sopram sobretudo de oeste para leste, a cerca de 9 a 12 km de altitude. A velocidade pode passar dos 300 km/h.']],
  ['Planetary science','A storm wider than Earth','Jupiter’s Great Red Spot is a giant storm that has been watched for well over a century, and it is wider than our whole planet.',['Uma tempestade mais larga do que a Terra','A Grande Mancha Vermelha de Júpiter é uma tempestade gigante observada há bem mais de um século, e é mais larga do que o nosso planeta inteiro.']],
  ['Planetary science','Supersonic winds on Neptune','Neptune has the fastest winds in the solar system, up to about 2,000 km/h, even though it is the farthest planet from the Sun’s warmth.',['Ventos supersónicos em Neptuno','Neptuno tem os ventos mais rápidos do sistema solar, até cerca de 2000 km/h, apesar de ser o planeta mais afastado do calor do Sol.']],
  ['Planetary science','Dust storms that cover a planet','Every few years, a dust storm on Mars can grow until it wraps the entire planet. The one in 2018 blocked so much sunlight that NASA’s Opportunity rover went silent.',['Tempestades de poeira que cobrem um planeta','De poucos em poucos anos, uma tempestade de poeira em Marte pode crescer até envolver o planeta inteiro. A de 2018 bloqueou tanta luz solar que o rover Opportunity, da NASA, ficou em silêncio.']],
  ['Atmosphere','The ozone layer’s address','Most of Earth’s ozone sits in the stratosphere, roughly 15 to 35 km up, where it absorbs most of the Sun’s harmful ultraviolet light.',['A morada da camada de ozono','A maior parte do ozono da Terra está na estratosfera, a cerca de 15 a 35 km de altitude, onde absorve a maior parte da radiação ultravioleta nociva do Sol.']],
  ['Atmosphere','Scorching, yet freezing','The International Space Station orbits in the thermosphere, where the few gas particles around it can reach about 2,000 °C. There are so few of them that they could not warm you.',['Escaldante, mas gelado','A Estação Espacial Internacional orbita na termosfera, onde as poucas partículas de gás à volta podem chegar a cerca de 2000 °C. São tão poucas que não te aqueceriam.']],
  ['Climate','The ocean is Earth’s heat sponge','Oceans have absorbed roughly 90% of the extra heat trapped by greenhouse gases in recent decades, which is why sea temperatures matter so much for climate.',['O oceano é a esponja de calor da Terra','Os oceanos absorveram cerca de 90% do calor extra retido pelos gases com efeito de estufa nas últimas décadas, e é por isso que a temperatura do mar pesa tanto no clima.']],
  ['Climate','Ice cores are time machines','Bubbles of ancient air trapped in Antarctic ice cores let scientists read the atmosphere back some 800,000 years.',['Os núcleos de gelo são máquinas do tempo','As bolhas de ar antigo presas nos núcleos de gelo da Antártida permitem aos cientistas ler a atmosfera até há cerca de 800 000 anos.']],
  ['Astronomy','Earth’s wobble paces the ice ages','Slow, regular changes in Earth’s orbit and tilt, the Milankovitch cycles, help time the ice ages. The tilt itself drifts between about 22.1° and 24.5° over some 41,000 years.',['A oscilação da Terra marca o ritmo das idades do gelo','Mudanças lentas e regulares na órbita e na inclinação da Terra, os ciclos de Milankovitch, ajudam a marcar o ritmo das idades do gelo. A própria inclinação oscila entre cerca de 22,1° e 24,5° ao longo de uns 41 000 anos.']],
  ['Meteorology','A thousand twisters a year','The United States sees about 1,200 tornadoes in an average year, more than any other country.',['Mil tornados por ano','Os Estados Unidos têm cerca de 1200 tornados num ano médio, mais do que qualquer outro país.']],
  ['Meteorology','Tornadoes are rated by their damage','The Enhanced Fujita scale, from EF0 to EF5, estimates a tornado’s winds from the damage left behind, because measuring them directly is rare.',['Os tornados são classificados pelos estragos','A escala Fujita melhorada, de EF0 a EF5, estima o vento de um tornado a partir dos estragos que deixa, porque medi-lo diretamente é raro.']],
  ['Meteorology','One storm, three names','Hurricanes, typhoons and cyclones are the same kind of storm. The name depends only on the ocean where it forms.',['Uma tempestade, três nomes','Furacões, tufões e ciclones são o mesmo tipo de tempestade. O nome depende só do oceano onde se forma.']],
  ['Meteorology','Monsoon simply means “season”','The word comes from the Arabic mawsim, “season”, and reached Portuguese as monção.',['Monção quer simplesmente dizer “estação”','A palavra vem do árabe mawsim, “estação”, e chegou ao português como monção.']],
  ['Thermodynamics','Rising air cools down','Dry air cools by about 10 °C for every kilometre it climbs, which is one reason mountain tops are so cold.',['O ar que sobe arrefece','O ar seco arrefece cerca de 10 °C por cada quilómetro que sobe, o que é uma das razões pelas quais o topo das montanhas é tão frio.']],
  ['Astronomy','The Sun that never sets','North of the Arctic Circle the Sun stays above the horizon for at least one full day every summer. At the North Pole it lasts for months.',['O Sol que nunca se põe','A norte do Círculo Polar Ártico, o Sol fica acima do horizonte pelo menos um dia inteiro em cada verão. No Polo Norte dura meses.']],
  ['Meteorology','A record day of rain','La Réunion’s Foc-Foc received 1,825 mm of rain in 24 hours in January 1966, during Cyclone Denise. That is the world record.',['Um dia de chuva recorde','Foc-Foc, na ilha da Reunião, recebeu 1825 mm de chuva em 24 horas em janeiro de 1966, durante o ciclone Denise. É o recorde mundial.']],
  ['Climate','El Niño changes weather worldwide','Every two to seven years, surface water in the central and eastern tropical Pacific warms up, which shifts rainfall and temperatures across much of the globe.',['O El Niño muda o tempo no mundo inteiro','Com intervalos de dois a sete anos, a água à superfície no Pacífico tropical central e oriental aquece, o que desloca a chuva e as temperaturas por grande parte do globo.']],
  ['Climate','Why we are not a frozen planet','The natural greenhouse effect lifts Earth’s average surface temperature to about 15 °C. Without it, it would be around −18 °C.',['Porque não somos um planeta gelado','O efeito de estufa natural eleva a temperatura média à superfície da Terra para cerca de 15 °C. Sem ele, seria à volta de −18 °C.']],
  ['Meteorology','Why storm clouds have anvils','A tall thunderstorm cloud flattens into an anvil when its rising air hits the stable layer at the top of the troposphere and has nowhere to go but sideways.',['Porque é que as nuvens de tempestade têm bigorna','Uma nuvem de trovoada alta achata-se numa bigorna quando o ar ascendente bate na camada estável no topo da troposfera e só pode espalhar-se para os lados.']],
  ['Meteorology','Dust devils need no storm','Dust devils spin up on hot, sunny ground under clear skies. They are usually far weaker than tornadoes, which grow out of thunderstorms.',['Os remoinhos de poeira não precisam de tempestade','Os remoinhos de poeira formam-se em solo quente e soalheiro, com céu limpo. Costumam ser muito mais fracos do que os tornados, que nascem de trovoadas.']],
  ['Climate','Antarctica’s ice','Antarctica holds about 90% of all the ice on Earth.',['O gelo da Antártida','A Antártida contém cerca de 90% de todo o gelo da Terra.']],
  ['Atmosphere','The ionosphere bounces radio waves around the curve of the Earth','Discovered in the early 20th century, the electrically charged ionosphere acts like a mirror for high-frequency radio waves, allowing long-distance communications across continents before satellites.',['A ionosfera reflete ondas de rádio além da curva da Terra','Descoberta no início do século XX, a ionosfera eletricamente carregada funciona como um espelho para ondas de rádio de alta frequência, permitindo comunicações entre continentes antes dos satélites.']],
  ['Meteorology','Supercells: storms with rotating updrafts','The most dangerous thunderstorms, supercells, contain a deep and persistent rotating updraft called a mesocyclone, which produces the vast majority of violent tornadoes and giant hailstones.',['Supercélulas: tempestades com correntes rotativas','As trovoadas mais perigosas, as supercélulas, contêm uma corrente ascendente rotativa contínua chamada mesociclone, que dá origem à grande maioria dos tornados violentos e pedras de granizo gigantes.']],
  ['Oceanography','The Gulf Stream carries more water than all world rivers combined','Transporting warm tropical water northwards into the North Atlantic at over 30 million cubic metres per second, the Gulf Stream helps keep Western Europe significantly milder than equivalent latitudes in North America.',['A Corrente do Golfo transporta mais água do que todos os rios do mundo juntos','Ao transportar água quente tropical para o Atlântico Norte a mais de 30 milhões de metros cúbicos por segundo, a Corrente do Golfo mantém a Europa Ocidental muito mais amena do que as mesmas latitudes na América do Norte.']],
  ['Planetary science','Venus has sulfuric acid clouds and runaway greenhouse heat','With an atmosphere composed of 96% carbon dioxide and shrouded in sulfuric acid haze, surface pressure on Venus is 92 times that of Earth and temperatures reach 465 °C, enough to melt lead.',['Vénus tem nuvens de ácido sulfúrico e calor extremo','Com uma atmosfera de 96% de dióxido de carbono e envolta em nuvens de ácido sulfúrico, a pressão à superfície de Vénus é 92 vezes a da Terra e a temperatura chega aos 465 °C, o suficiente para derreter chumbo.']],
  ['Physics','The speed of sound changes with temperature','Sound travels at roughly 331 m/s at 0 °C in dry air, speeding up by about 0.6 m/s for every degree Celsius rise in air temperature because warmer molecules move and transmit kinetic energy faster.',['A velocidade do som muda com a temperatura','O som desloca-se a cerca de 331 m/s a 0 °C no ar seco, acelerando cerca de 0,6 m/s por cada grau Celsius de subida de temperatura, porque as moléculas mais quentes vibram e transmitem energia mais depressa.']],
  ['Meteorology','Derechos: windstorms that run for hundreds of miles','A derecho is a widespread, long-lived straight-line windstorm associated with fast-moving bands of severe thunderstorms, capable of producing hurricane-force gusts over paths longer than 400 km.',['Derechos: tempestades de vento em linha reta por centenas de quilómetros','Um derecho é uma tempestade de vento generalizada e prolongada associada a faixas de trovoadas fortes de deslocação rápida, capaz de produzir rajadas com força de furacão ao longo de trajetos com mais de 400 km.']],
  ['Climate','The Younger Dryas: a sudden freeze 12,900 years ago','During Earth’s warming out of the last ice age, a massive influx of glacial meltwater disrupted Atlantic ocean circulation, plunging the Northern Hemisphere back into near-glacial conditions in less than a decade.',['O Dryas Recente: um congelamento súbito há 12 900 anos','Durante o degelo da última glaciação, uma enorme descarga de água doce nos oceanos perturbou a circulação do Atlântico Norte, atirando o hemisfério norte de volta para um frio quase glacial em menos de uma década.']],
  ['Atmosphere','Carbon dioxide stays in the air for centuries','Unlike water vapour which cycles out of the air as precipitation within days, a significant fraction of emitted carbon dioxide remains in the atmosphere for centuries to millennia before being absorbed by oceans and rocks.',['O dióxido de carbono permanece séculos no ar','Ao contrário do vapor de água, que precipita em poucos dias sob a forma de chuva, uma fração importante do dióxido de carbono emitido permanece na atmosfera durante séculos a milénios antes de ser reabsorvida.']],
  ['Meteorology','Microbursts: invisible downdraft hazards for aviation','A microburst occurs when a concentrated column of sinking cold air plunges from a thunderstorm and spreads radially upon hitting the ground, producing extreme wind shear that posed severe risks to landing aircraft before modern Doppler radar.',['Microbursts: o perigo invisível das rajadas descendentes para a aviação','Um microburst ocorre quando uma coluna concentrada de ar frio desce a pique de uma trovoada e se espalha em leque ao bater no chão, gerando um cisalhamento do vento violento que era um perigo crítico para aviões antes dos radares Doppler modernos.']],
  ['Astronomy','The solar wind creates a protective bubble around the planets','The heliosphere is a vast bubble of solar plasma and magnetic fields swept outward by the solar wind, shielding the Earth and other planets from high-energy interstellar cosmic radiation.',['O vento solar cria uma bolha protetora à volta dos planetas','A heliosfera é uma vasta bolha de plasma solar e campos magnéticos empurrada pelo vento solar, que protege a Terra e os restantes planetas da radiação cósmica interestelar de alta energia.']],
  ['Optics','Circumhorizontal arcs: the fiery rainbow in the sky','Often called a fire rainbow, this optical phenomenon is neither fire nor rain. It occurs when sunlight enters the vertical side face of flat hexagonal ice crystals in high cirrus clouds and refracts out through the bottom face at high solar angles.',['Arcos circum-horizontais: o arco-íris de fogo no céu','Muitas vezes chamado arco-íris de fogo, este fenómeno ótico não é fogo nem chuva. Ocorre quando a luz solar incide na face vertical de cristais de gelo planos em cirros altos e sai refratada pela face inferior com o Sol bem alto.']],
  ['Atmosphere','The Karman line: the official boundary of space','Set at 100 kilometres above sea level, the Kármán line marks the altitude where the atmosphere becomes so thin that an aircraft would need to fly faster than orbital velocity to generate aerodynamic lift.',['A linha de Kármán: a fronteira oficial do espaço','Fixada a 100 quilómetros acima do nível do mar, a linha de Kármán marca a altitude onde a atmosfera é tão rarefeita que um avião teria de voar mais depressa do que a velocidade orbital para obter sustentação aerodinâmica.']],
  ['Climate','Tree rings tell past weather over thousands of years','Dendroclimatology studies annual growth rings in ancient trees like bristlecone pines, providing scientists with an unbroken calendar of temperature, drought, and rainfall reaching back over 9,000 years.',['Os anéis das árvores contam o tempo de há milhares de anos','A dendroclimatologia estuda os anéis anuais de crescimento de árvores milenares, como os pinheiros bristlecone, fornecendo aos cientistas um arquivo ininterrupto de temperaturas, secas e chuvas que recua mais de 9000 anos.']],
  ['Meteorology','Rain shadows create the world’s driest deserts','When moist air hits a mountain range, it is forced upward, cools, and drops its moisture as rain on the windward side. As it sinks on the leeward side, it warms and dries out, forming rain shadow deserts like the Atacama and Death Valley.',['As sombras de chuva criam os desertos mais áridos','Quando o ar húmido encontra uma cordilheira, é forçado a subir, arrefece e liberta a sua humidade na encosta a barlavento. Ao descer pelo lado de sotavento, aquece e seca, gerando desertos áridos como o Atacama e o Vale da Morte.']]
];

let sciMode='fact',factI=0,qFresh=false;

/* ---- Mito ou facto: estado do jogo (30 perguntas, ordem aleatória, com fim) ---- */
const QZ_GAME=30;                                   // perguntas por jogo
const qShuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function qNew(prev){
 let seen=prev&&Array.isArray(prev.seen)?prev.seen.filter(i=>i>=0&&i<QZ.length):[];
 const all=QZ.map((_,i)=>i),fresh=all.filter(i=>!seen.includes(i));
 let o;
 if(fresh.length>=QZ_GAME)o=qShuffle(fresh).slice(0,QZ_GAME);          // só perguntas ainda não vistas
 else{                                                                  // quase não há novas: usa as que restam e completa com outras
  const extra=qShuffle(all.filter(i=>seen.includes(i))).slice(0,QZ_GAME-fresh.length);
  o=qShuffle([...fresh,...extra]);seen=[];                              // novo ciclo
 }
 return{v:3,o,i:0,r:0,a:null,seen};     // i = pergunta atual, r = certas, a = resposta dada (null = ainda não respondeu), seen = já respondidas
}
let qs=(()=>{
 const s=lsGet('qz3');
 if(s&&s.v==3&&Array.isArray(s.o)&&Array.isArray(s.seen)&&s.o.every(i=>QZ[i]))return s;
 const old=lsGet('qz2');                                                // jogo antigo (30 perguntas)
 if(old&&old.v==2&&Array.isArray(old.o)&&old.o.every(i=>QZ[i])){
  if(old.i<old.o.length)return{v:3,o:old.o,i:old.i,r:old.r,a:old.a,seen:old.o.slice(0,old.i+(old.a!=null?1:0))};   // continua o jogo
  return qNew({seen:old.o});                                            // já tinha acabado: o próximo só traz as novas
 }
 return qNew();
})();
const qSave=()=>lsSet('qz3',qs);

/* ============ idioma PT / EN ============ */
for(const m of['toLocaleString','toLocaleDateString','toLocaleTimeString']){
 const o=Date.prototype[m];
 Date.prototype[m]=function(l,...r){return o.call(this,l==='en'?LOC():l,...r)};   // datas no idioma ativo
}
const PT={
 /* topbar, landing, globo */
 'Search a city':'Pesquisar uma cidade','Install app':'Instalar app','Locate':'Localizar','Surprise':'Surpresa',
 'Jump to a place with interesting weather':'Saltar para um sítio com tempo interessante','Sound':'Som',
 'Ambient weather sound':'Som ambiente do tempo','Units':'Unidades',
 'Weather by Open-Meteo · Places by BigDataCloud · Pollen by Atmospore':'Meteorologia por Open-Meteo · Locais por BigDataCloud · Pólen por Atmospore',
 'The sky, explained.':'O céu, explicado.',
 'Live weather for anywhere on Earth, with the science behind what you’re looking at.':'Tempo em direto para qualquer ponto da Terra, com a ciência por trás do que estás a ver.',
 'Use my location':'Usar a minha localização','Surprise me':'Surpreende-me','Skylab — Weather & Science':'Skylab — Tempo e Ciência',
 'Interactive globe. Drag to rotate.':'Globo interativo. Arrasta para rodar.','You’re here':'Estás aqui','Near you':'Perto de ti',
 'Approximate, from your time zone. Use “Use my location” for the exact spot.':'Aproximado, a partir do teu fuso horário. Usa “Usar a minha localização” para o ponto exato.',
 'Tokyo':'Tóquio','New York':'Nova Iorque','Sydney':'Sidney','Reykjavík':'Reiquiavique','Cape Town':'Cidade do Cabo',
 /* IPMA */
 'IPMA warnings':'Avisos do IPMA','No active warnings for this area. ☀️':'Sem avisos ativos para esta zona. ☀️','Source: IPMA ↗':'Fonte: IPMA ↗',
 'No warnings':'Sem avisos','yellow':'amarelo','orange':'laranja','red':'vermelho',
 /* erros, localização, pesquisa, toasts */
 'Could not load the forecast':'Não foi possível carregar a previsão','You appear to be offline.':'Pareces estar sem ligação.',
 'Weather service unavailable':'Serviço meteorológico indisponível','Location isn’t supported':'A localização não é suportada',
 'This browser can’t share your location. Search for a city instead.':'Este navegador não consegue partilhar a tua localização. Pesquisa antes uma cidade.',
 'Finding you…':'A localizar-te…','Allow location access when your browser asks.':'Permite o acesso à localização quando o navegador perguntar.',
 'Location access is blocked':'O acesso à localização está bloqueado','Couldn’t get your location':'Não foi possível obter a tua localização',
 'Allow location for this page in your browser settings, or search for a city above.':'Permite a localização para esta página nas definições do navegador, ou pesquisa uma cidade acima.',
 'Try again, or search for a city above.':'Tenta de novo, ou pesquisa uma cidade acima.','Try my location again':'Tentar de novo a minha localização',
 'Your location':'A tua localização','No matches. Check the spelling.':'Sem resultados. Verifica a ortografia.',
 'Search is unavailable right now.':'A pesquisa não está disponível neste momento.',
 'Ambient sound off':'Som ambiente desligado','Ambient sound matches the weather':'O som ambiente acompanha o tempo','Refreshing…':'A atualizar…',
 'Loading…':'A carregar…','Loading map…':'A carregar o mapa…',
 /* tempo atmosférico */
 'Clear sky':'Céu limpo','Mostly clear':'Quase limpo','Partly cloudy':'Parcialmente nublado','Overcast':'Encoberto','Fog':'Nevoeiro',
 'Freezing fog':'Nevoeiro gelado','Light drizzle':'Chuvisco fraco','Drizzle':'Chuvisco','Heavy drizzle':'Chuvisco forte',
 'Freezing drizzle':'Chuvisco gelado','Light rain':'Chuva fraca','Rain':'Chuva','Heavy rain':'Chuva forte','Freezing rain':'Chuva gelada',
 'Light snow':'Neve fraca','Snow':'Neve','Heavy snow':'Neve forte','Snow grains':'Grãos de neve','Rain showers':'Aguaceiros',
 'Violent showers':'Aguaceiros violentos','Snow showers':'Aguaceiros de neve','Thunderstorm':'Trovoada','Thunderstorm with hail':'Trovoada com granizo',
 /* herói, separadores, hoje, semana */
 'Open in Science':'Abrir em Ciência','Save place':'Guardar local','Save this place':'Guardar este local','Remove from saved places':'Remover dos locais guardados',
 'Travel through the next 24 hours':'Viaja pelas próximas 24 horas','Drag to travel through the next 24 hours':'Arrasta para viajar pelas próximas 24 horas',
 'Now':'Agora','Today':'Hoje','Week':'Semana','Radar':'Radar','Air & pollen':'Ar e pólen','Science':'Ciência',
 'Dry for the next 2 hours':'Seco nas próximas 2 horas','Raining now':'A chover agora',
 'Comfort score':'Índice de conforto','Excellent':'Excelente','Comfortable':'Confortável','So-so':'Assim-assim','Rough':'Difícil',
 'Wind':'Vento','Humidity':'Humidade','Pressure':'Pressão','Sun and moon':'Sol e Lua','Best time outside:':'Melhor hora lá fora:',
 'Daylight has passed for today.':'O dia de sol já terminou por hoje.','Cooler':'Mais frio','Warmer':'Mais quente','▮ rain chance':'▮ prob. de chuva',
 'Temperature over the next 24 hours':'Temperatura nas próximas 24 horas','Sun position':'Posição do Sol','Next 24 hours':'Próximas 24 horas',
 'New moon':'Lua nova','Waxing crescent':'Lua crescente','First quarter':'Quarto crescente','Waxing gibbous':'Crescente gibosa','Full moon':'Lua cheia',
 'Waning gibbous':'Minguante gibosa','Last quarter':'Quarto minguante','Waning crescent':'Lua minguante',
 'Shorts and a light tee':'Calções e t-shirt leve','T-shirt weather':'Tempo de t-shirt','Long sleeves':'Mangas compridas','Warm jacket':'Casaco quente',
 'Heavy coat, hat, gloves':'Casaco grosso, gorro e luvas','Waterproof jacket':'Casaco impermeável','Take an umbrella':'Leva um guarda-chuva',
 'Sunscreen and sunglasses':'Protetor solar e óculos de sol','Sunglasses':'Óculos de sol','Windproof layer':'Camada corta-vento',
 'Drink plenty of water':'Bebe muita água','Ice risk outside':'Risco de gelo lá fora','Good for a walk':'Bom para passear',
 /* ar e pólen */
 'Air quality':'Qualidade do ar','Pollen & allergies':'Pólen e alergias','Good':'Bom','Fair':'Razoável','Moderate':'Moderado','Poor':'Mau',
 'Very poor':'Muito mau','Extremely poor':'Extremamente mau','Air is clean. Enjoy the outdoors.':'O ar está limpo. Aproveita o exterior.',
 'Fine for most people.':'Bom para a maioria das pessoas.','Sensitive people may notice effects.':'Pessoas sensíveis podem notar efeitos.',
 'Consider shorter time outside.':'Pondera passar menos tempo lá fora.','Limit strenuous outdoor activity.':'Limita a atividade física intensa ao ar livre.',
 'Stay indoors if you can.':'Fica em casa, se puderes.','Not available for this place right now.':'Indisponível para este local neste momento.',
 'None':'Nenhum','Low':'Baixo','High':'Alto','Very high':'Muito alto','Extreme':'Extremo',
 'Alder':'Amieiro','Birch':'Bétula','Grass':'Gramíneas','Mugwort':'Artemísia','Olive':'Oliveira','Ragweed':'Ambrósia',
 'Pollen is low across the board. A good day for allergy sufferers to be outside.':'O pólen está baixo em geral. Bom dia para alérgicos estarem ao ar livre.',
 'Rain is likely soon. It often rinses pollen out of the air, so levels can drop afterwards.':'É provável chuva em breve. Costuma lavar o pólen do ar, por isso os níveis podem descer depois.',
 'Dry and windy: pollen travels far today, and levels can peak around midday.':'Seco e ventoso: o pólen viaja longe hoje e os níveis podem atingir o pico por volta do meio-dia.',
 'Humid air makes pollen grains heavier, so they tend to settle closer to the ground.':'O ar húmido torna os grãos de pólen mais pesados, por isso tendem a assentar mais perto do chão.',
 'Calm, dry weather: pollen usually peaks from late morning to the afternoon. Mornings are gentler.':'Tempo calmo e seco: o pólen costuma atingir o pico do fim da manhã à tarde. As manhãs são mais suaves.',
 'Open-Meteo fallback · Europe only':'Alternativa Open-Meteo · só Europa',
 'Atmospore didn’t return usable data for this request. Check the browser console for details.':'A Atmospore não devolveu dados utilizáveis para este pedido. Vê a consola do navegador para mais detalhes.',
 'No pollen data is available for this location.':'Não há dados de pólen para este local.','Pollen data couldn’t be loaded right now.':'Não foi possível carregar os dados de pólen agora.',
 /* ciência */
 'Did you know':'Sabias que','Myth or fact':'Mito ou facto','Myth':'Mito','Fact':'Facto','Previous':'Anterior','Another':'Outro',
 'Next question':'Próxima pergunta','Correct.':'Certo.','Not quite.':'Quase.','The physics right now':'A física neste momento',
 'Dew point':'Ponto de orvalho','Dry and comfortable':'Seco e confortável','Pleasant':'Agradável','Slightly humid':'Ligeiramente húmido','Humid':'Húmido','Oppressive':'Abafado',
 'Cloud base':'Base das nuvens','Fog level':'Ao nível do nevoeiro','125 m per °C of spread':'125 m por °C de diferença','Wind chill':'Sensação de frio com vento',
 'Wind strips heat from skin':'O vento leva o calor da pele','Heat index':'Índice de calor','Humidity slows sweat':'A humidade atrasa o suor','Body heat':'Calor corporal',
 'Neutral':'Neutro','No chill or heat stress':'Sem stress de frio ou calor','Speed of sound':'Velocidade do som','Faster in warm air':'Mais rápido em ar quente',
 'Daylight':'Luz do dia','Low, unsettled':'Baixa, instável','High, settled':'Alta, estável','Near average':'Perto da média',
 'Optics':'Ótica','Astronomy':'Astronomia','Atmosphere':'Atmosfera','Fluid dynamics':'Dinâmica de fluidos','Chemistry':'Química','Meteorology':'Meteorologia',
 'Physics':'Física','Physiology':'Fisiologia','Thermodynamics':'Termodinâmica','Radiation':'Radiação',
 /* radar */
 'Weather radar map':'Mapa do radar meteorológico','Radar time':'Hora do radar','Pause':'Pausar','Play':'Reproduzir','Clouds':'Nuvens','Satellite':'Satélite',
 'Light':'Fraca','Heavy':'Forte','Rain rate':'Intensidade da chuva','light':'fraca','heavy':'forte','Current':'Atual','daily':'diário','Calm':'Calmo','Storm':'Tempestade',
 'Loading wind layer…':'A carregar a camada de vento…','Wind layer needs OWM_KEY in the worker.':'A camada de vento precisa da OWM_KEY no worker.',
 'Wind speed · OpenWeatherMap · updated regularly':'Velocidade do vento · OpenWeatherMap · atualizado regularmente',
 'Loading cloud layer…':'A carregar a camada de nuvens…','Global cloud cover · OpenWeatherMap · updated regularly':'Cobertura global de nuvens · OpenWeatherMap · atualizado regularmente',
 'Loading satellite frames…':'A carregar imagens de satélite…','Satellite imagery unavailable right now.':'Imagens de satélite indisponíveis neste momento.',
 'Temperature':'Temperatura','Loading temperature…':'A carregar a temperatura…','Temperature unavailable right now.':'Temperatura indisponível neste momento.',
 'Air temperature · Open-Meteo · hover for exact values':'Temperatura do ar · Open-Meteo · passa o rato para ver valores exatos',
 'Temperature data rate-limited — try again in a few minutes.':'Limite de pedidos atingido — tenta novamente dentro de alguns minutos.',
 'True-colour satellite · NASA VIIRS · global daily composite':'Satélite em cor real · NASA VIIRS · composição diária global',
 'Satellite rain estimate · worldwide · last ~6 h':'Estimativa de chuva por satélite · mundial · últimas ~6 h',
 /* alertas (notificações do navegador) */
 'High wind':'Vento forte','Extreme heat':'Calor extremo','Extreme cold':'Frio extremo','Very high UV':'UV muito alto','Rain approaching':'Chuva a aproximar-se',
 'Poor air quality':'Fraca qualidade do ar','High pollen':'Pólen elevado','Rain in the next hour':'Chuva na próxima hora',
 /* cartão de chuva */
 'Dismiss':'Fechar','Next 60 min':'Próximos 60 min',
 'Golden hour':'Hora dourada',
 'Stargazing index':'Índice de observação',
 'Optimal Seeing':'Visibilidade excelente',
 'Fair Seeing':'Visibilidade razoável',
 'Obscured / Hazy':'Encoberto / Turbulento',
 'Air density':'Densidade do ar',
 'Thin, low lift':'Rarefeito, menor sustentação',
 'Dense, high lift':'Denso, maior sustentação',
 'Standard atmosphere':'Atmosfera padrão',
 'Sign Up':'Criar Conta',
 'Barometric trend':'Tendência barométrica',
 'Falling rapidly (Front approaching)':'Queda rápida (Frente a aproximar-se)',
 'Falling (Unsettled)':'A descer (Instabilidade)',
 'Rising rapidly (High pressure)':'Subida rápida (Crista anticiclónica)',
 'Rising (Clearing)':'A subir (Céu a desanuviar)',
 'Steady (Stable mass)':'Estável (Massa de ar calma)',

 'Data by':'Dados por','Places by':'Locais por',
 'Source':'Fonte','Live':'Em direto','Stale data':'Dados desatualizados',

 'Sky Explained':'Céu Explicado','Next 6 hours':'Próximas 6 horas','This week in context':'Esta semana em contexto',
  
 'Forecast by':'Previsão do','based on':'baseada em',

 'Portugal':'Portugal','World':'Mundo','Scope':'Âmbito',
};
const FACTS_PT=[
 ['Porque é que o céu é azul','As moléculas do ar dispersam muito mais os comprimentos de onda curtos da luz solar do que os longos (dispersão de Rayleigh). O violeta dispersa-se ainda mais, mas o Sol emite menos dele e os nossos olhos respondem-lhe pouco, por isso vemos azul.'],
 ['Os pores do sol são vermelhos por uma razão','Ao pôr do sol, a luz atravessa muito mais atmosfera. A maior parte do azul é dispersada para fora do feixe pelo caminho, deixando os vermelhos e laranjas chegarem aos teus olhos.'],
 ['A luz do Sol tem 8 minutos','A luz do Sol demora cerca de 8 minutos e 20 segundos a chegar à Terra, por isso vês sempre o Sol como ele era há pouco tempo.'],
 ['A luz das estrelas é notícia velha','A luz da Lua demora cerca de 1,3 segundos a chegar até ti. A da estrela mais próxima, além do Sol, demora mais de quatro anos, por isso estás a ver o passado.'],
 ['Porque é que as estrelas cintilam','O ar turbulento desvia a luz das estrelas na descida, fazendo o ponto de luz tremeluzir. Os planetas cintilam menos porque são pequenos discos, não pontos.'],
 ['A Lua está a afastar-se','Afasta-se cerca de 3,8 cm da Terra por ano, mais ou menos à velocidade a que crescem as unhas.'],
 ['Uma nuvem é pesada','Um cúmulo típico de bom tempo contém cerca de 500 toneladas de água, sustentadas por ar ascendente e por gotículas tão pequenas que caem muito lentamente.'],
 ['Porque é que as nuvens parecem brancas','As gotículas de água dispersam todos os comprimentos de onda visíveis de forma quase igual, por isso a luz solar continua branca. As nuvens espessas parecem cinzentas porque pouca luz atravessa a base.'],
 ['As gotas de chuva não têm forma de lágrima','As gotas pequenas são quase esféricas. As maiores achatam-se numa forma de pão de hambúrguer à medida que o ar as empurra por baixo.'],
 ['O cheiro da chuva','O petricor vem dos óleos libertados pelas plantas e da geosmina, um composto produzido por bactérias do solo. As gotas, ao bater no chão seco, lançam-no para o ar.'],
 ['As gotas de chuva caem depressa','Uma gota grande atinge cerca de 9 m/s, aproximadamente 30 km/h. O chuvisco desce a menos de 1 m/s.'],
 ['A neve é branca, o gelo é azul','Os cristais de gelo dispersam todas as cores por igual, por isso a neve parece branca. O gelo espesso e transparente absorve um pouco de luz vermelha e mostra um azul ténue.'],
 ['Não há dois flocos de neve iguais','Cada cristal segue um caminho ligeiramente diferente de temperatura e humidade na queda, o que lhe dá uma forma única.'],
 ['O relâmpago é mais quente do que o Sol','Um canal de relâmpago atinge brevemente cerca de 30 000 °C, aproximadamente cinco vezes mais quente do que a superfície do Sol. O ar explode para fora: isso é o trovão.'],
 ['Conta até ao trovão','O som percorre cerca de 1 km em 3 segundos. Conta os segundos entre o clarão e o estrondo, divide por três e tens a distância em quilómetros.'],
 ['O nevoeiro é uma nuvem ao nível do chão','Forma-se como qualquer nuvem: o ar arrefece até ao ponto de orvalho e o vapor de água condensa-se em partículas minúsculas.'],
 ['O calor húmido custa mais do que o calor seco','À mesma temperatura, a humidade elevada atrasa a evaporação do suor, e o corpo não consegue libertar calor com tanta eficiência.'],
 ['Porque é que o ar frio parece seco','O ar frio comporta muito menos vapor de água. Se o aqueceres dentro de casa sem lhe juntar humidade, a humidade relativa desce bastante.'],
 ['As nuvens não bloqueiam todos os UV','Até 80% dos raios UV atravessam uma cobertura de nuvens ligeira, por isso dias nublados também podem queimar a pele.']
];

const firstS=s=>s.split('. ')[0].replace(/\.$/,'')+'.';          // o ticker mostra só a 1.ª frase do facto
FACTS.forEach((f,i)=>{const p=f[5]||FACTS_PT[i];if(p){PT[f[1]]=p[0];PT[f[2]]=p[1];PT[firstS(f[2])]=firstS(p[1])}});
QZ.forEach((z,i)=>{const p=z[3];if(p){PT[z[0]]=p[0];PT[z[2]]=p[1]}});
DAILY.forEach(f=>{PT[f[1]]=f[3][0];PT[f[2]]=f[3][1]});
Object.assign(PT,{ 'Fact of the day':'Facto do dia','See result':'Ver resultado','Play again':'Jogar outra vez',
 'Flawless. You could be on the forecasting desk.':'Impecável. Já podias estar na redação do tempo.',
 'Brilliant. Hardly any myth got past you.':'Brilhante. Quase nenhum mito te enganou.',
 'Solid. A few myths slipped through, and now you know.':'Bom resultado. Alguns mitos escaparam, e agora já sabes.',
 'Not bad. Weather myths are sneaky.':'Nada mau. Os mitos do tempo são traiçoeiros.',
  'The weather is full of surprises. Give it another go!':'O tempo está cheio de surpresas. Tenta outra vez!','Biology':'Biologia','Climate':'Clima','Planetary science':'Ciência planetária','Oceanography':'Oceanografia','Atmosphere':'Atmosfera','Meteorology':'Meteorologia','Physics':'Física','Thermodynamics':'Termodinâmica','Optics':'Ótica','Chemistry':'Química','Radiation':'Radiação','Astronomy':'Astronomia',
 'Precipitation forecast for the next 2 hours':'Previsão de precipitação para as próximas 2 horas',
 'Rain for the next 2 hours':'Chuva nas próximas 2 horas','Light rain expected':'Chuva fraca prevista',
 'Moderate rain expected':'Chuva moderada prevista','Heavy rain expected':'Chuva forte prevista',
 'Wind speed (colours) and direction (moving particles) · OpenWeatherMap + Open-Meteo':'Velocidade do vento (cores) e direção (partículas em movimento) · OpenWeatherMap + Open-Meteo',});
const LOW={};Object.values(LABEL).forEach(en=>{if(PT[en])LOW[en.toLowerCase()]=PT[en].toLowerCase()});
const TW={Freezing:'Gelado',Cold:'Frio',Cool:'Fresco',Mild:'Ameno',Warm:'Quente',Hot:'Muito quente'};
const WW={'calm':'calmo','a light breeze':'com brisa ligeira','breezy':'com vento moderado','windy':'ventoso','gusty':'com rajadas'};
const RCP={'within the hour':'com chuva provável na próxima hora','later today':'com chuva provável mais tarde','this evening':'com chuva provável ao fim do dia'};
const UVL={Low:'Baixo',Moderate:'Moderado',High:'Alto','Very high':'Muito alto',Extreme:'Extremo'};
const onD=x=>x=='today'?'hoje':/^(sábado|domingo)/i.test(x)?'no '+x:'na '+x;
const dec=s=>String(s).replace('.',',');
const polN=n=>{const c=n[0].toUpperCase()+n.slice(1);return PT[c]||c};
const PT_RX=[
 [/^Question (\d+) of (\d+)$/,'Pergunta $1 de $2'],
 [/^(Freezing|Cold|Cool|Mild|Warm|Hot) and (calm|a light breeze|breezy|windy|gusty), (.+?)(, rain falling now|, with rain likely (within the hour|later today|this evening))?\.$/,
  (m,a,b,c,rc,w)=>`${TW[a]} e ${WW[b]}, ${LOW[c]||c}${rc?(w?', '+RCP[w]:', a chover agora'):''}.`],
 [/^Feels like (-?\d+)° · High (-?\d+)° · Low (-?\d+)°$/,'Sensação de $1° · Máx. $2° · Mín. $3°'],
 [/^(\d+)% chance of rain$/,'$1% de probabilidade de chuva'],
 [/^(\d+)% rain chance in the next 3 hours$/,'$1% de probabilidade de chuva nas próximas 3 horas'],
 [/^Rain in about (\d+) min$/,'Chuva dentro de cerca de $1 min'],
 [/^This week: (?:snow arrives (.+?)|rain arrives (.+?)|skies stay dry all week)\. Warmest (.+) at (-?\d+)°, coolest (.+) at (-?\d+)°\.$/,
  (m,sn,rn,w,a,c,b)=>`Esta semana: ${sn?'neve '+onD(sn):rn?'chuva '+onD(rn):'o céu mantém-se limpo toda a semana'}. Mais quente ${onD(w)}, ${a}°; mais frio ${onD(c)}, ${b}°.`],
 [/^(\d+)% illuminated$/,'$1% iluminada'],
 [/^UV · (Low|Moderate|High|Very high|Extreme)$/,(m,l)=>'UV · '+UVL[l]],
 [/^(.*?)\s*· (\d+)% rain$/,(m,a,b)=>`${a?a+' ':''}· ${b}% de chuva`],
 [/^Comfort score (\d+) out of 100$/,'Índice de conforto $1 em 100'],
 [/^Air quality index (\d+)$/,'Índice de qualidade do ar $1'],
 [/^Tomorrow (\+|−)(\d+)s$/,'Amanhã $1$2 s'],
 [/^Next (\d+) days$/,'Próximos $1 dias'],
 [/^(\d+) right of (\d+)$/,'$1 certas em $2'],
 [/^(.+) pollen is running high\. Keep windows closed, consider an antihistamine before symptoms start, and shower after time outdoors\.$/,
  (m,n)=>`Pólen elevado (${polN(n.toLowerCase()).toLowerCase()}). Mantém as janelas fechadas, pondera tomar um anti-histamínico antes de os sintomas começarem e toma banho depois de estares ao ar livre.`],
 [/^Pollen is moderate, led by (.+)\. Sensitive people may notice mild symptoms\.$/,
  (m,n)=>`Pólen moderado, sobretudo de ${polN(n).toLowerCase()}. Pessoas sensíveis podem notar sintomas ligeiros.`],
 [/^(.*) · now$/,'$1 · agora'],[/^(.*) · (\d+) min ago$/,'$1 · há $2 min'],[/^(.*) · ([\d.]+) h ago$/,'$1 · há $2 h'],
 [/^Loading frames (\d+)\/(\d+)…$/,'A carregar imagens $1/$2…'],
 [/^Units: (.*)$/,'Unidades: $1'],
 [/^(\d+) warnings?$/,(m,n)=>`${n} aviso${n=='1'?'':'s'}`],
 [/^Open the forecast for (.+)$/,'Abrir a previsão de $1'],
 [/^(.*) Check your connection and try again\.$/,(m,a)=>`${PT[a]||a} Verifica a ligação e tenta novamente.`],
 [/^(Light|Moderate|Heavy) rain · up to ([\d.]+) mm\/h$/,(m,l,v)=>`Chuva ${l=='Light'?'fraca':l=='Moderate'?'moderada':'forte'} · até ${dec(v)} mm/h`],
 /* corpo das notificações */
 [/^Thunderstorm activity at (.+)\. Stay away from open ground and tall objects\.$/,'Atividade de trovoada em $1. Afasta-te de terrenos abertos e de objetos altos.'],
 [/^Heavy rain at (.+)\. Watch for flooded roads\.$/,'Chuva forte em $1. Atenção a estradas inundadas.'],
 [/^Heavy snow at (.+)\. Allow extra travel time\.$/,'Neve forte em $1. Conta com mais tempo de viagem.'],
 [/^Wind near (.+) at (.+)\. Secure loose objects\.$/,'Vento perto de $1 em $2. Prende os objetos soltos.'],
 [/^(-?\d+)° at (.+)\. Drink water and avoid the midday sun\.$/,'$1° em $2. Bebe água e evita o sol do meio-dia.'],
 [/^(-?\d+)° at (.+)\. Limit time outside and cover exposed skin\.$/,'$1° em $2. Limita o tempo lá fora e cobre a pele exposta.'],
 [/^UV index (\d+) today in (.+)\. Use sunscreen and seek shade\.$/,'Índice UV $1 hoje em $2. Usa protetor solar e procura sombra.'],
 [/^Heavy rain is likely within a few hours in (.+)\.$/,'É provável chuva forte dentro de poucas horas em $1.'],
 [/^Air quality index is (\d+) in (.+)\. Limit outdoor exertion\.$/,'O índice de qualidade do ar é $1 em $2. Limita o esforço ao ar livre.'],
 [/^(Low|Moderate|High|Very high) pollen risk in (.+?)(?:, led by (.+?))?\. Keep windows closed if you are allergic\.$/,
  (m,l,p,t)=>`Risco de pólen ${(UVL[l]||l).toLowerCase()} em ${p}${t?', sobretudo de '+polN(t).toLowerCase():''}. Mantém as janelas fechadas se fores alérgico.`],
 [/^It is raining at (.+)\.$/,'Está a chover em $1.'],
 [/^Rain expected at (.+) in about (\d+) min\.$/,'Chuva prevista em $1 dentro de cerca de $2 min.'],
 [/^Rain stops in about (\d+) min$/,'A chuva pára dentro de cerca de $1 min'],
];

/* nomes de pólen (Atmospore) → PT; comparação sem distinguir maiúsculas */
const PT_POLLEN={
 'Birch':'Bétula','Birch family':'Família da bétula','Hazel':'Aveleira','Alder':'Amieiro',
 'Pine':'Pinheiro','Spruce':'Abeto','Pine family':'Família do pinheiro',
 'Elm':'Ulmeiro','Willow':'Salgueiro','Oak':'Carvalho','Maple':'Bordo','Poplar':'Choupo',
 'Cypress':'Cipreste','Plane tree':'Plátano','Ash':'Freixo',
 'Timothy Grass':'Rabo-de-gato','Ryegrass':'Azevém',
 'Cock\'s-foot':'Panasco','Cock’s-foot':'Panasco',
 'False Oat-grass':'Aveia-Perene','Bluegrass':'Capim-Azul',
 'Nettle':'Urtiga','Mugwort':'Artemísia','Ragweed':'Ambrósia',
 'Very low':'Muito baixo',
 'Bermuda Grass':'Relva Bermuda'
};
const PTL=Object.fromEntries(Object.entries(PT_POLLEN).map(([k,v])=>[k.toLowerCase(),v]));

function trStr(s){
 if(LANG!='pt'||!/[A-Za-z]/.test(s))return s;
 const d=PT[s];if(d!==undefined)return d;
 const pl=PTL[s.toLowerCase()];if(pl!==undefined)return pl;
 for(const[rx,f]of PT_RX){const m=s.match(rx);if(m)return typeof f=='function'?f(...m):s.replace(rx,f)}
 return s;
}
const tr=trStr;

/* tradutor do DOM: guarda o inglês original de cada nó e reaplica ao mudar de idioma */
const ORIG=new WeakMap(),AORIG=new WeakMap(),TR_ATTRS=['placeholder','title','aria-label'];
function trText(n){
 if(!n.parentNode||/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName))return;
 const raw=n.nodeValue,rec=ORIG.get(n),en=rec&&raw===rec.pt?rec.en:raw;
 if(LANG!='pt'){if(en!==raw)n.nodeValue=en;ORIG.delete(n);return}
 const m=en.match(/^(\s*)([\s\S]*?)(\s*)$/);
 if(!m[2])return;
 const pt=trStr(m[2]);
 if(pt===m[2]){ORIG.delete(n);return}
 const out=m[1]+pt+m[3];ORIG.set(n,{en,pt:out});
 if(out!==raw)n.nodeValue=out;
}
function trAttr(el,a){
 const v=el.getAttribute(a);if(v==null)return;
 const o=AORIG.get(el)||{},rec=o[a],en=rec&&v===rec.pt?rec.en:v,pt=trStr(en);
 if(pt!==en)o[a]={en,pt};else delete o[a];
 AORIG.set(el,o);if(pt!==v)el.setAttribute(a,pt);
}
function trTree(root){
 if(root.nodeType==3)return trText(root);
 if(root.nodeType!=1)return;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let n;while((n=w.nextNode()))trText(n);
 const els=root.querySelectorAll?[...root.querySelectorAll('[placeholder],[title],[aria-label]')]:[];
 if(root.matches&&root.matches('[placeholder],[title],[aria-label]'))els.push(root);
 els.forEach(el=>TR_ATTRS.forEach(a=>trAttr(el,a)));
}
let indRaf=0;
new MutationObserver(ms=>{
 for(const m of ms){
  if(m.type=='characterData')trText(m.target);
  else if(m.type=='attributes')trAttr(m.target,m.attributeName);
  else m.addedNodes.forEach(trTree);
 }
 if(!indRaf)indRaf=requestAnimationFrame(()=>{indRaf=0;moveInd()});          // as abas mudam de largura
}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:TR_ATTRS});

function paintLang(swap){
 const i=$('#lngi'),t=$('#lngt'),b=$('#lng');if(!i)return;
 i.src=LANG=='pt'?'portugal-icon.png':'us-icon.png';
 t.textContent=LANG.toUpperCase();
 b.title=b.ariaLabel=LANG=='pt'?'Switch to English':'Mudar para português';
 if(swap&&!still){i.classList.remove('swap');void i.offsetWidth;i.classList.add('swap')}
}
function setLang(l){
 if(l==LANG)return;
 LANG=l;lsSet('lang',l);document.documentElement.lang=l;
  setUnit(l=='pt'?'c':'f',true,true);   // o idioma define as unidades (o botão °C/°F continua a poder mudá-las)
 trTree(document.body);paintLang(true);
 if(data)render();else if(!place&&$('#hero')&&$('#hero').classList.contains('land'))landing();
}
$('#lng').onclick=()=>setLang(LANG=='pt'?'en':'pt');
paintLang();trTree(document.body);

/* ============ fetching ============ */
async function getWeather(lat,lon){
 const cur = 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,dew_point_2m,pressure_msl,wind_gusts_10m,wind_speed_80m,wind_direction_80m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation,vapor_pressure_deficit';
 const hourly = 'temperature_2m,weather_code,precipitation_probability,is_day,surface_pressure,dew_point_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_direction_80m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation,vapor_pressure_deficit,boundary_layer_height';
 const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&forecast_minutely_15=8&timezone=auto&forecast_days=7`;
 const r=await fetch(u);if(!r.ok)throw new Error('Weather service unavailable');return r.json();
}
async function reverse(lat,lon){
 try{
  const r=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${LANG}`);const j=await r.json();
    return{name:j.city||j.locality||'Your location',sub:[j.principalSubdivision,j.countryName].filter(Boolean).join(', ')};
 }catch(e){return{name:'Your location',sub:''}}
}
const geo=async(n,c=5)=>((await(await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(n)}&count=${c}&language=${LANG}`)).json()).results||[]).map(x=>({lat:x.latitude,lon:x.longitude,name:x.name,sub:[x.admin1,x.country].filter(Boolean).join(', ')}));
/* ============ offline: última previsão guardada + faixa "sem ligação" ============ */
const WX_KEY='skylab_lastwx';
function wxSave(){try{localStorage.setItem(WX_KEY,JSON.stringify({t:Date.now(),place,data}))}catch(e){}}   // fora do lsSet: não vai para a nuvem
function wxLoad(lat,lon){try{const o=JSON.parse(localStorage.getItem(WX_KEY));
 if(o&&o.data&&o.data.current&&o.place&&Math.abs(o.place.lat-lat)<.01&&Math.abs(o.place.lon-lon)<.01)return o}catch(e){}return null}
let offStamp=0,lastOk=0,lastTry=null;
function offlineBar(on,stamp){
 let b=$('#offBar');
 if(!on){offStamp=0;if(b)b.classList.remove('on');return}
 if(stamp)offStamp=stamp;
 if(!b){b=document.createElement('div');b.id='offBar';b.setAttribute('role','status');document.body.appendChild(b);
  b.addEventListener('click',e=>{if(e.target.closest('button'))offRetry()})}
 const d=offStamp?new Date(offStamp):null,sameDay=d&&d.toDateString()==new Date().toDateString();
 const when=d?d.toLocaleString(LOC(),sameDay?{hour:'2-digit',minute:'2-digit'}:{weekday:'short',hour:'2-digit',minute:'2-digit'}):'';
 const head=navigator.onLine?T2('Can’t reach the weather service','Sem acesso ao serviço do tempo'):T2('You’re offline','Estás sem ligação');
 const tail=when?T2(`Showing the forecast saved at ${when}. Please try again.`,`A mostrar a previsão guardada às ${when}. Tenta outra vez.`):T2('Please check your connection and try again.','Verifica a ligação e tenta outra vez.');
 b.innerHTML=`<i class="od" aria-hidden="true"></i><span><b>${head}</b> · ${tail}</span><button type="button">${T2('Try again','Tentar de novo')}</button>`;
 b.classList.add('on');
}
async function offRetry(){
 const btn=$('#offBar button');if(btn){btn.disabled=true;btn.textContent=T2('Trying…','A tentar…')}
 try{const t=lastTry||(place&&{lat:place.lat,lon:place.lon,name:place.name,sub:place.sub});if(t)await show(t.lat,t.lon,t.name,t.sub);else{landing();await new Promise(r=>setTimeout(r,1200))}}catch(e){}
 const b2=$('#offBar button');if(b2){b2.disabled=false;b2.textContent=T2('Try again','Tentar de novo')}
 if(!navigator.onLine&&!$('#offBar.on'))offlineBar(true,offStamp);
}
addEventListener('offline',()=>offlineBar(true,data?lastOk:0));
addEventListener('online',()=>{if(!place)offlineBar(false)});   // com local, o handler 'online' abaixo volta a pedir a previsão e esconde a faixa se correr bem

async function show(lat,lon,name,sub){
 document.body.classList.add('busy');lastTry={lat,lon,name,sub};
 try{
  const[d,rev]=await Promise.all([getWeather(lat,lon),name?{name,sub}:reverse(lat,lon)]);
  data=d;place={lat,lon,name:rev.name,sub:rev.sub};lsSet('place',place);visitBump(place);wxSave();lastOk=Date.now();offlineBar(false);render();ipmaUpdate(place);
 }catch(e){
  const o=wxLoad(lat,lon);
  if(o){
   try{data=o.data;place={lat,lon,name:name||o.place.name,sub:sub||o.place.sub};lsSet('place',place);render();ipmaUpdate(place);offlineBar(true,o.t)}
   catch(e2){error(T2('Could not load the forecast','Não foi possível carregar a previsão'),T2('You appear to be offline. Check your connection and try again.','Parece que estás sem ligação. Verifica a ligação e tenta outra vez.'),true)}
  }else error(navigator.onLine?'Could not load the forecast':'You’re offline',(navigator.onLine?e.message:'This forecast hasn’t been saved on this device yet.')+' Check your connection and try again.',true)
 }
 document.body.classList.remove('busy');
}
function locate(){
 if(!navigator.geolocation)return error('Location isn’t supported','This browser can’t share your location. Search for a city instead.');
 main.innerHTML='<div class="msg sk"><h2>Finding you…</h2><p>Allow location access when your browser asks.</p></div>';
 navigator.geolocation.getCurrentPosition(p=>show(+p.coords.latitude.toFixed(3),+p.coords.longitude.toFixed(3)),
  e=>error(e.code==1?'Location access is blocked':'Couldn’t get your location',e.code==1?'Allow location for this page in your browser settings, or search for a city above.':'Try again, or search for a city above.'),
  {enableHighAccuracy:false,timeout:12000,maximumAge:600000});
}
function error(h,p,retry){main.className='';main.innerHTML=`<div class="msg"><h2>${h}</h2><p>${p}</p>${retry&&lastTry?`<button class="pill" data-act="retry">${T2('Try again','Tentar de novo')}</button> `:''}<button class="pill" data-act="locate">Try my location again</button></div>`}

/* ============ helpers for text ============ */
function heroLine(){
 const c=data.current,h=data.hourly,t=c.apparent_temperature,v=c.wind_speed_10m,i0=idx0();
 const tempW=t<=0?'freezing':t<=8?'cold':t<=14?'cool':t<=21?'mild':t<=28?'warm':'hot';
 const windW=v<8?'calm':v<22?'a light breeze':v<38?'breezy':v<55?'windy':'gusty';
 const nowRain=c.weather_code>=51&&c.weather_code<=67||c.weather_code>=80&&c.weather_code<=95;
 let rc='';
 if(nowRain)rc=', rain falling now';
 else{const soon=h.precipitation_probability.slice(i0+1,i0+9).findIndex(p=>p>=55);if(soon>=0)rc=`, with rain likely ${soon<=2?'within the hour':soon<=6?'later today':'this evening'}`}
 return`${tempW[0].toUpperCase()+tempW.slice(1)} and ${windW}, ${(LABEL[c.weather_code]||'').toLowerCase()}${rc}.`;
}
function story(){
 const d=data.daily,nm=d.time.map((t,i)=>i?new Date(t+'T12:00').toLocaleDateString('en',{weekday:'long'}):'today');
 const wet=d.weather_code.findIndex(c=>c>=51&&c<=67||c>=80&&c<=82||c>=95),snow=d.weather_code.findIndex(c=>c>=71&&c<=77||c==85||c==86);
 const hi=d.temperature_2m_max.indexOf(Math.max(...d.temperature_2m_max)),lo=d.temperature_2m_min.indexOf(Math.min(...d.temperature_2m_min));
 const sky=snow>=0?`snow arrives ${nm[snow]}`:wet>=0?`rain arrives ${nm[wet]}`:'skies stay dry all week';
 return`This week: ${sky}. Warmest ${nm[hi]} at ${T(d.temperature_2m_max[hi])}°, coolest ${nm[lo]} at ${T(d.temperature_2m_min[lo])}°.`;
}
function moon(){
 const syn=29.530588853,p=((((Date.now()-Date.UTC(2000,0,6,18,14))/864e5)%syn)+syn)%syn/syn;
 const names=['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
 return{n:names[Math.round(p*8)%8],lit:Math.round((1-Math.cos(2*Math.PI*p))/2*100),p};
}
function moonIcon(){
 const p=moon().p,k=Math.cos(2*Math.PI*p),rx=(9*Math.abs(k)).toFixed(2),w=p<.5,o=w?1:0,i=w?(k>0?0:1):(k>0?1:0);
 return`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="animation:none"><circle cx="12" cy="12" r="9" style="fill:rgba(20,49,79,.08);stroke:rgba(20,49,79,.3)"/><path d="M12 3A9 9 0 0 ${o} 12 21A${rx} 9 0 0 ${i} 12 3z" style="fill:#6b7bd6;stroke:none"/></svg>`;
}
function comfortInfo(){
 const c=data.current,h=data.hourly,i0=idx0();
 const rain=Math.max(...h.precipitation_probability.slice(i0,i0+6));
 const s=Math.max(0,Math.round(100-Math.min(45,Math.abs(c.temperature_2m-21)*3.2)-Math.max(0,c.dew_point_2m-16)*3-Math.max(0,c.wind_speed_10m-20)*.9-rain*.25));
 let best=-1,bs=-1e9;
 for(let i=i0;i<i0+24&&i<h.time.length;i++){
  if(!h.is_day[i])continue;
  const sc=100-Math.abs(h.temperature_2m[i]-21)*3.2-h.precipitation_probability[i]*.6;
  if(sc>bs){bs=sc;best=i}
 }
 return{s,lab:s>=80?'Excellent':s>=60?'Comfortable':s>=40?'So-so':'Rough',best};
}
function advice(){
 const c=data.current,h=data.hourly,i0=idx0(),rain=Math.max(...h.precipitation_probability.slice(i0,i0+10)),uv=data.daily.uv_index_max[0],t=c.apparent_temperature,v=c.wind_speed_10m,a=[];
 a.push(t>=27?['tshirt','Shorts and a light tee']:t>=20?['tshirt','T-shirt weather']:t>=13?['layers','Long sleeves']:t>=6?['jacket','Warm jacket']:['flake','Heavy coat, hat, gloves']);
 if(rain>=40)a.push(['umbrella',rain>=70?'Waterproof jacket':'Take an umbrella']);
 if(uv>=3&&c.is_day)a.push(['sun',uv>=6?'Sunscreen and sunglasses':'Sunglasses']);
 if(v>=35)a.push(['wind','Windproof layer']);
 if(c.temperature_2m>=28)a.push(['drop','Drink plenty of water']);
 if(c.temperature_2m<=2)a.push(['flake','Ice risk outside']);
 if(a.length==1&&rain<40)a.push(['walk','Good for a walk']);
 return a.slice(0,5).map(([i,s],n)=>`<span class="chip" style="--n:${n}">${ic(i)}${s}</span>`).join('');
}
function lab(){
 const c=data.current,d=data.daily,h=data.hourly,i0=idx0();
 const tC=c.temperature_2m,td=c.dew_point_2m,v=c.wind_speed_10m,rh=c.relative_humidity_2m;
 const comfort=td<10?'Dry and comfortable':td<16?'Pleasant':td<18?'Slightly humid':td<21?'Humid':'Oppressive';
 const cb=Math.max(0,(tC-td)*125),cbTxt=cb<60?'Fog level':unit=='c'?`~${Math.round(cb/10)*10} m`:`~${Math.round(cb*3.281/50)*50} ft`;
 let chill=null;if(tC<=10&&v>4.8){const p=Math.pow(v,.16);chill=13.12+.6215*tC-11.37*p+.3965*tC*p}
 const F=tC*9/5+32;let heat=null;
 if(F>=80&&rh>=40)heat=(-42.379+2.04901523*F+10.14333127*rh-.22475541*F*rh-.00683783*F*F-.05481717*rh*rh+.00122874*F*F*rh+.00085282*F*rh*rh-.00000199*F*F*rh*rh-32)*5/9;
 const feel=chill!==null?['Wind chill',T(chill)+'°','Wind strips heat from skin']:heat!==null?['Heat index',T(heat)+'°','Humidity slows sweat']:['Body heat','Neutral','No chill or heat stress'];
 const dl=(new Date(d.sunset[0])-new Date(d.sunrise[0]))/6e4,dl2=(new Date(d.sunset[1])-new Date(d.sunrise[1]))/6e4,df=Math.round((dl2-dl)*60);

 // 1. Densidade do ar
 const pVal = c.surface_pressure || 1013.25;
 const rho=(pVal*100/(287.058*(tC+273.15))).toFixed(3);
 const rhoSub=rho<1.18?'Thin, low lift':rho>1.25?'Dense, high lift':'Standard atmosphere';

 // 2. Tendência Barométrica Real das últimas 3 horas (WMO)
 const pastIdx = Math.max(0, i0 - 3);
 const pPast = (h.surface_pressure && isFinite(h.surface_pressure[pastIdx])) ? h.surface_pressure[pastIdx] : pVal;
 const deltaP = +(pVal - pPast).toFixed(1);
 
 const pArrow = deltaP > 0.4 ? '↗ ' : deltaP < -0.4 ? '↘ ' : '→ ';
 const pTrendVal = `${pArrow}${deltaP > 0 ? '+' : ''}${pdS(deltaP)}/3h`;
 const pTrendTxt = deltaP <= -1.5 
   ? 'Falling rapidly (Front approaching)' 
   : deltaP <= -0.5 
   ? 'Falling (Unsettled)' 
   : deltaP >= 1.5 
   ? 'Rising rapidly (High pressure)' 
   : deltaP >= 0.5 
   ? 'Rising (Clearing)' 
   : 'Steady (Stable mass)';

const soundMs=331.3+.606*tC;
const soundTxt=unit=='c'?Math.round(soundMs*3.6)+' km/h':Math.round(soundMs*1.94384)+' kt';
 const tiles=[
 ['Dew point',T(td)+'°',comfort],
 ['Cloud base',cbTxt,'125 m per °C of spread'],
 feel,
 ['Air density',rho+' kg/m³',rhoSub],
 ['Barometric trend',pTrendVal,pTrendTxt],
 ['Speed of sound',soundTxt,'Faster in warm air'],
 ['Daylight',hm(dl),`Tomorrow ${df>=0?'+':'−'}${Math.abs(df)}s`],
 ['Pressure',pf(pVal),pVal<1005?'Low, unsettled':pVal>1020?'High, settled':'Near average']
 ];

 return tiles.map(([a,b,s],n)=>`<div class="st" style="--n:${n}"><span>${tr(a)}</span><b>${b}</b><span>${tr(s)}</span></div>`).join('');
}
/* ============ Céu Explicado: deteção de padrões ============ */
const dec1=v=>(LANG==='pt'?v.toFixed(1).replace('.',','):v.toFixed(1));
const T2=(en,pt)=>LANG==='pt'?pt:en;
const Traw=c=>unit=='c'?c:c*9/5+32; // igual a T(), mas sem arredondar (mantém casas decimais)
const decT=v=>{const n=Traw(v);return LANG==='pt'?n.toFixed(1).replace('.',','):n.toFixed(1)}; // valor ABSOLUTO de temperatura, 1 casa decimal, sensível à unidade
const decDT=v=>{const n=unit=='c'?v:v*9/5;return LANG==='pt'?n.toFixed(1).replace('.',','):n.toFixed(1)}; // DIFERENÇA de temperatura (sem +32!), sensível à unidade

function skySignals(){
  const c=data.current,h=data.hourly,i0=idx0();
  const p3=Math.max(0,i0-3);
  const dP=c.surface_pressure-h.surface_pressure[p3];
  const dDew=(h.dew_point_2m&&isFinite(h.dew_point_2m[p3]))?c.dew_point_2m-h.dew_point_2m[p3]:0;
  const dT=c.temperature_2m-h.temperature_2m[p3];
  return {syn:synGet(),pmsl:c.pressure_msl,dP,dDew,dT,dewNow:c.dew_point_2m,rhNow:c.relative_humidity_2m,wind:c.wind_speed_10m,dir:c.wind_direction_10m,temp:c.temperature_2m,code:c.weather_code,isDay:c.is_day,p:p3,i0};
}

/* ============ Céu Explicado: Península Ibérica ============ */
function isIberia(lat,lon){
 if(place && place.countryCode) return place.countryCode==='PT'||place.countryCode==='ES';
 return lat>=35.8&&lat<=43.9&&lon>=-9.6&&lon<=3.5; // fallback sem countryCode
}
function isAtlanticPT(lat,lon){return isIberia(lat,lon)&&lon<=-7.4}
function isStraitZone(lat,lon){return isIberia(lat,lon)&&lat<=37.6&&lon>=-7&&lon<=-4.5}
function isMedSpain(lat,lon){return isIberia(lat,lon)&&lon>=-1.2}
const monthNow=()=>new Date().getMonth()+1;

function patternDetectIberia(s){
 if(!place||!isIberia(place.lat,place.lon))return null;
 const m=monthNow();
 const fromN=(s.dir>=315||s.dir<=45),fromE=(s.dir>=55&&s.dir<=125);
 if(isAtlanticPT(place.lat,place.lon)&&fromN&&s.wind>=25&&m>=4&&m<=9&&s.code<=3)return'ib-nortada';
 if(isStraitZone(place.lat,place.lon)&&fromE&&s.wind>=30)return'ib-levante';
 if(isIberia(place.lat,place.lon)&&fromE&&s.temp>=26&&s.rhNow<35&&m>=5&&m<=9)return'ib-suao';
 if(isIberia(place.lat,place.lon)&&s.dir>=100&&s.dir<=220&&s.temp>=20&&s.rhNow<=30&&(s.code==2||s.code==3))return'ib-calima';
 if(isMedSpain(place.lat,place.lon)&&m>=9&&m<=11&&s.dP<=-1.2&&(s.code>=61&&s.code<=82))return'ib-gotafria';
 return null;
}

function patternDetectGlobalExtra(s){
 const lat = place ? place.lat : 0;
 const tropical = Math.abs(lat) <= 35;
 const dP = Number(s.dP)||0, wind = Number(s.wind)||0, temp = Number(s.temp)||0, rh = Number(s.rhNow)||0;

 if(dP<=-6 && wind>=55 && s.code>=51 && s.code<=86) return 'bomb-cyclone';
 if(wind>=70 && s.code>=95 && dP<=-3) return 'derecho';
 if(s.code>=71 && s.code<=86 && wind>=40 && temp<=-2) return 'blizzard';
 if((s.code===95||s.code===96||s.code===99) && temp<=1) return 'thundersnow';
 if(temp>=35 && rh<=40 && wind<20 && s.code<=3) return 'heatwave';
 if(tropical && s.code>=61 && s.code<=82 && rh>=80 && temp>=24 && wind>=15) return 'monsoon';
 if(!tropical && s.code>=51 && s.code<=67 && wind>=35 && rh>=85 && temp>=4 && temp<=16) return 'atm-river';
 if(rh<=20 && wind>=35 && temp>=25 && tropical) return 'dust-storm';
 if(rh<=30 && wind>=20 && wind<=50 && s.code<=2 && dP>=-1 && dP<=1) return 'foehn';
 return null;
}

function patternDetect(){
 const s=skySignals();
 const ibId=patternDetectIberia(s);
 if(ibId)return{id:ibId,cat:'Iberia',s};
 const globalId=patternDetectGlobalExtra(s);
 if(globalId)return{id:globalId,cat:'Global extremes',s};
 const code=s.code;
 // ...resto da função original mantém-se inalterado...
  // ...o resto da função mantém-se exatamente igual...
  const isRain=(code>=51&&code<=67)||(code>=80&&code<=82);
  const isStorm=code>=95;
  const isClear=code<=2;
  const isFog=code===45||code===48;
  const fromN=(s.dir>=315||s.dir<=45);
  const fromS=(s.dir>=135&&s.dir<=225);
  const wkAvg=data.daily.temperature_2m_max.reduce((a,b)=>a+b,0)/data.daily.temperature_2m_max.length;
  const anomaly=s.temp-wkAvg;

  if(isStorm&&s.temp>20&&s.isDay)   return{id:'storm-conv',cat:'Meteorology',s};
  if(isFog&&s.wind<8&&!s.isDay)     return{id:'fog-rad',cat:'Atmosphere',s};
  if(s.dP<=-1.5&&s.dDew>0.8&&isRain)return{id:'front-cold',cat:'Meteorology',s};
  if(s.dP<=-0.5&&s.dewNow>=14&&isRain)return{id:'front-warm',cat:'Meteorology',s};
  if(s.dP>=0.5&&s.dDew<-0.5&&isClear)return{id:'post-front',cat:'Meteorology',s};
  if(s.pmsl>=1020&&isClear&&s.dP>=0)return{id:'high',cat:'Atmosphere',s};
  if(s.dewNow>=18&&s.temp>=22&&isClear)return{id:'tropical',cat:'Climate',s};
  if(anomaly<-3&&s.dewNow<5&&fromN)  return{id:'polar',cat:'Climate',s};
  if(isRain&&Math.abs(s.dP)<0.8)     return{id:'showers',cat:'Meteorology',s};
  const syn=synPick(s);                       // A/B do mapa de isóbaras perto do local
  if(syn)return{id:syn,cat:'Atmosphere',s};
  return{id:'transition',cat:'Atmosphere',s};
}

const PATTERNS={
 'front-cold':s=>({
  title:T2('A cold front is passing overhead','Uma frente fria está a passar'),
  body:T2(
   `In the last three hours <i>pressure has dropped ${pdS(s.dP)}</i> and the <i>dew point has climbed ${decDT(s.dDew)}°</i>. Rain is falling. Warm, humid air ahead of the front is being forced up over the colder air arriving behind it. As it rises it cools, the vapour condenses, and the drops fall. This is the most active phase of a frontal passage — expect the rain to ease within a few hours, then pressure to rise and the sky to clear.`,
   `Nas últimas três horas a <i>pressão caiu ${pdS(s.dP)}</i> e o <i>ponto de orvalho subiu ${decDT(s.dDew)}°</i>. Está a chover. O ar quente e húmido à frente da frente está a ser forçado a subir sobre o ar mais frio que chega por trás. Ao subir, arrefece, o vapor condensa-se e as gotas caem. Esta é a fase mais ativa de uma passagem frontal — é de esperar que a chuva abrande dentro de poucas horas, a pressão comece a subir e o céu a limpar.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Dew +${decDT(s.dDew)}° in 3h`,`Orvalho +${decDT(s.dDew)}° em 3h`),
   T2(`Code ${s.code} — rain`,`Código ${s.code} — chuva`)
  ]
 }),
 'front-warm':s=>({
  title:T2('A warm front is moving through','Uma frente quente está a passar'),
  body:T2(
   `Pressure is falling gently (${pdS(s.dP)} over 3h), the dew point is high at ${decT(s.dewNow)}°, and rain is falling. Warm air is sliding up over cooler air ahead of the front — but the slope is shallow, so the rain is steady rather than heavy and can last for hours. Behind the front the air will be noticeably warmer and more humid.`,
   `A pressão está a descer suavemente (${pdS(s.dP)} em 3 h), o ponto de orvalho está alto, em ${decT(s.dewNow)}°, e está a chover. O ar quente desliza sobre o ar mais frio à frente da frente — mas o declive é suave, por isso a chuva é contínua em vez de forte e pode durar horas. Depois da frente, o ar estará claramente mais quente e húmido.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 }),
 'post-front':s=>({
  title:T2('The front has passed — clearing','A frente passou — céu a limpar'),
  body:T2(
   `Pressure is rising, the <i>dew point is dropping (${decDT(s.dDew)}° in 3h)</i>, and the sky is clearing. A cooler, drier air mass has moved in behind the front. This is the clearest weather of the whole frontal cycle: crisp, stable, often with excellent visibility. It is also the moment when the temperature can drop fastest.`,
   `A pressão está a subir, o <i>ponto de orvalho está a descer (${decDT(s.dDew)}° em 3 h)</i> e o céu está a limpar. Entrou uma massa de ar mais fria e seca por trás da frente. Este é o tempo mais limpo de todo o ciclo frontal: nítido, estável, muitas vezes com visibilidade excelente. É também o momento em que a temperatura pode descer mais depressa.`
  ),
  signals:[
   T2(`ΔP +${pdS(s.dP)}/3h`,`ΔP +${pdS(s.dP)}/3h`),
   T2(`Dew ${decDT(s.dDew)}° in 3h`,`Orvalho ${decDT(s.dDew)}° em 3h`),
   T2(`Code ${s.code} — clear`,`Código ${s.code} — limpo`)
  ]
 }),
 'high':s=>({
  title:T2('An anticyclone sits over the region','Um anticiclone está sobre a região'),
  body:T2(
   `Pressure is ${pf(pMSL())}, the sky is clear and there is little wind. In a high-pressure system, <i>air descends from aloft</i>, warming and drying as it sinks. That sinking is what clears the sky — clouds cannot survive the descent. It also explains why nights are colder than expected under a high: with no clouds to trap heat, the ground radiates it straight to space.`,
   `A pressão está a ${pf(pMSL())}, o céu está limpo e há pouco vento. Num anticiclone, o <i>ar desce de níveis altos</i>, aquecendo e secando à medida que afunda. Essa descida é o que limpa o céu — as nuvens não sobrevivem ao movimento descendente. Também explica porque é que as noites são mais frias do que se esperaria sob um anticiclone: sem nuvens para reter calor, o solo irradia-o direto para o espaço.`
  ),
  signals:[
   T2(`Pressure ${pf(pMSL())}`,`Pressão ${pf(pMSL())}`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`),
   T2(`Code ${s.code} — clear`,`Código ${s.code} — limpo`)
  ]
 }),
 'tropical':s=>({
  title:T2('A warm, humid air mass','Uma massa de ar quente e húmida'),
  body:T2(
   `The temperature is ${decT(s.temp)}° and the dew point is ${decT(s.dewNow)}° — the air is loaded with water vapour. It feels heavy because it is: at this humidity, sweat evaporates more slowly, so your body cannot shed heat as efficiently. This air mass typically arrives from the south or southwest, often ahead of an approaching front.`,
   `A temperatura está a ${decT(s.temp)}° e o ponto de orvalho a ${decT(s.dewNow)}° — o ar está carregado de vapor de água. Sente-se pesado porque é: com esta humidade, o suor evapora mais devagar e o corpo não consegue libertar calor com a mesma eficiência. Esta massa de ar chega tipicamente de sul ou sudoeste, muitas vezes à frente de uma frente que se aproxima.`
  ),
  signals:[
   T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Humidity ${s.rhNow}%`,`Humidade ${s.rhNow}%`)
  ]
 }),
 'polar':s=>({
  title:T2('Cold, dry polar air','Ar polar, frio e seco'),
  body:T2(
   `The dew point is below ${decT(s.dewNow)}°, which means almost no water vapour in the air. A wind blowing from ${LANG==='pt'?'norte':'north'} is the signature of a polar outbreak. Expect very clear skies — dry air has no moisture to form clouds — sharp shadows, and a wind that bites. Nights under this air mass are the coldest of the winter.`,
   `O ponto de orvalho está abaixo de ${decT(s.dewNow)}°, o que significa quase nenhum vapor de água no ar. O vento a soprar de norte é a assinatura de uma entrada de ar polar. Espera céu muito limpo — o ar seco não tem humidade para formar nuvens —, sombras nítidas e um vento que corta. As noites sob esta massa de ar são as mais frias do inverno.`
  ),
  signals:[
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Wind from N · ${W(s.wind)}`,`Vento de N · ${W(s.wind)}`),
   T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`)
  ]
 }),
 'storm-conv':s=>({
  title:T2('A convective thunderstorm','Uma trovoada de convecção'),
  body:T2(
   `On a day this warm (${decT(s.temp)}°), the ground heats up, the air above it rises, cools, and the water vapour condenses into towering cumulonimbus clouds. The energy released inside the cloud drives the lightning, hail, and bursts of heavy rain typical of this kind of storm. It is usually short-lived — most convective cells pass within an hour or two — but the downburst of cold air underneath can be surprisingly strong.`,
   `Num dia tão quente (${decT(s.temp)}°), o solo aquece, o ar por cima sobe, arrefece, e o vapor de água condensa-se em nuvens cumulonimbus altas. A energia libertada dentro da nuvem alimenta os relâmpagos, o granizo e os aguaceiros fortes típicos deste tipo de tempestade. Costuma ser curta — a maioria das células convectivas passa em uma ou duas horas — mas a corrente descendente de ar frio por baixo pode ser surpreendentemente forte.`
  ),
  signals:[
   T2(`Code ${s.code} — thunder`,`Código ${s.code} — trovoada`),
   T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 }),
 'fog-rad':s=>({
  title:T2('Radiation fog','Nevoeiro de radiação'),
  body:T2(
   `Overnight the ground lost its heat to space by radiation, cooling the air directly above it to the dew point. With almost no wind (${W(s.wind)}), the air cannot mix with drier air above, so the fog sits and thickens. It will lift in the morning when the Sun warms the ground — but until then, visibility can drop below a few hundred metres.`,
   `Durante a noite o solo perdeu calor para o espaço por radiação, arrefecendo o ar logo acima até ao ponto de orvalho. Com quase nenhum vento (${W(s.wind)}), o ar não se mistura com o ar mais seco de cima, por isso o nevoeiro instala-se e adensa-se. Levanta pela manhã, quando o Sol aquecer o solo — mas até lá a visibilidade pode descer abaixo dos duzentos metros.`
  ),
  signals:[
   T2(`Code ${s.code} — fog`,`Código ${s.code} — nevoeiro`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`),
   T2(`Humidity ${s.rhNow}%`,`Humidade ${s.rhNow}%`)
  ]
 }),
 'showers':s=>({
  title:T2('Scattered showers, not a front','Aguaceiros dispersos, não uma frente'),
  body:T2(
   `Pressure is stable, so there is no large-scale system driving these showers — they are individual convective cells forming where the air is locally unstable. They pass quickly, and between them there are often long gaps of sunshine. This is the kind of weather where one side of a hill can be in rain and the other in full sun.`,
   `A pressão está estável, por isso não há nenhum sistema de grande escala a empurrar estes aguaceiros — são células convectivas individuais que se formam onde o ar está localmente instável. Passam depressa e entre eles há muitas vezes longos períodos de sol. É o tipo de tempo em que um lado de uma colina pode estar à chuva e o outro ao sol.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Code ${s.code} — showers`,`Código ${s.code} — aguaceiros`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 }),
 'transition':s=>({
  title:T2('No single pattern dominates','Nenhum padrão domina neste momento'),
  body:T2(
   `Pressure is steady, the dew point is close to normal, and the wind is light. The atmosphere is in transition — none of the classic signatures (a passing front, a settled high, a tropical or polar air mass) is present strongly enough to explain the weather on its own. This is the most common state of all: not dramatic, not chaotic, just the atmosphere quietly doing its thing.`,
   `A pressão está estável, o ponto de orvalho perto do normal e o vento fraco. A atmosfera está em transição — nenhuma das assinaturas clássicas (uma frente a passar, um anticiclone instalado, uma massa de ar tropical ou polar) está presente com força suficiente para explicar o tempo por si só. Este é o estado mais comum de todos: nem dramático, nem caótico, apenas a atmosfera a fazer o que faz.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 })
};

Object.assign(PATTERNS,{
 'bomb-cyclone':(s)=>({
  title:T2('Bomb cyclone','Ciclone-bomba'),
  body:T2('Pressure is falling very fast — a sign of explosive cyclogenesis. Expect rapid intensification of wind and rain over the next hours.',
          'A pressão está a cair muito depressa — sinal de ciclogénese explosiva. Espera-se intensificação rápida de vento e chuva nas próximas horas.'),
  signals:[T2(`Pressure drop ${s.dP!=null?pdS(s.dP):'–'}`,`Queda de pressão ${s.dP!=null?pdS(s.dP):'–'}`),
           T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2('Rapid intensification','Intensificação rápida')]
 }),
 'derecho':(s)=>({
  title:T2('Derecho / severe wind line','Derecho / linha de vento severo'),
  body:T2('A fast-moving band of thunderstorms is producing widespread damaging straight-line winds.',
          'Uma linha de trovoadas em movimento rápido está a produzir ventos retilíneos generalizados e destrutivos.'),
  signals:[T2(`Gusts ${Math.round(s.wind)} km/h`,`Rajadas ${Math.round(s.wind)} km/h`),
           T2('Thunderstorm activity','Atividade de trovoada'),
           T2('Sudden pressure drop','Queda súbita de pressão')]
 }),
 'blizzard':(s)=>({
  title:T2('Blizzard','Nevão com vento (blizzard)'),
  body:T2('Heavy snow combined with strong winds is sharply reducing visibility — classic blizzard conditions.',
          'Neve intensa combinada com vento forte reduz drasticamente a visibilidade — condições clássicas de blizzard.'),
  signals:[T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
           T2('Heavy snowfall','Queda de neve intensa')]
 }),
 'thundersnow':(s)=>({
  title:T2('Thundersnow','Trovoada com neve'),
  body:T2('A rare combination of thunder and snowfall — strong upward motion occurring even in near-freezing air.',
          'Uma combinação rara de trovão e neve — há movimento ascendente forte mesmo com ar próximo de 0°C.'),
  signals:[T2('Thunderstorm code active','Código de trovoada ativo'),
           T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`)]
 }),
 'heatwave':(s)=>({
  title:T2('Heatwave','Onda de calor'),
  body:T2('Persistently high temperatures with low humidity and light wind. Stay hydrated and avoid peak sun hours.',
          'Temperaturas persistentemente altas, humidade baixa e vento fraco. Hidrate-se e evite as horas de maior sol.'),
  signals:[T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
           T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2('Light wind','Vento fraco')]
 }),
 'monsoon':(s)=>({
  title:T2('Active monsoon burst','Episódio ativo de monção'),
  body:T2('Warm, moisture-loaded air is producing sustained heavy rainfall — consistent with an active monsoon phase.',
          'Ar quente e carregado de humidade produz chuva intensa e sustentada — consistente com uma fase ativa de monção.'),
  signals:[T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
           T2('Sustained heavy rain','Chuva forte sustentada')]
 }),
 'atm-river':(s)=>({
  title:T2('Atmospheric river','Rio atmosférico'),
  body:T2('A narrow corridor of concentrated moisture is funnelling sustained rain and strong wind into the region.',
          'Um corredor estreito de humidade concentrada canaliza chuva sustentada e vento forte para a região.'),
  signals:[T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2('Persistent rain','Chuva persistente')]
 }),
 'dust-storm':(s)=>({
  title:T2('Dust storm / Haboob','Tempestade de poeira (haboob)'),
  body:T2('Strong, dry winds are lifting large amounts of sand and dust, sharply reducing visibility.',
          'Ventos fortes e secos levantam grandes quantidades de areia e poeira, reduzindo drasticamente a visibilidade.'),
  signals:[T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2('Low visibility risk','Risco de baixa visibilidade')]
 }),
 'foehn':(s)=>({
  title:T2('Foehn / Chinook wind','Vento foehn / Chinook'),
  body:T2('Air descending from high terrain is warming and drying rapidly, producing an unusually warm, dry, gusty wind.',
          'O ar que desce de terreno elevado aquece e seca rapidamente, produzindo um vento invulgarmente quente, seco e forte.'),
  signals:[T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2('Clear sky','Céu limpo')]
 })
});
Object.assign(PT,{'Global extremes':'Fenómenos extremos'});

Object.assign(PT,{'Iberia':'Península Ibérica','Signals right now':'Sinais neste momento'});

Object.assign(PT,{
  'No exact match for':'Sem correspondência exata para',
  'Here are the closest cities we could find.':'Estas são as cidades mais parecidas que encontrámos.',
  'Back':'Voltar'
});

/* ============ Céu Explicado × isóbaras ============ */
/* Usa o MESMO campo de pressão do mapa (isoCache + gridLoad + isoBuild), por isso o A/B que vês no radar é o A/B que o Céu Explicado conhece. */
const pMSL=()=>{const c=data.current;return isFinite(c.pressure_msl)?c.pressure_msl:c.surface_pressure};   // pressão ao nível do mar (a de superfície engana em locais altos)
const SYN_Z=6;                                                     // passo de 5°: escala regional
let synMemo={k:'',t:0,a:null},synBusy=false;
const synKey=()=>place.lat.toFixed(2)+','+place.lon.toFixed(2);
function synBox(){                                                 // caixa de ±24° à volta do local (≈ ±2 600 km)
  const st=tempStepOf(SYN_Z),jm=Math.floor(84/st),R=24;
  const kx=Math.min(1.6,1/Math.max(.3,Math.cos(Math.min(75,Math.abs(place.lat))*Math.PI/180)));
  return{z:SYN_Z,st,i0:Math.floor((place.lon-R*kx)/st),i1:Math.ceil((place.lon+R*kx)/st),
         j0:Math.max(-jm,Math.floor((place.lat-R)/st)),j1:Math.min(jm,Math.ceil((place.lat+R)/st))};
}
function synAnalyse(){
  const g=synBox(),M=isoBuild(g);
  if(!M)return null;
  const p0=pMSL(),la=place.lat,lo=place.lon,rad=Math.PI/180;
  const brg=(la2,lo2)=>{const f1=la*rad,f2=la2*rad,dl=(lo2-lo)*rad;
    return(Math.atan2(Math.sin(dl)*Math.cos(f2),Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl))/rad+360)%360};
  const list=M.ext.map(e=>({hi:e.hi,p:e.p,lat:e.lat,lng:e.lng,d:hav(la,lo,e.lat,e.lng),b:brg(e.lat,e.lng)})).sort((a,b)=>a.d-b.d);
  /* anel de 600–1 200 km: diz se o local está acima ou abaixo da pressão que o rodeia (dorsal / cavado) */
  const N=Math.round(360/g.st);let sum=0,cnt=0;
  for(let j=g.j0;j<=g.j1;j++)for(let i=g.i0;i<=g.i1;i++){
    const v=isoNode(g.z,((i%N)+N)%N,j);if(v!==v)continue;
    const d=hav(la,lo,j*g.st,i*g.st);if(d>=600&&d<=1200){sum+=v;cnt++}
  }
  return{p0,rel:cnt>=4?p0-sum/cnt:null,hi:list.find(e=>e.hi)||null,lo:list.find(e=>!e.hi)||null};
}
function synGet(){                                                 // análise em cache (1 min); null se o campo ainda não chegou
  if(!place||!data)return null;
  const k=synKey();
  if(synMemo.k===k&&Date.now()-synMemo.t<6e4)return synMemo.a;
  let a=null;try{a=synAnalyse()}catch(e){console.warn('[Synoptic]',e.message)}
  synMemo={k,t:Date.now(),a};
  return a;
}
async function synEnsure(){                                        // pede os nós em falta (worker /grid, com cache) e repinta o herói quando chegarem
  if(!place||synBusy)return;
  const g=synBox(),need=isoMissing(g),k=synKey();
  if(!need.length||Date.now()<Math.max(isoBlock,tempBlock))return;
  synBusy=true;
  try{await gridLoad(g.z,need)}
  catch(err){
    console.warn('[Synoptic]',err.message);
    isoBlock=Date.now()+(err.message==='429'?3e5:3e4);
    if(err.message==='429')tempBlock=Math.max(tempBlock,isoBlock);
    return;
  }finally{synBusy=false}
  synMemo.t=0;
  if(tab==='sky'&&place&&synKey()===k)skyRepaint();
}
const SYN_DIR_EN=['N','NE','E','SE','S','SW','W','NW'],SYN_DIR_PT=['N','NE','E','SE','S','SO','O','NO'];
const synDir=b=>(LANG==='pt'?SYN_DIR_PT:SYN_DIR_EN)[Math.round(b/45)%8];
const synDist=d=>unit=='c'?(Math.round(d/10)*10)+' km':(Math.round(d*.621371/10)*10)+' mi';
const synWhere=e=>e.d<150?T2('right over this area','mesmo sobre esta zona'):T2(`about ${synDist(e.d)} ${synDir(e.b)} of here`,`a cerca de ${synDist(e.d)} a ${synDir(e.b)} daqui`);
const synStr=e=>e.hi
  ?(e.p>=1030?T2('strong','forte'):e.p>=1020?T2('well-marked','bem marcado'):T2('weak','fraco'))
  :(e.p<=990?T2('deep','cavada'):e.p<=1004?T2('moderate','moderada'):T2('shallow','pouco cavada'));
function synNearest(s){                                            // A ou B mais próximo (≤ 1 800 km)
  const y=s&&s.syn;if(!y)return null;
  const A=y.hi&&y.hi.d<=1800?y.hi:null,B=y.lo&&y.lo.d<=1800?y.lo:null;
  return A&&B?(A.d<=B.d?A:B):(A||B);
}
function synPick(s){                                               // usado pelo patternDetect antes do "nenhum padrão domina"
  const e=synNearest(s);
  if(e)return e.hi?'high-near':'low-near';
  const r=s.syn&&s.syn.rel;
  if(r!=null&&r>=2)return'ridge';
  if(r!=null&&r<=-2)return'trough';
  return null;
}
function synLine(s){                                               // frase + chip para os padrões que NÃO são regionais
  const e=synNearest(s);if(!e)return null;
  const kind=e.hi?T2('high (A)','alta (A)'):T2('low (B)','baixa (B)');
  return{
    text:T2(`On the pressure map a ${kind} of ${pf(e.p)} sits ${synWhere(e)}.`,`No mapa de pressão há uma ${kind} de ${pf(e.p)} ${synWhere(e)}.`),
    chip:`${e.hi?'A':'B'} ${pf(e.p)} · ${e.d<150?T2('overhead','por cima'):synDist(e.d)+' '+synDir(e.b)}`
  };
}
const SKY_ALIAS={'high-near':'high','ridge':'high','low-near':'showers','trough':'showers'};   // ícones reutilizados
Object.assign(PATTERNS,{
 'high-near':s=>{
  const e=synNearest(s),rel=s.syn&&s.syn.rel,north=place.lat>=0;
  const relTxt=rel!=null&&rel>.5?T2(`, about ${pdS(rel)} above the surrounding area`,`, cerca de ${pdS(rel)} acima da zona envolvente`):'';
  const drift=Math.abs(s.dP)>=1.5?T2(` Pressure has moved ${pdS(s.dP)} in three hours, so the high is building or drifting rather than sitting still — expect conditions to keep changing.`,` A pressão variou ${pdS(s.dP)} em três horas, por isso a alta está a formar-se ou a deslocar-se em vez de estar parada — as condições devem continuar a mudar.`):'';
  const cloud=s.code===3?T2(` The sky is overcast here anyway: under a weak high, moisture trapped below the sinking air can form low cloud.`,` Aqui o céu está encoberto na mesma: sob uma alta fraca, a humidade presa por baixo do ar que desce pode formar nuvens baixas.`):'';
  return{
   title:T2('A high-pressure centre nearby','Um centro de alta pressão nas proximidades'),
   body:T2(
    `The pressure map shows a closed high, the <i>A of ${pf(e.p)}</i>, ${synWhere(e)}. It is a ${synStr(e)} anticyclone, but it does not need to be strong to matter: what counts is that pressure is higher here than around it${relTxt}. Air sinks inside a high and spirals ${north?'clockwise':'anticlockwise'} around it, which thins out cloud and keeps the wind light.${drift}${cloud}`,
    `O mapa de pressão mostra uma alta fechada, o <i>A de ${pf(e.p)}</i>, ${synWhere(e)}. É um anticiclone ${synStr(e)}, mas não precisa de ser forte para contar: o que interessa é que a pressão aqui é superior à do ar à volta${relTxt}. O ar desce dentro de uma alta e gira ${north?'no sentido dos ponteiros do relógio':'no sentido contrário ao dos ponteiros do relógio'} à volta dela, o que dissipa a nebulosidade e mantém o vento fraco.${drift}${cloud}`),
   signals:[synLine(s).chip,T2(`Pressure ${pf(pMSL())} (sea level)`,`Pressão ${pf(pMSL())} (nível do mar)`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
  };
 },
 'low-near':s=>{
  const e=synNearest(s),north=place.lat>=0;
  const calm=s.code<=2?T2(` The sky is clear here for now — the low is not directly affecting this spot, but it can bring cloud and wind as it moves.`,` Aqui o céu está limpo por agora — a baixa ainda não afeta este ponto, mas pode trazer nuvens e vento ao deslocar-se.`):'';
  return{
   title:T2('A low-pressure centre nearby','Um centro de baixa pressão nas proximidades'),
   body:T2(
    `The pressure map shows a closed low, the <i>B of ${pf(e.p)}</i>, ${synWhere(e)}: a ${synStr(e)} depression. Air converges and rises into a low and spirals ${north?'anticlockwise':'clockwise'} around its centre, which is why cloud, rain and wind tend to gather around it.${calm}`,
    `O mapa de pressão mostra uma baixa fechada, o <i>B de ${pf(e.p)}</i>, ${synWhere(e)}: uma depressão ${synStr(e)}. O ar converge e sobe numa baixa e gira ${north?'no sentido contrário ao dos ponteiros do relógio':'no sentido dos ponteiros do relógio'} à volta do centro, e é por isso que nuvens, chuva e vento tendem a juntar-se à volta dela.${calm}`),
   signals:[synLine(s).chip,T2(`Pressure ${pf(pMSL())} (sea level)`,`Pressão ${pf(pMSL())} (nível do mar)`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
  };
 },
 'ridge':s=>({
  title:T2('On a ridge of high pressure','Numa dorsal de pressão alta'),
  body:T2(
   `Pressure here (${pf(pMSL())} at sea level) is <i>${pdS(s.syn.rel)} above</i> the surrounding area, but there is no closed high close by. That is a ridge: a tongue of higher pressure where air gently sinks, so the weather tends to be calmer than around it even though no single feature dominates.`,
   `A pressão aqui (${pf(pMSL())} ao nível do mar) está <i>${pdS(s.syn.rel)} acima</i> da zona envolvente, mas não há nenhuma alta fechada por perto. É uma dorsal: uma língua de pressão mais alta onde o ar desce suavemente, por isso o tempo tende a ser mais calmo do que à volta, mesmo sem um único sistema a dominar.`),
  signals:[T2(`+${pdS(s.syn.rel)} vs surroundings`,`+${pdS(s.syn.rel)} face à envolvente`),T2(`Pressure ${pf(pMSL())}`,`Pressão ${pf(pMSL())}`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
 }),
 'trough':s=>({
  title:T2('In a trough of low pressure','Num cavado de baixa pressão'),
  body:T2(
   `Pressure here (${pf(pMSL())} at sea level) is <i>${pdS(-s.syn.rel)} below</i> the surrounding area, but no closed low is nearby. That is a trough: a stretched-out zone of lower pressure where air tends to rise, so cloud and showers can develop even without a clear front.`,
   `A pressão aqui (${pf(pMSL())} ao nível do mar) está <i>${pdS(-s.syn.rel)} abaixo</i> da zona envolvente, mas não há nenhuma baixa fechada por perto. É um cavado: uma zona alongada de pressão mais baixa onde o ar tende a subir, por isso podem surgir nuvens e aguaceiros mesmo sem uma frente clara.`),
  signals:[T2(`${pdS(s.syn.rel)} vs surroundings`,`${pdS(s.syn.rel)} face à envolvente`),T2(`Pressure ${pf(pMSL())}`,`Pressão ${pf(pMSL())}`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
 })
});

function synDebug(p){                                              // só com o modo programador ligado
  const y=p.s.syn,f=e=>e?`${e.hi?'A':'B'} ${e.p.toFixed(1)} hPa @ ${e.lat.toFixed(1)},${e.lng.toFixed(1)} · ${Math.round(e.d)} km · ${Math.round(e.b)}°`:'—';
  return`<pre class="expProg">${escH([
    'pattern    '+p.id,
    'grid       z='+SYN_Z+'  step='+tempStepOf(SYN_Z)+'°  cache='+(isoCache[SYN_Z]?isoCache[SYN_Z].size:0)+' nós',
    'p0 (MSL)   '+(+pMSL()).toFixed(1)+' hPa',
    'rel        '+(y&&y.rel!=null?y.rel.toFixed(2)+' hPa vs anel 600–1200 km':'—'),
    'nearest A  '+f(y&&y.hi),
    'nearest B  '+f(y&&y.lo)
  ].join('\n'))}</pre>`;
}
function skyHero(p){
  const det=(PATTERNS[p.id]||PATTERNS.transition)(p.s);
  const icon=PD_ICONS[p.id]||PD_ICONS[SKY_ALIAS[p.id]]||PD_ICONS.transition;
  const isIb=p.cat==='Iberia',sl=SKY_ALIAS[p.id]?null:synLine(p.s);
  const sig=sl?[...det.signals,sl.chip]:det.signals;
  return`<section class="card expHero">
 <div class="expTxt">
 <span class="expCat${isIb?' ib':''}">${tr(p.cat)}</span>
 <h2 class="expH">${det.title}</h2>
 <p class="expP">${det.body}</p>
 ${sl?`<p class="expSynP">${sl.text}</p>`:''}
 <div class="expSig">${sig.map(x=>`<span class="sg"><i></i>${x}</span>`).join('')}</div>
 ${typeof progOn==='function'&&progOn()?synDebug(p):''}
 </div>
 <div class="expDiagram">${icon}</div>
 </section>`;
}
function skyRepaint(){
  const el=$('#pane .expHero');if(!el||tab!=='sky'||!data)return;
  const t=document.createElement('div');t.innerHTML=skyHero(patternDetect());
  el.replaceWith(t.firstElementChild);
}

/* ============ Céu Explicado: diagramas + sparkline ============ */
const SVG_CLOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
const SVG_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
const SVG_PULSE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>';

const PD_ICONS={
'front-cold':`<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="#2f7ee0" opacity=".10"/><path d="M14 72 Q 60 40 106 72" fill="none" stroke="#2f7ee0" stroke-width="5" stroke-linecap="round"/><polygon points="34,70 42,70 38,58" fill="#2f7ee0"/><polygon points="58,60 66,60 62,48" fill="#2f7ee0"/><polygon points="82,60 90,60 86,48" fill="#2f7ee0"/></svg>`,
'front-warm':`<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="#e5652e" opacity=".10"/><path d="M14 72 Q 60 40 106 72" fill="none" stroke="#e5652e" stroke-width="5" stroke-linecap="round"/><circle cx="38" cy="68" r="7" fill="#e5652e"/><circle cx="62" cy="58" r="7" fill="#e5652e"/><circle cx="86" cy="58" r="7" fill="#e5652e"/></svg>`,
'post-front':`<svg viewBox="0 0 120 120"><circle cx="66" cy="46" r="20" fill="#f2a51a"/><g stroke="#f2a51a" stroke-width="4" stroke-linecap="round"><line x1="66" y1="12" x2="66" y2="20"/><line x1="66" y1="72" x2="66" y2="80"/><line x1="32" y1="46" x2="40" y2="46"/><line x1="92" y1="46" x2="100" y2="46"/><line x1="42" y1="22" x2="48" y2="28"/><line x1="84" y1="22" x2="78" y2="28"/></g><path d="M12 92 q10 -14 26 -8 q8 -10 22 -4" fill="none" stroke="#9fb3c4" stroke-width="6" stroke-linecap="round" opacity=".5"/></svg>`,
'high':`<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="22" fill="#f2a51a"/><g stroke="#f2a51a" stroke-width="4" stroke-linecap="round"><line x1="60" y1="18" x2="60" y2="28"/><line x1="60" y1="92" x2="60" y2="102"/><line x1="18" y1="60" x2="28" y2="60"/><line x1="92" y1="60" x2="102" y2="60"/><line x1="30" y1="30" x2="37" y2="37"/><line x1="83" y1="83" x2="90" y2="90"/><line x1="90" y1="30" x2="83" y2="37"/><line x1="37" y1="83" x2="30" y2="90"/></g><circle cx="60" cy="60" r="44" fill="none" stroke="#f2a51a" stroke-width="2" stroke-dasharray="3 7" opacity=".55"/></svg>`,
'tropical':`<svg viewBox="0 0 120 120"><circle cx="46" cy="44" r="18" fill="#f2a51a"/><path d="M16 86 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0" fill="none" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/><path d="M78 92 c0 -10 14 -14 14 -24 0 10 14 14 14 24 a14 14 0 0 1 -28 0z" fill="#3b8fe0" opacity=".85"/></svg>`,
'polar':`<svg viewBox="0 0 120 120"><g stroke="#8fd0ef" stroke-width="5" stroke-linecap="round"><line x1="60" y1="20" x2="60" y2="100"/><line x1="27" y1="37" x2="93" y2="83"/><line x1="93" y1="37" x2="27" y2="83"/></g><polygon points="60,6 50,20 70,20" fill="#5aa7ff"/></svg>`,
'storm-conv':`<svg viewBox="0 0 120 120"><path d="M30 64 h54 a16 16 0 0 0 0 -32 24 24 0 0 0 -46 -6 18 18 0 0 0 -8 38z" fill="#6f8aa8"/><polyline points="58,70 46,88 60,88 50,106" fill="none" stroke="#f0cf45" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><line x1="80" y1="74" x2="74" y2="90" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/><line x1="94" y1="74" x2="88" y2="90" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/></svg>`,
'fog-rad':`<svg viewBox="0 0 120 120"><circle cx="60" cy="46" r="16" fill="#cdd9e3"/><g stroke="#8aa0b5" stroke-width="5" stroke-linecap="round" opacity=".8"><line x1="18" y1="68" x2="102" y2="68"/><line x1="26" y1="82" x2="94" y2="82"/><line x1="34" y1="96" x2="86" y2="96"/></g></svg>`,
'showers':`<svg viewBox="0 0 120 120"><circle cx="38" cy="40" r="15" fill="#f2a51a"/><path d="M46 68 h38 a14 14 0 0 0 0 -28 20 20 0 0 0 -38 -4 15 15 0 0 0 0 32z" fill="#6f8aa8"/><line x1="50" y1="80" x2="45" y2="92" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/><line x1="68" y1="80" x2="63" y2="92" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/><line x1="86" y1="80" x2="81" y2="92" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/></svg>`,
'transition':`<svg viewBox="0 0 120 120"><circle cx="44" cy="44" r="17" fill="#f2a51a"/><path d="M52 72 h34 a13 13 0 0 0 0 -26 18 18 0 0 0 -35 -3 14 14 0 0 0 1 29z" fill="#6f8aa8"/></svg>`,
'ib-nortada':`<svg viewBox="0 0 120 120"><path d="M14 10 L34 10 L26 110 L14 110 Z" fill="#cfe3ee"/><g stroke="#1d5f8c" stroke-width="6" stroke-linecap="round"><line x1="72" y1="14" x2="72" y2="34"/><line x1="72" y1="46" x2="72" y2="66"/><line x1="72" y1="78" x2="72" y2="98"/><polyline points="62,28 72,38 82,28"/><polyline points="62,60 72,70 82,60"/><polyline points="62,92 72,102 82,92"/></g><path d="M40 108 q8 -6 16 0 q8 -6 16 0" fill="none" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/></svg>`,
'ib-levante':`<svg viewBox="0 0 120 120"><polygon points="4,36 40,36 30,84 4,84" fill="#d8c7a8"/><polygon points="116,36 80,36 90,84 116,84" fill="#d8c7a8"/><line x1="44" y1="60" x2="76" y2="60" stroke="#b4552e" stroke-width="6" stroke-linecap="round"/><polyline points="64,48 78,60 64,72" fill="none" stroke="#b4552e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
'ib-suao':`<svg viewBox="0 0 120 120"><circle cx="34" cy="32" r="16" fill="#e0892f"/><rect x="28" y="60" width="12" height="30" rx="6" fill="#e0352b"/><circle cx="34" cy="92" r="9" fill="#e0352b"/><line x1="60" y1="66" x2="98" y2="66" stroke="#b4552e" stroke-width="5" stroke-linecap="round"/><polyline points="86,54 100,66 86,78" fill="none" stroke="#b4552e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
'ib-calima':`<svg viewBox="0 0 120 120"><circle cx="60" cy="44" r="20" fill="#e0a046"/><g stroke="#c9873a" stroke-width="6" stroke-linecap="round" opacity=".75"><line x1="14" y1="74" x2="106" y2="74"/><line x1="20" y1="88" x2="100" y2="88"/><line x1="28" y1="102" x2="92" y2="102"/></g></svg>`,
'ib-gotafria':`<svg viewBox="0 0 120 120"><circle cx="60" cy="52" r="30" fill="none" stroke="#5d6391" stroke-width="3" stroke-dasharray="4 6" opacity=".55"/><path d="M44 64 h32 a14 14 0 0 0 0 -28 20 20 0 0 0 -38 -2 15 15 0 0 0 6 30z" fill="#5d6391" opacity=".8"/><line x1="46" y1="78" x2="40" y2="92" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/><line x1="62" y1="80" x2="56" y2="94" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/><line x1="78" y1="78" x2="72" y2="92" stroke="#3b8fe0" stroke-width="4" stroke-linecap="round"/></svg>`,
 'bomb-cyclone':`<svg viewBox="0 0 160 160" class="pdIcon"><g class="pdSpin"><path d="M80 20a60 60 0 1 0 42 102" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M80 20l10 14-18 2z" fill="currentColor"/></g></svg>`,
 'derecho':`<svg viewBox="0 0 160 160" class="pdIcon"><line x1="20" y1="60" x2="130" y2="60" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="pdDash"/><line x1="20" y1="90" x2="110" y2="90" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="pdDash"/><path d="M120 50l20 10-20 10" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>`,
 'blizzard':`<svg viewBox="0 0 160 160" class="pdIcon"><g class="pdSpin" style="transform-origin:80px 80px"><path d="M80 40v80M45 60l70 40M115 60l-70 40" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></g><line x1="20" y1="120" x2="60" y2="120" stroke="currentColor" stroke-width="5" class="pdDash"/></svg>`,
 'thundersnow':`<svg viewBox="0 0 160 160" class="pdIcon"><path d="M85 30 60 85h20l-15 45 45-60H90z" fill="currentColor" class="pdPulse"/><circle cx="40" cy="120" r="4" fill="currentColor"/><circle cx="55" cy="130" r="4" fill="currentColor"/></svg>`,
 'heatwave':`<svg viewBox="0 0 160 160" class="pdIcon"><circle cx="80" cy="70" r="26" fill="currentColor" class="pdPulse"/><path d="M30 120q20-10 40 0t40 0t40 0" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="pdDash"/></svg>`,
 'monsoon':`<svg viewBox="0 0 160 160" class="pdIcon"><ellipse cx="80" cy="55" rx="45" ry="25" fill="currentColor" opacity=".85"/><line x1="55" y1="90" x2="45" y2="125" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="pdDash"/><line x1="80" y1="90" x2="70" y2="130" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="pdDash"/><line x1="105" y1="90" x2="95" y2="125" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="pdDash"/></svg>`,
 'atm-river':`<svg viewBox="0 0 160 160" class="pdIcon"><path d="M15 60q30-25 60 0t70 0" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" class="pdDash"/><path d="M15 95q30-25 60 0t70 0" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" opacity=".6" class="pdDash"/></svg>`,
 'dust-storm':`<svg viewBox="0 0 160 160" class="pdIcon"><g class="pdSpin" style="transform-origin:80px 80px"><circle cx="60" cy="70" r="4" fill="currentColor"/><circle cx="90" cy="60" r="3" fill="currentColor"/><circle cx="100" cy="90" r="4" fill="currentColor"/><circle cx="70" cy="100" r="3" fill="currentColor"/></g><path d="M20 120h120" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="pdDash"/></svg>`,
 'foehn':`<svg viewBox="0 0 160 160" class="pdIcon"><path d="M20 110l40-60 25 35 20-25 35 50z" fill="currentColor" opacity=".7"/><line x1="90" y1="120" x2="90" y2="140" stroke="currentColor" stroke-width="5" stroke-linecap="round" class="pdDash"/></svg>`
};

function pressureSeries(){
 if(!data||!data.hourly)return null;
 const h=data.hourly, i0=idx0();
 const back=6, fwd=6; // ~12h de janela centrada em "agora"
 const start=Math.max(0, i0-back);
 const end=Math.min(h.time.length-1, i0+fwd);
 const out=[];
 for(let i=start;i<=end;i++){
  const v=h.surface_pressure ? h.surface_pressure[i] : null;
  if(v==null||!isFinite(v))continue;
  out.push({
   t:new Date(h.time[i]).toLocaleTimeString(LOC(),{hour:'2-digit',minute:'2-digit'}),
   v:v,
   now:i===i0
  });
 }
 return out;
}

function pressureSparkSVG(){
 const hrs = pressureSeries(); // assume que já existe: [{t:'14:00', v:1013.2, now:false}, ...]
 if(!hrs || hrs.length<2){
  return `<div class="sp-empty">${T2('Not enough data yet','Dados insuficientes por agora')}</div>`;
 }
 const W=260,H=60,pad=6;
 const vals=hrs.map(p=>p.v);
 const min=Math.min(...vals), max=Math.max(...vals);
 const span=(max-min)||1;
 const pts=hrs.map((p,i)=>({
  x:pad+i*(W-2*pad)/(hrs.length-1),
  y:H-pad-((p.v-min)/span)*(H-2*pad),
  t:p.t, v:p.v, now:p.now
 }));
 const line=pts.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
 const circles=pts.map(p=>
  `<circle class="sp-pt${p.now?' sp-now':''}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.now?4:7}"
    data-t="${p.t}" data-v="${p.v.toFixed(1)}"></circle>`
 ).join('');
 return `<div class="sparkWrap">
  <svg viewBox="0 0 ${W} ${H}" class="sparkline" preserveAspectRatio="none">
   <path d="${line}" class="sparkfill" fill="none"/>
   ${circles}
  </svg>
  <div class="sp-tooltip" id="spTip"></div>
 </div>`;
}

function initSparkTooltip(){
 const wrap=document.querySelector('.sparkWrap');
 if(!wrap)return;
 const tip=wrap.querySelector('.sp-tooltip');
 const show=(pt,x,y)=>{
  tip.textContent=`${pt.dataset.t} · ${unit=='c'?pt.dataset.v+' hPa':dcm(+pt.dataset.v*HPA_INHG,2)+' inHg'}`;
  tip.style.left=x+'px'; tip.style.top=y+'px';
  tip.classList.add('show');
 };
 wrap.querySelectorAll('.sp-pt').forEach(pt=>{
  pt.addEventListener('mouseenter',e=>{
   const r=wrap.getBoundingClientRect();
   show(pt, e.clientX-r.left, e.clientY-r.top);
  });
  pt.addEventListener('mousemove',e=>{
   const r=wrap.getBoundingClientRect();
   tip.style.left=(e.clientX-r.left)+'px';
   tip.style.top=(e.clientY-r.top)+'px';
  });
  pt.addEventListener('mouseleave',()=>tip.classList.remove('show'));
  pt.addEventListener('touchstart',e=>{
   const r=wrap.getBoundingClientRect();
   const t=e.touches[0];
   show(pt, t.clientX-r.left, t.clientY-r.top);
  },{passive:true});
 });
 document.addEventListener('touchstart',e=>{
  if(!wrap.contains(e.target))tip.classList.remove('show');
 },{passive:true});
}

function expMetricsHTML(s){
 const dP = Number(s.dP) || 0;
 const dDew = Number(s.dDew)|| 0;
 const wind = Number(s.wind)|| 0;
 const dDewD = unit=='c'?dDew:dDew*9/5; // diferença: só escala, nunca +32
 const rows=[
 {label:T2('Pressure (3h)','Pressão (3h)'),
 value:`${dP>0?'+':''}${pdS(dP)}`, trend:dP},
 {label:T2('Dew point (3h)','Ponto de orvalho (3h)'),
 value:`${dDewD>0?'+':''}${dDewD.toFixed(1)}°`, trend:dDew},
 {label:T2('Wind now','Vento agora'),
 value:W(wind), trend:null}
 ];
 return rows.map(r=>`
 <div class="sgRow">
 <span class="sgLabel">${r.label}</span>
 <span class="sgVal">${r.value}${trendIcon(r.trend)}</span>
 </div>`).join('');
}
function trendIcon(v){
 if(v==null)return'';
 if(v>0.05)return'<i class="sgUp">▲</i>';
 if(v<-0.05)return'<i class="sgDown">▼</i>';
 return'<i class="sgFlat">▬</i>';
}

function next6hText(){
  const h=data.hourly,i0=idx0();
  const i6=Math.min(i0+6,h.time.length-1);
  const c=data.current;
  const dP=h.surface_pressure[i6]-c.surface_pressure;
  const dDew=(h.dew_point_2m&&isFinite(h.dew_point_2m[i6]))?h.dew_point_2m[i6]-c.dew_point_2m:0;
  const dT=h.temperature_2m[i6]-c.temperature_2m;
  const rainMax=Math.max(...h.precipitation_probability.slice(i0,i6+1));
  const parts=[];
  if(Math.abs(dP)>=0.8) parts.push(T2(
    `<i>Pressure ${dP>0?'rising':'falling'} by ${pdS(Math.abs(dP))}</i> — ${dP>0?T2('settled weather is on the way','tempo estável a caminho'):T2('more active weather is likely','tempo mais ativo é provável')}.`,
    `<i>Pressão ${dP>0?'a subir':'a descer'} ${pdS(Math.abs(dP))}</i> — ${dP>0?'tempo mais estável a caminho':'tempo mais ativo é provável'}.`
  ));
  if(Math.abs(dDew)>=1) parts.push(T2(
    `<i>Dew point ${dDew>0?'rising':'falling'} by ${decDT(Math.abs(dDew))	}°</i> — the air is getting ${dDew>0?'more humid':'drier'}.`,
    `<i>Ponto de orvalho ${dDew>0?'a subir':'a descer'} ${decDT(Math.abs(dDew))	}°</i> — o ar está a ficar ${dDew>0?'mais húmido':'mais seco'}.`
  ));
  if(Math.abs(dT)>=1.5) parts.push(T2(
    `Temperature ${dT>0?'climbing':'dropping'} by about ${decDT(Math.abs(dT))}°.`,
    `Temperatura ${dT>0?'a subir':'a descer'} cerca de ${decDT(Math.abs(dT))}°.`
  ));
  if(rainMax>=50) parts.push(T2(
    `Rain probability peaks at ${rainMax}% in this window.`,
    `A probabilidade de chuva atinge ${rainMax}% nesta janela.`
  ));
  if(!parts.length) return T2(
    `Very little change expected over the next six hours — pressure, dew point and temperature all hold roughly steady. A good window for anything outdoors.`,
    `Muito pouca mudança esperada nas próximas seis horas — pressão, ponto de orvalho e temperatura mantêm-se praticamente constantes. Uma boa janela para estar ao ar livre.`
  );
  return parts.join(' ');
}

function contextWeekText(){
  const d=data.daily,c=data.current;
  const wkMax=d.temperature_2m_max.reduce((a,b)=>a+b,0)/d.temperature_2m_max.length;
  const diff=c.temperature_2m-wkMax;
  const hi=d.temperature_2m_max.indexOf(Math.max(...d.temperature_2m_max));
  const lo=d.temperature_2m_min.indexOf(Math.min(...d.temperature_2m_min));
  const wet=d.weather_code.filter(x=>x>=51).length;
  const parts=[];
  if(Math.abs(diff)<=1.5) parts.push(T2(
    `Today is close to the week's average (${decT(wkMax)}°).`,
    `Hoje está perto da média da semana (${decT(wkMax)}°).`
  ));
  else parts.push(T2(
    `Today is <b>${decDT(Math.abs(diff))}° ${diff>0?'warmer':'cooler'}</b> than the week's average (${decT(wkMax)}°).`,
    `Hoje está <b>${decDT(Math.abs(diff))}° ${diff>0?'mais quente':'mais frio'}</b> do que a média da semana (${decT(wkMax)}°).`
  ));
  parts.push(T2(
    `Warmest day: <b>${new Date(d.time[hi]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b> at ${T(d.temperature_2m_max[hi])}°. Coolest night: <b>${new Date(d.time[lo]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b> at ${T(d.temperature_2m_min[lo])}°.`,
    `Dia mais quente: <b>${new Date(d.time[hi]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b>, ${T(d.temperature_2m_max[hi])}°. Noite mais fria: <b>${new Date(d.time[lo]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b>, ${T(d.temperature_2m_min[lo])}°.`
  ));
  if(wet>=4) parts.push(T2(
    `${wet} of the next 7 days show rain.`,
    `${wet} dos próximos 7 dias mostram chuva.`
  ));
  else if(wet===0) parts.push(T2(
    `No rain in the seven-day window.`,
    `Sem chuva na janela de sete dias.`
  ));
  return parts.join(' ');
}

function skyPane(){
 synEnsure();                                   // pede o campo de pressão regional; o herói repinta-se quando chegar
 const p=patternDetect();
 return`<div class="pane exp">
 ${skyHero(p)}
 <div class="expGrid three">
 <section class="card expCard"><h4>${SVG_CLOCK}${tr('Next 6 hours')}</h4><p>${next6hText()}</p>
 <div class="expSpark"><h5>${T2('Pressure trend','Tendência da pressão')}</h5>${pressureSparkSVG()}</div></section>
 <section class="card expCard"><h4>${SVG_CAL}${tr('This week in context')}</h4><p>${contextWeekText()}</p></section>
 <section class="card expCard"><h4>${SVG_PULSE}${T2('Signals right now','Sinais neste momento')}</h4><div class="expMetrics">${expMetricsHTML(p.s)}</div></section>
 </div>
 </div>`;
}
/* ============ IPMA: descodificação ============ */
let ipmaMeta=null;
async function ipmaLoadMeta(){
  if(ipmaMeta) return ipmaMeta;
  try{
    const[w,t,p]=await Promise.all([
      fetchJSON('https://api.ipma.pt/open-data/weather-type-classe.json'),
      fetchJSON('https://api.ipma.pt/open-data/wind-speed-daily-classe.json'),
      fetchJSON('https://api.ipma.pt/open-data/precipitation-classe.json')
    ]);
    const weather={},wind={},precip={};
    (w.data||[]).forEach(x=>weather[x.idWeatherType]=LANG==='pt'?x.descWeatherTypePT:x.descWeatherTypeEN);
    (t.data||[]).forEach(x=>wind[x.classWindSpeed]=LANG==='pt'?x.descClassWindSpeedDailyPT:x.descClassWindSpeedDailyEN);
    (p.data||[]).forEach(x=>precip[x.classPrecInt]=LANG==='pt'?x.descClassPrecIntPT:x.descClassPrecIntEN);
    ipmaMeta={weather,wind,precip};
    return ipmaMeta;
  }catch(e){console.warn('[IPMA meta]',e.message);return{weather:{},wind:{},precip:{}}}
}

function isPortugal(lat,lon){
  return lat>=29.5&&lat<=42.2&&lon>=-32&&lon<=-6;
}
async function ipmaDaily(lat,lon){
  try{
    const list=await fetchJSON('https://api.ipma.pt/open-data/distrits-islands.json');
    const areas=(list.data||[]).map(a=>({id:a.globalIdLocal,name:a.local,lat:+a.latitude,lon:+a.longitude}));
    if(!areas.length) return null;
    let best=areas[0],bd=1e9;
    for(const a of areas){
      const d=hav(lat,lon,a.lat,a.lon);
      if(d<bd){bd=d;best=a}
    }
    if(bd>50) return null;   // mais de 50 km: não mostra
    const f=await fetchJSON(`https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${best.id}.json`);
    const meta=await ipmaLoadMeta();
    return{area:best,daily:(f.data||[]).map(d=>({
      date:d.forecastDate,
      tMin:+d.tMin,tMax:+d.tMax,
      rain:+d.precipitaProb,
      windDir:d.predWindDir,
      windCls:meta.wind[d.classWindSpeed]||d.classWindSpeed,
      code:+d.idWeatherType,
      desc:meta.weather[d.idWeatherType]||''
    }))};
  }catch(e){console.warn('[IPMA daily]',e.message);return null}
}

/* ============ Radar IPMA (Portugal) ============ */
const IPMA_RADAR_BASE = 'https://www.ipma.pt/resources.www/transf/radar/';
let ipmaRadarCache = null;
let ipmaRadarPrefix = lsGet('ipmaRadarPrefix');

function ipmaRadarURL(path){
  return IPMA_RADAR_BASE + (ipmaRadarPrefix ?? 'por/') + path;
}
function probeImage(url){
  return new Promise(res=>{
    const im=new Image(),to=setTimeout(()=>{im.src='';res(false)},4000);
    im.onload=()=>{clearTimeout(to);res(true)};
    im.onerror=()=>{clearTimeout(to);res(false)};
    im.src=url;
  });
}
async function ipmaResolvePrefix(samplePath){
  if(ipmaRadarPrefix) return ipmaRadarPrefix;
  for(const pre of ['por/','']){
    if(await probeImage(IPMA_RADAR_BASE+pre+samplePath)){
      ipmaRadarPrefix=pre;lsSet('ipmaRadarPrefix',pre);
      console.info('[IPMA Radar] prefix resolved:',pre||'(root)');
      return pre;
    }
  }
  ipmaRadarPrefix='por/';
  return 'por/';
}

async function ipmaRadarFrames(){
  try{
    const r=await fetchJSON(WORKER+'/ipma-radar');
    // Estrutura real: {"Portugal":[{date,path},...]} — pode ter mais regiões no futuro
    const all=[];
    for(const region of Object.keys(r||{})){
      const arr=Array.isArray(r[region])?r[region]:[];
      for(const f of arr){
        if(!f||!f.path) continue;                                  // path:null = frame ainda não processado
          const time=Date.parse(String(f.date||'').replace(' ','T'))||0;
        if(!time) continue;
        all.push({time,path:f.path,region});
      }
    }
    all.sort((a,b)=>a.time-b.time);   // mais antiga primeiro, mais recente por último
    if(!all.length){console.warn('[IPMA Radar] no frames with paths');return null}
    const out=all.slice(-12);
    console.info('[IPMA Radar]',out.length,'frames ·',new Date(out[0].time).toISOString(),'→',new Date(out[out.length-1].time).toISOString());
    return out;
  }catch(e){console.warn('[IPMA Radar]',e.message);return null}
}



/* ============ RainViewer (global) ============ */
let rainViewerFrames = null;
let rainViewerCacheAt = 0;

async function rainViewerLoad() {
  if (rainViewerFrames && Date.now() - rainViewerCacheAt < 5 * 60 * 1000) {
    return rainViewerFrames;
  }
  try {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const radar = j.radar || {};
    const past = (radar.past || []).map(f => ({ time: f.time * 1000, path: f.path }));
    const nowcast = (radar.nowcast || []).map(f => ({ time: f.time * 1000, path: f.path, fc: true }));
    rainViewerFrames = { host: j.host, past, nowcast, all: [...past, ...nowcast] };
    rainViewerCacheAt = Date.now();
    return rainViewerFrames;
  } catch (e) {
    console.warn('[RainViewer]', e.message);
    return null;
  }
}

function rainViewerTileURL(host, path, colorScheme = 4, options = '0_0') {
  return `${host}${path}/256/{z}/{x}/{y}/${colorScheme}/${options}.png`;
}

/* ============ hero ============ */
function nowcastHTML(){
 const m=data.minutely_15,p=m&&m.precipitation?m.precipitation.slice(0,8).map(x=>x||0):null;
 if(!p||!p.length){
  const i0=idx0(),r=Math.max(...data.hourly.precipitation_probability.slice(i0,i0+3));
  return`<div class="ncbox">${ic('drop')}<span>${r}% rain chance in the next 3 hours</span></div>`;
 }
 const wet=x=>x>=.05,first=p.findIndex(wet),mx=Math.max(...p,.5),pk=Math.max(...p)*4;   // pico em mm/h
 const col=x=>!wet(x)?'rgba(255,255,255,.6)':x*4<.5?'#7fc1ff':x*4<4?'#3b8fe0':'#1d5fc4';
 const i0=idx0(),r3=Math.max(...data.hourly.precipitation_probability.slice(i0,i0+3));
 let head,sub;
 if(first<0){head='Dry for the next 2 hours';sub=`${r3}% rain chance in the next 3 hours`}
 else if(first==0){const end=p.findIndex(x=>!wet(x));head='Raining now';sub=end<0?'Rain for the next 2 hours':`Rain stops in about ${end*15} min`}
 else{head=`Rain in about ${first*15} min`;sub=pk<.5?'Light rain expected':pk<4?'Moderate rain expected':'Heavy rain expected'}
 return`<div class="ncbox" title="Precipitation forecast for the next 2 hours"><div class="nb">${p.map((x,i)=>`<i class="${wet(x)?'w':''}" style="height:${Math.max(14,x/mx*100)}%;animation-delay:${i*60}ms;background:${col(x)}"></i>`).join('')}</div><div class="nct"><b>${head}</b><small>${sub}</small></div></div>`;
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

/* ============ tabs ============ */
const TABS=[['today','Today'],['week','Week'],['radar','Radar'],['air','Air & pollen'],['sky','Sky Explained'],['sci','Science']];
function shell(){
 return`<div class="tabs" role="tablist" id="tabs"><i class="ind" id="ind"></i>${TABS.map(([k,n])=>`<button class="tab" role="tab" data-t="${k}" aria-selected="${k==tab}">${n}</button>`).join('')}</div><div id="pane"></div>`;
}
function moveInd(){
 const b=$('.tab[aria-selected=true]'),i=$('#ind');if(!b||!i)return;
 i.style.left=b.offsetLeft+'px';i.style.width=b.offsetWidth+'px';
}
const PANES={today:()=>todayPane(),week:()=>weekPane(),radar:()=>radarPane(),air:()=>airPane(),sky:()=>skyPane(),sci:()=>sciPane()};
const INIT={today:()=>scrub(),radar:()=>radarInit()};
function setTab(k){
 radarStop();
 tab=k;if(lsGet('tabPick')!==k)lsSet('tabPick',k);$$('.tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.t==k));moveInd();
 const pane=$('#pane');pane.innerHTML=PANES[k]();
 if(INIT[k])INIT[k]();
 if(k==='sky')initSparkTooltip();   // <-- adicionar esta linha
 runCounters(pane);
}

/* --- Today --- */
function ringHTML(ci){
 const C=2*Math.PI*30;
 return`<div class="ringw" title="Comfort score"><svg viewBox="0 0 76 76" width="76" height="76" role="img" aria-label="Comfort score ${ci.s} out of 100"><circle cx="38" cy="38" r="30" fill="none" stroke="rgba(20,49,79,.12)" stroke-width="7"/><circle class="rg" cx="38" cy="38" r="30" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-ci.s/100)}" style="--C:${C}" transform="rotate(-90 38 38)"/><text x="38" y="45" text-anchor="middle" font-family="Instrument Serif,serif" font-size="24" fill="#14314f">${ci.s}</text></svg><small>${ci.lab}</small></div>`;
}
function chartSVG(){
 const h=data.hourly,i0=idx0();
 const v=h.temperature_2m.slice(i0,i0+25),pp=h.precipitation_probability.slice(i0,i0+25),tt=h.time.slice(i0,i0+25);
 const lo=Math.min(...v),hi=Math.max(...v),sp=hi-lo||1,n=v.length-1;
 const X=i=>24+i*(552/n),Y=x=>38+(hi-x)/sp*66;
 let d=`M${X(0)},${Y(v[0])}`;
 for(let i=1;i<=n;i++){const m=(X(i-1)+X(i))/2;d+=` C${m},${Y(v[i-1])} ${m},${Y(v[i])} ${X(i)},${Y(v[i])}`}
 const bars=pp.map((p,i)=>`<rect class="rb" style="--i:${i}" x="${X(i)-4}" y="${140-p*.3}" width="8" height="${Math.max(0,p*.3)}" rx="3" fill="#3b8fe0" opacity=".28"/>`).join('');
 const pct=i=>((X(i)-X(0))/(X(n)-X(0))*100).toFixed(1)+'%';
 const stops=v.map((x,i)=>`<stop offset="${pct(i)}" stop-color="${tempColor(x)}"/>`).join('');
 const areaStops=v.map((x,i)=>`<stop offset="${pct(i)}" stop-color="${tempColor(x)}" stop-opacity=".3"/>`).join('');
 const pts=v.map((x,i)=>i%4==0?`<circle cx="${X(i)}" cy="${Y(x)}" r="4.5" fill="${tempColor(x)}" stroke="#fff" stroke-width="1.5"/><text x="${X(i)}" y="${Y(x)-12}" text-anchor="middle" font-size="13" font-weight="600" fill="#14314f">${T(x)}°</text><text x="${X(i)}" y="162" text-anchor="middle" font-size="11" fill="rgba(20,49,79,.6)">${i?tt[i].slice(11,13)+'h':'Now'}</text>`:'').join('');
 return`<div class="chartbox"><svg viewBox="0 0 600 170" role="img" aria-label="Temperature over the next 24 hours" style="width:100%;height:auto;display:block"><defs>
 <linearGradient id="tgrad" gradientUnits="userSpaceOnUse" x1="${X(0)}" y1="0" x2="${X(n)}" y2="0">${stops}</linearGradient>
 <linearGradient id="agrad" gradientUnits="userSpaceOnUse" x1="${X(0)}" y1="0" x2="${X(n)}" y2="0">${areaStops}</linearGradient>
 <linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
 <mask id="fade"><rect x="0" y="0" width="600" height="140" fill="url(#ar)"/></mask></defs>
 ${bars}<g mask="url(#fade)"><path d="${d} L${X(n)},140 L${X(0)},140Z" fill="url(#agrad)"/></g>
 <path d="${d}" pathLength="1" class="draw" fill="none" stroke="url(#tgrad)" stroke-width="3.5" stroke-linecap="round"/>${pts}</svg></div>
 <div class="tlegend"><span>Cooler</span><div class="tgbar" style="background:linear-gradient(90deg,${tempColor(lo)},${tempColor((lo+hi)/2)},${tempColor(hi)})"></div><span>Warmer</span><span style="margin-left:10px">▮ rain chance</span></div>`;
}
function sunSVG(){
 const d=data.daily,now=new Date(data.current.time),sr=new Date(d.sunrise[0]),ss=new Date(d.sunset[0]);
 const up=now>=sr&&now<=ss;let t;
 if(up)t=(now-sr)/(ss-sr);
 else{const a=now<sr?new Date(ss-864e5):ss,b=now<sr?sr:new Date(d.sunrise[1]||sr.getTime()+864e5);t=Math.min(1,Math.max(0,(now-a)/(b-a)))}
 const P='M20,100 Q150,-20 280,100';
 const body=up?'<circle r="20" fill="#ffd166" opacity=".4" class="glow"/><circle r="10" fill="#f6a81c"/>':'<circle r="9" fill="#e9eeff" stroke="#6b7bd6" stroke-width="1.5"/>';
 return`<svg viewBox="0 0 300 124" role="img" aria-label="Sun position" style="width:100%;height:auto"><path class="arc" d="${P}" fill="none" stroke="rgba(20,49,79,.35)" stroke-width="2"/><line x1="0" y1="100" x2="300" y2="100" stroke="rgba(20,49,79,.2)"/><g><animateMotion dur="${still?.01:2.6}s" path="${P}" keyPoints="0;${t.toFixed(3)}" keyTimes="0;1" calcMode="linear" fill="freeze"/>${body}</g><text x="20" y="118" font-size="12" fill="rgba(20,49,79,.65)">${fmtT(d.sunrise[0])}</text><text x="280" y="118" font-size="12" text-anchor="end" fill="rgba(20,49,79,.65)">${fmtT(d.sunset[0])}</text></svg>`;
}
/* ============ New Feature: Celestial Ephemeris & Stargazing Seeing ============ */
function ephemerisData(){
 const d=data.daily,c=data.current,h=data.hourly,i0=idx0();
 const sr=new Date(d.sunrise[0]),ss=new Date(d.sunset[0]);
 
 // Hora Dourada: ~45 min antes do pôr do sol
 const ghStart=new Date(ss.getTime()-45*60000);
 // Hora Azul: ~15 a 35 min após o pôr do sol
 const bhStart=new Date(ss.getTime()+15*60000);
 
 const fmtH=dt=>dt.toLocaleTimeString(LOC(),{hour:'2-digit',minute:'2-digit'});
 
 // Índice de Observação Astronómica (Seeing 0-100)
 const cloudProb=Math.max(...h.precipitation_probability.slice(i0,i0+6));
 const rh=c.relative_humidity_2m;
 const moonLit=moon().lit;
 
 const seeingScore=Math.max(5,Math.min(100,Math.round(100 - (cloudProb*0.5) - (rh*0.25) - (moonLit*0.25))));
 const seeingLabel=seeingScore>=75?tr('Optimal Seeing'):seeingScore>=50?tr('Fair Seeing'):tr('Obscured / Hazy');
 
 return{
  gh:`${fmtH(ghStart)} – ${fmtH(ss)}`,
  bh:`${fmtH(bhStart)}`,
  seeingScore,
  seeingLabel
 };
}

function sourceBadge(){
 if(!data||!place)return'';
 const c=data.current;
 // usa o offset da API em vez de confiar no parsing de timezone do browser
 const apiNow = data.utc_offset_seconds!=null
   ? Date.now() + data.utc_offset_seconds*1000
   : Date.now();
 const stale = apiNow - new Date(c.time).getTime() > 60*60*1000;
 const dot = stale ? '#f59a3a' : '#2fb34a';
 const label = stale ? tr('Stale data') : tr('Live');
 return`<div class="src-badge">
 <span class="src-dot${stale?'':' live'}" style="background:${dot}"></span>
 <span>${label}</span>
 ${place.lat!=null?`<span class="src-sep">·</span><span class="src-coords">${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}</span>`:''}
 </div>`;
}
function stationHTML(){
 const s = extras.station;
 if(!s) return '';
 const fresh = data && (Date.now() - new Date(data.current.time).getTime()) < 30*60*1000;
 return`<div class="station-row">
   <span class="src-dot${fresh?' live':''}" style="background:${fresh?'#2fb34a':'#f59a3a'}"></span>
   <div class="station-info">
     <b>${escH(s.name)}</b>
     <small>${s.lat!=null?s.lat.toFixed(2):'—'}, ${s.lon!=null?s.lon.toFixed(2):'—'}${s.id?' · ID '+escH(s.id):''}</small>
   </div>
   <span class="station-src">NOAA ISD</span>
 </div>`;
}
async function loadStation(){
 const key = place.lat+','+place.lon;
 if(extras.stationKey===key && extras.station) return;
 extras.stationKey = key;
 extras.station = null;
 try{
  const r = await fetch(`https://www.ncei.noaa.gov/access/services/search/v1/data?dataset=global-hourly&bbox=${(place.lon-1).toFixed(2)},${(place.lat-1).toFixed(2)},${(place.lon+1).toFixed(2)},${(place.lat+1).toFixed(2)}&limit=1&format=json`);
  if(!r.ok) throw 0;
  const j = await r.json();
  const s = j.results && j.results[0];
  if(!s) throw 0;
  extras.station = { id: s.station || '', name: s.name || s.station || '—', lat: +s.latitude, lon: +s.longitude };
  putExtra('station', stationHTML());
 }catch(e){ /* sem estação disponível: não mostra nada */ }
}

function todayPane(){
 const c=data.current,d=data.daily,m=moon(),uv=d.uv_index_max[0],ci=comfortInfo(),h=data.hourly;
 const uvl=uv<3?'Low':uv<6?'Moderate':uv<8?'High':uv<11?'Very high':'Extreme';
 const best=ci.best<0?'Daylight has passed for today.':`Best time outside: <b>${new Date(h.time[ci.best]).toLocaleTimeString('en',{hour:'numeric'})}</b> · ${T(h.temperature_2m[ci.best])}° · ${h.precipitation_probability[ci.best]}% rain`;
 return`${window.SkyOrb?SkyOrb.html():''}<div class="pane g2"> <section class="card"> ${sourceBadge()}
  <div class="strip">
   ${ringHTML(ci)}
   <div class="mini"><span>Wind</span><b><svg class="wind" style="--r:${(c.wind_direction_10m||0)+180}deg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 9h-4v9h-2v-9H7z" fill="currentColor"/></svg>${W(c.wind_speed_10m)}</b></div>
   <div class="mini"><span>Humidity</span><b>${c.relative_humidity_2m}%</b><div class="bar2"><i style="--w:${c.relative_humidity_2m}%"></i></div></div>
   <div class="mini"><span>UV · ${uvl}</span><b>${Math.round(uv)}</b><div class="bar2"><i style="--w:${Math.min(100,uv/11*100)}%"></i></div></div>
   <div class="mini"><span>Pressure</span><b>${pN(c.surface_pressure)}<small>${pU()}</small></b><div class="bar2"><i style="--w:${Math.max(6,Math.min(100,(c.surface_pressure-970)/70*100))}%"></i></div></div>
  </div>
  ${chartSVG()}
 </section>
 <section class="card side">
  <div><h3>Sun and moon</h3>${sunSVG()}</div>
  <div class="moonrow"><span>${moonIcon()}</span><div><b>${m.n}</b><small>${m.lit}% illuminated</small></div></div>
  
  <!-- New Feature: Celestial Ephemeris & Stargazing Seeing -->
  <div class="ephem">
   <div><span>${tr('Golden hour')}</span><b>${ephemerisData().gh}</b></div>
   <div><span>${tr('Stargazing index')}</span><b>${ephemerisData().seeingScore}% · ${ephemerisData().seeingLabel}</b></div>
  </div>

 <p class="best">${best}</p>
 <div id="station">${stationHTML()}</div>
</section></div>`;
}
function scrub(){
 const svg=$('.chartbox svg');if(!svg)return;
 const h=data.hourly,i0=idx0(),v=h.temperature_2m.slice(i0,i0+25),n=v.length-1,box=svg.parentElement;
 const tip=document.createElement('div');tip.className='tip';box.appendChild(tip);
 svg.insertAdjacentHTML('beforeend','<line id="sl" y1="18" y2="140" stroke="#14314f" stroke-opacity=".5" stroke-dasharray="3 4" style="opacity:0;transition:opacity .2s"/>');
 const ln=svg.querySelector('#sl');
 const mv=e=>{
  const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*600,i=Math.max(0,Math.min(n,Math.round((x-24)/(552/n))));
  const px=24+i*(552/n);ln.setAttribute('x1',px);ln.setAttribute('x2',px);ln.style.opacity=1;
  const j=i0+i;tip.style.left=`clamp(44px, ${px/600*100}%, calc(100% - 44px))`;tip.style.opacity=1;
  tip.innerHTML=`<b>${T(v[i])}°</b><br><small>${new Date(h.time[j]).toLocaleTimeString('en',{hour:'numeric'})} · ${h.precipitation_probability[j]}% rain</small>`;
 };
 svg.addEventListener('pointermove',mv);svg.addEventListener('pointerdown',mv);
 svg.addEventListener('pointerleave',()=>{ln.style.opacity=0;tip.style.opacity=0});
}

/* --- Week --- */
async function weekPaneAsync(){
  const d=data.daily,h=data.hourly,i0=idx0();
  const c=data.current;
  const inPT=place&&isPortugal(place.lat,place.lon);
  if(inPT&&!data.__noIpma){
    const ip=await ipmaDaily(place.lat,place.lon);
    if(ip&&ip.daily.length){
      const days=ip.daily.slice(0,7);
      const mn=Math.min(...days.map(x=>x.tMin)),mx=Math.max(...days.map(x=>x.tMax)),sp=mx-mn||1;
      const cols=days.map((x,i)=>{
        const lo=(x.tMin-mn)/sp*100,ht=Math.max(10,(x.tMax-x.tMin)/sp*100);
        const code=IPMA_TO_WMO[x.code]??2;
        const isToday=i===0;
        return`<div class="dcol" style="--n:${i}"><b>${isToday?'Today':new Date(x.date+'T12:00').toLocaleDateString(LOC(),{weekday:'short'})}</b><span class="dic">${emoji(code,1)}</span><span class="hi">${T(x.tMax)}°</span><div class="dbar"><i style="--lo:${lo}%;--h:${ht}%;--n:${i};background:linear-gradient(${tempColor(x.tMax)},${tempColor(x.tMin)})"></i></div><span class="lo">${T(x.tMin)}°</span><small>${x.rain>=20?x.rain+'%':'&nbsp;'}</small></div>`;
      }).join('');
      const hrs=h.time.slice(i0,i0+24).map((t,j)=>{const i=i0+j;return`<div class="hr" style="--n:${j}"><div class="t">${j?t.slice(11,13)+'h':'Now'}</div><div class="e">${emoji(h.weather_code[i],h.is_day[i])}</div><div>${T(h.temperature_2m[i])}°</div><div class="p">${h.precipitation_probability[i]>=20?h.precipitation_probability[i]+'%':''}</div></div>`}).join('');
      return`<div class="pane"><section class="card"><p class="story">${story()}</p><div class="wk">${cols}</div><p class="note" style="margin-top:10px;font-size:12px">${tr('Forecast by')} <a href="https://www.ipma.pt/" target="_blank" rel="noopener" style="color:var(--acc)">IPMA</a> · ${tr('based on')} ECMWF + AROME</p></section>
      <section class="card"><h3>Next 24 hours</h3><div class="hours">${hrs}</div></section></div>`;
    }
  }
  // fallback: Open-Meteo (resto do mundo)
  const mn=Math.min(...d.temperature_2m_min),mx=Math.max(...d.temperature_2m_max),sp=mx-mn||1;
  const cols=d.time.map((t,i)=>{
    const lo=(d.temperature_2m_min[i]-mn)/sp*100,ht=Math.max(10,(d.temperature_2m_max[i]-d.temperature_2m_min[i])/sp*100);
    const rp=d.precipitation_probability_max?d.precipitation_probability_max[i]:0;
    return`<div class="dcol" style="--n:${i}"><b>${i?new Date(t+'T12:00').toLocaleDateString('en',{weekday:'short'}):'Today'}</b><span class="dic">${emoji(d.weather_code[i])}</span><span class="hi">${T(d.temperature_2m_max[i])}°</span><div class="dbar"><i style="--lo:${lo}%;--h:${ht}%;--n:${i};background:linear-gradient(${tempColor(d.temperature_2m_max[i])},${tempColor(d.temperature_2m_min[i])})"></i></div><span class="lo">${T(d.temperature_2m_min[i])}°</span><small>${rp>=20?rp+'%':'&nbsp;'}</small></div>`;
  }).join('');
  const hrs=h.time.slice(i0,i0+24).map((t,j)=>{const i=i0+j;return`<div class="hr" style="--n:${j}"><div class="t">${j?t.slice(11,13)+'h':'Now'}</div><div class="e">${emoji(h.weather_code[i],h.is_day[i])}</div><div>${T(h.temperature_2m[i])}°</div><div class="p">${h.precipitation_probability[i]>=20?h.precipitation_probability[i]+'%':''}</div></div>`}).join('');
  return`<div class="pane"><section class="card"><p class="story">${story()}</p><div class="wk">${cols}</div></section>
  <section class="card"><h3>Next 24 hours</h3><div class="hours">${hrs}</div></section></div>`;
}
function weekPane(){
  setTimeout(async()=>{
    const pane=$('#pane');if(!pane||tab!=='week')return;
    let html;
    try{
      html=await weekPaneAsync();
    }catch(e){
      console.warn('[Week]',e);
      data.__noIpma=1;
      html=await weekPaneAsync().catch(()=>'');
    }
    if(tab!=='week'||!$('#pane'))return;
    $('#pane').innerHTML=html;
    moveInd();
  },0);

  // Match the min-height to a typical full week layout (e.g. 500px instead of 260px)
  return `<div class="pane sk" style="min-height:520px"></div>`;
}

/* --- Air & pollen --- */
let extras={key:'',air:'',pol:''};
const LOADING=t=>`<h3>${t}</h3><p class="note sk">Loading…</p>`;
function airPane(){return`<div class="pane g2e"><section class="card" id="aq">${extras.air||LOADING('Air quality')}</section><section class="card" id="pol">${extras.pol||LOADING('Pollen & allergies')}</section></div>`}
function putExtra(id,html){const el=$('#'+id);if(el){el.innerHTML=html;runCounters(el)}}
function loadExtras(){
 const key=place.lat+','+place.lon;
 if(extras.key===key&&extras.air&&extras.pol)return;
 extras={key,air:'',pol:''};sig.aqi=null;sig.pollen=null;
 loadAir().then(h=>{if(extras.key!==key)return;extras.air=h;putExtra('aq',h);
  const m=h.match(/data-cu="(\d+)"/);sig.aqi=m?+m[1]:null;checkAlerts()});
 loadPollen().then(h=>{if(extras.key!==key)return;extras.pol=h;putExtra('pol',h);checkAlerts()});
}
async function loadAir(){
 try{
  const r=await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=european_aqi,pm2_5,pm10`);
  const j=(await r.json()).current;if(!j||j.european_aqi==null)throw 0;
  const a=Math.round(j.european_aqi),pct=Math.max(3,Math.min(100,a)),rot=-90+Math.min(100,a)*1.8;
  const lv=a<=20?['Good','Air is clean. Enjoy the outdoors.']:a<=40?['Fair','Fine for most people.']:a<=60?['Moderate','Sensitive people may notice effects.']:a<=80?['Poor','Consider shorter time outside.']:a<=100?['Very poor','Limit strenuous outdoor activity.']:['Extremely poor','Stay indoors if you can.'];
  return`<h3>Air quality</h3><div class="gauge"><svg viewBox="0 0 200 112" role="img" aria-label="Air quality index ${a}"><defs><linearGradient id="gg" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0"><stop offset="0" stop-color="#4fd18b"/><stop offset=".4" stop-color="#f3d34a"/><stop offset=".7" stop-color="#f59a3a"/><stop offset="1" stop-color="#e5652e"/></linearGradient></defs><path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="rgba(20,49,79,.1)" stroke-width="14" stroke-linecap="round"/><path class="gfill" d="M20,100 A80,80 0 0 1 180,100" pathLength="100" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="${100-pct}"/><g class="needle" style="--r:${rot}deg"><line x1="100" y1="100" x2="100" y2="34" stroke="#14314f" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="#14314f"/></g></svg></div>
  <div class="aq"><span data-cu="${a}">0</span><small>${lv[0]}</small></div><p class="note" style="text-align:center">${lv[1]}</p><p class="note" style="text-align:center;font-size:13px">PM2.5 ${j.pm2_5} µg/m³ · PM10 ${j.pm10} µg/m³</p>`;
 }catch(e){return`<h3>Air quality</h3><p class="note">Not available for this place right now.</p>`}
}

/* Pollen: Atmospore first, Open-Meteo as fallback */
const POLLEN_RX=/pollen|tree|grass|weed|birch|alder|oak|olive|ragweed|mugwort|hazel|cypress|pine|plane|poplar|ash|elm|nettle|plantain|cedar|maple|mold|mould|spore|fungi|alternaria|cladosporium/i;
const CATS={none:0,'very low':0,low:0,moderate:1,medium:1,high:2,'very high':3,extreme:3,severe:3};
const numOf=o=>{for(const k of['index','level','value','count','concentration','risk','score']){const v=o[k];if(typeof v=='number')return v;if(typeof v=='string'&&v.trim()!==''&&!isNaN(+v))return+v}return null};
const catOf=o=>{for(const k of['category','label','risk','level','status','description']){const v=o[k];if(typeof v=='string'&&CATS[v.toLowerCase()]!==undefined)return v.toLowerCase()}return null};
function harvest(node,out,depth=0){
 if(node==null||depth>7)return;
 if(Array.isArray(node)){node.forEach(n=>harvest(n,out,depth+1));return}
 if(typeof node!='object')return;
 const nm=['name','type','plant','species','allergen','displayName','display_name','code'].map(k=>node[k]).find(v=>typeof v=='string');
 if(nm&&POLLEN_RX.test(nm)){const v=numOf(node),c=catOf(node);if(v!==null||c){out.push({n:nm,v,c});return}}
 for(const[k,v]of Object.entries(node)){
  if(typeof v=='number'&&POLLEN_RX.test(k)&&!/lat|lon|time/i.test(k))out.push({n:k,v,c:null});
  else if(typeof v=='string'&&POLLEN_RX.test(k)&&CATS[v.toLowerCase()]!==undefined)out.push({n:k,v:null,c:v.toLowerCase()});
  else if(v&&typeof v=='object'&&!Array.isArray(v)&&POLLEN_RX.test(k)&&(numOf(v)!==null||catOf(v)))out.push({n:k,v:numOf(v),c:catOf(v)});
  else harvest(v,out,depth+1);
 }
}
const pretty=s=>{s=s.replace(/[_-]+/g,' ').replace(/\bpollen\b/i,'').trim();return s?s[0].toUpperCase()+s.slice(1).toLowerCase():'Pollen'};
function pLevel(v){if(v<=20)return 0;if(v<=50)return 1;if(v<=100)return 2;return 3}
const LVL=['Low','Moderate','High','Very high'];
function normalize(list){
 const m=new Map();
 list.forEach(x=>{const k=pretty(x.n).toLowerCase(),o=m.get(k);if(!o||(x.v??-1)>(o.v??-1))m.set(k,{...x,n:pretty(x.n)})});
 const arr=[...m.values()],vals=arr.map(x=>x.v).filter(v=>v!==null),mx=vals.length?Math.max(...vals):0,scale=mx<=5?5:mx<=10?10:null;
 return arr.map(x=>{
  let lvl,pct,label;
  if(x.v!==null){
   if(scale){const f=x.v/scale;lvl=f<=.3?0:f<=.6?1:f<=.8?2:3;pct=f*100}
   else{lvl=pLevel(x.v);pct=Math.min(100,x.v/1.2)}
   label=x.v===0?'None':LVL[lvl];
  }else{lvl=CATS[x.c];label=x.c[0].toUpperCase()+x.c.slice(1);pct=[18,45,75,100][lvl]}
  return{n:x.n,label,lvl,pct:Math.max(pct,5)};
 }).sort((a,b)=>b.lvl-a.lvl||b.pct-a.pct);
}
async function fetchJSON(url,headers){
 const ac=new AbortController(),t=setTimeout(()=>ac.abort(),6000);
 try{const r=await fetch(url,{headers,signal:ac.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
 finally{clearTimeout(t)}
}
let speciesMeta=lsGet('speciesMeta');
const RISK={low:0,moderate:1,high:2,'very high':3};
const sig={aqi:null,pollen:null};

async function getSpeciesMeta(){
 if(speciesMeta&&speciesMeta.t>Date.now()-6048e5)return speciesMeta.d;
 try{
  const j=await fetchJSON(ATMO.base+'/species');
  speciesMeta={t:Date.now(),d:j.data||{}};lsSet('speciesMeta',speciesMeta);return speciesMeta.d;
 }catch(e){return{}}
}
let pollenOutlook=null;
const BAR_BASE=[12,38,62,85],BAR_SPAN=[24,24,23,15];
function speciesBar(s,lims){
 const risk=String(s.risk_level||'low').toLowerCase(),lvl=RISK[risk]??0,v=+s.value||0;
 const lowEdge=lvl>0?(lims[lvl-1]||0):0,highEdge=lims[lvl]||lims[lims.length-1]||1;
 const frac=lvl>=3?Math.min(1,v/highEdge):Math.max(0,Math.min(1,(v-lowEdge)/((highEdge-lowEdge)||1)));
 return{risk,lvl,v,pct:v===0?5:BAR_BASE[lvl]+BAR_SPAN[lvl]*frac};
}
async function pollenAtmospore(){
 if(atmoDead)return null;
 try{
  const dt=data.current.time.slice(0,10);
  const[j,meta]=await Promise.all([
   fetchJSON(`${ATMO.base}/pollen?lat=${place.lat}&lon=${place.lon}&dt=${dt}&forecast_days=5`),
   getSpeciesMeta()
  ]);
  console.info('[Atmospore]',j);
  const days=j.data||[],day=days[0];
  if(!day||!day.species)return null;
  const limsOf=id=>(meta[id]&&meta[id].risk_thresholds)||[];
  const nameOf=(id,s)=>s.display_name||(meta[id]&&meta[id].display_name)||id;

  let rows=Object.entries(day.species).map(([id,s])=>{
   const b=speciesBar(s,limsOf(id));
   return{n:nameOf(id,s),v:b.v,lvl:b.lvl,pct:b.pct,label:b.v===0?'None':b.risk[0].toUpperCase()+b.risk.slice(1)};
  }).sort((a,b)=>b.lvl-a.lvl||b.v-a.v);
  if(rows.some(r=>r.v>0))rows=rows.filter(r=>r.v>0);

  pollenOutlook=days.slice(0,5).map((d,i)=>{
   const list=Object.entries(d.species||{}).map(([id,s])=>({id,s,b:speciesBar(s,limsOf(id))})).sort((a,b)=>b.b.lvl-a.b.lvl||b.b.v-a.b.v);
   const top=list[0],ov=RISK[String(d.overall_risk||'low').toLowerCase()]??0;
   const lvl=Math.max(ov,top?top.b.lvl:0),none=!top||top.b.v===0;
   return{
    day:i?new Date(d.date+'T12:00').toLocaleDateString('en',{weekday:'short'}):'Today',
    lvl,pct:none?8:Math.max(top.b.pct,BAR_BASE[lvl]),
    label:none?'None':['Low','Moderate','High','Very high'][lvl]
   };
  });

  sig.pollen={risk:String(day.overall_risk||'low').toLowerCase(),top:rows[0]&&rows[0].n};
  return rows;
 }catch(e){
  console.warn('[Atmospore] failed:',e.message);
  atmoDead=true;
  return null;
 }
}
async function pollenOpenMeteo(){
 const keys=[['alder_pollen','Alder'],['birch_pollen','Birch'],['grass_pollen','Grass'],['mugwort_pollen','Mugwort'],['olive_pollen','Olive'],['ragweed_pollen','Ragweed']];
 const r=await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=${keys.map(k=>k[0]).join(',')}&timezone=auto`);
 const cur=(await r.json()).current||{};
 return keys.map(([k,n])=>{const v=cur[k];if(v==null)return null;const l=pLevel(v);return{n,label:v===0?'None':LVL[l],lvl:l,pct:Math.max(5,Math.min(100,v/1.2))}}).filter(Boolean).sort((a,b)=>b.lvl-a.lvl||b.pct-a.pct);
}
function pollenInsight(){
 const c=data.current,h=data.hourly,i0=idx0();
 const rain=Math.max(...h.precipitation_probability.slice(i0,i0+8)),v=c.wind_speed_10m,rh=c.relative_humidity_2m;
 if(rain>=60)return['drop','Rain is likely soon. It often rinses pollen out of the air, so levels can drop afterwards.'];
 if(v>=20&&rh<60)return['wind','Dry and windy: pollen travels far today, and levels can peak around midday.'];
 if(rh>=80)return['drop','Humid air makes pollen grains heavier, so they tend to settle closer to the ground.'];
 return['sun','Calm, dry weather: pollen usually peaks from late morning to the afternoon. Mornings are gentler.'];
}
function pollenHTML(rows,source,note){
 const w=rows[0],nm=w.n.toLowerCase();
 const adv=w.lvl>=2?`${nm[0].toUpperCase()+nm.slice(1)} pollen is running high. Keep windows closed, consider an antihistamine before symptoms start, and shower after time outdoors.`:w.lvl==1?`Pollen is moderate, led by ${nm}. Sensitive people may notice mild symptoms.`:'Pollen is low across the board. A good day for allergy sufferers to be outside.';
 const colors=['#4fd18b','#f0cf45','#f59a3a','#e5652e'];
 const grains=Array.from({length:6+w.lvl*6},()=>`<i style="--x:${Math.round(Math.random()*96)}%;--s:${(3+Math.random()*5).toFixed(1)}px;--d:${(7+Math.random()*7).toFixed(1)}s;--dl:-${(Math.random()*12).toFixed(1)}s;--pc:${colors[w.lvl]}"></i>`).join('');
 const[ii,it]=pollenInsight();
 const out=pollenOutlook&&pollenOutlook.length?`<div class="pout"><h4>Next ${pollenOutlook.length} days</h4><div class="pdays">${pollenOutlook.map((d,i)=>`<div class="pd" style="--n:${i}"><div class="pcol"><i class="lv${d.lvl}" style="--h:${d.pct}%"></i></div><b>${d.day}</b><small>${d.label}</small></div>`).join('')}</div></div>`:'';
 return`<div class="pdrift" aria-hidden="true">${grains}</div><h3>Pollen & allergies</h3><p class="note" style="margin:0 0 6px;font-size:15px">${adv}</p><div class="pl">${rows.slice(0,6).map((r,i)=>`<div class="pr"><span>${escH(r.n)}</span><div class="pb"><i class="lv${r.lvl}" style="--w:${r.pct}%;--n:${i}"></i></div><b>${escH(r.label)}</b></div>`).join('')}</div><div class="pins">${ic(ii)}<span>${it}</span></div>${out}<span class="src" style="align-self:flex-start;margin-top:14px">${source}</span>${note?`<p class="note" style="font-size:12px">${note}</p>`:''}`;
}
async function loadPollen(){
  pollenOutlook=null;
 try{
  const a=await pollenAtmospore();
  if(a&&a.length)return pollenHTML(a,'Atmospore');
  const o=await pollenOpenMeteo();
  if(o.length)return pollenHTML(o,'Open-Meteo fallback · Europe only','Atmospore didn’t return usable data for this request. Check the browser console for details.');
  return`<h3>Pollen & allergies</h3><p class="note">No pollen data is available for this location.</p>`;
 }catch(e){return`<h3>Pollen & allergies</h3><p class="note">Pollen data couldn’t be loaded right now.</p>`}
}

/* --- Science --- */
const dayN=()=>{const d=new Date();return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5)};   // nº do dia (hora local)
const dailyFact=()=>DAILY[((dayN()%DAILY.length)+DAILY.length)%DAILY.length];
function dailyHTML(isNew){
 const f=dailyFact(),dt=new Date().toLocaleDateString(LOC(),{day:'numeric',month:'long'});
 const title=LANG==='pt'&&f[3]?f[3][0]:f[1];
 const text=LANG==='pt'&&f[3]?f[3][1]:f[2];
 const cat=tr(f[0]);
 return`<div class="dayf${isNew?' new':''}" id="dayf" data-d="${dayN()}"><div class="dtag"><span>${tr('Fact of the day')} · ${cat}</span><em>${dt}</em></div><h3>${title}</h3><p>${text}</p></div>`;
}
let dayT=0;
function dayRefresh(){                       // troca o facto quando o dia muda
 const el=$('#dayf');
 if(el&&+el.dataset.d!==dayN())el.outerHTML=dailyHTML(true);
}
function dayArm(){                           // agenda a troca para as 0:00 (hora local)
 clearTimeout(dayT);
 const d=new Date(),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1,0,0,0,50);
 dayT=setTimeout(()=>{dayRefresh();dayArm()},Math.max(1000,next-d));
}
dayArm();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){dayRefresh();dayArm()}});   // separador em segundo plano

function quizCls(){
 if(sciMode!='quiz'||qs.a==null||qs.i>=qs.o.length)return'';
 return QZ[qs.o[qs.i]][1]==qs.a?' qok':' qbad';
}
function qMark(ok){
 const cf=ok?[...Array(14)].map((_,i)=>{const a=i/14*6.283+.2,d=40+(i%3)*10;
  return`<i class="cf" style="--dx:${(Math.cos(a)*d).toFixed(0)}px;--dy:${(Math.sin(a)*d).toFixed(0)}px;--r:${i*47}deg;--c:${['#22c55e','#facc15','#38bdf8','#fb7185'][i%4]}"></i>`}).join(''):'';
 const sym=ok?'<path class="qtick" d="M19 33.5l9 9 17.5-19.5"/>':'<path class="qx1" d="M22 22L42 42"/><path class="qx2" d="M42 22L22 42"/>';
 return`<div class="qm"><svg class="qmark" viewBox="0 0 64 64" aria-hidden="true"><circle class="qdisc" cx="32" cy="32" r="29"/><circle class="qring" cx="32" cy="32" r="29"/>${sym}</svg>${cf}</div>`;
}
function quizEnd(){
 const n=qs.o.length,r=qs.r,t=r==n?0:r>=25?1:r>=18?2:r>=10?3:4;
 const em=['🏆','🌟','👍','🌦️','🌱'][t];
 const vd=['Flawless. You could be on the forecasting desk.','Brilliant. Hardly any myth got past you.','Solid. A few myths slipped through, and now you know.','Not bad. Weather myths are sneaky.','The weather is full of surprises. Give it another go!'][t];
 return`<div class="qend"><div class="qem">${em}</div><div class="qscore"><b data-cu="${r}">0</b><span>/ ${n}</span></div><div class="qbar"><i style="width:${(r/n*100).toFixed(1)}%"></i></div><p class="qverdict">${vd}</p><button class="pill dk" data-qr>Play again</button></div>`;
}
function quizHTML(){
 const n=qs.o.length;
 if(qs.i>=n)return quizEnd();
 const z=QZ[qs.o[qs.i]],done=qs.a!=null,ok=done&&qs.a==z[1],last=qs.i+1>=n;
 const btn=(v,l)=>{let c='pill dk';if(done){if(v==z[1])c+=' qright';else if(v==qs.a)c+=' qwrong'}return`<button class="${c}" data-a="${v}"${done?' disabled':''}>${l}</button>`};
 const res=done?`<div class="qres">${qMark(ok)}<div class="qtxt"><b>${ok?'Correct.':'Not quite.'}</b> ${z[2]}<div><button class="pill dk" data-nq>${last?'See result':'Next question'}</button></div></div></div>`:'';
 return`<div class="qprog"><span>Question ${qs.i+1} of ${n}</span><div class="qbar"><i style="width:${((qs.i+(done?1:0))/n*100).toFixed(1)}%"></i></div></div>`
  +`<p class="qs">${z[0]}</p><div class="qb">${btn(0,'Myth')}${btn(1,'Fact')}</div>`
  +`<div class="qr" aria-live="polite">${res}</div><div class="sc" id="sc">${qs.r} right of ${qs.i+(done?1:0)}</div>`;
}
function sciBody() {
 if (sciMode == 'quiz') return quizHTML();
 const pool = factPool(), f = pool[((factI % pool.length) + pool.length) % pool.length];
 const imgHTML = f[4] ? `<img class="fimg" src="${IMG_DIR}${f[4]}" data-n="${f[4]}" 
alt="${tr(f[1]).replace(/"/g,'&quot;')}" loading="lazy" decoding="async" 
data-fbok data-fb="Gen">` : '';
 return `<span class="tag">${f[3]}</span><h2 class="fh">${f[1]}</h2>${imgHTML}
<p class="fp">${f[2]}</p><div class="fnav"><button class="pill dk" data-f="-1">Previous</button><button class="pill dk" data-f="1">Another</button></div>`;
}
function sciPane(){
 return`<div class="pane g2e"><section class="card${quizCls()}"><div class="sw"><button data-s="fact" aria-pressed="${sciMode=='fact'}">Did you know</button><button data-s="quiz" aria-pressed="${sciMode=='quiz'}">Myth or fact</button></div><div id="sbody">${sciBody()}</div></section>
 <section class="card"><h3>The physics right now</h3><div class="labgrid">${lab()}</div></section></div>`;
}
function drawSci(){
 const b=$('#sbody');if(!b)return;
 const n=b.cloneNode(false);n.innerHTML=sciBody();b.replaceWith(n);
 const c=n.closest('.card');
 if(c){c.classList.remove('qok','qbad','fresh');const k=quizCls();if(k){c.classList.add(k.trim());if(qFresh)c.classList.add('fresh')}}
 if(qFresh){const nb=n.querySelector('[data-nq]');if(nb)nb.focus({preventScroll:true})}
 qFresh=false;
 if(sciMode=='quiz')runCounters(n);
}

/* ============ count-up ============ */
function countUp(el,to,ms=1100){
 if(!el)return;if(still){el.textContent=to;return}
 const t0=performance.now(),f=t=>{const k=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-k,4);el.textContent=Math.round(to*e);if(k<1)requestAnimationFrame(f)};
 requestAnimationFrame(f);
}
const runCounters=(r=document)=>$$('[data-cu]',r).forEach(el=>{countUp(el,+el.dataset.cu);el.removeAttribute('data-cu')});

/* ============ ticker ============ */
let tI=0;

/* ============ Privacidade / Privacy — página própria (#privacy), no estilo do Skylab; abre a partir de qualquer [data-priv] ============ */
const CONTACT_EMAIL='skylab.support@gmail.com';
function privacyHTML(pt){
 const L=(en,p)=>pt?p:en,m=`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
 const ck='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
 const chips=[L('No ads or trackers','Sem anúncios nem rastreadores'),L('Works without an account','Funciona sem conta'),L('Delete your account yourself','Apagas a conta tu mesmo'),L('Hosted on Cloudflare','Alojado na Cloudflare')].map(t=>`<li>${ck}<span>${t}</span></li>`).join('');
 const toc=[['who',L('Who I am','Quem sou')],['free',L('Without an account','Sem conta')],['acc',L('With an account','Com conta')],['push',L('Notifications','Notificações')],['sec',L('Security logs','Registos de segurança')],['third',L('Third parties','Terceiros')],['keep',L('Legal basis & retention','Base legal e conservação')],['rights',L('Your rights','Os teus direitos')]];
 const tocH=toc.map(([k,t])=>`<a href="#pv-${k}">${t}</a>`).join('');
 const sec=(k,i,t,body)=>`<section class="pv-card" id="pv-${k}"><h2><span class="pv-n">${String(i).padStart(2,'0')}</span>${t}</h2>${body}</section>`;
 const prov=[['Open-Meteo',L('forecast','previsão')],['BigDataCloud',L('place names','nomes de locais')],['Atmospore',L('pollen','pólen')],['IPMA',L('Portugal warnings','avisos de Portugal')],['RainViewer',L('radar','radar')],['NASA GIBS',L('satellite','satélite')],['OpenWeather',L('map layers','camadas')],['CARTO · OpenStreetMap',L('maps','mapas')],['Google',L('sign-in, profile photo, email codes (Gmail)','início de sessão, foto de perfil, códigos por email (Gmail)')],['Cloudflare',L('hosting, database, bot check','alojamento, base de dados, anti-bot')],['GitHub Pages',L('site hosting','alojamento do site')],['unpkg · jsDelivr',L('map and globe libraries, map data','bibliotecas do mapa e do globo, dados dos mapas')],['NOAA',L('station observations','observações de estações')]].map(([a,b])=>`<li><b>${a}</b><small>${b}</small></li>`).join('');
 const rows=[[L('Account (username, email, password hash, Google ID and photo URL)','Conta (username, email, hash da palavra-passe, ID e foto Google)'),L('Until you delete your account','Até apagares a conta')],[L('Synced data (favourites, main city, history…)','Dados sincronizados (favoritos, cidade principal, histórico…)'),L('Until you delete your account','Até apagares a conta')],[L('Pending email verification (email, username, password hash, code hash)','Verificação de email pendente (email, username, hash da palavra-passe, hash do código)'),L('10 minutes at most','10 minutos no máximo')],[L('Login sessions','Sessões de início de sessão'),L('14 days','14 dias')],[L('Push address, keys and approximate location','Endereço e chaves push e localização aproximada'),L('Until you turn them off or delete your account','Até as desativares ou apagares a conta')],[L('Security logs','Registos de segurança'),L('7 days','7 dias')],[L('Without an account','Sem conta'),L('Nothing is stored on my servers','Nada fica nos meus servidores')]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('');
 return `<div class="pv-bar"><button type="button" class="pv-back" data-priv-close aria-label="${L('Back to Skylab','Voltar ao Skylab')}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span>${L('Back','Voltar')}</span></button><div class="pv-logo"><span class="lg"></span>Skylab</div><div class="pv-seg" role="group" aria-label="Language"><button type="button" data-pv-lang="pt" aria-pressed="${pt}">PT</button><button type="button" data-pv-lang="en" aria-pressed="${!pt}">EN</button></div></div>
<div class="pv-main">
<section class="pv-hero"><p class="pv-kicker">${L('Privacy · GDPR','Privacidade · RGPD')}</p><h1>${L('Your data, in plain words.','Os teus dados, sem letras pequenas.')}</h1><p class="pv-lead">${L('Skylab is an independent project. No ads, no trackers, no selling data. Here is exactly what is stored, where, for how long, and how to erase it.','O Skylab é um projeto independente. Sem anúncios, sem rastreadores, sem vender dados. Aqui está exatamente o que é guardado, onde, durante quanto tempo e como apagar.')}</p><ul class="pv-chips">${chips}</ul><p class="pv-s">${L('Last updated: October 2026','Atualizado: outubro de 2026')}</p><nav class="pv-toc" aria-label="${L('Sections','Secções')}">${tocH}</nav></section>
${sec('who',1,L('Who I am','Quem sou'),`<p>${L('Skylab is an independent personal project by Lourenço (Lisbon, Portugal), who is the controller of the data described here. Skylab is meant for people aged 13 or over. Contact: ','O Skylab é um projeto pessoal independente do Lourenço (Lisboa, Portugal), responsável pelos dados aqui descritos. O Skylab destina-se a pessoas com 13 ou mais anos. Contacto: ')}${m}.</p>`)}
${sec('free',2,L('Without an account','Sem conta'),`<p>${L('You can use all the weather features without signing in. Nothing about you is stored on my servers. Your choices (units, language, recent places, favourites, main city, last place viewed, terminal history and theme, developer mode, and a counter of your most visited places used to pick where notifications go) stay in your browser’s local storage. Skylab sets no cookies of its own and uses no advertising or analytics cookies or trackers. Fonts are hosted by Skylab itself. Google sign-in and the Cloudflare Turnstile anti-bot check are only loaded when you open the sign-in window, and may use their own cookies or similar technologies under their own policies.','Podes usar o tempo todo sem iniciar sessão. Nada sobre ti fica guardado nos meus servidores. As tuas escolhas (unidades, idioma, locais recentes, favoritos, cidade principal, último local visto, histórico e tema do terminal, modo programador e um contador dos locais mais visitados, usado para escolher para onde vão as notificações) ficam no armazenamento local do teu browser. O Skylab não define cookies próprios nem usa cookies de publicidade ou de análise, nem rastreadores. As letras são alojadas pelo próprio Skylab. O início de sessão Google e a verificação anti-robô Cloudflare Turnstile só são carregados quando abres a janela de início de sessão, e podem usar os seus próprios cookies ou tecnologias semelhantes, segundo as suas políticas.')}</p><p>${L('Your device location is requested when you press “locate”. If you have already allowed location for this site, Skylab may also use it when you open the page to suggest your city; otherwise it only guesses a city from your time zone, on your device. Coordinates are used to fetch the forecast and are not stored unless you save a place as a favourite, set a main city or enable notifications. What you type in the city search is sent to the Open-Meteo geocoding service.','A localização do teu dispositivo é pedida quando carregas em “localizar”. Se já deste permissão de localização a este site, o Skylab pode também usá-la ao abrir a página para sugerir a tua cidade; caso contrário, apenas deduz uma cidade a partir do teu fuso horário, no teu dispositivo. As coordenadas servem para obter a previsão e não são guardadas, a não ser que guardes um local como favorito, definas uma cidade principal ou ativas notificações. O texto que escreves na pesquisa de cidades é enviado ao serviço de geocodificação do Open-Meteo.')}</p>`)}
${sec('acc',3,L('With an account','Com conta'),`<p>${L('Stored in a Cloudflare D1 database:','Guardado numa base de dados Cloudflare D1:')}</p><ul class="pv-list"><li>${L('your username and email;','o teu username e o teu email;')}</li><li>${L('if you sign up with a password, only a salted PBKDF2 hash of it, never the password itself;','se te registares com palavra-passe, apenas um hash PBKDF2 com sal, nunca a palavra-passe;')}</li><li>${L('if you sign in with Google, your Google identifier and profile picture URL;','se entrares com Google, o teu identificador Google e o URL da foto de perfil;')}</li><li>${L('your synced data: favourite places, main city, recent places, last place viewed, units, language, selected tab, developer-mode setting, and terminal theme and command history (up to 200 commands, so avoid typing personal information there);','os teus dados sincronizados: locais favoritos, cidade principal, locais recentes, último local visto, unidades, idioma, separador escolhido, modo programador, e tema e histórico de comandos do terminal (até 200 comandos, por isso evita escrever informação pessoal aí);')}</li><li>${L('your login sessions: a hash of the session token, valid for 14 days.','as tuas sessões: um hash do token, válido 14 dias.')}</li></ul><p>${L('To create an account (or the first time you sign in with an older account) I email a 6-digit code to the address you entered, sent from skylab.support@gmail.com through Gmail. The account is only created once you enter it. Until then, your email, username and a password hash wait in a pending record that is deleted when you verify or after 10 minutes; the code itself is stored only as a hash.','Para criar uma conta (ou na primeira vez que entras com uma conta antiga) envio um código de 6 dígitos para o email que indicaste, a partir de skylab.support@gmail.com através do Gmail. A conta só é criada depois de o introduzires. Até lá, o teu email, o username e um hash da palavra-passe ficam num registo pendente, apagado quando confirmas ou ao fim de 10 minutos; o próprio código só é guardado em forma de hash.')}</p><p>${L('I only use your email to identify your account, sign you in and send you verification codes: no newsletters, no marketing. While you are signed in, your session token and basic profile (username, email, photo) are also kept in your browser’s local storage.','Uso o teu email apenas para identificar a conta, iniciar sessão e enviar-te códigos de verificação: sem newsletters nem marketing. Enquanto tens sessão iniciada, o token da sessão e o perfil básico (username, email, foto) ficam também no armazenamento local do teu browser.')}</p>`)}
${sec('push',4,L('Notifications','Notificações'),`<p>${L('If you enable notifications I store your browser’s push address and keys, an approximate location (about 100 m) with its name, plus language and unit, so I can send weather alerts. You can turn them off at any time.','Se ativares as notificações guardo o endereço e as chaves push do teu browser, uma localização aproximada (cerca de 100 m) com o nome, o idioma e a unidade, para poder enviar avisos do tempo. Podes desativá-las quando quiseres.')} ${L('To receive them, a service worker is installed in your browser.','Para as receber, é instalado um service worker no teu browser.')}</p>`)}
${sec('sec',5,L('Security logs','Registos de segurança'),`<p>${L('For abuse prevention I keep security logs (an identifier derived from your IP address and the type of incident) for 7 days. In a serious incident the IP may appear in a private alert to the maintainer.','Para prevenir abusos guardo registos de segurança (um identificador derivado do teu IP e o tipo de incidente) durante 7 dias. Num incidente grave o IP pode constar de um alerta privado enviado ao responsável.')}</p>`)}
${sec('third',6,L('Third parties','Terceiros'),`<p>${L('To show you data, your browser or my server contacts these services. They can see your IP address and, where relevant, the coordinates requested.','Para mostrar dados, o teu browser ou o meu servidor contactam estes serviços, que podem ver o teu IP e, quando aplicável, as coordenadas pedidas.')}</p><ul class="pv-tags">${prov}</ul><p>${L('When you choose a password, its hash prefix (5 characters, never the password) is checked against Have I Been Pwned.','Quando escolhes uma palavra-passe, o prefixo do seu hash (5 carateres, nunca a palavra-passe) é verificado no Have I Been Pwned.')}</p><p>${L('Forecast, radar and map layers from some providers pass through my Cloudflare Worker, which caches them. I do not log these ordinary requests (only abuse incidents, see Security logs), but Cloudflare, as host, processes technical logs under its own policy.','A previsão, o radar e as camadas de mapa de alguns fornecedores passam pelo meu Cloudflare Worker, que os guarda em cache. Não registo estes pedidos normais (apenas incidentes de abuso, ver Registos de segurança), mas a Cloudflare, como alojadora, trata registos técnicos segundo a sua própria política.')}</p>`)}
${sec('keep',7,L('Legal basis & retention','Base legal e conservação'),`<p>${L('Account data and notifications are processed to provide the service you ask for (GDPR Art. 6(1)(b)); push notifications and device location rely on your consent (Art. 6(1)(a)), which you can withdraw at any time by turning them off. Security logs rest on my legitimate interest in protecting the service (Art. 6(1)(f)).','Os dados da conta e das notificações são tratados para prestar o serviço que pedes (RGPD, art. 6.º, n.º 1, al. b); as notificações push e a localização do dispositivo assentam no teu consentimento (art. 6.º, n.º 1, al. a), que podes retirar a qualquer momento desativando-as. Os registos de segurança assentam no meu interesse legítimo em proteger o serviço (art. 6.º, n.º 1, al. f).')}</p><div class="pv-rows">${rows}</div><p>${L('Some providers above are based outside the EU (for example Cloudflare and Google, in the US) and rely on safeguards such as the EU–US Data Privacy Framework or standard contractual clauses.','Alguns dos fornecedores acima ficam fora da UE (por exemplo Cloudflare e Google, nos EUA) e recorrem a garantias como o Quadro de Privacidade de Dados UE–EUA ou cláusulas contratuais-tipo.')}</p>`)}
${sec('rights',8,L('Your rights','Os teus direitos'),`<p>${L('You can delete your account and all its data yourself from the account menu (“Delete account”). You can also ask me for access, correction, a copy (portability), restriction or objection.','Podes apagar a tua conta e todos os dados associados no menu da conta («Apagar conta»). Podes também pedir-me acesso, retificação, uma cópia (portabilidade), limitação ou oposição.')}</p><p class="pv-cta"><a class="pv-btn" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p>${L('You may complain to the Portuguese data protection authority, ','Podes apresentar reclamação à autoridade portuguesa de proteção de dados, a ')}<a href="https://www.cnpd.pt/" target="_blank" rel="noopener">CNPD</a>.</p>`)}
<p class="pv-end"><button type="button" class="pv-x" data-priv-close>${L('Back to Skylab','Voltar ao Skylab')}</button></p>
</div>`;
}
let pvPushed=false;
function pvRender(){
 const p=$('#privPage');if(!p)return;
 const y=p.scrollTop;p.innerHTML=privacyHTML(p.dataset.lang==='pt');p.scrollTop=y;
}
function pvShow(){
 let p=$('#privPage');
 if(!p){p=document.createElement('div');p.id='privPage';p.setAttribute('role','dialog');p.setAttribute('aria-modal','true');p.setAttribute('aria-label','Privacy');p.hidden=true;document.body.appendChild(p);
  p.addEventListener('click',e=>{
   if(e.target.closest('[data-priv-close]')){closePrivacy();return}
   const l=e.target.closest('[data-pv-lang]');if(l){p.dataset.lang=l.dataset.pvLang;pvRender();return}
   const a=e.target.closest('a[href^="#pv-"]');if(a){e.preventDefault();const t=p.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}
  })}
 if(!p.hidden)return;
 p.dataset.lang=LANG;pvRender();p.hidden=false;p.scrollTop=0;
 document.documentElement.classList.add('pv-open');
 const b=p.querySelector('.pv-back');if(b)b.focus({preventScroll:true});
}
function pvHide(){
 const p=$('#privPage');if(!p||p.hidden)return;
 p.hidden=true;document.documentElement.classList.remove('pv-open');
}
function openPrivacy(){
 if(location.hash!=='#privacy'){history.pushState(null,'','#privacy');pvPushed=true}
 pvShow();
}
function closePrivacy(){
 if(pvPushed&&location.hash==='#privacy'){pvPushed=false;history.back();return}
 if(location.hash==='#privacy')history.replaceState(null,'',location.pathname+location.search);
 pvHide();
}
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-priv]')){e.preventDefault();openPrivacy()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=$('#privPage');if(p&&!p.hidden){e.preventDefault();closePrivacy()}}});
window.addEventListener('hashchange',()=>{if(location.hash==='#privacy')pvShow();else pvHide()});
if(location.hash==='#privacy')setTimeout(pvShow,0);

/* Condições de várias cidades: primeiro pelo worker (cache + chave + "stale"), depois directo ao Open-Meteo, com uma segunda tentativa */
async function worldFetch(lats,lons,daily){
  try{
    const r=await fetch(`${WORKER}/world?lat=${lats.join(',')}&lon=${lons.join(',')}${daily?'&daily=1':''}`);
    if(r.ok){const j=await r.json();if(j&&!j.error)return j}
  }catch(e){}
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=temperature_2m,weather_code,is_day&timezone=auto`
    +(daily?'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2':'');
  let last;
  for(let i=0;i<2;i++){
    try{const r=await fetch(u);if(r.ok)return await r.json();last=new Error('HTTP '+r.status)}catch(e){last=e}
    await new Promise(res=>setTimeout(res,700));
  }
  throw last;
}
function startTicker(){
 clearInterval(tickT);const el=$('#tk');if(!el)return;
 const pool=factPool();tI=data?0:Math.floor(Math.random()*pool.length);
 const put=()=>{const f=pool[tI%pool.length];el.dataset.i=tI%pool.length;el.innerHTML=`<span class="spark">✦</span><b>${f[1]}</b><span class="tkb">${f[2].split('. ')[0].replace(/\.$/,'')}.</span>`;tI++};
 put();
 tickT=setInterval(()=>{const e=$('#tk');if(!e)return clearInterval(tickT);e.classList.add('out');setTimeout(()=>{put();e.classList.remove('out')},still?0:380)},8000);
}

/* ============ render ============ */
function render(){
 const c=data.current,k=cat(c.weather_code,c.is_day),key=place.lat+','+place.lon,fresh=key!==lastKey,y=scrollY;
 if(fresh){
   factI=0;
   const wantScope = isPortugal(place.lat, place.lon) ? 'pt' : 'global';
   if(wantScope !== radarScope){
     radarScope = wantScope;
     lsSet('radarScope', radarScope);
     $$('#rscope button').forEach(x=>x.setAttribute('aria-pressed', x.dataset.rs===radarScope));
     if(tab==='radar'){ radarStop(); radarInit(); }
   }
 }
 lastKey=key;
 main.className=fresh?'enter':'';
 main.innerHTML=heroHTML()+`<div class="sheet" id="sheet">${mobileSheetHTML()}<div class="ticker" id="tk" title="Open in Science"></div>${shell()}</div>`;
 theme(c.temperature_2m,k);if(mode!==k)fxSet(k);
 paintFav();timeTravel();startTicker();
 countUp($('#tn'),T(c.temperature_2m));
 setTab(tab);loadExtras();
 checkAlerts();
 document.title=`${T(c.temperature_2m)}° ${place.name} — Skylab`;
  if(fresh){
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    // Preserve scroll position when updating state
    window.scrollTo(0, y);
  }
}


/* ═══════════ LANDING — landing page, city search, globe, sky canvas, sound, events, silent alerts ═══════════ */
/* ============ landing ============ */
const CITIES=[['Tokyo','Japan',35.68,139.69],['New York','United States',40.71,-74.01],['Sydney','Australia',-33.87,151.21],['Reykjavík','Iceland',64.15,-21.94],['Dubai','United Arab Emirates',25.2,55.27],['Rio de Janeiro','Brazil',-22.91,-43.17],['Cape Town','South Africa',-33.92,18.42],['Mumbai','India',19.08,72.88],
// extremos da Terra (5.º elemento = etiqueta EN/PT)
["Oymyakon","Sakha, Russia",63.46,142.79,["Coldest permanent village","A aldeia mais fria"]],
["Verkhoyansk","Sakha, Russia",67.55,133.39,["Biggest yearly swing","Maior amplitude anual"]],
["Vostok Station","Antarctica",-78.46,106.84,["Coldest ever measured","O mais frio alguma vez medido"]],
["Furnace Creek","California, United States",36.46,-116.87,["Hottest air on record","O ar mais quente registado"]],
["Dallol","Afar, Ethiopia",14.24,40.3,["Hottest on average","A mais quente em média"]],
["Mawsynram","Meghalaya, India",25.3,91.58,["Rainiest on average","A mais chuvosa em média"]],
["Arica","Chile",-18.48,-70.31,["Among the driest","Entre as mais secas"]],
["La Rinconada","Peru",-14.63,-69.45,["Highest town","A vila mais alta"]],
["Longyearbyen","Svalbard, Norway",78.22,15.65,["Northernmost town","A cidade mais a norte"]],
["Ushuaia","Argentina",-54.8,-68.3,["Southernmost city","A cidade mais a sul"]],
["Tristan da Cunha","Tristan da Cunha",-37.11,-12.28,["Most remote island","A ilha mais remota"]]];
function landing(){
 clearInterval(tickT);lastKey='';data=null;place=null;ipmaUpdate(null);
 const hr=new Date().getHours(),night=hr<6||hr>=20,k=night?'night':'clear';
 landTheme(night,k);if(mode!==k)fxSet(k);
 document.title=tr('Skylab — Weather & Science');
 main.className='enter lnd';
 main.innerHTML=`<section class="hero land" id="hero">
<div class="now">
 <h1>The sky, explained.</h1>
 <p class="lp">Live weather for anywhere on Earth, with the science behind what you’re looking at.</p>
<div class="cta">
 <button class="pill big solid" id="lc">Use my location</button>
 <button class="pill big" id="ls">Surprise me</button>
</div>
<div class="m-tiles" id="mTiles">
 <button class="m-tile main" id="mtLoc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg><span>${LANG==='pt'?'Localizar':'Locate me'}</span></button>
 <button class="m-tile" id="mtSur"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg><span>${LANG==='pt'?'Surpresa':'Surprise me'}</span></button>
</div>
 ${dailyHTML()}
 <div class="ticker" id="tk"></div>
</div>
<div class="scene">
 <div class="gwrap" id="gwrap">
  <div class="globe-halo" aria-hidden="true"></div>
  <canvas id="globe" role="img" aria-label="Interactive globe. Drag to rotate."></canvas>
  <button class="gpin" id="gpin" hidden></button>
 </div>
</div>
</section>
<section class="m-cities" id="mCities"><h2 class="m-h2">${T2('Around the world now','Pelo mundo agora')}</h2><div class="m-cl" id="mcl">${[0,1,2,3].map(()=>'<div class="m-cc sk"></div>').join('')}</div></section>
<section class="marq" id="marq"><div class="track">${CITIES.map(c=>`<div class="cityc sk">${c[0]}</div>`).join('')}</div></section>`;
 $('#lc').onclick=locate;$('#ls').onclick=surprise;startTicker();
 {const a=$('#mtLoc'),b=$('#mtSur');if(a)a.onclick=locate;if(b)b.onclick=surprise}
 globeStart();
 if(IS_MOBILE){mobileCities();return}
 worldFetch(CITIES.map(c=>c[2]),CITIES.map(c=>c[3]),false).then(j=>{
 const el=$('#marq');if(!el)return;
 const items=j.map((x,i)=>`<button class="cityc" data-ci="${i}">
${emoji(x.current.weather_code,x.current.is_day)}<b>${T(x.current.temperature_2m)}°</b><span>${CITIES[i][0]}</span><small>${LABEL[x.current.weather_code]||''}</small></button>`).join('');
 el.innerHTML=`<div class="track">${items}${items}</div>`;
 el.onclick=e=>{const b=e.target.closest('[data-ci]');if(b){const c=CITIES[+b.dataset.ci];show(c[2],c[3],c[0],c[1])}};
 }).catch(()=>{const el=$('#marq');if(el)el.innerHTML='<p style="text-align:center">World conditions are unavailable right now. Search for a city above.</p>'});
}
const EXTREMES=[['Oymyakon','Sakha, Russia',63.46,142.79],['Cherrapunji','Meghalaya, India',25.27,91.72],['Ushuaia','Tierra del Fuego, Argentina',-54.8,-68.3],['Singapore','Singapore',1.35,103.82],['Reykjavík','Iceland',64.15,-21.94],['Dubai','United Arab Emirates',25.2,55.27],['Quito','Ecuador',-.18,-78.47],['Cairo','Egypt',30.04,31.24],['Vancouver','Canada',49.28,-123.12],['Nairobi','Kenya',-1.29,36.82]];
function surprise(){const p=EXTREMES[Math.floor(Math.random()*EXTREMES.length)];show(p[2],p[3],p[0],p[1])}

/* ============ fuzzy city search (fallback results page) ============ */
{const q=$('#q'),c=$('#qClear');
 if(q&&c){const sync=()=>{c.hidden=!q.value};
  q.addEventListener('input',sync);q.addEventListener('change',sync);
  c.addEventListener('click',()=>{q.value='';sync();q.dispatchEvent(new Event('input',{bubbles:true}));q.focus()});sync()}}

function levenshtein(a,b){
  a=a.toLowerCase();b=b.toLowerCase();
  const m=a.length,n=b.length;
  if(!m)return n; if(!n)return m;
  const d=Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=0;i<=m;i++)d[i][0]=i;
  for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  }
  return d[m][n];
}
function strSim(a,b){
  a=String(a||'').trim().toLowerCase();b=String(b||'').trim().toLowerCase();
  if(!a||!b)return 0;
  if(a===b)return 1;
  if(b.startsWith(a)||a.startsWith(b))return .92;
  if(b.includes(a))return .8;
  const dist=levenshtein(a,b),maxLen=Math.max(a.length,b.length);
  return Math.max(0,1-dist/maxLen);
}
const SEARCH_POOL=[
  ...CITIES.map(c=>({name:c[0],sub:c[1],lat:c[2],lon:c[3]})),
  ...EXTREMES.map(e=>({name:e[0],sub:e[1],lat:e[2],lon:e[3]}))
];
function citySimilarityList(query,extra=[],n=10){
  const pool=[...extra.map(c=>({name:c.name,sub:c.sub||'',lat:c.lat,lon:c.lon})),...SEARCH_POOL];
  const seen=new Set(),out=[];
  for(const c of pool){
    const id=c.name.toLowerCase()+'|'+(c.sub||'').toLowerCase();
    if(seen.has(id))continue; seen.add(id);
    out.push({...c,score:strSim(query,c.name)});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,n);
}
async function handleSearchEnter(){
  const v=q.value.trim();
  if(!v)return;
  let candidates = items && items.length ? items : [];
  if(!candidates.length){
    try{ candidates = await geo(v,5) || []; }catch(e){ candidates = []; }
  }
  const best=candidates[0];
  if(best && strSim(v,best.name) >= .45){
    items=candidates; closeSg(); pick(0); return;
  }
  showSearchResultsPage(v, candidates);
}
async function showSearchResultsPage(query, apiCandidates=[]){
  closeSg(); q.blur();
  clearInterval(tickT);
  if(typeof radarStop==='function')try{radarStop()}catch(e){}
  const list = citySimilarityList(query, apiCandidates);
  main.className='enter';
  main.innerHTML = `<section class="pane src-results">
    <button class="pill" id="srcBack" style="margin-bottom:18px">${tr('Back')}</button>
    <h2 class="story" style="margin-bottom:4px">${tr('No exact match for')} “${escH(query)}”</h2>
    <p class="note" style="margin-bottom:18px">${tr('Here are the closest cities we could find.')}</p>
    <div class="src-list" id="srcList">
      ${list.map((c,i)=>`
        <button class="src-row" data-i="${i}" style="--n:${i}">
          <span class="src-main"><b>${escH(c.name)}</b><small>${escH(c.sub||'')}</small></span>
          <span class="src-wx" id="srcWx${i}"><span class="sk" style="display:inline-block;width:46px;height:14px;border-radius:7px;background:rgba(20,49,79,.1)"></span></span>
        </button>`).join('')}
    </div>
  </section>`;
  $('#srcBack').onclick=()=>{ place?render():landing(); };
  $('#srcList').addEventListener('click',e=>{
    const b=e.target.closest('.src-row'); if(!b)return;
    const c=list[+b.dataset.i]; if(!c)return;
    lsSet('recent',[c,...(lsGet('recent')||[]).filter(x=>!(x.name==c.name&&x.sub==c.sub))].slice(0,5));
    show(c.lat,c.lon,c.name,c.sub);
  });
  list.forEach(async(c,i)=>{
    try{
      const w = await getWeather(c.lat,c.lon);
      const cur = w.current;
      const el = document.getElementById('srcWx'+i);
      if(el) el.innerHTML = `${emoji(cur.weather_code, cur.is_day)}<b>${T(cur.temperature_2m)}°</b>`;
    }catch(e){}
  });
}

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
 if(data&&'123456'.includes(e.key)&&e.key)setTab(TABS[+e.key-1][0]);
});
addEventListener('load',moveInd);
setInterval(()=>{if(place&&!document.hidden&&navigator.onLine&&tab!='radar')show(place.lat,place.lon,place.name,place.sub)},6e5);   // não reconstrói o radar a meio
addEventListener('online',()=>{if(place)show(place.lat,place.lon,place.name,place.sub)});

/* ============ silent severe-weather alerts (no UI) ============ */
const ALERTS=[
 ['storm',d=>d.current.weather_code>=95,()=>['Thunderstorm',`Thunderstorm activity at ${place.name}. Stay away from open ground and tall objects.`]],
 ['heavyrain',d=>[65,82].includes(d.current.weather_code),()=>['Heavy rain',`Heavy rain at ${place.name}. Watch for flooded roads.`]],
 ['snow',d=>[75,86].includes(d.current.weather_code),()=>['Heavy snow',`Heavy snow at ${place.name}. Allow extra travel time.`]],
 ['wind',d=>d.current.wind_speed_10m>=50,d=>['High wind',`Wind near ${W(d.current.wind_speed_10m)} at ${place.name}. Secure loose objects.`]],
 ['heat',d=>d.current.temperature_2m>=35,d=>['Extreme heat',`${T(d.current.temperature_2m)}° at ${place.name}. Drink water and avoid the midday sun.`]],
 ['cold',d=>d.current.temperature_2m<=-10,d=>['Extreme cold',`${T(d.current.temperature_2m)}° at ${place.name}. Limit time outside and cover exposed skin.`]],
 ['uv',d=>d.current.is_day&&d.daily.uv_index_max[0]>=9,d=>['Very high UV',`UV index ${Math.round(d.daily.uv_index_max[0])} today in ${place.name}. Use sunscreen and seek shade.`]],
 ['rainsoon',d=>{
   const h=d.hourly,i=idx0();
   return h.precipitation_probability[i]<40&&h.precipitation_probability.slice(i+1,i+5).some(p=>p>=70);
  },()=>['Rain approaching',`Heavy rain is likely within a few hours in ${place.name}.`]],
 ['aqi',()=>sig.aqi!==null&&sig.aqi>80,()=>['Poor air quality',`Air quality index is ${sig.aqi} in ${place.name}. Limit outdoor exertion.`]],
 ['pollen',()=>sig.pollen&&(sig.pollen.risk=='high'||sig.pollen.risk=='very high'),()=>['High pollen',`${sig.pollen.risk[0].toUpperCase()+sig.pollen.risk.slice(1)} pollen risk in ${place.name}${sig.pollen.top?', led by '+sig.pollen.top.toLowerCase():''}. Keep windows closed if you are allergic.`]]
];
function checkAlerts(){
 if(!data||!place||!('Notification' in window)||Notification.permission!=='granted')return;
 const hc=lsGet('homeCity');                     // só avisa sobre a cidade principal, nunca sobre locais que estás só a ver
 if(!hc||!(Math.abs(hc.lat-place.lat)<.06&&Math.abs(hc.lon-place.lon)<.06))return;
 const day=new Date().toISOString().slice(0,10);
 let log=lsGet('alertLog')||{};if(log._d!==day)log={_d:day};   // one alert per place, type and day
 for(const[id,test,msg]of ALERTS){
  const k=place.name+'|'+id;let hit=false;
  try{hit=!!test(data)}catch(e){}
  if(hit&&!log[k]){
   log[k]=1;
   const[title,body]=msg(data);
   try{
       skyNotify('Skylab · '+tr(title),{body:tr(body),tag:k});
   }catch(e){}
  }
 }
 lsSet('alertLog',log);
}
/* ask for permission once, on the first click or keypress (browsers require a gesture) */

/* Mostra uma notificação local. No Android o construtor new Notification() é proibido — tem de ser via service worker. */
async function skyNotify(title,opts){
  opts=Object.assign({icon:'manifest-icon-192.png',badge:'manifest-icon-192.png'},opts||{});
  try{
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.ready;
      if(reg&&reg.showNotification){await reg.showNotification(title,opts);return true}
    }
  }catch(e){console.warn('[skyNotify:sw]',e)}
  try{const n=new Notification(title,opts);n.onclick=()=>{window.focus();n.close()};return true}catch(e){console.warn('[skyNotify:ctor]',e)}
  return false;
}
function askNotif(){
 if(!('Notification' in window)||Notification.permission!=='default')return;
 try{Promise.resolve(Notification.requestPermission()).then(()=>checkAlerts())}catch(e){}
}
addEventListener('pointerdown',askNotif,{once:true});
addEventListener('keydown',askNotif,{once:true});


/* ═══════════ RADAR — radar tab: wind particles, geo-referencing, temperature, borders, isobars ═══════════ */
/* ============ Radar tab ============ */
const RADAR_KINDS = [
  ['rain', 'Rain'],
  ['wind', 'Wind'],
  ['cloud', 'Clouds'],
  ['temp', 'Temperature'],
  ['sat', 'Satellite']
];
const OWM_KINDS={wind:{
 layer:'wind_new',
 note:'Wind speed (colours) and direction (moving particles) · ECMWF + Open-Meteo',
 lo:()=>unit=='c'?'0 km/h':'0 kt',
 hi:()=>unit=='c'?'120+ km/h':'65+ kt',
 grad:'linear-gradient(90deg,#cfe6f5 0%,#aacbe6 15%,#b364bc 40%,#7a4cac 65%,#46009f 100%)'
}};
let radarMap,radarLayers=[],radarFrames=[],radarIdx=0,radarTimer,radarPlay=!still,radarKind='rain',radarMeta=null,radarMetaT=0,radarTok=0,leafletP;
let radarScope = lsGet('radarScope') || 'pt';
let radarKT=0;
const BLANK='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/* ===== Vento: partículas animadas (substitui as setas) ===== */
let windTok=0,windT=0,windCv=null,windCx=null,windRaf=0,windLast=0,windGrid=null,windFld=null,windP=[];
// Change from {rows:6, cols:8} to:
const WGR = { rows: 8, cols: 12 }, WSTEP = 6, WK = .045, WFADE = .045;const WBK=[[0,12,.38,1],[12,35,.58,1.2],[35,60,.78,1.5],[60,1e9,.92,1.8]];

function windStopLoop(){cancelAnimationFrame(windRaf);windRaf=0}
function windClear(){if(windCx&&windCv)windCx.clearRect(0,0,windCv.width,windCv.height)}
function windPause(){windStopLoop();windClear()}                    // durante o arrasto/zoom o canvas fica limpo
function windMoved(){clearTimeout(windT);windT=setTimeout(updateWindVectors,700)}
function windStop(){
  windTok++;windStopLoop();clearTimeout(windT);
  if(radarMap){try{radarMap.off('movestart zoomstart',windPause);radarMap.off('moveend resize',windMoved)}catch(e){}}
  if(windCv)windCv.remove();
  windCv=windCx=windFld=null;windP=[];
}
function clearWindMarkers(){windStop()}                              // mantém o nome usado por clearRadarLayers()

function windEnsure(){
  const cont=radarMap.getContainer();
  if(!windCv||windCv.parentNode!==cont){
    windCv=document.createElement('canvas');windCv.className='windfx';windCv.setAttribute('aria-hidden','true');
    cont.appendChild(windCv);windCx=windCv.getContext('2d');
    radarMap.on('movestart zoomstart',windPause);radarMap.on('moveend resize',windMoved);
  }
  const dpr=Math.min(2,window.devicePixelRatio||1),W=cont.clientWidth,H=cont.clientHeight;
  if(windCv.width!==Math.round(W*dpr)||windCv.height!==Math.round(H*dpr)){windCv.width=Math.round(W*dpr);windCv.height=Math.round(H*dpr)}
  windCx.setTransform(dpr,0,0,dpr,0,0);
  return{W,H};
}

/* grelha de vento sobre a área visível (+35% de margem), numa só chamada à Open-Meteo */
async function windFetchGrid(b){                                   // vento na mesma grelha (e cache) da temperatura
  const z=tempZ(),st=tempStepOf(z),N=Math.round(360/st),jm=Math.floor(84/st);
  const dl=b.getNorth()-b.getSouth(),dg=b.getEast()-b.getWest();
  const i0=Math.floor((b.getWest()-dg*.35)/st),i1=Math.ceil((b.getEast()+dg*.35)/st);
  const j0=Math.max(-jm,Math.floor((b.getSouth()-dl*.35)/st)),j1=Math.min(jm,Math.ceil((b.getNorth()+dl*.35)/st));
  const wm=windCache[z]||(windCache[z]=new Map()),need=[],seen=new Set(),now=Date.now();
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const ii=((i%N)+N)%N,k=tempKey(j,ii);
    if(seen.has(k))continue;seen.add(k);
    const c=wm.get(k);if(!c||now-c[2]>WIND_TTL)need.push([ii,j,k]);
  }
  if(need.length)await gridLoad(z,need);
  const cols=i1-i0+1,rows=j1-j0+1;
  if(cols<2||rows<2)throw new Error('grid too small');
  const u=new Float32Array(cols*rows),v=new Float32Array(cols*rows);let have=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const e=wm.get(tempKey(j0+r,(((i0+c)%N)+N)%N)),sp=e?e[0]:0,fl=(((e?e[1]:0)+180)%360)*Math.PI/180;
    if(e)have++;
    u[r*cols+c]=sp*Math.sin(fl);v[r*cols+c]=sp*Math.cos(fl);
  }
  if(!have)throw new Error('no wind data');
  return{s:j0*st,n:j1*st,w:i0*st,e:i1*st,rows,cols,u,v,z:radarMap.getZoom(),t:Date.now()};
}
/* interpolação bilinear dos vetores (u,v) – nunca se interpolam ângulos */
function windSample(g, lat, lng, o){
  const span = g.e - g.w;
  let x;
  // If global (full 360), wrap around; otherwise clamp to grid edges smoothly
  if (span >= 355) {
    x = ((lng - g.w) % 360 + 360) % 360;
  } else {
    const clampedLng = Math.max(g.w, Math.min(g.e, lng));
    x = clampedLng - g.w;
  }

  const clampedLat = Math.max(g.s, Math.min(g.n, lat));
  const fx = span > 0 ? (x / span) * (g.cols - 1) : 0;
  const fy = (g.n - g.s) > 0 ? ((clampedLat - g.s) / (g.n - g.s)) * (g.rows - 1) : 0;

  const x0 = Math.min(g.cols - 2, Math.floor(fx));
  const y0 = Math.min(g.rows - 2, Math.floor(fy));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const i = y0 * g.cols + x0, c = g.cols;

  const bl = a => a[i]*(1 - tx)*(1 - ty) + a[i + 1]*tx*(1 - ty) + a[i + c]*(1 - tx)*ty + a[i + c + 1]*tx*ty;
  o[0] = bl(g.u);
  o[1] = bl(g.v);
}

/* campo em pixéis: um vetor por cada 6 px do ecrã, recalculado só quando a vista muda */
function windBuild(W,H){
  const fw=Math.ceil(W/WSTEP)+2,fh=Math.ceil(H/WSTEP)+2,fu=new Float32Array(fw*fh),fv=new Float32Array(fw*fh),o=[0,0];
  for(let j=0;j<fh;j++)for(let i=0;i<fw;i++){
    const ll=radarMap.containerPointToLatLng([i*WSTEP,j*WSTEP]);
    windSample(windGrid,ll.lat,ll.lng,o);fu[j*fw+i]=o[0];fv[j*fw+i]=o[1];
  }
  windFld={fw,fh,fu,fv,W,H};
  const n=Math.max(300,Math.min(3500,Math.round(W*H/380)));
  windP=Array.from({length:n},()=>{const p=windSpawn({});p.a=Math.random()*p.m;return p});
}
function windSpawn(p){
  const f=windFld;p.x=Math.random()*(f?f.W:300);p.y=Math.random()*(f?f.H:200);
  p.ox=p.x;p.oy=p.y;p.a=0;p.m=45+Math.random()*75;p.s=-1;return p;      // s=-1: não desenha o 1.º passo
}
function windAt(x,y,o){
  const f=windFld,gx=x/WSTEP,gy=y/WSTEP,i=Math.min(f.fw-2,gx|0),j=Math.min(f.fh-2,gy|0),tx=gx-i,ty=gy-j,k=j*f.fw+i,c=f.fw;
  const a=(1-tx)*(1-ty),b=tx*(1-ty),d=(1-tx)*ty,e=tx*ty;
  o[0]=f.fu[k]*a+f.fu[k+1]*b+f.fu[k+c]*d+f.fu[k+c+1]*e;
  o[1]=f.fv[k]*a+f.fv[k+1]*b+f.fv[k+c]*d+f.fv[k+c+1]*e;
}
function windStep(dt,fade){
  const cx=windCx,f=windFld,o=[0,0];
  if(fade){cx.globalCompositeOperation='destination-out';cx.fillStyle=`rgba(0,0,0,${WFADE})`;cx.fillRect(0,0,f.W,f.H);cx.globalCompositeOperation='source-over'}
  for(const p of windP){
    windAt(p.x,p.y,o);
    const sp=Math.hypot(o[0],o[1]);
    p.ox=p.x;p.oy=p.y;p.x+=o[0]*WK*dt;p.y-=o[1]*WK*dt;p.a+=dt;p.s=sp;     // no ecrã o Norte é y negativo
    if(p.a>p.m||p.x<0||p.y<0||p.x>f.W||p.y>f.H||sp<.3)windSpawn(p);
  }
  cx.lineCap='round';
  for(const[lo,hi,al,lw] of WBK){
    cx.lineWidth=lw; cx.strokeStyle=`rgba(255,255,255,${al})`;
    cx.beginPath();
    for(const p of windP) if(p.s>=lo&&p.s<hi){cx.moveTo(p.ox,p.oy);cx.lineTo(p.x,p.y)}
    cx.stroke();
  }
}
function windFrame(t){
  if(!windFrame._logged){windFrame._logged=1;console.info('[Wind] first frame', windP.length, 'particles, field', !!windFld);}
  if(!windCx||!windFld||radarKind!=='wind'||!radarMap){windRaf=0;return}
  const dt=Math.min(2.5,(t-(windLast||t))/16.67);windLast=t;
  windStep(dt||1,true);
  windRaf=requestAnimationFrame(windFrame);
}

async function updateWindVectors(){
  const tok=++windTok;
  if(!radarMap||radarKind!=='wind'){windStop();return}
  const b=radarMap.getBounds(),z=radarMap.getZoom(),g=windGrid;
  const ok=g&&g.s<=b.getSouth()&&g.n>=b.getNorth()&&g.w<=b.getWest()&&g.e>=b.getEast()&&z-g.z<1&&Date.now()-g.t<9e5;
  if(!ok){
    try{
      const ng=await windFetchGrid(b);
      if(tok!==windTok||radarKind!=='wind'||!radarMap)return;     // trocou de camada entretanto
      windGrid=ng;
    }catch(err){console.warn('[Wind]',err.message);if(tok!==windTok)return;if(!windGrid){const n=$('#rnote');if(n)n.textContent='Wind particles unavailable right now.';return}}
  }
  const{W,H}=windEnsure();
  windStopLoop();windClear();windBuild(W,H);
  if(still){for(let i=0;i<70;i++)windStep(1,false)}                // movimento reduzido: linhas de corrente estáticas
  else{windLast=0;windRaf=requestAnimationFrame(windFrame)}
}

/* ---- tile cache: every tile is downloaded once per session ---- */
const tileCache=new Map(),tilePending=new Map(),noCors=new Set(),tileQ=[];
const TILE_MAX=900;let tileActive=0;
const tileSlot=()=>new Promise(res=>{const go=()=>{tileActive++;res()};tileActive<4?go():tileQ.push(go)});
const tileDone=()=>{tileActive--;const n=tileQ.shift();if(n)n()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function tileBlob(url){
  if(tileCache.has(url)){const v=tileCache.get(url);tileCache.delete(url);tileCache.set(url,v);return Promise.resolve(v)}
  if(tilePending.has(url))return tilePending.get(url);
  const p=(async()=>{
    const host=new URL(url).origin;
    if(noCors.has(host))return url;                 // server has no CORS: plain <img>, browser cache
    await tileSlot();
    try{
      for(let a=0;a<3;a++){
        let r;
        try{r=await fetch(url)}catch(e){if(a<1){await sleep(1200);continue}noCors.add(host);return url}
        if(r.status==429){await sleep(900*(a+1));continue}
        if(!r.ok)throw new Error('HTTP '+r.status);
        const u=URL.createObjectURL(await r.blob());
        tileCache.set(url,u);
        if(tileCache.size>TILE_MAX){const k=tileCache.keys().next().value;URL.revokeObjectURL(tileCache.get(k));tileCache.delete(k)}
        return u;
      }
      throw new Error('429');
    }finally{tileDone()}
  })();
  tilePending.set(url,p);
  p.then(()=>tilePending.delete(url),()=>tilePending.delete(url));
  return p;
}

let CachedTiles;
const mkLayer=(url,opts)=>{
  CachedTiles=CachedTiles||L.TileLayer.extend({
    createTile(coords,done){
      const img=document.createElement('img');
      img.alt='';img.setAttribute('role','presentation');
      const set=src=>{img.onload=()=>done(null,img);img.onerror=()=>done(null,img);img.src=src};
      tileBlob(this.getTileUrl(coords)).then(set).catch(()=>set(BLANK));
      return img;
    }
  });
  return new CachedTiles(url,{pane:'radar',className:'rlayer',opacity:0,
    updateWhenZooming:false,updateWhenIdle:true,keepBuffer:2,...opts});
};

const WORKER=ATMO.base.replace('/v1','');
const SAT_ID='VIIRS_SNPP_CorrectedReflectance_TrueColor';

function loadLeaflet(){
 if(window.L){installFourCorners();return Promise.resolve()}
 return leafletP||(leafletP=Promise.all([
  new Promise((res,rej)=>{const c=document.createElement('link');c.rel='stylesheet';c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';c.integrity='sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';c.crossOrigin='anonymous';c.onload=res;c.onerror=rej;document.head.appendChild(c)}),
  new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.integrity='sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';s.crossOrigin='anonymous';s.onload=res;s.onerror=rej;document.head.appendChild(s)})
 ]).then(installFourCorners).catch(e=>{leafletP=null;throw e}));
}

/* ===== Geo-referenciação por 4 cantos (instalado após o Leaflet carregar) ===== */
function solveHomography(src, dst){
  const A = [];
  for(let i=0;i<4;i++){
    const [x,y]=src[i], [X,Y]=dst[i];
    A.push([x,y,1,0,0,0,-x*X,-y*X,X]);
    A.push([0,0,0,x,y,1,-x*Y,-y*Y,Y]);
  }
  for(let i=0;i<8;i++){
    let piv=i;
    for(let r=i+1;r<8;r++) if(Math.abs(A[r][i])>Math.abs(A[piv][i])) piv=r;
    [A[i],A[piv]]=[A[piv],A[i]];
    const d=A[i][i]||1e-12;
    for(let c=i;c<9;c++) A[i][c]/=d;
    for(let r=0;r<8;r++){
      if(r===i) continue;
      const f=A[r][i];
      for(let c=i;c<9;c++) A[r][c]-=f*A[i][c];
    }
  }
  const h=A.map(r=>r[8]); h.push(1);
  return h;
}

function installFourCorners(){
  if(!window.L||L.ImageOverlay.FourCorners) return;
  L.ImageOverlay.FourCorners = L.Layer.extend({
    initialize(url, corners, options){
      this._url=url; this._corners=corners;
      L.setOptions(this, options);
    },
    onAdd(map){
      this._map=map;
      const img=this._image=document.createElement('img');
      img.src=this._url; img.alt='';
      img.className='leaflet-image-layer '+(this.options.className||'');
      Object.assign(img.style,{position:'absolute',transformOrigin:'0 0',pointerEvents:'none',opacity:this.options.opacity??0});
      (this.options.pane?map.getPane(this.options.pane):map.getPanes().overlayPane).appendChild(img);
      this._onMove=()=>this._reset();
      map.on('move zoom moveend zoomend resize', this._onMove);
      img.onload=()=>{ this._reset(); this.fire('load'); };
      img.onerror=()=>this.fire('error');
      this._reset();
      return this;
    },
    onRemove(map){
      map.off('move zoom moveend zoomend resize', this._onMove);
      if(this._image&&this._image.parentNode) this._image.parentNode.removeChild(this._image);
    },
    setOpacity(op){ this.options.opacity=op; if(this._image) this._image.style.opacity=op; return this; },
    _reset(){
      if(!this._map||!this._image) return;
      const map=this._map,c=this._corners,p=ll=>map.latLngToLayerPoint(ll);
      const nw=p(c.nw),ne=p(c.ne),sw=p(c.sw),se=p(c.se);
      const w=this._image.naturalWidth||1,h=this._image.naturalHeight||1;
      const m=solveHomography([[0,0],[w,0],[0,h],[w,h]],[[nw.x,nw.y],[ne.x,ne.y],[sw.x,sw.y],[se.x,se.y]]);
      this._image.style.width=w+'px'; this._image.style.height=h+'px';
      this._image.style.transform=`matrix3d(${m[0]},${m[3]},0,${m[6]}, ${m[1]},${m[4]},0,${m[7]}, 0,0,1,0, ${m[2]},${m[5]},0,1)`;
    }
  });
  L.imageOverlay.fourCorners=(url,corners,opts)=>new L.ImageOverlay.FourCorners(url,corners,opts);
}

function radarPane(){
 return`<div class="pane"><section class="card radar">
 <div class="rtop">
  <div class="sw" id="rsw">${RADAR_KINDS.map(([k,n])=>`<button data-rk="${k}" aria-pressed="${k==radarKind}">${n}</button>`).join('')}</div>
  <div class="sw rscope" id="rscope" role="group" aria-label="${tr('Scope')}">
    <button data-rs="pt" aria-pressed="${radarScope==='pt'}">${tr('Portugal')}</button>
    <button data-rs="global" aria-pressed="${radarScope==='global'}">${tr('World')}</button>
  </div>
  <span class="rnow" id="rnote"></span>
 </div>
 <div id="rmap" role="application" aria-label="Weather radar map">Loading map…</div>
 <div class="rctl"><button class="pill dk" id="rplay" aria-label="Pause">❚❚</button><input type="range" id="rsl" min="0" max="0" value="0" aria-label="Radar time"><span class="rtime" id="rtime"></span></div>
 <div class="rleg" id="rleg"><span>Light</span><i></i><span>Heavy</span></div>
 <div class="rleg rleg2" id="rleg2" hidden><span>Rain rate</span><span id="rlmin">— mm/h</span><i id="rlbar"></i><span id="rlmax">— mm/h</span><span id="rlsrc" style="margin-left:8px;font-size:10px;opacity:.7"></span></div>
  <div class="rleg rleg3" id="rleg3" hidden><span class="tunit" id="tunit">°C</span><div class="tscale"><div class="tbar" id="tbar"></div><div class="tticks" id="tticks"></div></div><a class="tsrc" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a></div>
 </section></div>`;
}
function clearRadarLayers(){
  tempStop();
  isoStop();
  if(!radarMap)return;
  windTok++;   // cancela pedidos de vento a meio
  clearWindMarkers();
  radarMap.eachLayer(l=>{
    if(l.options && (l.options.pane === 'radar' || (l.options.className && l.options.className.includes('rlayer')))){
      try { radarMap.removeLayer(l); } catch(e){}
    }
  });
}

function radarStop(){
 radarTok++;clearTimeout(radarTimer);
 clearRadarLayers();
 if(radarMap){try{radarMap.remove()}catch(e){}radarMap=null}
 radarLayers=[];radarFrames=[];
}


function radarBtn(){const b=$('#rplay');if(b){b.textContent=radarPlay?'❚❚':'▶';b.setAttribute('aria-label',radarPlay?'Pause':'Play')}}
function radarShow(i){
  if(!radarMap||!radarLayers.length||!$('#rtime'))return;
  radarIdx=i;
   const cur=radarLayers[i],op=(radarKind=='sat'||radarKind=='cloud'||OWM_KINDS[radarKind])?.95:.8;
  if(!radarMap.hasLayer(cur))cur.addTo(radarMap);
  cur.setOpacity(op);
  /* as outras frames ficam no mapa (tiles já carregados), só ficam invisíveis */
  const hide=()=>{if(radarIdx!==i||!radarMap)return;radarLayers.forEach((l,j)=>{if(j!==i)l.setOpacity(0)})};
  if(cur._loading)cur.once('load',hide);else hide();

  const f=radarFrames[i];$('#rsl').value=i;
  if(f.time){
    const d=new Date(f.time*1000);
    if(f.day){
      $('#rtime').innerHTML=`${d.toLocaleDateString('en',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})} · <em>daily</em>`;
    }else{
      const m=Math.round((d-Date.now())/6e4),t=d.toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'});
      $('#rtime').innerHTML=`${t} · ${f.fc?`<em>forecast</em> +${Math.max(m,0)} min`:m>-3?'now':m<-90?`${(-m/60).toFixed(1)} h ago`:`${-m} min ago`}`;
    }
  }
}
function radarBuffering(b){const t=$('#rtime');if(t)t.classList.toggle('buf',b)}

function radarTick(){
  clearTimeout(radarTimer);radarBuffering(false);
  if(!radarPlay||radarFrames.length<2)return;
  const n=radarFrames.length,layers=radarLayers,step=radarKind=='sat'?900:650;
  const advance=t0=>{
    if(layers!==radarLayers||!radarPlay)return;
    const nx=(radarIdx+1)%n,l=layers[nx];
    if(l&&l._loading&&performance.now()-t0<5000){      // frame seguinte ainda a carregar: espera (máx. 5 s)
      radarBuffering(true);
      radarTimer=setTimeout(()=>advance(t0),150);
      return;
    }
    radarShow(nx);radarTick();
  };
  radarTimer=setTimeout(()=>advance(performance.now()),radarIdx==n-1?1800:step);
}

/* pré-carrega todas as frames: ficam no mapa com opacidade 0 */
function radarWarm(){
  const layers=radarLayers,n=layers.length,note=$('#rnote');
  if(!radarMap||n<2||!note)return;
  const base=note.textContent;
  const upd=()=>{
    if(layers!==radarLayers||!note.isConnected)return;
    const rdy=layers.filter(l=>!l._loading).length;
    note.textContent=rdy<n?`Loading frames ${rdy}/${n}…`:base;
  };
  for(let k=0;k<n;k++){
    const l=layers[(radarIdx+k)%n];                     // começa na frame atual
    l.on('load',upd);
    const add=()=>{if(layers!==radarLayers||!radarMap)return;if(!radarMap.hasLayer(l)){l.setOpacity(0);l.addTo(radarMap)}};
    if(k===0)add();else setTimeout(add,k*450);          // uma frame de cada vez, não 6 de uma vez
  }
  upd();
}
async function radarInit(){
 const tok=++radarTok;
 try{await loadLeaflet()}catch(e){const m=$('#rmap');if(m)m.textContent='The map library couldn’t load. Check your connection.';return}
 if(tok!==radarTok||!$('#rmap'))return;
 $('#rmap').textContent='';
  if(radarMap){try{radarMap.remove()}catch(e){}radarMap=null}
 const rmapEl=$('#rmap');if(rmapEl&&rmapEl._leaflet_id)delete rmapEl._leaflet_id;
const isPT = radarScope === 'pt';
const mapOpts = isPT
 ? { center:[place.lat,place.lon], zoom:7, minZoom:6, maxZoom:11, maxBounds:[[36.0,-10.8],[42.8,-5.4]], maxBoundsViscosity:1.0 }
 : { center:[place.lat,place.lon], zoom:6, minZoom:3, maxZoom:9, maxBounds:[[-85,-180],[85,180]], maxBoundsViscosity:1.0 };
 radarMap=L.map('rmap',{scrollWheelZoom:false,...mapOpts});
 radarMap.createPane('radar').style.zIndex=250;
 const lp=radarMap.createPane('labels');lp.style.zIndex=260;lp.style.pointerEvents='none';
 const MAP_KEY='cb1_4644_2_e1ddc0590e0bf3595329dba5';
 L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${MAP_KEY}`,{maxZoom:19}).addTo(radarMap);
 const att = radarScope === 'pt'
   ? '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/">CARTO</a> · rain <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> · wind/clouds <a href="https://openweathermap.org/">OpenWeatherMap</a> · sat <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
   : '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/">CARTO</a> · rain <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> · wind/clouds <a href="https://openweathermap.org/">OpenWeatherMap</a> · sat <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>';
 radarMap.attributionControl.addAttribution(att);
  radarMap.attributionControl.addAttribution('temp <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (CC BY 4.0)');
 L.marker([place.lat,place.lon],{keyboard:false,icon:L.divIcon({className:'rpin',html:'<i></i>',iconSize:[18,18]})}).addTo(radarMap);
 radarMap.on('click focus',()=>radarMap.scrollWheelZoom.enable());
 radarMap.on('mouseout',()=>radarMap.scrollWheelZoom.disable());
 setTimeout(()=>radarMap&&radarMap.invalidateSize(),250);

 $('#rsw').onclick=e=>{const b=e.target.closest('[data-rk]');if(b&&b.dataset.rk!=radarKind)radarLoadKind(b.dataset.rk)};
 $('#rscope').onclick=e=>{
   const b=e.target.closest('[data-rs]');
   if(!b||b.dataset.rs===radarScope)return;
   radarScope=b.dataset.rs;
   lsSet('radarScope',radarScope);
   $$('#rscope button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.rs===radarScope));
   radarStop();
   radarInit();
 };
 $('#rplay').onclick=()=>{radarPlay=!radarPlay;radarBtn();radarTick()};
 $('#rsl').oninput=e=>{radarPlay=false;radarBtn();clearTimeout(radarTimer);radarShow(+e.target.value)};
 radarBtn();
 radarLoadKind(radarKind);
}
/* NASA IMERG: find the newest available times, then build an animation */
const nasaISO=t=>new Date(t).toISOString().slice(0,19)+'Z';
const NASA_URL=t=>`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/${nasaISO(t)}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
const NASA_PROBE=t=>NASA_URL(t).replace('{z}','0').replace('{y}','0').replace('{x}','0');
let nasaCache=null;
function imgOK(url){
 return new Promise(res=>{
  const im=new Image(),to=setTimeout(()=>{im.src='';res(false)},6000);
  im.onload=()=>{clearTimeout(to);res(true)};
  im.onerror=()=>{clearTimeout(to);res(false)};
  im.src=url;
 });
}
/* keep only frames whose image content is really different */
async function nasaDistinct(times){
 const sig=await Promise.all(times.map(async t=>{
  try{
   const r=await fetch(NASA_PROBE(t));
   if(!r.ok)return null;
   const b=new Uint8Array(await r.arrayBuffer());
   let h=2166136261;for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619)}
   return(h>>>0)+':'+b.length;
  }catch(e){return undefined}   // undefined = couldn't check (e.g. CORS)
 }));
 if(sig.every(s=>s===undefined)){console.warn('[NASA IMERG] could not compare frames, keeping all');return times}
 const seen=new Set(),out=[];
 times.forEach((t,i)=>{if(sig[i]&&!seen.has(sig[i])){seen.add(sig[i]);out.push(t)}});
 console.info('[NASA IMERG] distinct frames:',out.length,'of',times.length);
 return out;
}

async function nasaTimes(){
 if(nasaCache&&Date.now()-nasaCache.at<9e5)return nasaCache.times;
 const step=30*60e3;
 try{
  const r=await fetch(ATMO.base.replace('/v1','')+'/imerg-latest');
  if(!r.ok)throw new Error('HTTP '+r.status);
  const latest=Date.parse((await r.json()).latest);
  if(!isFinite(latest))throw new Error('bad date');
  console.info('[NASA IMERG] newest frame:',nasaISO(latest),'=',((Date.now()-latest)/36e5).toFixed(1),'h ago');
  const times=await nasaDistinct(Array.from({length:12},(_,k)=>latest-(11-k)*step));
  nasaCache={at:Date.now(),times};return times;
 }catch(e){console.warn('[NASA IMERG] latest lookup failed:',e.message);return[]}
}
const satCache={};
const satURL=(id,j,t)=>{
  const ts=j.stepMs>=864e5?new Date(t).toISOString().slice(0,10):nasaISO(t);   // daily layers use YYYY-MM-DD
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${id}/default/${ts}/${j.tms}/{z}/{y}/{x}.${j.ext}`;
};
async function satInfo(id){
  const c=satCache[id];
  if(c&&Date.now()-c.at<6e5)return c.v;
  let v;
  try{
    const r=await fetch(WORKER+'/gibs-latest?id='+id);
    if(!r.ok)throw new Error('HTTP '+r.status);
    v=await r.json();
    if(!v.found||!v.end||!v.stepMs||!v.tms)throw new Error('layer not found');
  }catch(e){
    console.warn('[SAT] worker lookup failed, using defaults:',e.message);
    v={found:true,end:new Date().toISOString(),start:new Date(Date.now()-30*864e5).toISOString(),
       stepMs:864e5,tms:'GoogleMapsCompatible_Level9',ext:'jpg'};
  }
  satCache[id]={at:Date.now(),v};return v;
}

let nasaLeg=null;
async function nasaLegend(){
  if(!nasaLeg){
    const urls=['https://gibs.earthdata.nasa.gov/colormaps/v1.3/IMERG_Precipitation_Rate.xml',
                ATMO.base.replace('/v1','')+'/colormap'];
    for(const u of urls){
      try{
        const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);
        const x=new DOMParser().parseFromString(await r.text(),'text/xml'),lg=x.querySelector('Legend');
        let cols=[...x.querySelectorAll('LegendEntry')].map(e=>e.getAttribute('rgb')).filter(Boolean);
        if(cols.length<2)cols=[...x.querySelectorAll('ColorMapEntry')].filter(e=>e.getAttribute('transparent')!='true').map(e=>e.getAttribute('rgb')).filter(Boolean);
        if(cols.length<2)throw new Error('no colours');
        const n=Math.min(24,cols.length);
        cols=Array.from({length:n},(_,i)=>cols[Math.round(i*(cols.length-1)/(n-1))]);
        nasaLeg={cols,min:lg&&lg.getAttribute('minLabel'),max:lg&&lg.getAttribute('maxLabel')};
        break;
      }catch(e){console.warn('[NASA legend] failed:',u,e.message)}
    }
    if(!nasaLeg)nasaLeg={cols:null};
  }
  const bar=$('#rlbar');if(!bar)return;
  if(nasaLeg.cols)bar.style.background=`linear-gradient(90deg,${nasaLeg.cols.map(c=>`rgb(${c})`).join(',')})`;
  const min=+nasaLeg.min||0,max=+nasaLeg.max||0;
  const fmt=v=>v<1?v.toFixed(2):v<10?v.toFixed(1):Math.round(v);
  $('#rlmin').textContent=nasaLeg.min!=null?rateS(min):'light';
  $('#rlmax').textContent=nasaLeg.max!=null?rateS(max):'heavy';
}


async function radarLoadKind(k){
  if(!radarMap)return;
  if(place) radarMap.setView([place.lat, place.lon], radarMap.getZoom(), {animate:false});
  const tok=radarTok,kt=++radarKT;
  const stale=()=>tok!==radarTok||kt!==radarKT||!radarMap;
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');

  clearTimeout(radarTimer);
  clearRadarLayers();
  radarLayers=[];radarFrames=[];
  radarKind=k;
  $$('#rsw button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.rk==k));
  radarPlay=!still;radarBtn();
  note.textContent='';$('#rtime').textContent='';

  const isPT = radarScope==='pt';
  $('#rmap').classList.toggle('cloudy',k==='cloud'||k==='wind');
  $('#rleg').hidden = k!=='wind';
  $('#rleg2').hidden = k!=='rain';
  $('#rleg3').hidden = k!=='temp';
  if(ISO_KINDS.includes(k)) isoStart();

  try{
    if(k==='rain')    return loadRainGlobal(stale);
    if(k==='wind')    return loadWind(stale);
    if(k==='cloud')   return loadCloud(stale,isPT);
    if(k==='temp')    return loadTemp(stale);
    if(k==='sat')     return loadSat(stale);
  }catch(e){
    console.warn('[Radar]',k,e.message);
    if(!stale()&&note)note.textContent='Layer unavailable right now.';
  }
}

/* ---- Rain: IPMA (PT) ---- */
async function loadRainPT(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading IPMA radar…';
  const frames=await ipmaRadarFrames();
  if(stale())return;
  if(!frames||!frames.length){note.textContent='IPMA radar unavailable right now.';return}
  await ipmaResolvePrefix(frames[0].path);
  const sliced=frames.slice(-12);
  const IPMA_CORNERS = {
    nw:[43.705, -12.345], ne:[43.066, -6.279],
    sw:[35.953, -12.986], se:[36.097, -5.948]
  };
  radarLayers=sliced.map(f=>L.imageOverlay.fourCorners(ipmaRadarURL(f.path), IPMA_CORNERS, {opacity:0,pane:'radar',className:'rlayer'}));
  radarFrames=sliced.map(f=>({time:f.time/1000,fc:false}));
  sl.disabled=false;pl.disabled=false;sl.max=radarFrames.length-1;
  note.textContent='IPMA radar · 5 min resolution · Portugal';
  $('#rlmin').textContent=rateS(.1);
  $('#rlmax').textContent='> '+rateS(30);
  $('#rlbar').style.background='linear-gradient(90deg,#c8e6c9,#81c784,#4caf50,#ffeb3b,#ff9800,#f44336,#9c27b0)';
  $('#rlsrc').textContent='IPMA · 5 min';
  radarShow(0);radarWarm();radarBtn();radarTick();
}

/* ---- Rain: RainViewer (global) ---- */
async function loadRainGlobal(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading RainViewer…';
  const rv=await rainViewerLoad();
  if(stale())return;
  if(!rv||!rv.all.length){note.textContent='RainViewer unavailable right now.';return}
  const frames=rv.all.slice(-6);
  radarFrames=frames.map(f=>({time:f.time/1000,fc:!!f.fc}));
    console.info('[RainViewer] host=%s first-path=%s tile=%s',
    rv.host, frames[0].path,
    rainViewerTileURL(rv.host, frames[0].path, 2, '0_0'));
  radarLayers=frames.map(f=>mkLayer(`${WORKER}/rv/${f.path.split('/').pop()}/256/{z}/{x}/{y}/2/0_0.png`,{maxNativeZoom:7,maxZoom:radarScope==='pt'?11:9}));
  sl.disabled=false;pl.disabled=false;sl.max=frames.length-1;
  note.textContent='RainViewer · 10 min · past 2 h'+(radarScope==='pt'?' · Portugal':' · Global');
  $('#rlmin').textContent=rateS(.1);
  $('#rlmax').textContent='> '+rateS(50);
  $('#rlbar').style.background='linear-gradient(90deg,#88ddee,#36bae5,#00a3e0,#007fb4,#005588,#c2b482,#cec087,#ffee00,#ffd200,#ffaa00,#ff8100,#ff4400)';
  $('#rlsrc').textContent='RainViewer · 10 min';
  radarShow(0);radarWarm();radarBtn();radarTick();
}

/* ---- Wind (OpenWeatherMap + ECMWF particles) ---- */
async function loadWind(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  const ow=OWM_KINDS.wind;
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading wind layer…';
  let ok=false;
  try{ok=(await fetch(`${WORKER}/owm/${ow.layer}/0/0/0.png`)).ok}catch(e){}
  if(stale())return;
  const isPT=radarScope==='pt';
  radarLayers=ok?[mkLayer(`${WORKER}/owm/${ow.layer}/{z}/{x}/{y}.png`,
    {maxNativeZoom:6,maxZoom:isPT?11:9,className:'rlayer rcloud'})]:[];
  radarFrames=[{}];sl.max=0;
  note.textContent=ok?ow.note+(isPT?' · Portugal':' · Global'):'Wind particles · ECMWF + Open-Meteo (colour layer needs OWM_KEY in the worker)';
  $('#rtime').textContent='Current';
  $('#rleg').innerHTML=`<span>${ow.lo()}</span><i style="background:${ow.grad}"></i><span>${ow.hi()}</span><span style="margin-left:8px;font-size:10px;opacity:.7">ECMWF/IFS</span>`;
  $('#rleg').hidden=!ok;
  radarShow(0);radarBtn();
  requestAnimationFrame(()=>requestAnimationFrame(updateWindVectors));
}

/* ---- Clouds (OpenWeatherMap) ---- */
async function loadCloud(stale,isPT){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading cloud layer…';
  let ok=false;
  try{ok=(await fetch(WORKER+'/clouds/0/0/0.png')).ok}catch(e){}
  if(stale())return;
  if(!ok){
    note.textContent='Cloud layer needs OWM_KEY, showing satellite instead.';
    isoStop();
    return loadSat(stale);
  }
  radarLayers=[mkLayer(WORKER+'/clouds/{z}/{x}/{y}.png',
    {maxNativeZoom:6,maxZoom:isPT?11:9,className:'rlayer rcloud'})];
  radarFrames=[{}];sl.max=0;
  note.textContent='Clouds · OpenWeatherMap'+(isPT?' · Portugal':' · Global');
  $('#rtime').textContent='Current';
  radarShow(0);radarBtn();
}

/* ---- Satellite (NASA VIIRS, idêntico nos dois âmbitos) ---- */
async function loadSat(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading satellite frames…';
  let j;
  try{j=await satInfo(SAT_ID)}catch(e){
    if(!stale()&&note)note.textContent='Satellite imagery unavailable right now.';
    return;
  }
  if(stale())return;
  const daily=j.stepMs>=864e5;
  let end=Date.parse(j.end);
  const start=Date.parse(j.start),N=daily?7:12;
  if(daily)end-=j.stepMs;
  const times=Array.from({length:N},(_,i)=>end-(N-1-i)*j.stepMs).filter(t=>t>=start);
  const nz=+((j.tms.match(/Level(\d+)/)||[0,9])[1]);
  radarFrames=times.map(t=>({time:t/1000,fc:false,day:daily}));
  radarLayers=times.map(t=>mkLayer(satURL(SAT_ID,j,t),{maxNativeZoom:nz,maxZoom:9}));
  sl.disabled=false;pl.disabled=false;sl.max=times.length-1;
  sl.value=times.length-1;
  note.textContent='NASA VIIRS true colour · '+(daily?'daily composite':'30 min frames');
  radarShow(times.length-1);
  radarPlay=false;radarBtn();radarWarm();
}

/* ============ Temperature radar (Open-Meteo · free, no key) ============ */
/* Reticulado fixo (alinhado com o globo): ~114 px entre nós em qualquer zoom, em cache por nível.
   Só se pedem à Open-Meteo os nós que faltam, por isso arrastar o mapa quase não gasta pedidos. */
const TEMP_MIN=-40,TEMP_MAX=50,TEMP_TTL=9e5;                       // escala em °C · dados válidos 15 min
const TEMP_RAMP=[[-40,'#4b1d91'],[-30,'#3a3fc4'],[-20,'#2f6fe0'],[-10,'#3fa7f0'],[0,'#9fe3f5'],[5,'#74dcc0'],[10,'#7bd37a'],
  [15,'#c5e04a'],[20,'#fbe03a'],[25,'#f9b233'],[30,'#f58220'],[35,'#e8452c'],[40,'#c2192d'],[50,'#5a0a3a']];
const TEMP_LUT=(()=>{                                              // cor a cada 0,25 °C
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),st=TEMP_RAMP.map(([t,h])=>[t,rgb(h)]);
  const n=Math.round((TEMP_MAX-TEMP_MIN)/.25)+1,lut=new Uint8ClampedArray(n*3);
  for(let k=0;k<n;k++){
    const t=TEMP_MIN+k*.25;let a=st[0],b=st[st.length-1];
    for(let s=0;s<st.length-1;s++)if(t>=st[s][0]&&t<=st[s+1][0]){a=st[s];b=st[s+1];break}
    const f=b[0]===a[0]?0:(t-a[0])/(b[0]-a[0]);
    for(let c=0;c<3;c++)lut[k*3+c]=Math.round(a[1][c]+(b[1][c]-a[1][c])*f);
  }
  return lut;
})();
const tempIdx=c=>Math.round((Math.max(TEMP_MIN,Math.min(TEMP_MAX,c))-TEMP_MIN)*4)*3;
const tempRgb=c=>{const k=tempIdx(c);return`rgb(${TEMP_LUT[k]},${TEMP_LUT[k+1]},${TEMP_LUT[k+2]})`};

const tempStepOf=z=>320/Math.pow(2,z);                             // reticulado ~230 px (menos pedidos); divide 360 e 80
const tempKey=(j,i)=>(j+1100)*10000+i;
const tempZ=()=>Math.max(3,Math.min(11,Math.round(radarMap.getZoom())));
let tempCache={},tempOv=null,tempGen=0,tempMoveT=0,tempTimer=0,tempHoverT=0,tempStamp=0,tempBlock=0,tempTip=null,tempHov=null,tempMoving=false;
const tempBusy=new Set(),tempExactC=new Map(),tempNameC=new Map();

function tempNode(L,i,j){
  const m=tempCache[L];if(!m)return NaN;
  const N=Math.round(360/tempStepOf(L)),e=m.get(tempKey(j,((i%N)+N)%N));
  return e?e[0]:NaN;
}
/* interpolação bilinear; se faltar um nó, recorre ao nível mais grosseiro (zoom–1, –2…) */
function tempAt(lat,lng,z){
  lat=Math.max(-80,Math.min(80,lat));lng=((lng+180)%360+360)%360-180;
  for(let L=z;L>=3;L--){
    const s=tempStepOf(L),fx=lng/s,fy=lat/s,i0=Math.floor(fx),j0=Math.min(Math.round(80/s)-1,Math.floor(fy));
    const tx=fx-i0,ty=fy-j0;
    const a=tempNode(L,i0,j0),b=tempNode(L,i0+1,j0),c=tempNode(L,i0,j0+1),d=tempNode(L,i0+1,j0+1);
    if(a===a&&b===b&&c===c&&d===d)return a*(1-tx)*(1-ty)+b*tx*(1-ty)+c*(1-tx)*ty+d*tx*ty;
  }
  return NaN;
}
function tempNeeded(z,s,n,w,e){                                    // nós da caixa que faltam / expiraram
  const st=tempStepOf(z),N=Math.round(360/st),jm=Math.round(80/st),m=tempCache[z]||new Map(),now=Date.now(),out=[],seen=new Set();
  const i0=Math.floor(w/st),i1=Math.ceil(e/st),j0=Math.max(-jm,Math.floor(s/st)),j1=Math.min(jm,Math.ceil(n/st));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const ii=((i%N)+N)%N,k=tempKey(j,ii);
    if(seen.has(k))continue;seen.add(k);
    const c=m.get(k);
    if((!c||now-c[1]>TEMP_TTL)&&!tempBusy.has(z+':'+k))out.push([ii,j,k]);
  }
  return out;
}

async function gridBlock(z,bi,bj){                                 // worker primeiro; se falhar, plano B direto ao Open-Meteo
  const st=tempStepOf(z);
  try{
    const r=await fetch(`${WORKER}/grid?step=${st}&bi=${bi}&bj=${bj}`);
    if(r.ok)return await r.json();
    if(r.status===429)throw new Error('429');
    console.warn('[Grid] worker',r.status,await r.text().catch(()=>''));
  }catch(e){if(e.message==='429')throw e}
  return gridDirect(z,bi,bj);
}
async function gridDirect(z,bi,bj){
  const st=tempStepOf(z),N=Math.round(360/st),lats=[],lons=[],idx=[];
  for(let b=0;b<GRID_B;b++)for(let a=0;a<GRID_B;a++){
    const lat=(bj*GRID_B+b)*st;if(lat>84||lat<-84)continue;
    const x=((((bi*GRID_B+a)%N)+N)%N)*st;
    lats.push(lat.toFixed(4));lons.push((x>=180?x-360:x).toFixed(4));idx.push(b*GRID_B+a);
  }
  const t=Array(GRID_B*GRID_B).fill(null),p=t.slice(),out={t,p,ts:0};
  if(!idx.length)return out;
  const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=temperature_2m,pressure_msl&timeformat=unixtime`);
  if(!r.ok)throw new Error(r.status==429?'429':'HTTP '+r.status);
  const j=await r.json(),arr=Array.isArray(j)?j:[j];
  idx.forEach((k,n)=>{const c=arr[n]&&arr[n].current;if(!c)return;if(c.temperature_2m!=null)t[k]=c.temperature_2m;if(c.pressure_msl!=null)p[k]=c.pressure_msl;if(c.time)out.ts=Math.max(out.ts,c.time*1000)});
  return out;
}
const GRID_B=8;                                                    // blocos 8×8 nós, iguais aos do worker (/grid)
let windCache={};
const WIND_TTL=18e5;
async function gridLoad(z,nodes){                                  // pede blocos ao worker e preenche as caches (temperatura, pressão, vento)
  const st=tempStepOf(z),N=Math.round(360/st),blocks=new Map();
  nodes.forEach(n=>{const bi=Math.floor(n[0]/GRID_B),bj=Math.floor(n[1]/GRID_B);blocks.set(bi+','+bj,[bi,bj])});
  const tm=tempCache[z]||(tempCache[z]=new Map()),pm=isoCache[z]||(isoCache[z]=new Map()),wm=windCache[z]||(windCache[z]=new Map());
  await Promise.all([...blocks.values()].slice(0,16).map(async([bi,bj])=>{
    const g=await gridBlock(z,bi,bj),now=Date.now();
    for(let b=0;b<GRID_B;b++)for(let a=0;a<GRID_B;a++){
      const k=b*GRID_B+a,t=g.t[k],p=g.p[k],s=g.ws&&g.ws[k],d=g.wd&&g.wd[k];
      if(t==null&&p==null&&s==null)continue;
      const key=tempKey(bj*GRID_B+b,(((bi*GRID_B+a)%N)+N)%N);
      if(t!=null)tm.set(key,[+t,now]);
      if(p!=null)pm.set(key,[+p,now]);
      if(s!=null&&d!=null)wm.set(key,[+s,+d,now]);
    }
    if(g.ts)tempStamp=Math.max(tempStamp,g.ts);
  }));
  for(const m of [tm,pm,wm])if(m.size>6000){let k=0;for(const key of m.keys()){m.delete(key);if(++k>1500)break}}
}

async function tempFetch(z,nodes){
  nodes.forEach(n=>tempBusy.add(z+':'+n[2]));
  try{await gridLoad(z,nodes)}
  finally{nodes.forEach(n=>tempBusy.delete(z+':'+n[2]))}
}

/* caixa visível + margem (25 % para a imagem, que assim acompanha o mapa sem cortes ao arrastar) */
function tempBox(f=.15){
  const sz=radarMap.getSize(),px=sz.x*f,py=sz.y*f;
  return{sz,px,py,nw:radarMap.containerPointToLatLng([-px,-py]),se:radarMap.containerPointToLatLng([sz.x+px,sz.y+py])};
}
function tempRender(){
  if(!radarMap||radarKind!=='temp'||!window.L)return;
  const z=tempZ(),{sz,px,py,nw,se}=tempBox(),pw=sz.x+2*px,ph=sz.y+2*py;
  const cw=Math.max(48,Math.min(360,Math.ceil(pw/6))),ch=Math.max(32,Math.ceil(cw*ph/pw));
  const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
  const cx=cv.getContext('2d'),img=cx.createImageData(cw,ch),d=img.data,lons=new Float64Array(cw),lats=new Float64Array(ch);
  for(let x=0;x<cw;x++)lons[x]=radarMap.containerPointToLatLng([-px+(x+.5)/cw*pw,0]).lng;
  for(let y=0;y<ch;y++)lats[y]=radarMap.containerPointToLatLng([0,-py+(y+.5)/ch*ph]).lat;
  let hit=0;
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const t=tempAt(lats[y],lons[x],z);
    if(t!==t)continue;                                             // ainda sem dados: transparente
    const k=tempIdx(t),o=(y*cw+x)*4;
    d[o]=TEMP_LUT[k];d[o+1]=TEMP_LUT[k+1];d[o+2]=TEMP_LUT[k+2];d[o+3]=255;hit++;
  }
  if(!hit)return;
  cx.putImageData(img,0,0);
  const bounds=L.latLngBounds(nw,se),ov=L.imageOverlay(cv.toDataURL('image/png'),bounds,{pane:'radar',className:'rlayer rtemp',opacity:0,interactive:false});
  ov._z=z;ov._b=bounds;ov._at=Date.now();
  ov.addTo(radarMap);
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.setOpacity(.8)));
  const old=tempOv;tempOv=ov;
  if(old)setTimeout(()=>{try{radarMap&&radarMap.removeLayer(old)}catch(e){}},1100);   // o novo faz fade por cima do antigo
}

function tempStatus(){
  const nt=$('#rnote'),tm=$('#rtime');
  if(nt)nt.textContent=tr('Air temperature · Open-Meteo · hover for exact values');
  if(tm)tm.textContent=tr('Current')+' · '+new Date(tempStamp||Date.now()).toLocaleTimeString(LOC(),{hour:'2-digit',minute:'2-digit'});
}
function tempSchedule(){
  clearTimeout(tempTimer);
  tempTimer=setTimeout(()=>{if(radarMap&&radarKind==='temp'){if(document.hidden)tempSchedule();else tempUpdate()}},TEMP_TTL+5e3);
}
async function tempUpdate(){
  if(!radarMap||radarKind!=='temp')return;
  const gen=tempGen,z=tempZ(),box=b=>[Math.max(-85,b.se.lat),Math.min(85,b.nw.lat),b.nw.lng,b.se.lng];
  const need=tempNeeded(z,...box(tempBox())),core=tempNeeded(z,...box(tempBox(.12)));
  if(!core.length&&tempOv&&tempOv._z===z&&tempOv._b.contains(radarMap.getBounds())&&Date.now()-tempOv._at<TEMP_TTL)return tempSchedule();
  tempRender();                                                    // já com o que existe em cache
  if(tempOv&&!need.length)tempStatus();
  if(need.length&&Date.now()>tempBlock){
    try{await tempFetch(z,need)}
    catch(err){
      console.warn('[Temp]',err.message);
      tempBlock=Date.now()+(err.message==='429'?3e5:3e4);
      const nt=$('#rnote');
      if(gen===tempGen&&nt&&!tempOv)nt.textContent=tr(err.message==='429'?'Temperature data rate-limited — try again in a few minutes.':'Temperature unavailable right now.');
      return;
    }
    if(gen!==tempGen||!radarMap||radarKind!=='temp')return;
    tempRender();tempStatus();tempSave();
  }
  tempSchedule();
}

/* ---- escala (muda com °C / °F) ---- */
function tempLegend(){
  const bar=$('#tbar'),tk=$('#tticks'),un=$('#tunit');if(!bar||!tk)return;
  const pos=c=>((c-TEMP_MIN)/(TEMP_MAX-TEMP_MIN)*100).toFixed(2),f=unit==='f';
  bar.style.background=`linear-gradient(90deg,${TEMP_RAMP.map(([t,h])=>`${h} ${pos(t)}%`).join(',')})`;
  const vals=f?[-40,-20,0,20,40,60,80,100,120]:[-40,-30,-20,-10,0,10,20,30,40,50];
  tk.innerHTML=vals.map(v=>`<span style="left:${pos(f?(v-32)*5/9:v)}%">${v<0?'−'+(-v):v}</span>`).join('');
  if(un)un.textContent=deg();
}

/* ---- tooltip ao passar o rato (ou tocar) ---- */
const tempFmt2=v=>LANG==='pt'?v.toFixed(2).replace('.',','):v.toFixed(2);
function tempCoords(ll){
  const lat=ll.lat,lon=((ll.lng+180)%360+360)%360-180;
  return`${tempFmt2(Math.abs(lat))}° ${lat>=0?'N':'S'} · ${tempFmt2(Math.abs(lon))}° ${lon>=0?'E':(LANG==='pt'?'O':'W')}`;
}
function tempTipPaint(c,ll,pending,name){
  if(!tempTip)return;
  if(!(c===c)){tempTip.innerHTML=`<b>—</b><small>${T2('loading…','a carregar…')}</small>`;return}
  tempTip.innerHTML=`<b><i style="background:${tempRgb(c)}"></i>${decT(c)} ${deg()}</b><small>${name?escH(name)+' · ':''}${tempCoords(ll)}${pending?' · …':''}</small>`;
}
function tempTipPlace(pt){
  const el=tempTip,W=radarMap.getContainer().clientWidth,hw=el.offsetWidth/2+8;
  el.style.left=Math.max(hw,Math.min(W-hw,pt.x))+'px';el.style.top=pt.y+'px';
  el.classList.toggle('below',pt.y<92);el.classList.add('on');
}
function tempTipHide(){clearTimeout(tempHoverT);tempHov=null;if(tempTip)tempTip.classList.remove('on')}
function tempHover(e){
  if(!radarMap||radarKind!=='temp'||tempMoving||!tempTip)return;
  const ll=e.latlng,h=tempHov={ll,pt:e.containerPoint,c:tempAt(ll.lat,ll.lng,tempZ()),click:e.type==='click'};
  tempTipPaint(h.c,ll,true,'');tempTipPlace(h.pt);
  clearTimeout(tempHoverT);tempHoverT=setTimeout(()=>tempExact(h),800);   // só se o rato parar
}
async function tempName(lat,lon){
  const k=lat.toFixed(2)+','+lon.toFixed(2);
  if(tempNameC.has(k))return tempNameC.get(k);
  let n='';
  try{
    const j=await(await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=${LANG}`)).json();
    n=[j.city||j.locality||j.principalSubdivision,j.countryName].filter(Boolean).join(', ');
  }catch(e){}
  tempNameC.set(k,n);return n;
}
async function tempExact(h){                                       // nome do sítio sempre; valor exato só ao clicar (poupa pedidos)
  if(h!==tempHov||!radarMap||radarKind!=='temp')return;
  const gen=tempGen,lat=Math.max(-85,Math.min(85,h.ll.lat)),lon=((h.ll.lng+180)%360+360)%360-180,key=lat.toFixed(2)+','+lon.toFixed(2);
  let v=tempExactC.get(key);
  const fresh=v&&v.at&&Date.now()-v.at<TEMP_TTL;
  try{
    const name=await tempName(lat,lon);
    let c=fresh?v.c:h.c,at=fresh?v.at:0;
    if(h.click&&!fresh&&Date.now()>tempBlock){
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m&timeformat=unixtime`);
      if(r.status===429)tempBlock=Date.now()+3e5;
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      if(!j.current||j.current.temperature_2m==null)throw new Error('no data');
      c=+j.current.temperature_2m;at=Date.now();
    }
    v={c,name,at};
    tempExactC.set(key,v);if(tempExactC.size>300)tempExactC.delete(tempExactC.keys().next().value);
  }catch(err){console.warn('[Temp hover]',err.message);if(gen===tempGen&&h===tempHov)tempTipPaint(h.c,h.ll,false,'');return}
  if(gen!==tempGen||h!==tempHov||!tempTip)return;
  tempTipPaint(v.c,h.ll,false,v.name);tempTipPlace(h.pt);
}

const tempMoveStart=()=>{tempMoving=true;tempTipHide()};
function tempMoved(){tempMoving=false;clearTimeout(tempMoveT);tempMoveT=setTimeout(tempUpdate,700)}
function tempMount(){
  const cont=radarMap.getContainer();
  if(!tempTip||tempTip.parentNode!==cont){tempTip=document.createElement('div');tempTip.className='rttip';tempTip.setAttribute('aria-hidden','true');cont.appendChild(tempTip)}
  radarMap.on('movestart zoomstart',tempMoveStart);radarMap.on('moveend',tempMoved);
  radarMap.on('mousemove click',tempHover);radarMap.on('mouseout',tempTipHide);
}
function tempStop(){
  tempGen++;clearTimeout(tempMoveT);clearTimeout(tempTimer);clearTimeout(tempHoverT);
  tempHov=null;tempMoving=false;
  if(radarMap){
    try{radarMap.off('movestart zoomstart',tempMoveStart);radarMap.off('moveend',tempMoved);radarMap.off('mousemove click',tempHover);radarMap.off('mouseout',tempTipHide)}catch(e){}
    if(tempOv){try{radarMap.removeLayer(tempOv)}catch(e){}}
    if(tempBd){try{radarMap.removeLayer(tempBd)}catch(e){}}
    if(tempLab){try{radarMap.removeLayer(tempLab)}catch(e){}}
  }
  tempBd=null;tempLab=null;
  if(false){
  }
  tempOv=null;
  if(tempTip){tempTip.remove();tempTip=null}
}

/* ---- Temperature (Open-Meteo) ---- */
async function loadTemp(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;sl.max=0;radarFrames=[{}];radarPlay=false;radarBtn();
  note.textContent=tr('Loading temperature…');
  $('#rtime').textContent=tr('Current');
  tempLegend();
  if(stale())return;
  tempMount();
  tempBordersOn();
  await tempUpdate();
}

/* cache da temperatura sobrevive a recarregamentos (15 min) */
const TEMP_LS='skylabTempCache1';
function tempSave(){try{const o={};for(const z in tempCache){const a=[];for(const[k,e]of tempCache[z])if(Date.now()-e[1]<TEMP_TTL)a.push([k,e[0],e[1]]);if(a.length)o[z]=a.slice(-1200)}localStorage.setItem(TEMP_LS,JSON.stringify(o))}catch(e){}}
function tempLoad(){try{const o=JSON.parse(localStorage.getItem(TEMP_LS)||'{}');for(const z in o)tempCache[z]=new Map(o[z].filter(a=>Date.now()-a[2]<TEMP_TTL).map(a=>[a[0],[a[1],a[2]]]))}catch(e){}}
tempLoad();

/* ============ Fronteiras + nomes dos países (radar de temperatura) ============ */
const mkPane=(n,z)=>{const p=radarMap.getPane(n)||radarMap.createPane(n);p.style.zIndex=z;p.style.pointerEvents='none';return p};
const BORDERS_URL='https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';   // Natural Earth 50m (TopoJSON)
const BORDERS_KEY='cb1_4644_2_e1ddc0590e0bf3595329dba5';                                  // a mesma MAP_KEY do radarInit
let bordersP=null,tempBd=null,tempLab=null;
function bordersLoad(){                                                                   // descodifica os arcos → [[lat,lng],…] sem artefactos de recorte
  return bordersP||(bordersP=fetch(BORDERS_URL).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(t=>{
    const[sx,sy]=t.transform.scale,[tx,ty]=t.transform.translate;
    const lines=[];
    const isArtifact=pts=>{
      let minLng=1e9,maxLng=-1e9,minLat=1e9,maxLat=-1e9;
      for(const p of pts){
        if(p[1]<minLng)minLng=p[1];if(p[1]>maxLng)maxLng=p[1];
        if(p[0]<minLat)minLat=p[0];if(p[0]>maxLat)maxLat=p[0];
      }
      return (maxLng - minLng > 60 && maxLat - minLat < 0.6);
    };
    for(const a of t.arcs){
      let x=0,y=0,seg=[];
      for(const p of a){
        x+=p[0];y+=p[1];
        const lat=y*sy+ty,lng=x*sx+tx;
        if(seg.length){
          const prev=seg[seg.length-1];
          // Evita unir pontos através do antimeridiano (salto > 180° cria linha horizontal pelo mapa todo)
          if(Math.abs(lng-prev[1])>180){
            if(seg.length>=2&&!isArtifact(seg))lines.push(seg);
            seg=[[lat,lng]];
            continue;
          }
        }
        seg.push([lat,lng]);
      }
      if(seg.length>=2&&!isArtifact(seg))lines.push(seg);
    }
    return lines;
  }).catch(e=>{bordersP=null;throw e}));
}
async function tempBordersOn(){
  if(!radarMap||tempBd||tempLab)return;
  const map=radarMap,gen=tempGen;
  mkPane('rborders',254);
  tempLab=L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png?key=${BORDERS_KEY}`,{pane:'labels',maxZoom:19,opacity:.95}).addTo(map);
  try{
    const lines=await bordersLoad();
    if(gen!==tempGen||radarMap!==map)return;                         // mudou de radar entretanto
    const r=L.canvas({pane:'rborders',padding:.3}),o={renderer:r,pane:'rborders',interactive:false,smoothFactor:1.2,lineJoin:'round',lineCap:'round'};
    tempBd=L.layerGroup([
      L.polyline(lines,{...o,color:'#ffffff',weight:3.4,opacity:.7}),   // contorno branco (lê-se sobre qualquer cor)
      L.polyline(lines,{...o,color:'#14314f',weight:1.2,opacity:.9})
    ]).addTo(map);
  }catch(e){console.warn('[Borders]',e.message)}
}

/* ============ Linhas de pressão (isóbaras) + A/B · Open-Meteo pressure_msl ============ */
const ISO_KINDS=['rain','cloud','temp'];                           // radares com isóbaras (sem vento nem satélite)
const ISO_TTL=18e5;                                                // dados válidos 30 min
const isoStepOf=z=>tempStepOf(z);                                  // mesmo reticulado da temperatura → um único pedido serve os dois               // independente da temperatura
let isoCache={},isoGrp=null,isoOld=new Set(),isoGen=0,isoT=0,isoBlock=0,isoRun=false,isoAgain=false,isoOn=false;

const isoZ=()=>Math.max(5,tempZ());                                // isóbaras: nunca com passo > 10° (a 40°/20° só há 5–9 filas de latitude e as linhas ficam em faixas horizontais)
const isoNode=(z,i,j)=>{const m=isoCache[z],e=m&&m.get(tempKey(j,i)),v=e?e[0]:NaN;return v>850&&v<1090?v:NaN};   // valores absurdos contam como "sem dados"
function isoGridBox(){
  const b=radarMap.getBounds(),z=isoZ(),st=isoStepOf(z),jm=Math.floor(84/st);      // nunca pedir latitudes > 84°
  const mLa=Math.max((b.getNorth()-b.getSouth())*.12,2*st),mLo=Math.max((b.getEast()-b.getWest())*.12,2*st);
  const s=b.getSouth()-mLa,n=b.getNorth()+mLa,w=b.getWest()-mLo,e=b.getEast()+mLo;
  return{z,st,i0:Math.floor(w/st),i1:Math.ceil(e/st),j0:Math.max(-jm,Math.floor(s/st)),j1:Math.min(jm,Math.ceil(n/st))};
}
function isoMissing(g){                                            // nós em falta / expirados
  const N=Math.round(360/g.st),m=isoCache[g.z]||new Map(),now=Date.now(),out=[],seen=new Set();
  for(let j=g.j0;j<=g.j1;j++)for(let i=g.i0;i<=g.i1;i++){
    const ii=((i%N)+N)%N,k=tempKey(j,ii);
    if(seen.has(k))continue;seen.add(k);
    const c=m.get(k);if(!c||now-c[1]>ISO_TTL)out.push([ii,j,k]);
  }
  return out;
}
async function isoFetch(z,nodes){await gridLoad(z,nodes)}

/* marching squares: emite segmentos (x1,y1,x2,y2) em coordenadas de grelha */
function isoMarch(F,nx,ny,lv,emit){
  for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
    const a=F[y*nx+x],b=F[y*nx+x+1],c=F[(y+1)*nx+x+1],d=F[(y+1)*nx+x];
    if(a!==a||b!==b||c!==c||d!==d)continue;
    const k=(a>=lv?1:0)|(b>=lv?2:0)|(c>=lv?4:0)|(d>=lv?8:0);
    if(k===0||k===15)continue;
    const T=[x+(lv-a)/(b-a),y],R=[x+1,y+(lv-b)/(c-b)],B=[x+(lv-d)/(c-d),y+1],W=[x,y+(lv-a)/(d-a)],m=(a+b+c+d)/4>=lv;
    const S=({1:[W,T],2:[T,R],3:[W,R],4:[R,B],5:m?[T,R,W,B]:[W,T,R,B],6:[T,B],7:[W,B],8:[W,B],9:[T,B],10:m?[W,T,R,B]:[T,R,W,B],11:[R,B],12:[W,R],13:[T,R],14:[W,T]})[k];
    for(let s=0;s<S.length;s+=2)emit(S[s][0],S[s][1],S[s+1][0],S[s+1][1]);
  }
}
/* junta os segmentos do marching squares em linhas contínuas e arredonda os cantos (Chaikin) */
function isoChain(segs){
  const key=(x,y)=>Math.round(x*1e4)+','+Math.round(y*1e4),m=new Map();
  segs.forEach((q,i)=>{for(const k of[key(q[0],q[1]),key(q[2],q[3])]){let a=m.get(k);if(!a)m.set(k,a=[]);a.push(i)}});
  const used=new Uint8Array(segs.length),out=[];
  for(let i=0;i<segs.length;i++){
    if(used[i])continue;used[i]=1;
    const pts=[[segs[i][0],segs[i][1]],[segs[i][2],segs[i][3]]];
    for(let dir=0;dir<2;dir++){
      for(;;){
        const e=pts[pts.length-1],k=key(e[0],e[1]),a=m.get(k);let j=-1;
        if(a)for(const t of a)if(!used[t]){j=t;break}
        if(j<0)break;used[j]=1;const q=segs[j];
        pts.push(key(q[0],q[1])===k?[q[2],q[3]]:[q[0],q[1]]);
      }
      pts.reverse();
    }
    out.push(pts);
  }
  return out;
}
const isoThin=c=>{if(c.length<9)return c;const o=[];for(let i=0;i<c.length;i+=2)o.push(c[i]);if((c.length-1)%2)o.push(c[c.length-1]);return o};
function isoSmooth(p,it){
  const same=(a,b)=>Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6,closed=p.length>3&&same(p[0],p[p.length-1]);
  for(;it>0;it--){
    const q=[];if(!closed)q.push(p[0]);
    for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];
      q.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]])}
    if(closed)q.push(q[0]);else q.push(p[p.length-1]);
    p=q;
  }
  return p;
}
const isoCR=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));   // Catmull-Rom (suaviza o campo)
function isoBuild(g){
  const nx=g.i1-g.i0+1,ny=g.j1-g.j0+1,N=Math.round(360/g.st),P=new Float64Array(nx*ny);let ok=0;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const v=isoNode(g.z,((g.i0+x)%N+N)%N,g.j0+y);P[y*nx+x]=v;if(v===v)ok++}
  if(nx<5||ny<5||ok<nx*ny*.5)return null;
  const K=g.z<=5?8:6,fx=(nx-1)*K+1,fy=(ny-1)*K+1,F=new Float32Array(fx*fy);
  const at=(x,y)=>P[Math.max(0,Math.min(ny-1,y))*nx+Math.max(0,Math.min(nx-1,x))];
  for(let Y=0;Y<fy;Y++){const y=Math.floor(Y/K),ty=Y/K-y;
    for(let X=0;X<fx;X++){const x=Math.floor(X/K),tx=X/K-x,c=[-1,0,1,2].map(dy=>isoCR(at(x-1,y+dy),at(x,y+dy),at(x+1,y+dy),at(x+2,y+dy),tx));
      F[Y*fx+X]=isoCR(c[0],c[1],c[2],c[3],ty)}}
  let lo=1e9,hi=-1e9;for(const v of F)if(v===v){if(v<lo)lo=v;if(v>hi)hi=v}
  if(!(hi>lo))return null;
  const iv=g.z<=5?8:g.z<=8?4:2;                                    // intervalo fixo por zoom: arrastar o mapa já não subdivide as linhas
  const X2=x=>(g.i0+x/K)*g.st,Y2=y=>(g.j0+y/K)*g.st,lines=[];
  for(let lv=Math.ceil(lo/iv)*iv;lv<=hi;lv+=iv){
    const segs=[];isoMarch(F,fx,fy,lv,(x1,y1,x2,y2)=>segs.push([x1,y1,x2,y2]));
    if(!segs.length)continue;
    const chains=isoChain(segs).map(c=>isoSmooth(isoThin(c),2).map(q=>[Y2(q[1]),X2(q[0])]));
    const sg=[];chains.forEach(c=>{for(let i=0;i<c.length-1;i++)sg.push([c[i][0],c[i][1],c[i+1][0],c[i+1][1]])});
    lines.push({lv,segs:sg,chains});
  }
  /* máximos (A) e mínimos (B): extremos locais com raio de 2 nós e proeminência mínima */
  const ext=[],R=g.st>=20?1:2,prom=g.z<=5?2:1;                     // passos grandes → vizinhança mais curta
  for(let y=R;y<ny-R;y++)for(let x=R;x<nx-R;x++){
    const p=P[y*nx+x];if(p!==p)continue;
    let mx=true,mn=true,sum=0,cnt=0;
    for(let dy=-R;dy<=R&&(mx||mn);dy++)for(let dx=-R;dx<=R;dx++){
      if(!dx&&!dy)continue;const q=P[(y+dy)*nx+x+dx];
      if(q!==q){mx=mn=false;break}
      if(q>p)mx=false;if(q<p)mn=false;
      if(Math.max(Math.abs(dx),Math.abs(dy))===R){sum+=q;cnt++}
    }
    const d=p-sum/cnt,isHi=mx&&d>=prom,isLo=mn&&-d>=prom;
    if(!isHi&&!isLo)continue;
    let bx=x*K,by=y*K,bv=F[by*fx+bx];                              // afina o ponto na grelha suavizada
    for(let Y=by-K;Y<=by+K;Y++)for(let X=bx-K;X<=bx+K;X++){const v=F[Y*fx+X];if(v===v&&(isHi?v>bv:v<bv)){bv=v;bx=X;by=Y}}
    const e={hi:isHi,p:bv,lat:Y2(by),lng:X2(bx)};
    if(!ext.some(o=>o.hi===e.hi&&Math.hypot(o.lat-e.lat,o.lng-e.lng)<2*R*g.st))ext.push(e);
  }
  return{lines,ext};
}
function isoDraw(M){
  if(!radarMap||!isoGrp)return;
  const nu=L.layerGroup(),old=isoGrp;
  if(M){
    const multi=M.lines.flatMap(l=>l.chains),o={pane:'isobars',className:'isoln',interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:.6};
    if(multi.length){
      L.polyline(multi,{...o,color:'#ffffff',weight:3.6,opacity:.65}).addTo(nu);     // halo
      L.polyline(multi,{...o,color:'#14314f',weight:1.4,opacity:.9}).addTo(nu);
    }
    /* etiquetas hPa: posição ligada à grelha do mundo (não ao ecrã) → não saltam ao arrastar */
    const cd=260*360/(256*Math.pow(2,tempZ())),best=new Map(),bd=radarMap.getBounds().pad(-.04);
    M.lines.forEach(l=>l.segs.forEach(s=>{
      const lat=(s[0]+s[2])/2,lng=(s[1]+s[3])/2,ci=Math.floor(lat/cd),cj=Math.floor(lng/cd),k=l.lv+'|'+ci+'|'+cj;
      const d=Math.hypot(lat-(ci+.5)*cd,lng-(cj+.5)*cd),b=best.get(k);
      if(!b||d<b.d)best.set(k,{d,lat,lng,lv:l.lv});
    }));
    const placed=[];
    [...best.values()].sort((a,b)=>a.d-b.d).forEach(c=>{
      const ll=L.latLng(c.lat,c.lng);if(!bd.contains(ll))return;
      const p=radarMap.latLngToContainerPoint(ll);
      if(placed.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<150))return;
      placed.push(p);
      L.marker(ll,{pane:'isolab',interactive:false,keyboard:false,icon:L.divIcon({className:'isolbl',html:`<span>${Math.round(c.lv)}</span>`,iconSize:[0,0]})}).addTo(nu);
    });
    /* A = alta pressão · B = baixa pressão */
    const vb=radarMap.getBounds();
    M.ext.forEach(e=>{const ll=L.latLng(e.lat,e.lng);if(!vb.contains(ll))return;
      L.marker(ll,{pane:'isolab',interactive:false,keyboard:false,zIndexOffset:500,icon:L.divIcon({className:'isoax '+(e.hi?'hi':'lo'),html:`<b>${e.hi?'A':'B'}</b><small>${Math.round(e.p)}</small>`,iconSize:[0,0]})}).addTo(nu)});
  }
  nu.addTo(radarMap);isoGrp=nu;                                    // o novo entra com fade; o antigo sai logo a seguir
  isoOld.add(old);
  setTimeout(()=>{isoOld.delete(old);try{radarMap&&radarMap.removeLayer(old)}catch(e){}},900);
}
let isoRetry=0;
async function isoUpdate(){
  if(!radarMap||!isoOn)return;
  if(isoRun){isoAgain=true;return}
  isoRun=true;const gen=isoGen;
  try{
    const g=isoGridBox();
    for(let pass=0;pass<3;pass++){                                   // cada ronda só traz 16 blocos: até 3 rondas
      const need=isoMissing(g);
      if(!need.length||Date.now()<=Math.max(isoBlock,tempBlock))break;   // respeita também o bloqueio do radar de temperatura
      try{await isoFetch(g.z,need)}
      catch(err){
        console.warn('[Isobars]',err.message);
        isoBlock=Date.now()+(err.message==='429'?3e5:3e4);
        if(err.message==='429')tempBlock=Math.max(tempBlock,isoBlock);   // 429: ambos param de pedir
        break;
      }
    }
    if(gen!==isoGen||!radarMap||!isoOn)return;
    const M=isoBuild(g);
    if(M){isoRetry=0;isoDraw(M)}                                     // só substitui as linhas se houver dados; antes apagava tudo
    else if(isoRetry<3){isoRetry++;clearTimeout(isoT);isoT=setTimeout(isoUpdate,6000)}   // volta a tentar em 6 s
  }finally{isoRun=false;if(isoAgain){isoAgain=false;isoUpdate()}}
}
const isoMoved=()=>{clearTimeout(isoT);isoT=setTimeout(isoUpdate,900)};
function isoStart(){
  if(!radarMap)return;
  isoStop();
  mkPane('isobars',258);mkPane('isolab',270);
  isoGrp=L.layerGroup().addTo(radarMap);isoOn=true;
  radarMap.on('moveend',isoMoved);
  isoUpdate();
}
function isoStop(){
  isoGen++;isoOn=false;clearTimeout(isoT);
  if(radarMap){
    try{radarMap.off('moveend',isoMoved)}catch(e){}
    if(isoGrp){try{radarMap.removeLayer(isoGrp)}catch(e){}}
    isoOld.forEach(g=>{try{radarMap.removeLayer(g)}catch(e){}});
  }
  isoOld.clear();isoGrp=null;
}


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
function ipmaClose(){const p=$('#wpop'),b=$('#wrn');if(p)p.hidden=true;if(b)b.setAttribute('aria-expanded','false')}
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
 if(open)ipmaPaint();
 p.hidden=!open;$('#wrn').setAttribute('aria-expanded',open);
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
async function hurrFetch(){
 try{
  const j=await fetchJSON(WORKER+'/storms');
  if(j&&Array.isArray(j.storms))return{storms:j.storms.map(hClean).filter(Boolean),at:Date.parse(j.updated)||Date.now()};
 }catch(e){console.info('[Hurricanes] rota /storms indisponível no worker ('+e.message+'); a tentar o GDACS diretamente')}
 const j=await fetchJSON('https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP');
 const by=new Map();
 for(const f of(j&&j.features)||[]){
  const p=f.properties||{},g=f.geometry&&f.geometry.coordinates;
  if(p.eventtype!=='TC'||String(p.iscurrent)!=='true'||!g)continue;
  const old=by.get(p.eventid);if(old&&old.ep>=p.episodeid)continue;
  const sv=p.severitydata||{};
  by.set(p.eventid,{ep:p.episodeid,s:{id:'gdacs'+p.eventid,name:hName(p.eventname||p.name),lat:g[1],lon:g[0],windKt:hNum(sv.severity)==null?null:sv.severity/1.852,src:'GDACS',url:p.url&&p.url.report,updated:p.datemodified?p.datemodified+'Z':null}});
 }
 return{storms:[...by.values()].map(x=>hClean(x.s)).filter(Boolean).sort((a,b)=>(b.windKt||0)-(a.windKt||0)),at:Date.now()};
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
 const sub=!D?(hView=='load'?hT('Loading storms…','A carregar tempestades…'):hT('Storm data unavailable','Dados indisponíveis')):
  list.length?`${list.length} ${list.length==1?hT('active storm','tempestade ativa'):hT('active storms','tempestades ativas')} · ${hT('updated','atualizado')} ${hAgo(D.at)}`:hT('All quiet for now','Tudo calmo por agora');
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

/* ═══════════ ACCOUNT — auth client, Turnstile, preference sync, notifications ═══════════ */
/* ============ Skylab Auth Client ============ */
const AUTH_CONFIG = {
  apiUrl: (typeof ATMO !== 'undefined' && ATMO.base) 
    ? ATMO.base.replace(/\/v1\/?$/, '/api/auth') 
    : 'https://aged-mountain-a883.lourencoalvesfonseca2011.workers.dev/api/auth',
  googleClientId: '175966063647-g97am2pbroisp0oiuqp8p5ek052ins8p.apps.googleusercontent.com',
  turnstileSiteKey: '0x4AAAAAAFXe8LEPrrxgCRnj'   // Site Key do Turnstile (pública). Enquanto não a colares, o Turnstile fica desligado.
};

/* ============ Terceiros do login: só carregam quando abres a janela de início de sessão ============ */
const _once = {};
function loadScriptOnce(src){
  if(_once[src]) return _once[src];
  return _once[src] = new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = res; s.onerror = ()=>{ delete _once[src]; rej(new Error('load '+src)); };
    document.head.appendChild(s);
  });
}
function authLoadThirdParty(){
  loadScriptOnce('https://accounts.google.com/gsi/client').catch(()=>{});                                   // Google Sign-In
  if(tsActive()) loadScriptOnce('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit').catch(()=>{});   // Turnstile
}

/* ============ Cloudflare Turnstile (anti-robôs) ============ */
let tsWidgetId = null;
function tsActive(){ return !!AUTH_CONFIG.turnstileSiteKey && AUTH_CONFIG.turnstileSiteKey !== 'COLA_AQUI_A_SITE_KEY'; }
function tsEnsure(tries){
  tries = tries || 0;
  if(!tsActive() || tsWidgetId !== null) return;
  const box = document.getElementById('authTurnstile');
  if(!box || !window.turnstile){ if(tries < 25) setTimeout(()=>tsEnsure(tries+1), 600); return; }   // o script ainda está a carregar
  tsWidgetId = window.turnstile.render(box, { sitekey: AUTH_CONFIG.turnstileSiteKey, theme: 'auto', size: 'flexible' });
}
function tsToken(){ try{ return tsWidgetId !== null ? (window.turnstile.getResponse(tsWidgetId) || '') : ''; }catch(e){ return ''; } }
function tsReset(){ try{ if(tsWidgetId !== null) window.turnstile.reset(tsWidgetId); }catch(e){} }   // cada token só serve uma vez

/* Sessão revogada no servidor (ex.: lockdown ou sessão expirada): sai localmente, sem apagar favoritos/preferências */
function authSessionDead(){
  if(!currentToken) return;
  currentUser = null; currentToken = null;
  try{ localStorage.removeItem('skylab_auth_user'); localStorage.removeItem('skylab_auth_token'); }catch(e){}
  try{ updateAuthUI(); }catch(e){}
}
/* ==== sync de preferências (v2: um documento, "a escrita mais recente ganha") ==== */
let syncT = null;
async function prefsPush(){
  if(!currentToken) return;
  const payload = {};
  for(const k of SYNC_KEYS){ const v = lsGet(k); if(v!=null) payload[k]=v; }
  if(!Object.keys(payload).length) return;
  payload._ts = +localStorage.getItem('prefsTs') || Date.now();     // carimbo da última alteração local
  try{
    const pr = await fetch(`${AUTH_CONFIG.apiUrl.replace('/auth','')}/prefs`,{
      method:'PUT',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${currentToken}`},
      body:JSON.stringify(payload)
    });
    if(pr.status===401) authSessionDead();
  }catch(e){}
  if(typeof pushSyncLoc==='function')pushSyncLoc();
}
function prefsSchedulePush(){
  clearTimeout(syncT);
  syncT = setTimeout(prefsPush, 800);
}
async function prefsPull(){
  if(!currentToken) return null;
  try{
    const r = await fetch(`${AUTH_CONFIG.apiUrl.replace('/auth','')}/prefs`,{
      headers:{'Authorization':`Bearer ${currentToken}`}
    });
    if(r.status===401){ authSessionDead(); return null; }
    if(!r.ok) return null;
    const j = await r.json();
    return j.prefs || null;
  }catch(e){ return null; }
}
/* first=true → acabou de iniciar sessão neste dispositivo: junta listas locais + nuvem.
   first=false → arranque normal: o documento mais recente (local ou nuvem) ganha, por isso apagar um favorito num dispositivo também o apaga nos outros. */
function prefsMerge(server, first){
  if(!server) return false;
  const sTs = +server._ts || 0, lTs = +localStorage.getItem('prefsTs') || 0, LIM = {favs:20, recent:5, termHist:200};
  let changed = false, push = false;
  const put = (k,v) => { if(JSON.stringify(lsGet(k)) !== JSON.stringify(v)){ lsSet(k,v); changed = true; } };
  window.__prefsApplying = true;
  try{
    if(first){
      for(const k of SYNC_KEYS){
        if(k in LIM){
          const seen = new Set(), out = [];
          for(const f of [...(Array.isArray(server[k])?server[k]:[]), ...(lsGet(k)||[])]){
            const id = typeof f==='string' ? f : f.name+'|'+(f.sub||'');
            if(!seen.has(id)){ seen.add(id); out.push(f); }
          }
          put(k, out.slice(0, LIM[k]));
        }else if(k in server) put(k, server[k]);
      }
      localStorage.setItem('prefsTs', String(Date.now())); push = true;
    }else if(sTs > lTs || !lTs){
      for(const k of SYNC_KEYS) if(k in server) put(k, server[k]);
      localStorage.setItem('prefsTs', String(sTs || Date.now()));
    }else if(lTs > sTs) push = true;
  }finally{ window.__prefsApplying = false; }
  if(push) prefsSchedulePush();
  return changed;
}
/* aplica ao ecrã o que veio da nuvem (o antigo só gravava no localStorage: LANG e unit só mudavam no reload seguinte) */
function prefsApplied(){
  const l = lsGet('lang'), u = lsGet('unitPick');                    // ler ANTES: o setLang reescreve a unidade
  window.__prefsApplying = true;
  try{
    if((l==='pt'||l==='en') && l!==LANG) setLang(l);
    if(u==='c'||u==='f'){ lsSet('unitPick',u); if(u!==unit) setUnit(u,false,true); }
    if(termInst){
      const h = lsGet('termHist'); termInst.history = Array.isArray(h) ? h.slice(-SkyTerm.CFG.histMax) : []; termInst.hIdx = termInst.history.length;
      const th = lsGet('termTheme'); if(th) SkyTerm.setTheme(th);
    }
  }finally{ window.__prefsApplying = false; }
  if(typeof progUI==='function') progUI();
  if(typeof favUI==='function') favUI();
  if(typeof favOpen!=='undefined' && favOpen) favPaint(false);
  if(data) render();
}
async function prefsAfterLogin(){                                    // chamar depois de guardar currentToken (email, registo e Google)
  const sp = await prefsPull();
  if(sp){ if(prefsMerge(sp,true)) prefsApplied(); }
  else{ localStorage.setItem('prefsTs', String(Date.now())); prefsSchedulePush(); }   // conta nova: sobe o que já existe localmente
}

function imgFBAuth(el){
  const tries=['imgs/icons/person.png','person.png','imgs/logos/FullLogo_Transparent_NoBuffer-resized-128x128.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
    svg.innerHTML='<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>';
    svg.style.width='18px';svg.style.height='18px';el.replaceWith(svg);
  }
}

function imgFBEmail(el){
  const tries=['imgs/icons/email.png','email.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','#64748b');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
    svg.innerHTML='<rect width="20" height="16" x="2" y="4" rx="3"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>';
    svg.style.width='18px';svg.style.height='18px';el.replaceWith(svg);
  }
}

function imgFBLock(el){
  const tries=['imgs/icons/lock.png','lock.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','#64748b');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
    svg.innerHTML='<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
    svg.style.width='18px';svg.style.height='18px';el.replaceWith(svg);
  }
}

function imgFBGoogle(el){
  const tries=['imgs/icons/google.png','google.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.innerHTML='<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>';
    svg.style.width='19px';svg.style.height='19px';el.replaceWith(svg);
  }
}

function renderEyeIcon(isOpen){
  const btn=$('#authTogglePass');if(!btn)return;
  const path=isOpen?'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>':'<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
  btn.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

let authMode = 'signup';
let currentUser = lsGet('skylab_auth_user');
let currentToken = lsGet('skylab_auth_token');
let authModalOpen = false;

function updateAuthUI(){
 const btn=$('#authBtn');const txt=$('#authTxt');const ico=$('#authIco');
 if(!btn||!txt)return;
 if(currentUser&&currentUser.username){
  btn.classList.remove('pulse-btn');btn.classList.add('is-in');
  if(ico)ico.style.display='none';
  const rawName=currentUser.username.trim();
  const av=$('#authAv');
  if(av){
   if(currentUser.avatar_url){av.textContent='';av.style.backgroundImage=`url("${String(currentUser.avatar_url).replace(/"/g,'%22')}")`}
   else{av.style.backgroundImage='';av.textContent=(rawName[0]||'?').toUpperCase()}
  }
  const displayName=rawName.length>15?rawName.slice(0,15):rawName;
  txt.innerHTML=`<span class="auth-u-id" title="${escH(rawName)}">${escH(displayName)}</span>`;
  btn.setAttribute('title',`Conta: ${rawName}`);
 }else{
  btn.classList.add('pulse-btn');btn.classList.remove('is-in');
  if(ico)ico.style.display='';
  const av0=$('#authAv');if(av0){av0.textContent='';av0.style.backgroundImage=''}
  // Destaque limpo de Sign Up / Criar Conta
  txt.textContent=LANG==='pt'?'Criar Conta':'Sign Up';
  btn.setAttribute('title',LANG==='pt'?'Criar Conta / Iniciar Sessão':'Sign Up / Sign In');
 }
}

/* ============ Notificações Periódicas de 10 em 10 min (Apenas Logged In) ============ */
let userWeatherTimer = null;

async function sendUserWeatherStatus() {
  if (!currentUser || !currentUser.username) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Se já temos dados carregados do local atual
  if (data && place) {
    const c = data.current;
    const tStr = `${T(c.temperature_2m)}°`;
    const condStr = tr(LABEL[c.weather_code] || 'Tempo atual');
    const wStr = W(c.wind_speed_10m);
    const title = `Skylab · ${place.name}: ${tStr}`;
    const body = `${condStr} · Vento: ${wStr} · Humidade: ${c.relative_humidity_2m}%`;

    skyNotify(title,{body,tag:'skylab-user-live-weather'});
  } else if (navigator.geolocation) {
    // Caso ainda não tenha dados, obtém a localização atual
    navigator.geolocation.getCurrentPosition(p => {
      show(+p.coords.latitude.toFixed(3), +p.coords.longitude.toFixed(3));
    });
  }
}

function startUserWeatherLoop() {} //Antiga, já não é usada, mas mantida para referência //



function stopUserWeatherLoop() {
  if (userWeatherTimer) {
    clearInterval(userWeatherTimer);
    userWeatherTimer = null;
  }
}

function authSetMode(mode){
  authMode=mode;
  const isUp=mode==='signup';
  $('#authTabSignup').classList.toggle('active',isUp);
  $('#authTabSignup').setAttribute('aria-selected',isUp);
  $('#authTabSignin').classList.toggle('active',!isUp);
  $('#authTabSignin').setAttribute('aria-selected',!isUp);

  $('#fieldUsername').hidden=!isUp;
  $('#authTitle').textContent=isUp 
    ?(LANG==='pt'?'Criar Conta Skylab':'Create Skylab Account')
    :(LANG==='pt'?'Iniciar Sessão':'Welcome Back');
  $('#authSubtitle').textContent=isUp
    ?(LANG==='pt'?'Cria a tua conta para guardar locais e preferências':'Create your account to sync settings & places')
    :(LANG==='pt'?'Entra com a tua conta para sincronizar dados':'Sign in to access your saved places');
  $('#authSubmitTxt').textContent=isUp
    ?(LANG==='pt'?'Criar Conta':'Sign Up')
    :(LANG==='pt'?'Iniciar Sessão':'Sign In');
  $('#authSwitchMsg').textContent=isUp
    ?(LANG==='pt'?'Já tens conta?':'Already have an account?')
    :(LANG==='pt'?'Ainda não tens conta?':"Don't have an account?");
  $('#authSwitchLink').textContent=isUp
    ?(LANG==='pt'?'Iniciar sessão':'Sign In')
    :(LANG==='pt'?'Regista-te':'Sign Up');
  if($('#authLegal'))$('#authLegal').innerHTML=LANG==='pt'?`Os teus dados são tratados como descrito na <button type="button" class="priv-link" data-priv>Privacidade</button>. Contacto: ${CONTACT_EMAIL}`:`Your data is handled as described in <button type="button" class="priv-link" data-priv>Privacy</button>. Contact: ${CONTACT_EMAIL}`;
  if($('#lblUsername'))$('#lblUsername').textContent=LANG==='pt'?'Nome de utilizador':'Username';
  if($('#profUserLbl'))$('#profUserLbl').textContent=LANG==='pt'?'Nome de utilizador':'Username';
  if($('#profEmailLbl'))$('#profEmailLbl').textContent=LANG==='pt'?'Email':'Email';

  authClearAlert();
}

function authShowAlert(msg,type='err'){
  const el=$('#authAlert');if(!el)return;
  el.className=`auth-alert ${type}`;
  el.textContent=msg;
  el.hidden=false;
}
function authClearAlert(){
  const el=$('#authAlert');if(el)el.hidden=true;
}

/* ============ Verificação de email: código de 6 dígitos ============ */
let authVerifyEmail='',authResendT=null,authCool=0;
function authResendPaint(){
  const b=$('#authResend');if(!b)return;const pt=LANG==='pt';
  b.disabled=authCool>0;
  b.textContent=authCool>0?(pt?`Reenviar código (${authCool}s)`:`Resend code (${authCool}s)`):(pt?'Reenviar código':'Resend code');
}
function authStartCooldown(s){
  clearInterval(authResendT);authCool=Math.max(0,Math.ceil(s||0));authResendPaint();
  if(authCool>0)authResendT=setInterval(()=>{authCool--;authResendPaint();if(authCool<=0)clearInterval(authResendT)},1000);
}
function authShowVerify(d){
  const pt=LANG==='pt';authVerifyEmail=d.email;
  $('#authLoggedOutView').dataset.step='verify';
  $('#authTitle').textContent=pt?'Confirma o teu email':'Confirm your email';
  $('#authSubtitle').textContent=pt?'Enviámos-te um código de 6 dígitos':'We sent you a 6-digit code';
  const m=$('#authVerifyMsg');m.textContent='';
  const b=document.createElement('b');b.textContent=d.email;
  m.append(pt?'Enviámos um código para ':'We sent a code to ',b,pt?'. Vê também o spam. O código expira em 10 minutos.':'. Check your spam folder too. It expires in 10 minutes.');
  $('#lblCode').textContent=pt?'Código de verificação':'Verification code';
  $('#authCodeTxt').textContent=pt?'Confirmar':'Confirm';
  $('#authVerifyBack').textContent=pt?'Mudar de email':'Change email';
  authClearAlert();authStartCooldown(d.resend_in||45);
  const c=$('#authCode');c.value='';setTimeout(()=>c.focus(),60);
}
function authVerifyReset(){
  clearInterval(authResendT);authVerifyEmail='';
  const v=$('#authLoggedOutView');if(v&&v.dataset.step)delete v.dataset.step;
}

function authShell(){
  let ov=$('#authOv');if(ov)return ov;
  ov=document.createElement('div');
  ov.className='hov auth-ov';ov.id='authOv';ov.hidden=true;
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','authTitle');
  ov.innerHTML=`<div class="hcard auth-card">
  <div class="hh">
   <div class="hht">
    <div class="auth-avatar-ico" id="authHeaderAvatar">
      <img id="authCardIco" src="imgs/icons/person.png" alt="" width="22" height="22" data-fb="Auth">
    </div>
    <div>
     <h2 id="authTitle">Skylab Account</h2>
     <p id="authSubtitle">Join Skylab to access your profile & settings</p>
    </div>
   </div>
   <button class="hx" id="authClose" aria-label="Close">✕</button>
  </div>

  <!-- Profile View (When Logged In) -->
  <div id="authLoggedInView" hidden class="auth-profile-view">
   <div class="auth-clean-card">
    <div class="auth-prof-user-row">
     <span class="auth-prof-label" id="profUserLbl">Nome de utilizador</span>
     <b id="profUsername" class="auth-prof-username"></b>
    </div>
    <div class="auth-prof-email-row">
     <span class="auth-prof-label" id="profEmailLbl">Email</span>
     <span class="auth-prof-email" id="profEmail"></span>
    </div>
   </div>
   <div class="auth-prog">
    <button type="button" class="auth-prog-btn" id="progBtn" aria-pressed="false" aria-describedby="progDesc">
     <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    </button>
    <label class="auth-prog-txt" for="progBtn">
     <b id="progLbl">Programmer mode</b>
     <span id="progDesc">Terminal, raw data and technical detail</span>
    </label>
    <span class="auth-prog-state" id="progState">OFF</span>
   </div>
   <div class="auth-prog" id="pushRow">
    <button type="button" class="auth-prog-btn" id="pushBtn" aria-pressed="false" aria-describedby="pushDesc">
     <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    </button>
    <label class="auth-prog-txt" for="pushBtn">
     <b id="pushLbl">Weather notifications</b>
     <span id="pushDesc">Now and what’s coming</span>
    </label>
    <span class="auth-prog-state" id="pushState">OFF</span>
   </div>
   <div class="auth-profile-actions">
    <button type="button" class="pill solid big auth-logout-btn" id="authLogoutBtn">Terminar Sessão</button>
    <button type="button" class="pill solid big auth-delete-btn" id="authDeleteBtn">Apagar Conta</button>
   </div>
  </div>

  <!-- Auth Form View (When Logged Out) -->
  <div id="authLoggedOutView">
   <div class="auth-tabs" role="tablist">
    <button type="button" id="authTabSignup" class="auth-tab active" role="tab" aria-selected="true">Criar Conta</button>
    <button type="button" id="authTabSignin" class="auth-tab" role="tab" aria-selected="false">Iniciar Sessão</button>
   </div>

   <!-- Google Sign-In Button -->
   <div class="auth-google-wrap">
    <button type="button" class="auth-google-btn" id="authGoogleBtn">
     <img src="imgs/icons/google.png" alt="" width="19" height="19" data-fb="Google">
     <span id="googleBtnTxt">Continuar com o Google</span>
    </button>
   </div>

   <div class="auth-divider">
    <span id="authDividerTxt">ou com email</span>
   </div>

   <div class="auth-alert" id="authAlert" hidden></div>

   <!-- Passo 2: código enviado por email -->
   <div id="authVerifyView">
    <p class="auth-verify-msg" id="authVerifyMsg"></p>
    <form id="authCodeForm" class="auth-form" novalidate>
     <div class="auth-field">
      <label for="authCode" class="auth-label"><span id="lblCode">Código de verificação</span></label>
      <div class="auth-input-wrap">
       <input type="text" id="authCode" class="auth-input auth-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="000000" aria-describedby="authVerifyMsg">
      </div>
     </div>
     <button type="submit" class="pill solid big auth-submit-btn" id="authCodeBtn"><span id="authCodeTxt">Confirmar</span></button>
    </form>
    <div class="auth-verify-actions">
     <button type="button" class="auth-switch-link" id="authResend">Reenviar código</button>
     <button type="button" class="auth-switch-link" id="authVerifyBack">Mudar de email</button>
    </div>
   </div>

   <form id="authForm" class="auth-form" novalidate>
    <!-- Username (Sign Up only) -->
    <div class="auth-field" id="fieldUsername">
     <label for="authUsername" class="auth-label">
      <span id="lblUsername">Nome de utilizador</span>
     </label>
     <div class="auth-input-wrap">
      <input type="text" id="authUsername" class="auth-input" placeholder="ex: sky_explorer" maxlength="15" autocomplete="username">
      <span class="auth-char-count" id="authCharCount">0/15</span>
     </div>
    </div>

    <!-- Email -->
    <div class="auth-field" id="fieldEmail">
     <label for="authEmail" class="auth-label"><span id="lblEmail">Email</span></label>
     <div class="auth-input-wrap">
      <input type="email" id="authEmail" class="auth-input has-dyn-icon" placeholder="o.teu.email@exemplo.com" autocomplete="email" required>
      <span class="auth-dyn-ico" aria-hidden="true">
       <img src="imgs/icons/email.png" alt="" data-fb="Email">
      </span>
     </div>
    </div>

    <!-- Password -->
    <div class="auth-field" id="fieldPassword">
     <label for="authPassword" class="auth-label"><span id="lblPassword">Palavra-passe</span></label>
     <div class="auth-input-wrap">
      <input type="password" id="authPassword" class="auth-input has-dyn-icon" placeholder="••••••••" autocomplete="current-password" required>
      <span class="auth-dyn-ico" aria-hidden="true">
       <img src="imgs/icons/lock.png" alt="" data-fb="Lock">
      </span>
      <button type="button" class="auth-eye-btn" id="authTogglePass" title="Ver / ocultar senha" aria-label="Ver / ocultar senha"></button>
     </div>
    </div>

    <!-- Cloudflare Turnstile (anti-robôs) -->
    <div id="authTurnstile" style="margin:6px 0"></div>

    <!-- Submit Button -->
    <button type="submit" class="pill solid big auth-submit-btn" id="authSubmitBtn">
     <span id="authSubmitTxt">Criar Conta</span>
    </button>
   </form>
   <p class="auth-legal" id="authLegal"></p>

   <div class="auth-switch-prompt">
    <span id="authSwitchMsg">Já tens conta?</span>
    <button type="button" class="auth-switch-link" id="authSwitchLink">Iniciar sessão</button>
   </div>
  </div>
 </div>`;
  document.body.appendChild(ov);
  initAuthInputs();
  if(typeof progUI==='function') progUI();
  if(typeof pushUI==='function') pushUI();
  const pb=$('#progBtn');if(pb)pb.onclick=progToggle;
  const psb=$('#pushBtn');if(psb)psb.onclick=pushToggle;
  trTree(ov);
  return ov;
}

function authOpen(){
  const ov=authShell();
  authModalOpen=true;
  if(!(currentUser&&currentUser.username))authLoadThirdParty();
  tsEnsure();
  authClearAlert();

  if(currentUser&&currentUser.username){
    $('#authLoggedInView').hidden=false;
    $('#authLoggedInView').style.display='grid';
    $('#authLoggedOutView').hidden=true;
    $('#authLoggedOutView').style.display='none';
    if($('#authHeaderAvatar'))$('#authHeaderAvatar').style.display='none';

    const rawName=currentUser.username||'User';
    $('#profUsername').textContent=rawName.length>15?rawName.slice(0,15):rawName;
    $('#profEmail').textContent=currentUser.email||'';
    $('#authTitle').textContent=LANG==='pt'?'A tua Conta':'Your Account';
    $('#authSubtitle').textContent=LANG==='pt'?'Sessão iniciada no Skylab':'Signed in to Skylab';
    if($('#profUserLbl'))$('#profUserLbl').textContent=LANG==='pt'?'Nome de utilizador':'Username';
    if($('#profEmailLbl'))$('#profEmailLbl').textContent=LANG==='pt'?'Email':'Email';
    if($('#authLogoutBtn'))$('#authLogoutBtn').textContent=LANG==='pt'?'Terminar Sessão':'Log Out';
    if($('#authDeleteBtn'))$('#authDeleteBtn').textContent=LANG==='pt'?'Apagar Conta':'Delete Account';
  }else{
    $('#authLoggedInView').hidden=true;
    $('#authLoggedInView').style.display='none';
    $('#authLoggedOutView').hidden=false;
    $('#authLoggedOutView').style.display='block';
    if($('#authHeaderAvatar'))$('#authHeaderAvatar').style.display='grid';
    authSetMode(authMode);
  }

  ov.hidden=false;
  document.documentElement.classList.add('hlock');
  void ov.offsetWidth;
  ov.classList.add('on');
  $('#authBtn').setAttribute('aria-expanded','true');
}

function authClose(){
  authVerifyReset();
  const ov=$('#authOv');if(!ov||ov.hidden)return;
  authModalOpen=false;
  ov.classList.remove('on');
  document.documentElement.classList.remove('hlock');
  $('#authBtn').setAttribute('aria-expanded','false');
  setTimeout(()=>{if(!authModalOpen)ov.hidden=true},360);
}

function initAuthInputs(){
  const emailIn=$('#authEmail');
  const passIn=$('#authPassword');
  const userIn=$('#authUsername');

  const checkDyn=(inp)=>{
    if(!inp)return;
    inp.classList.toggle('has-val',(inp.value||'').length>0);
  };

  [emailIn,passIn].forEach(inp=>{
    if(!inp)return;
    inp.addEventListener('input',()=>checkDyn(inp));
    inp.addEventListener('change',()=>checkDyn(inp));
  });

  if(userIn){
    userIn.addEventListener('input',(e)=>{
      let val=e.target.value;
      if(val.length>15){val=val.slice(0,15);userIn.value=val}
      $('#authCharCount').textContent=`${val.length}/15`;
    });
  }

  let passVisible=false;
  renderEyeIcon(false);
  const togglePassBtn=$('#authTogglePass');
  if(togglePassBtn&&passIn){
    togglePassBtn.onclick=(e)=>{
      e.preventDefault();e.stopPropagation();
      passVisible=!passVisible;
      passIn.type=passVisible?'text':'password';
      renderEyeIcon(passVisible);
    };
  }

  $('#authBtn').onclick=()=>authModalOpen?authClose():authOpen();
  $('#authClose').onclick=authClose;
  $('#authTabSignup').onclick=()=>authSetMode('signup');
  $('#authTabSignin').onclick=()=>authSetMode('signin');
  $('#authSwitchLink').onclick=()=>authSetMode(authMode==='signup'?'signin':'signup');

  // Terminar Sessão
  $('#authLogoutBtn').onclick=async()=>{
    termClose();
    pushDisable(currentToken);                       // desliga as notificações push deste dispositivo
    if(termInst){termInst.history=[];termInst.hIdx=0}// o histórico de comandos não fica para o próximo utilizador
    stopUserWeatherLoop();
    const tok=currentToken;
    currentUser=null;
    currentToken=null;
    try{
      localStorage.removeItem('skylab_auth_user');
      localStorage.removeItem('skylab_auth_token');
      for(const k of SYNC_KEYS) localStorage.removeItem(k);
    }catch(e){}
    if(data){ place=null; data=null; landing(); }

    if(tok){
      fetch(`${AUTH_CONFIG.apiUrl}/logout`,{
        method:'POST',
        headers:{'Authorization':`Bearer ${tok}`}
      }).catch(()=>{});
    }

    updateAuthUI();
    startUserWeatherLoop();
    if(emailIn)emailIn.value='';
    if(passIn)passIn.value='';
    if(userIn)userIn.value='';
    if(emailIn)emailIn.classList.remove('has-val');
    if(passIn)passIn.classList.remove('has-val');

    $('#authLoggedInView').hidden=true;
    $('#authLoggedInView').style.display='none';
    $('#authLoggedOutView').hidden=false;
    $('#authLoggedOutView').style.display='block';
    authSetMode('signin');

    toast(LANG==='pt'?'Sessão terminada com sucesso':'Logged out successfully');
    authClose();
  };

  // Apagar Conta
  if($('#authDeleteBtn')){
    $('#authDeleteBtn').onclick=async()=>{
      const msg = LANG==='pt'
        ? 'Tem a certeza de que pretende apagar a sua conta permanentemente? Esta ação removerá os seus dados da base de dados e não pode ser desfeita.'
        : 'Are you sure you want to permanently delete your account? This action will remove your data from the database and cannot be undone.';
      
      if(!confirm(msg)) return;

      const tok = currentToken;
      const deleteBtn = $('#authDeleteBtn');
      deleteBtn.disabled = true;
      const oldTxt = deleteBtn.textContent;
      deleteBtn.textContent = LANG==='pt' ? 'A apagar…' : 'Deleting…';

      try {
        if(tok){
          const res = await fetch(`${AUTH_CONFIG.apiUrl}/delete-account`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tok}` 
            }
          });
          const data = await res.json().catch(()=>({}));
          if(!res.ok || data.error) {
            throw new Error(data.error || (LANG==='pt'?'Erro ao apagar a conta.':'Failed to delete account.'));
          }
        }

        currentUser = null;
        currentToken = null;
        try {
          localStorage.removeItem('skylab_auth_user');
          localStorage.removeItem('skylab_auth_token');
          for(const k of SYNC_KEYS) localStorage.removeItem(k);
        } catch(e) {}
        if(data){ place=null; data=null; landing(); }

        updateAuthUI();
        startUserWeatherLoop();
        if(emailIn) emailIn.value = '';
        if(passIn) passIn.value = '';
        if(userIn) userIn.value = '';
        if(emailIn) emailIn.classList.remove('has-val');
        if(passIn) passIn.classList.remove('has-val');

        $('#authLoggedInView').hidden = true;
        $('#authLoggedInView').style.display = 'none';
        $('#authLoggedOutView').hidden = false;
        $('#authLoggedOutView').style.display = 'block';
        authSetMode('signin');

        toast(LANG==='pt' ? 'Conta apagada com sucesso.' : 'Account deleted successfully.');
        authClose();
      } catch(err) {
        console.warn('[Delete Account Error]', err);
        alert(err.message || (LANG==='pt' ? 'Erro ao apagar a conta.' : 'Error deleting account.'));
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = oldTxt;
      }
    };
  }

  $('#authForm').onsubmit=async(e)=>{
    e.preventDefault();
    authClearAlert();

    const email=(emailIn.value||'').trim();
    const password=passIn.value||'';
    const username=userIn?(userIn.value||'').trim():'';

    if(authMode==='signup'){
      if(!username)return authShowAlert(LANG==='pt'?'Por favor introduz o nome de utilizador.':'Please choose a username.');
      if(username.length>15)return authShowAlert(LANG==='pt'?'O nome de utilizador não pode ter mais de 15 carateres.':'Username must be at most 15 characters.');
      if(!/^[a-zA-Z0-9_-]+$/.test(username))return authShowAlert(LANG==='pt'?'O nome de utilizador apenas pode conter letras, números, _ ou -.':'Username can only contain letters, numbers, _ and -.');
    }
    if(!email)return authShowAlert(LANG==='pt'?'Por favor introduz o teu email.':'Please enter your email.');
    const minPw = authMode==='signup' ? 8 : 6;
    if(!password||password.length<minPw)return authShowAlert(LANG==='pt'?`A palavra-passe deve ter pelo menos ${minPw} carateres.`:`Password must be at least ${minPw} characters.`);
    if(password.length>128)return authShowAlert(LANG==='pt'?'A palavra-passe não pode ter mais de 128 carateres.':'Password must be at most 128 characters.');
    const cf_turnstile = tsToken();
    if(tsActive() && !cf_turnstile)return authShowAlert(window.turnstile
      ?(LANG==='pt'?'A confirmar que és humano… tenta de novo dentro de segundos.':'Verifying you are human… try again in a moment.')
      :(LANG==='pt'?'Não foi possível carregar a verificação anti-robôs. Desativa bloqueadores de anúncios e recarrega a página.':'Could not load the anti-bot check. Disable ad blockers and reload the page.'));

    const submitBtn=$('#authSubmitBtn');
    submitBtn.disabled=true;
    const oldTxt=$('#authSubmitTxt').textContent;
    $('#authSubmitTxt').textContent=LANG==='pt'?'A processar…':'Processing…';

    try{
      const endpoint=authMode==='signup'?`${AUTH_CONFIG.apiUrl}/signup`:`${AUTH_CONFIG.apiUrl}/signin`;
      const payload=authMode==='signup' 
        ?{username,email,password,cf_turnstile,lang:LANG}
        :{identifier:email,password,cf_turnstile,lang:LANG};

      const res=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });

      const data=await res.json();
      if(res.ok&&data&&data.pending){authShowVerify(data);return}      // falta confirmar o email com o código
      if(!res.ok||!data.success){
        throw new Error(data.error||(LANG==='pt'?'Falha na autenticação.':'Authentication failed.'));
      }

      currentUser=data.user;
      currentToken=data.token;
      lsSet('skylab_auth_user',currentUser);
      lsSet('skylab_auth_token',currentToken);
      updateAuthUI();
      startUserWeatherLoop();
      await prefsAfterLogin();

      toast(authMode==='signup' 
        ?(LANG==='pt'?`Bem-vindo ao Skylab, ${currentUser.username}!`:`Welcome to Skylab, ${currentUser.username}!`)
        :(LANG==='pt'?`Sessão iniciada como ${currentUser.username}`:`Signed in as ${currentUser.username}`));

      authClose();
    }catch(err){
      console.warn('[Auth Error]',err);
      authShowAlert(err.message||(LANG==='pt'?'Erro de ligação ao servidor.':'Server connection error.'));
    }finally{
      submitBtn.disabled=false;
      $('#authSubmitTxt').textContent=oldTxt;
      tsReset();
    }
  };

  $('#authGoogleBtn').onclick=()=>authTriggerGoogle();

  $('#authCode').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
  $('#authCodeForm').onsubmit=async(e)=>{
    e.preventDefault();authClearAlert();
    const pt=LANG==='pt',code=$('#authCode').value.trim();
    if(!/^\d{6}$/.test(code))return authShowAlert(pt?'Introduz os 6 dígitos do código.':'Enter the 6-digit code.');
    const btn=$('#authCodeBtn');btn.disabled=true;
    try{
      const res=await fetch(`${AUTH_CONFIG.apiUrl}/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:authVerifyEmail,code})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.success)throw new Error(data.error||(pt?'Código incorreto ou expirado.':'Wrong or expired code.'));
      currentUser=data.user;currentToken=data.token;
      lsSet('skylab_auth_user',currentUser);lsSet('skylab_auth_token',currentToken);
      updateAuthUI();startUserWeatherLoop();await prefsAfterLogin();
      toast(data.welcome
        ?(pt?`Bem-vindo ao Skylab, ${currentUser.username}!`:`Welcome to Skylab, ${currentUser.username}!`)
        :(pt?`Sessão iniciada como ${currentUser.username}`:`Signed in as ${currentUser.username}`));
      authClose();
    }catch(err){
      authShowAlert(err.message||(pt?'Erro de ligação ao servidor.':'Server connection error.'));
    }finally{btn.disabled=false}
  };
  $('#authResend').onclick=async()=>{
    if(authCool>0)return;authClearAlert();const pt=LANG==='pt';
    try{
      const res=await fetch(`${AUTH_CONFIG.apiUrl}/resend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:authVerifyEmail,lang:LANG})});
      const data=await res.json().catch(()=>({}));
      if(res.status===429&&data.retry_after)authStartCooldown(data.retry_after);
      if(!res.ok)throw new Error(data.error||(pt?'Não foi possível reenviar o código.':'Could not resend the code.'));
      if(data.sent===false){authVerifyReset();authSetMode(authMode);authShowAlert(pt?'O pedido expirou. Volta a preencher o formulário.':'The request expired. Please fill in the form again.');return}
      authStartCooldown(data.resend_in||45);authShowAlert(pt?'Enviámos-te um novo código.':'We sent you a new code.','ok');
    }catch(err){authShowAlert(err.message)}
  };
  $('#authVerifyBack').onclick=()=>{authVerifyReset();authSetMode(authMode)};

  $('#authOv').addEventListener('click',(e)=>{
    if(e.target===$('#authOv'))authClose();
  });
}

// Fluxo de Autenticação com Google (Google Identity Services)
function authTriggerGoogle(){
  authClearAlert();
  const rawInput = $('#authUsername') ? $('#authUsername').value.trim() : '';
  const chosenUsername = (rawInput && rawInput.length <= 15 && /^[a-zA-Z0-9_-]+$/.test(rawInput)) ? rawInput : '';

  if(window.google && window.google.accounts && window.google.accounts.oauth2 && AUTH_CONFIG.googleClientId){
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: AUTH_CONFIG.googleClientId,
      scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      callback: async (tokenResponse) => {
        if (!tokenResponse || !tokenResponse.access_token) return;
        try {
          authShowAlert(LANG==='pt'?'A autenticar com a Google…':'Signing in with Google…','ok');
          const gUserInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
          }).then(r => r.json());

          const defaultName = (gUserInfo.name || gUserInfo.email || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 15) || 'google_user';
          const finalUsername = chosenUsername || defaultName;

          const res = await fetch(`${AUTH_CONFIG.apiUrl}/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              credential: tokenResponse.access_token,
              email: gUserInfo.email,
              google_id: gUserInfo.sub,
              username: finalUsername,
              picture: gUserInfo.picture
            })
          });
          const data = await res.json();
          if(!res.ok || !data.success) throw new Error(data.error || 'Erro Google Sign-In');
          currentUser = data.user;
          currentToken = data.token;
          lsSet('skylab_auth_user', currentUser);
          lsSet('skylab_auth_token', currentToken);
          updateAuthUI();
          startUserWeatherLoop();
          await prefsAfterLogin();
          toast(LANG==='pt'?`Autenticado como ${currentUser.username}!`:`Signed in as ${currentUser.username}!`);
          authClose();
        } catch(e) {
          authShowAlert(e.message || 'Erro ao autenticar com a Google.');
        }
      }
    });
    client.requestAccessToken({ prompt: 'select_account' });
  } else if(AUTH_CONFIG.googleClientId){
    authLoadThirdParty();
    authShowAlert(LANG==='pt'?'A carregar o início de sessão Google… carrega no botão outra vez dentro de um instante.':'Loading Google sign-in… press the button again in a moment.','ok');
  } else {
    authShowAlert(LANG==='pt'
      ?'Para ativar o início de sessão Google, configure o Google Client ID no AUTH_CONFIG (ou utilize o registo com email/palavra-passe).'
      :'To enable Google Sign-In, add your Google Client ID to AUTH_CONFIG (or use email/password sign-in).');
  }
}

addEventListener('keydown',e=>{
 if(authModalOpen){
  if(e.key=='Escape'){e.preventDefault();e.stopPropagation();authClose();return}
  if(e.key=='Tab'){
   const f=$$('#authOv button,#authOv input,#authOv a[href]').filter(x=>!x.disabled&&x.getClientRects().length);
   if(!f.length)return;
   const a=f[0],z=f[f.length-1];
   if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
   else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
   return;
  }
  if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.key.length==1)e.stopPropagation();
 }
},true);

const authBtnEl = $('#authBtn');
if(authBtnEl) authBtnEl.onclick = () => authModalOpen ? authClose() : authOpen();
updateAuthUI();
if (currentUser) startUserWeatherLoop();
/* ============ Quick Tools Popover Toggle ============ */
const toolsBtn = $('#toolsBtn');
const toolsPop = $('#toolsPop');
if(toolsBtn && toolsPop){
 toolsBtn.onclick = (e) => {
  e.stopPropagation();
  const on = toolsPop.classList.toggle('on');
  toolsBtn.setAttribute('aria-expanded', String(on));
 };
 document.addEventListener('click', (e) => {
  if(!toolsPop.contains(e.target) && e.target !== toolsBtn){
   toolsPop.classList.remove('on');
   toolsBtn.setAttribute('aria-expanded', 'false');
  }
 });
}


/* ═══════════ TERMINAL — SkyLab Terminal (CLI) and its lifecycle ═══════════ */
/* ============ Terminal Image Fallback ============ */
function imgFBTerm(el){
 const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','17');svg.setAttribute('height','17');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2.2');
 svg.setAttribute('stroke-linecap','round');svg.innerHTML='<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>';
 el.replaceWith(svg);
}

/* ============ SkyLab Terminal (CLI) ============ */
let termIsOpen = false;
let termInst = null, termClockT = null;

function isUserAuth(){
 return !!(currentUser && currentUser.username && currentToken);
}

const SkyTerm = (() => {
'use strict';

/* ---------- config & tiny helpers ---------- */
const CFG = { mock:false, cacheMs:10*60*1000, histMax:200, version:'1.0' };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/* cores da linha de comandos (como o pip): 1.º termo = comando, -x / --xx = opção (esbatida), resto = argumentos */
const hlCmd = line => { let first = true;
 return String(line).replace(/("[^"]*"?|'[^']*'?|\s+|\S+)/g, t => {
  if(/^\s+$/.test(t)) return t;
  const cls = first ? 'hl-cmd' : /^--?[A-Za-z]/.test(t) ? 'hl-flag' : 'hl-arg'; first = false;
  return `<span class="${cls}">${esc(t)}</span>`; }); };
const num = x => typeof x === 'number' && isFinite(x);
const fmt = (v,d=1) => num(v) ? v.toFixed(d) : '—';
const sgn = (v,d=1) => { if(!num(v)) return '—'; const s = Math.abs(v).toFixed(d); return (v<0 && +s!==0 ? '-' : '+') + s; };
const dispU = s => String(s||'');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2,'0');
const isoLocal = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
const unitAscii = u => String(u||'').replace(/°/g,'deg ').replace(/²/g,'2').replace(/³/g,'3').replace(/µ/g,'u').replace(/\s+$/,'');
const reduced = () => { try{ return matchMedia('(prefers-reduced-motion:reduce)').matches; }catch(e){ return false; } };

/* =====================================================================
   1. PARSER  — tokenizer (quotes, escapes) + flag/argument resolver
   ===================================================================== */
function tokenize(line){
 const out = []; let cur = '', quote = null, had = false;
 for(let i=0;i<line.length;i++){
  const ch = line[i];
  if(quote){
   if(ch==='\\' && (line[i+1]===quote || line[i+1]==='\\')) cur += line[++i];
   else if(ch===quote) quote = null;
   else cur += ch;
  } else if(ch==='"' || ch==="'"){ quote = ch; had = true; }
  else if(/\s/.test(ch)){ if(cur || had){ out.push(cur); cur = ''; had = false; } }
  else cur += ch;
 }
 if(quote) throw new Error(`unterminated quote (${quote})`);
 if(cur || had) out.push(cur);
 return out;
}

/* spec: { flagName:{ type:'bool'|'str'|'list', alias:['x'] } }
   - '-loc', '--loc', '--loc=lisbon' are all valid
   - 'list' flags swallow every following non-flag token ("new york")
   - '-6' is a value, not a flag (flags must start with a letter)       */
function parseArgs(tokens, spec = {}){
 const names = {};
 for(const [n,d] of Object.entries(spec)){ names[n.toLowerCase()] = n; (d.alias||[]).forEach(a => names[a.toLowerCase()] = n); }
 const isFlag = t => /^--?[A-Za-z_][\w-]*(=|$)/.test(t);
 const flags = {}, args = [], errors = [];
 for(let i=0;i<tokens.length;i++){
  const t = tokens[i];
  if(t === '--'){ args.push(...tokens.slice(i+1)); break; }
  if(!isFlag(t)){ args.push(t); continue; }
  const eq = t.indexOf('=');
  const raw = (eq<0 ? t : t.slice(0,eq)).replace(/^--?/,'').toLowerCase();
  const inline = eq<0 ? undefined : t.slice(eq+1);
  const key = names[raw];
  if(!key){ errors.push(`unknown flag '${eq<0?t:t.slice(0,eq)}'` + hint(raw, Object.keys(names))); continue; }
  const type = spec[key].type || 'bool';
  if(type === 'bool'){ flags[key] = inline === undefined ? true : !/^(0|false|no|off)$/i.test(inline); continue; }
  const vals = inline !== undefined ? [inline] : [];
  if(inline === undefined){
   // A list flag accepts one comma/space-delimited value token. Multi-word
   // strings must be quoted, so trailing words cannot be swallowed as data.
   if(i+1 < tokens.length && !isFlag(tokens[i+1]) && tokens[i+1] !== '--') vals.push(tokens[++i]);
  }
  if(!vals.length){ errors.push(`flag '${t}' needs a value`); continue; }
  flags[key] = type === 'list' ? vals.join(' ') : vals[0];
 }
 return { args, flags, errors };
}
const splitList = s => String(s||'').split(/[,\s]+/).filter(Boolean);

/* ---- fuzzy matching for "did you mean" ---- */
const lev = (a,b) => { a = String(a).toLowerCase(); b = String(b).toLowerCase(); const m = a.length, n = b.length; if(!m) return n; if(!n) return m;
 let prev = Array.from({length:n+1}, (_,j) => j);
 for(let i=1;i<=m;i++){ const cur = [i]; for(let j=1;j<=n;j++) cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1] ? 0 : 1)); prev = cur; }
 return prev[n]; };
const suggest = (word, pool, max = 3) => {
 const w = String(word).toLowerCase(), lim = Math.max(2, Math.ceil(w.length/3));
 return [...new Set(pool)].map(p => [p, p.toLowerCase().startsWith(w) ? 0 : lev(w,p)]).filter(([,d]) => d <= lim)
  .sort((x,y) => x[1]-y[1] || x[0].length-y[0].length).slice(0,max).map(x => x[0]);
};
const hint = (word, pool) => { const s = suggest(word, pool); return s.length ? ` — did you mean ${s.join(', ')}?` : ''; };

/* =====================================================================
   2. REGISTRIES  — add a command / metric / exporter with one call
   ===================================================================== */
class Registry{
 constructor(label){ this.label = label; this.map = new Map(); this.byName = new Map(); }
 register(name, def){
  def.name = name; this.map.set(name, def);
  [name, ...(def.alias||[])].forEach(n => this.byName.set(n.toLowerCase(), def));
  return this;
 }
 get(n){ return this.byName.get(String(n||'').toLowerCase()); }
 list(){ return [...this.map.values()]; }
 names(){ return [...this.byName.keys()].sort(); }
}
const commands  = new Registry('command');   // terminal commands
const metrics   = new Registry('metric');    // calc <metric>
const exporters = new Registry('format');    // export --format <fmt>

/* =====================================================================
   3. ATMOSPHERIC PHYSICS  (inputs: °C, %, hPa, km/h, m)
   ===================================================================== */
const Rd = 287.058, Rv = 461.495, KT = 1.943844;
const toK = c => c + 273.15;
const es = T => 6.112 * Math.exp(17.67*T/(T+243.5));                       // sat. vapour pressure, hPa
const vaporPressure = (T,RH) => RH/100 * es(T);                             // hPa
const dewPoint = (T,RH) => { const g = Math.log(Math.max(RH,.01)/100) + 17.625*T/(243.04+T); return 243.04*g/(17.625-g); };
const mixingRatio = (T,RH,p) => { const e = vaporPressure(T,RH); return 622*e/(p-e); };           // g/kg
const airDensity = (p,T,RH) => {
 const Tk = toK(T);
 if(!num(RH)) return p*100/(Rd*Tk);
 const e = vaporPressure(T,RH);
 return (p-e)*100/(Rd*Tk) + e*100/(Rv*Tk);
};
const wetBulb = (T,RH) => T*Math.atan(.151977*Math.sqrt(RH+8.313659)) + Math.atan(T+RH) - Math.atan(RH-1.676331) + .00391838*Math.pow(RH,1.5)*Math.atan(.023101*RH) - 4.686035; // Stull 2011
const lclTemp = (T,Td) => { const a = toK(T), b = toK(Td); return 1/(1/(b-56) + Math.log(a/b)/800) + 56; };            // K (Bolton 1980)
const theta = (T,p) => toK(T)*Math.pow(1000/p, .2854);
const thetaE = (T,Td,p,RH) => {
 const Tk = toK(T), TL = lclTemp(T,Td), r = mixingRatio(T,RH,p);
 return Tk*Math.pow(1000/p, .2854*(1-.28e-3*r)) * Math.exp((3.376/TL - .00254)*r*(1+.81e-3*r));
};
const heatIndexC = (T,RH) => {
 const t = T*9/5+32, r = RH;
 if(t < 80 || r < 40) return null;
 const hi = -42.379 + 2.04901523*t + 10.14333127*r - .22475541*t*r - 6.83783e-3*t*t - 5.481717e-2*r*r + 1.22874e-3*t*t*r + 8.5282e-4*t*r*r - 1.99e-6*t*t*r*r;
 return (hi-32)*5/9;
};
const windChillC = (T,v) => (T > 10 || v <= 4.8) ? null : 13.12 + .6215*T - 11.37*Math.pow(v,.16) + .3965*T*Math.pow(v,.16);
const pressureAlt = p => 44330.77*(1 - Math.pow(p/1013.25, .190263));      // m
const densityAlt = (p,T) => { const pa = pressureAlt(p); return pa + 36.576*(T - (15 - 6.5*pa/1000)); };
const soundSpeed = T => 331.3*Math.sqrt(1 + T/273.15);
const uv2xy = (spd,dir) => { const r = dir*Math.PI/180; return [-spd*Math.sin(r), -spd*Math.cos(r)]; };
const vecShear = (v1,d1,v2,d2) => { const a = uv2xy(v1,d1), b = uv2xy(v2,d2); return Math.hypot(b[0]-a[0], b[1]-a[1]); };   // km/h
const BEAUFORT = [1,6,12,20,29,39,50,62,75,89,103,118];
const beaufort = k => { let n = 0; while(n < BEAUFORT.length && k >= BEAUFORT[n]) n++; return n; };
const CARD = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const cardinal = d => num(d) ? CARD[Math.round(((d%360)+360)%360/22.5)%16] : '—';
const classify = (v, table) => { for(const [lim,txt] of table) if(v < lim) return txt; return table[table.length-1][1]; };
const CAPE_CLS = [[100,'none / negligible'],[1000,'marginal instability'],[2500,'moderate instability'],[4000,'strong instability'],[Infinity,'extreme instability']];
const UV_CLS = [[3,'low'],[6,'moderate'],[8,'high'],[11,'very high'],[Infinity,'extreme']];
const LI_CLS = [[-6,'extremely unstable'],[-3,'very unstable'],[0,'unstable'],[3,'marginally stable'],[Infinity,'stable']];

/* =====================================================================
   4. METRIC REGISTRY  — `calc <metric>`  (add yours with metrics.register)
      run(v, flags) -> { value, unit, d, inputs:[[label,val]], extra:[[label,val]], note }
      v = flat variable map for the chosen hour (+ elevation)
   ===================================================================== */
const need = (v, keys) => {
 const miss = keys.filter(k => !num(v[k]));
 if(miss.length) throw new Error(`missing input: ${miss.join(', ')} (run 'fetch' or pass --t / --rh / --p)`);
};
const tdOf = v => num(v.dew_point_2m) ? v.dew_point_2m : dewPoint(v.temperature_2m, v.relative_humidity_2m);

metrics
.register('air_density', { group:'thermo', alias:['rho','density'], formula:'ρ = p / (R·T)    R = 287.058 J/(kg·K)',
 summary:'Air density from surface pressure & temperature (--moist = humid air)',
 run(v,f){
  need(v,['surface_pressure','temperature_2m']);
  const dry = airDensity(v.surface_pressure, v.temperature_2m);
  const wet = num(v.relative_humidity_2m) ? airDensity(v.surface_pressure, v.temperature_2m, v.relative_humidity_2m) : null;
  const main = f.moist && num(wet) ? wet : dry;
  return { value:main, unit:'kg/m³', d:4,
   inputs:[['p', fmt(v.surface_pressure,1)+' hPa'],['T', fmt(v.temperature_2m,1)+' °C ('+fmt(toK(v.temperature_2m),2)+' K)']],
   extra:[['dry-air ρ', fmt(dry,4)+' kg/m³'], ['humid-air ρ', num(wet)?fmt(wet,4)+' kg/m³':'—'], ['vs ISA sea level (1.2250)', fmt(main/1.225*100,1)+' %']],
   note: f.moist ? 'humid air: partial pressures of dry air + vapour' : 'dry-air approximation (add --moist for humid air)' };
 }})
.register('dew_point', { group:'thermo', alias:['dew','td'], formula:'Td = c·γ/(b−γ),  γ = ln(RH/100) + b·T/(c+T)   (b=17.625, c=243.04)',
 summary:'Dew point from temperature & relative humidity (Magnus formula)',
 run(v){
  need(v,['temperature_2m','relative_humidity_2m']);
  const td = dewPoint(v.temperature_2m, v.relative_humidity_2m);
  return { value:td, unit:'°C', d:1,
   inputs:[['T', fmt(v.temperature_2m,1)+' °C'],['RH', fmt(v.relative_humidity_2m,0)+' %']],
   extra:[['spread T−Td', fmt(v.temperature_2m-td,1)+' °C'],['vapour pressure e', fmt(vaporPressure(v.temperature_2m,v.relative_humidity_2m),2)+' hPa'],['API dew_point_2m', num(v.dew_point_2m)?fmt(v.dew_point_2m,1)+' °C':'—']],
   note: td > 20 ? 'oppressive' : td > 16 ? 'humid' : td > 10 ? 'comfortable' : td > 0 ? 'dry' : 'very dry' };
 }})
.register('lcl', { group:'thermo', alias:['cloud_base'], formula:'LCL ≈ 125·(T − Td)  m AGL   (Espy)   ·  T_LCL by Bolton (1980)',
 summary:'Lifting Condensation Level (estimated cloud-base height)',
 run(v){
  need(v,['temperature_2m']);
  const T = v.temperature_2m, Td = tdOf(v);
  if(!num(Td)) throw new Error('missing input: dew point (need relative_humidity_2m)');
  const h = Math.max(0, 125*(T-Td)), TL = lclTemp(T,Td);
  const pL = num(v.surface_pressure) ? v.surface_pressure*Math.pow(TL/toK(T), 3.5) : null;
  return { value:h, unit:'m AGL', d:0,
   inputs:[['T', fmt(T,1)+' °C'],['Td', fmt(Td,1)+' °C']],
   extra:[['LCL (ASL)', num(v.elevation) ? fmt(h+v.elevation,0)+' m' : '—'],['T at LCL', fmt(TL-273.15,1)+' °C'],['p at LCL', fmt(pL,0)+' hPa']],
   note: h < 300 ? 'fog / very low stratus likely' : h < 1000 ? 'low cloud base' : h < 2500 ? 'typical cumulus base' : 'high base, dry boundary layer' };
 }})
.register('wet_bulb', { group:'thermo', alias:['tw'], formula:'Tw — Stull (2011) empirical fit, valid RH 5–99 %, T −20…50 °C',
 summary:'Wet-bulb temperature',
 run(v){ need(v,['temperature_2m','relative_humidity_2m']);
  const tw = wetBulb(v.temperature_2m, v.relative_humidity_2m);
  return { value:tw, unit:'°C', d:1, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['RH',fmt(v.relative_humidity_2m,0)+' %']],
   note: tw >= 31 ? 'extreme heat stress (limit of human survivability ≈ 35 °C)' : tw >= 28 ? 'dangerous heat stress' : 'below heat-stress thresholds' }; }})
.register('theta', { group:'thermo', alias:['potential_temp'], formula:'θ = T·(1000/p)^0.2854',
 summary:'Potential temperature',
 run(v){ need(v,['temperature_2m','surface_pressure']);
  const th = theta(v.temperature_2m, v.surface_pressure);
  return { value:th, unit:'K', d:2, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['p',fmt(v.surface_pressure,1)+' hPa']], extra:[['θ in °C', fmt(th-273.15,2)+' °C']] }; }})
.register('theta_e', { group:'thermo', alias:['equiv_pot_temp'], formula:'θe — Bolton (1980) eq. 43',
 summary:'Equivalent potential temperature (moist-static energy proxy)',
 run(v){ need(v,['temperature_2m','relative_humidity_2m','surface_pressure']);
  const te = thetaE(v.temperature_2m, tdOf(v), v.surface_pressure, v.relative_humidity_2m);
  return { value:te, unit:'K', d:1, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['Td',fmt(tdOf(v),1)+' °C'],['p',fmt(v.surface_pressure,1)+' hPa']],
   note: te > 345 ? 'very high — tropical-like air mass, strong convective potential' : te > 330 ? 'warm & moist' : 'moderate / dry air mass' }; }})
.register('mixing_ratio', { group:'thermo', alias:['w'], formula:'r = 622·e / (p − e)   [g/kg]',
 summary:'Water-vapour mixing ratio',
 run(v){ need(v,['temperature_2m','relative_humidity_2m','surface_pressure']);
  return { value:mixingRatio(v.temperature_2m, v.relative_humidity_2m, v.surface_pressure), unit:'g/kg', d:2,
   inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['RH',fmt(v.relative_humidity_2m,0)+' %'],['p',fmt(v.surface_pressure,1)+' hPa']] }; }})
.register('vapor_pressure', { group:'thermo', alias:['vp','e'], formula:'e = RH/100 · es(T),  es = 6.112·exp(17.67T/(T+243.5))',
 summary:'Actual & saturation vapour pressure, VPD',
 run(v){ need(v,['temperature_2m','relative_humidity_2m']);
  const s = es(v.temperature_2m), e = vaporPressure(v.temperature_2m, v.relative_humidity_2m);
  return { value:e, unit:'hPa', d:2, inputs:[['T',fmt(v.temperature_2m,1)+' °C'],['RH',fmt(v.relative_humidity_2m,0)+' %']],
   extra:[['saturation es', fmt(s,2)+' hPa'],['deficit (VPD)', fmt((s-e)/10,2)+' kPa'],['abs. humidity', fmt(e*100/(Rv*toK(v.temperature_2m))*1000,2)+' g/m³']] }; }})
.register('heat_index', { group:'comfort', alias:['hi'], formula:'Rothfusz regression (NWS) — valid for T ≥ 27.0 °C and RH ≥ 40 %',
 summary:'Heat index & apparent thermal deviation',
 run(v){
  need(v,['temperature_2m','relative_humidity_2m']);
  const T = v.temperature_2m, RH = v.relative_humidity_2m;
  if(T < 27.0 || RH < 40){
   return { value:T, unit:'°C', d:1, inputs:[['T',fmt(T,1)+' °C'],['RH',fmt(RH,0)+' %']],
    extra:[['ΔT (deviation)', '0.0 °C'],['status', 'outside heat index threshold (T < 27°C or RH < 40%)']],
    note:'Heat index is equal to dry-bulb temperature below threshold' };
  }
  const hi = heatIndexC(T, RH);
  const diff = hi - T;
  const risk = hi >= 54 ? 'EXTREME DANGER (heat stroke imminent)' :
               hi >= 41 ? 'DANGER (cramps, exhaustion & heat stroke likely)' :
               hi >= 32 ? 'EXTREME CAUTION (cramps & exhaustion possible)' : 'CAUTION (fatigue with prolonged activity)';
  return { value:hi, unit:'°C', d:1,
   inputs:[['T',fmt(T,1)+' °C'],['RH',fmt(RH,0)+' %']],
   extra:[['ΔT (deviation)', `${diff>=0?'+':''}${diff.toFixed(1)} °C`],
          ['thermal stress', risk],
          ['apparent_temperature (model)', num(v.apparent_temperature)?fmt(v.apparent_temperature,1)+' °C':'—']],
   note: `Humid air impedes evaporative cooling: thermal load is increased by ${diff.toFixed(1)} °C` };
 }})
.register('wind_chill', { group:'comfort', alias:['wc'], formula:'JAG/TI (2001) formula — valid for T ≤ 10.0 °C and wind ≥ 4.8 km/h',
 summary:'Wind chill factor & convective convective thermal loss',
 run(v){
  need(v,['temperature_2m','wind_speed_10m']);
  const T = v.temperature_2m, spd = v.wind_speed_10m;
  if(T > 10.0 || spd < 4.8){
   return { value:T, unit:'°C', d:1, inputs:[['T',fmt(T,1)+' °C'],['wind',fmt(spd,1)+' km/h']],
    extra:[['ΔT (deviation)', '0.0 °C'],['status', 'outside wind chill threshold (T > 10°C or wind < 4.8 km/h)']],
    note:'Wind chill is equal to ambient temperature under mild/calm conditions' };
  }
  const wc = windChillC(T, spd);
  const diff = wc - T;
  const frostbite = wc <= -40 ? 'SEVERE (frostbite in < 10 minutes)' :
                    wc <= -28 ? 'HIGH RISK (frostbite in ~30 minutes)' :
                    wc <= -15 ? 'MODERATE (hypothermia risk with prolonged exposure)' : 'LOW RISK';
  return { value:wc, unit:'°C', d:1,
   inputs:[['T',fmt(T,1)+' °C'],['wind',fmt(spd,1)+' km/h']],
   extra:[['ΔT (deviation)', `${diff.toFixed(1)} °C`],
          ['frostbite risk', frostbite],
          ['apparent_temperature (model)', num(v.apparent_temperature)?fmt(v.apparent_temperature,1)+' °C':'—']],
   note: `Forced aerodynamic convection accelerates sensible heat loss by ${Math.abs(diff).toFixed(1)} °C` };
 }})
.register('shear', { group:'dynamics', alias:['wind_shear'], formula:'|V80 − V10| (vector difference) / 70 m',
 summary:'Low-level vector wind shear, 10 m → 80 m',
 run(v){ need(v,['wind_speed_10m','wind_direction_10m','wind_speed_80m','wind_direction_80m']);
  const dv = vecShear(v.wind_speed_10m, v.wind_direction_10m, v.wind_speed_80m, v.wind_direction_80m)/3.6;
  return { value:dv, unit:'m/s (10→80 m)', d:2,
   inputs:[['V10', fmt(v.wind_speed_10m,1)+' km/h @ '+fmt(v.wind_direction_10m,0)+'°'],['V80', fmt(v.wind_speed_80m,1)+' km/h @ '+fmt(v.wind_direction_80m,0)+'°']],
   extra:[['gradient', fmt(dv/70*1000,2)+' ×10⁻³ s⁻¹'],['gradient', fmt(dv*KT/70*100,2)+' kt/100 m'],['speed ratio V80/V10', fmt(v.wind_speed_80m/Math.max(v.wind_speed_10m,.1),2)]],
   note: dv/70 > .02 ? 'strong low-level shear' : dv/70 > .01 ? 'moderate shear' : 'weak shear' }; }})
.register('beaufort', { group:'dynamics', alias:['bf'], formula:'Beaufort scale from 10 m wind speed',
 summary:'Beaufort number & description',
 run(v){ need(v,['wind_speed_10m']);
  const n = beaufort(v.wind_speed_10m);
  const names = ['calm','light air','light breeze','gentle breeze','moderate breeze','fresh breeze','strong breeze','near gale','gale','strong gale','storm','violent storm','hurricane force'];
  return { value:n, unit:'Bft', d:0, inputs:[['wind',fmt(v.wind_speed_10m,1)+' km/h']], extra:[['gust', fmt(v.wind_gusts_10m,1)+' km/h'],['direction', fmt(v.wind_direction_10m,0)+'° '+cardinal(v.wind_direction_10m)]], note:names[n] }; }})
.register('pressure_alt', { group:'aviation', alias:['pa'], formula:'PA = 44330.77·(1 − (p/1013.25)^0.190263)',
 summary:'Pressure altitude',
 run(v){ need(v,['surface_pressure']);
  const pa = pressureAlt(v.surface_pressure);
  return { value:pa, unit:'m', d:0, inputs:[['p',fmt(v.surface_pressure,1)+' hPa']], extra:[['feet', fmt(pa*3.28084,0)+' ft']] }; }})
.register('density_alt', { group:'aviation', alias:['da'], formula:'DA = PA + 36.576·(T − T_ISA)   [m]',
 summary:'Density altitude (aircraft / drone performance)',
 run(v){ need(v,['surface_pressure','temperature_2m']);
  const da = densityAlt(v.surface_pressure, v.temperature_2m);
  return { value:da, unit:'m', d:0, inputs:[['p',fmt(v.surface_pressure,1)+' hPa'],['T',fmt(v.temperature_2m,1)+' °C']], extra:[['feet', fmt(da*3.28084,0)+' ft'],['pressure alt', fmt(pressureAlt(v.surface_pressure),0)+' m']] }; }})
.register('sound_speed', { group:'aviation', alias:['mach'], formula:'c = 331.3·√(1 + T/273.15)',
 summary:'Speed of sound',
 run(v){ need(v,['temperature_2m']);
  return { value:soundSpeed(v.temperature_2m), unit:'m/s', d:1, inputs:[['T',fmt(v.temperature_2m,1)+' °C']], extra:[['km/h', fmt(soundSpeed(v.temperature_2m)*3.6,0)]] }; }})
.register('cape', { group:'convection', formula:'CAPE from the model (J/kg) + stability classification',
 summary:'Convective Available Potential Energy (model value) with CIN & lifted index',
 run(v){ need(v,['cape']);
  return { value:v.cape, unit:'J/kg', d:0, inputs:[['model','best_match']],
   extra:[['CIN', fmt(v.convective_inhibition,0)+' J/kg'],['lifted index', fmt(v.lifted_index,1)+(num(v.lifted_index)?'  ('+classify(v.lifted_index,LI_CLS)+')':'')],['max updraft √(2·CAPE)', fmt(Math.sqrt(2*Math.max(v.cape,0)),1)+' m/s']],
   note: classify(v.cape, CAPE_CLS) }; }})
.register('uv', { group:'radiation', alias:['uv_index'], formula:'WHO UV-index categories',
 summary:'UV index & category, with clear-sky comparison',
 
 run(v){ need(v,['uv_index']);
  return { value:v.uv_index, unit:'UVI', d:1, inputs:[['model','best_match']],
   extra:[['clear-sky UVI', fmt(v.uv_index_clear_sky,1)],['cloud attenuation', num(v.uv_index_clear_sky)&&v.uv_index_clear_sky>0 ? fmt((1-v.uv_index/v.uv_index_clear_sky)*100,0)+' %' : '—']],
   note: classify(v.uv_index, UV_CLS) }; }})

.register('solar_budget', { group:'radiation', alias:['solar_flux','rad_budget','irradiance'], formula:'Erbs (1982) decomposition + Brutsaert downwelling longwave',
 summary:'Surface radiative budget (Direct, Diffuse, GHI, Clearness Index & Net Flux)',
 run(v, f){
  need(v,['temperature_2m']);
  const lat = (v.latitude !== undefined ? v.latitude : (f.lat !== undefined ? +f.lat : 41.15));
  const tC = v.temperature_2m;
  const ghi = num(v.shortwave_radiation) ? Math.max(0, v.shortwave_radiation) : 0;
  const clouds = num(v.cloud_cover) ? v.cloud_cover : 0;
  
  // Calculate approximate Solar Zenith Angle
  const dateObj = new Date(v.time || Date.now());
  const dayOfYear = Math.floor((dateObj - new Date(dateObj.getFullYear(), 0, 0)) / 864e5);
  const hour = dateObj.getUTCHours() + dateObj.getUTCMinutes() / 60;
  const delta = 23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear - 172)) * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  const omega = (15 * (hour - 12)) * (Math.PI / 180);
  const cosZenith = Math.max(0, Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(omega));
  const zenithDeg = Math.acos(cosZenith) * (180 / Math.PI);
  
  // Extraterrestrial Irradiance on Horizontal Surface (G0)
  const I0 = 1361.0; // Solar constant W/m2
  const g0 = I0 * cosZenith;
  const kt = g0 > 10 ? Math.min(1.0, ghi / g0) : 0; // Clearness Index
  
  // Erbs decomposition model for Diffuse Fraction (DHI / GHI)
  let dhi = 0;
  if(ghi > 0 && g0 > 10){
    const df = kt <= 0.22 ? (1.0 - 0.09 * kt) :
               kt <= 0.80 ? (0.9511 - 0.1604 * kt + 4.388 * Math.pow(kt, 2) - 16.638 * Math.pow(kt, 3) + 12.336 * Math.pow(kt, 4)) : 0.165;
    dhi = Math.min(ghi, ghi * df);
  }
  const dni = cosZenith > 0.08 ? Math.max(0, (ghi - dhi) / cosZenith) : 0;
  
  // Net Shortwave Absorbed (Albedo alpha ≈ 0.18 for standard ground)
  const albedo = 0.18;
  const netShortwave = ghi * (1 - albedo);
  
  // Downwelling Longwave (Brutsaert clear sky + cloud correction)
  const Tk = toK(tC);
  const vp = num(v.relative_humidity_2m) ? vaporPressure(tC, v.relative_humidity_2m) : 10;
  const epsClear = 1.24 * Math.pow(vp / Tk, 1 / 7);
  const epsEff = epsClear * (1 + 0.22 * Math.pow(clouds / 100, 2));
  const sigmaSB = 5.670374e-8;
  const lwDown = epsEff * sigmaSB * Math.pow(Tk, 4);
  const lwUp = 0.98 * sigmaSB * Math.pow(Tk, 4);
  const netRadiation = netShortwave + (lwDown - lwUp);

  return {
    value: ghi, unit:'W/m²', d:0,
    inputs:[
      ['GHI (Global Horiz.)', fmt(ghi, 0) + ' W/m²'],
      ['Cloud Cover', fmt(clouds, 0) + ' %'],
      ['Solar Zenith', fmt(zenithDeg, 1) + '° (' + (cosZenith <= 0 ? 'Night / Below Horizon' : 'Daylight') + ')']
    ],
    extra:[
      ['Direct Normal (DNI)', fmt(dni, 0) + ' W/m²'],
      ['Diffuse Horiz. (DHI)', fmt(dhi, 0) + ' W/m²'],
      ['Clearness Index (k_t)', fmt(kt, 3) + (kt > 0.65 ? ' [Clear Beam]' : kt > 0.35 ? ' [Intermittent/Partly]' : ' [Overcast/Attenuated]')],
      ['Extraterrestrial G₀', fmt(g0, 0) + ' W/m²'],
      ['Net Shortwave Absorbed', fmt(netShortwave, 0) + ' W/m² (albedo α=0.18)'],
      ['Downwelling Longwave', fmt(lwDown, 0) + ' W/m²'],
      ['Net All-Wave Radiation (R_n)', `${netRadiation >= 0 ? '+' : ''}${fmt(netRadiation, 0)} W/m²`]
    ],
    note: netRadiation > 0 ? 'Surface energy surplus (driving upward sensible & latent heat flux)' : 'Surface radiative cooling deficit (nighttime/inversion regime)'
  };
 }})

   
   

/* derived values used by compare / export / now */
const derivedOf = v => {
 const o = {};
 for(const k of ['air_density','dew_point','lcl','wet_bulb','theta','theta_e','mixing_ratio','shear','pressure_alt','density_alt','sound_speed']){
  try{ o[k] = metrics.get(k).run(v,{}).value; }catch(e){ o[k] = null; }
 }
 return o;
};

/* =====================================================================
   5. DATA LAYER  — async, cached, auto-prunes variables the API rejects
   ===================================================================== */
const HOURLY = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m','surface_pressure','pressure_msl',
 'precipitation','precipitation_probability','rain','snowfall','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','visibility',
 'wind_speed_10m','wind_direction_10m','wind_gusts_10m','wind_speed_80m','wind_direction_80m',
 'shortwave_radiation','direct_normal_irradiance','diffuse_radiation','uv_index','uv_index_clear_sky',
 'cape','lifted_index','convective_inhibition','freezing_level_height','boundary_layer_height','vapor_pressure_deficit','et0_fao_evapotranspiration',
 'soil_temperature_0cm','soil_moisture_0_to_1cm',
 'temperature_850hPa','temperature_500hPa','relative_humidity_850hPa','relative_humidity_500hPa','wind_speed_850hPa','wind_speed_500hPa',
 'wind_direction_850hPa','wind_direction_500hPa','geopotential_height_850hPa','geopotential_height_500hPa'];
const CURRENT = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m','surface_pressure','pressure_msl','wind_speed_10m','wind_direction_10m',
 'wind_gusts_10m','wind_speed_80m','wind_direction_80m','shortwave_radiation','direct_normal_irradiance','diffuse_radiation','vapor_pressure_deficit','cloud_cover','precipitation'];
const DAILY = ['temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_speed_10m_max','wind_gusts_10m_max',
 'uv_index_max','sunrise','sunset','daylight_duration','shortwave_radiation_sum','et0_fao_evapotranspiration'];
const UNITS = { temperature_2m:'°C',apparent_temperature:'°C',relative_humidity_2m:'%',dew_point_2m:'°C',surface_pressure:'hPa',pressure_msl:'hPa',precipitation:'mm',precipitation_probability:'%',
 rain:'mm',snowfall:'cm',cloud_cover:'%',cloud_cover_low:'%',cloud_cover_mid:'%',cloud_cover_high:'%',visibility:'m',wind_speed_10m:'km/h',wind_direction_10m:'°',wind_gusts_10m:'km/h',
 wind_speed_80m:'km/h',wind_direction_80m:'°',shortwave_radiation:'W/m²',direct_normal_irradiance:'W/m²',diffuse_radiation:'W/m²',uv_index:'',uv_index_clear_sky:'',cape:'J/kg',lifted_index:'',
 convective_inhibition:'J/kg',freezing_level_height:'m',boundary_layer_height:'m',vapor_pressure_deficit:'kPa',et0_fao_evapotranspiration:'mm',soil_temperature_0cm:'°C',soil_moisture_0_to_1cm:'m³/m³',
 temperature_850hPa:'°C',temperature_500hPa:'°C',relative_humidity_850hPa:'%',relative_humidity_500hPa:'%',wind_speed_850hPa:'km/h',wind_speed_500hPa:'km/h',wind_direction_850hPa:'°',
 wind_direction_500hPa:'°',geopotential_height_850hPa:'m',geopotential_height_500hPa:'m' };
const ALIAS = { temp:'temperature_2m', t:'temperature_2m', feels:'apparent_temperature', apparent:'apparent_temperature', rh:'relative_humidity_2m', humidity:'relative_humidity_2m',
 dew:'dew_point_2m', dewpoint:'dew_point_2m', pressure:'surface_pressure', p:'surface_pressure', msl:'pressure_msl', wind:'wind_speed_10m', gust:'wind_gusts_10m', gusts:'wind_gusts_10m',
 wind80:'wind_speed_80m', precip:'precipitation', pop:'precipitation_probability', cloud:'cloud_cover', clouds:'cloud_cover', cloud_low:'cloud_cover_low', cloud_mid:'cloud_cover_mid',
 cloud_high:'cloud_cover_high', vis:'visibility', ghi:'shortwave_radiation', solar:'shortwave_radiation', sw:'shortwave_radiation', dni:'direct_normal_irradiance', dhi:'diffuse_radiation',
 uv:'uv_index', li:'lifted_index', cin:'convective_inhibition', freezing:'freezing_level_height', pblh:'boundary_layer_height', vpd:'vapor_pressure_deficit', et0:'et0_fao_evapotranspiration',
 soil_moisture:'soil_moisture_0_to_1cm', soil_temp:'soil_temperature_0cm', t850:'temperature_850hPa', t500:'temperature_500hPa', z500:'geopotential_height_500hPa', z850:'geopotential_height_850hPa' };
const DEFAULT_EXPORT = ['temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m','surface_pressure','pressure_msl','wind_speed_10m','wind_direction_10m',
 'wind_gusts_10m','cloud_cover','precipitation','shortwave_radiation','uv_index','cape','soil_moisture_0_to_1cm','visibility'];

const cache = new Map();
const hourlyLinear = (i,base,amp,ph,lo,hi) => Math.min(hi, Math.max(lo, base + amp*Math.sin(2*Math.PI*((i%24)-ph)/24) + 0.35*amp*Math.sin(i*1.7)));
function mockWeather(pl){
 const t0 = new Date(); t0.setMinutes(0,0,0); t0.setHours(t0.getHours()-48);
 const N = 216, time = Array.from({length:N}, (_,i) => isoLocal(new Date(t0.getTime()+i*3600e3)));
 const M = { temperature_2m:[16,6,9,-5,45], relative_humidity_2m:[62,22,21,5,100], surface_pressure:[1008,4,3,950,1050], wind_speed_10m:[14,8,13,0,80], wind_speed_80m:[22,11,13,0,110],
  shortwave_radiation:[220,260,6,0,950], cape:[300,350,15,0,3500], uv_index:[3,3.2,6,0,11], cloud_cover:[45,30,2,0,100], soil_moisture_0_to_1cm:[.24,.01,3,.05,.45],
  boundary_layer_height:[700,550,8,50,2500], visibility:[24000,6000,5,500,40000], precipitation_probability:[20,18,0,0,100] };
 const hourly = { time };
 for(const k of HOURLY){
  const m = M[k] || (k.startsWith('temperature_8')?[8,2,9,-30,30]: k.startsWith('temperature_5')?[-18,2,9,-50,0]: k.startsWith('geopotential_height_8')?[1500,20,3,1000,2000]: k.startsWith('geopotential_height_5')?[5700,30,3,5000,6000]:
   k.startsWith('wind_speed_')?[40,15,5,0,200]: k.startsWith('wind_direction')?[270,40,5,0,359]: k.startsWith('relative_humidity_')?[50,15,3,0,100]: [0,0,0,-1e9,1e9]);
  hourly[k] = time.map((_,i) => { const x = hourlyLinear(i, ...m); return +x.toFixed(2); });
 }
 hourly.dew_point_2m = hourly.temperature_2m.map((T,i) => +dewPoint(T, Math.max(hourly.relative_humidity_2m[i],5)).toFixed(1));
 hourly.apparent_temperature = hourly.temperature_2m.map(T => +(T-1).toFixed(1));
 hourly.pressure_msl = hourly.surface_pressure.map(p => +(p+11).toFixed(1));
 hourly.wind_gusts_10m = hourly.wind_speed_10m.map(w => +(w*1.6).toFixed(1));
 hourly.wind_direction_10m = hourly.wind_direction_10m.map(d => Math.round(d));
 const days = Array.from({length:9}, (_,d) => time[d*24].slice(0,10));
 const daily = { time:days, temperature_2m_max:days.map((_,i)=>21+Math.sin(i)*2), temperature_2m_min:days.map((_,i)=>13+Math.cos(i)*2), precipitation_sum:days.map((_,i)=>+(i%3?0:2.4).toFixed(1)),
  precipitation_probability_max:days.map((_,i)=>i%3?10:60), wind_speed_10m_max:days.map((_,i)=>22+i), wind_gusts_10m_max:days.map((_,i)=>41+i), uv_index_max:days.map(()=>5.6),
  sunrise:days.map(d=>d+'T07:12'), sunset:days.map(d=>d+'T18:55'), daylight_duration:days.map(()=>42180), shortwave_radiation_sum:days.map(()=>14.2), et0_fao_evapotranspiration:days.map(()=>2.1) };
 const cur = { time: time[48] }; for(const k of CURRENT) cur[k] = hourly[k] ? hourly[k][48] : null;
 return { latitude:pl.lat, longitude:pl.lon, elevation:42, timezone:'mock/UTC', utc_offset_seconds:0, hourly_units:{...UNITS}, hourly, daily, current:cur, _mock:true };
}

async function resolvePlace(name){
 const n = String(name||'').trim();
 if(!n || /^(here|\.|current)$/i.test(n)){
  if(typeof place !== 'undefined' && place) return { lat:place.lat, lon:place.lon, name:place.name, sub:place.sub||'' };
  throw new Error('no location selected in SkyLab yet');
 }
 const m = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(n);
 if(m){
  if(Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) throw new Error(`coordinates out of range: latitude must be -90…90 and longitude -180…180 (got ${m[1]}, ${m[2]})`);
  return { lat:+m[1], lon:+m[2], name:`${(+m[1]).toFixed(3)},${(+m[2]).toFixed(3)}`, sub:'coordinates' };
 }
 if(n.length < 2 || !/\p{L}/u.test(n)) throw new Error(`'${n}' is not a place name or a lat,lon pair`);
 const r = await geo(n, 5);
 if(!r.length) throw new Error(`location not found: "${n}"`);
 const flat = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const q = flat(n), hit = r.find(x => { const f = flat(x.name); return f.includes(q) || q.includes(f); });
 return hit || { ...r[0], fuzzy:true };
}

async function fetchWeather(pl, { refresh=false } = {}){
 const key = `${pl.lat.toFixed(2)},${pl.lon.toFixed(2)}${CFG.mock?'#m':''}`;
 const hit = cache.get(key);
 if(hit && !refresh && Date.now()-hit.t < CFG.cacheMs) return { raw:hit.raw, cached:true, dropped:hit.dropped };
 if(CFG.mock){ await sleep(180); const raw = mockWeather(pl); cache.set(key,{t:Date.now(),raw,dropped:[]}); return { raw, cached:false, dropped:[] }; }
 let hv = [...HOURLY], cv = [...CURRENT], dv = [...DAILY]; const dropped = [];
 for(let tries=0; tries<6; tries++){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pl.lat}&longitude=${pl.lon}&current=${cv.join(',')}&hourly=${hv.join(',')}&daily=${dv.join(',')}&timezone=auto&past_days=2&forecast_days=7`;
  const r = await fetch(url);
  if(r.ok){ const raw = await r.json(); cache.set(key,{t:Date.now(),raw,dropped}); return { raw, cached:false, dropped }; }
  let j = {}; try{ j = await r.json(); }catch(e){}
  const bad = /value\s+'?([A-Za-z0-9_]+)'?/.exec(j.reason||'');
  if(r.status === 400 && bad && [...hv,...cv,...dv].includes(bad[1])){
   dropped.push(bad[1]); hv = hv.filter(x=>x!==bad[1]); cv = cv.filter(x=>x!==bad[1]); dv = dv.filter(x=>x!==bad[1]); continue;
  }
  throw new Error(j.reason || `Open-Meteo HTTP ${r.status}`);
 }
 throw new Error('Open-Meteo rejected too many variables');
}

function buildCtx(pl, raw, extra={}){
 const h = raw.hourly, ct = ((raw.current && raw.current.time) || h.time[0]).slice(0,13)+':00';
 let i0 = h.time.findIndex(t => t >= ct); if(i0 < 0) i0 = 0;
 return { place:pl, raw, i0, fetchedAt:new Date(), ...extra };
}
const hourAt = (ctx,i) => { const o = { time:ctx.raw.hourly.time[i], elevation:ctx.raw.elevation }; for(const k in ctx.raw.hourly) if(k !== 'time') o[k] = ctx.raw.hourly[k][i]; return o; };
const nowVals = ctx => { const o = hourAt(ctx, ctx.i0), c = ctx.raw.current || {}; for(const k in c) if(c[k] !== null && c[k] !== undefined && k !== 'interval') o[k] = c[k]; return o; };
const unitOf = (ctx,k) => (ctx && ctx.raw.hourly_units && ctx.raw.hourly_units[k] !== undefined) ? ctx.raw.hourly_units[k] : (UNITS[k] ?? '');
const resolveVar = (ctx,name) => {
 const n = String(name).toLowerCase(), h = ctx.raw.hourly, k = ALIAS[n] || n;
 if(k !== 'time' && h[k]) return k;
 const m = Object.keys(h).filter(x => x !== 'time' && x.startsWith(n));
 return m.length === 1 ? m[0] : null;
};
const resolveVars = (ctx,str) => {
 const ok = [], bad = [];
 splitList(str).forEach(n => { const k = resolveVar(ctx,n); k ? (ok.includes(k)||ok.push(k)) : bad.push(n); });
 if(bad.length){ const pool = varNamesFor(ctx);
  throw new Error(`unknown variable${bad.length>1?'s':''}: ${bad.map(b => `'${b}'` + hint(b,pool)).join('; ')}  (list them with: vars)`); }
 if(!ok.length) throw new Error('no variable given (see: vars)');
 return { ok, bad };
};
const varNamesFor = ctx => ctx ? [...Object.keys(ctx.raw.hourly).filter(k=>k!=='time'), ...Object.keys(ALIAS)] : Object.keys(ALIAS);
const hhmm = s => (s||'').slice(11,16);
const needCtx = t => { if(!t.ctx) throw new Error("no context loaded — run: fetch -loc <city>"); return t.ctx; };
const winIdx = (ctx, from, hours) => { const n = ctx.raw.hourly.time.length; const a = Math.max(0, Math.min(n-1, from)), b = Math.max(a+1, Math.min(n, from+hours)); return [a,b]; };
const stats = a => {
 const v = a.filter(num); if(!v.length) return null;
 const mean = v.reduce((s,x)=>s+x,0)/v.length, sd = Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length);
 const sorted = [...v].sort((x,y)=>x-y), med = sorted.length%2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
 const n = v.length, xs = v.map((_,i)=>i), mx = (n-1)/2; let sxy = 0, sxx = 0; v.forEach((y,i)=>{ sxy += (xs[i]-mx)*(y-mean); sxx += (xs[i]-mx)**2; });
 return { n, min:Math.min(...v), max:Math.max(...v), mean, sd, med, slope: sxx ? sxy/sxx : 0 };
};

/* =====================================================================
   6. ASCII CHARTS
   ===================================================================== */
const BARS = '▁▂▃▄▅▆▇█';
function sparkline(vals, lo, hi){
 const v = vals.filter(num); if(!v.length) return '';
 const mn = lo ?? Math.min(...v), mx = hi ?? Math.max(...v);
 return vals.map(x => !num(x) ? ' ' : BARS[mx === mn ? 3 : Math.max(0, Math.min(7, Math.round((x-mn)/(mx-mn)*7)))]).join('');
}
function blockChart(vals, rows){
 const v = vals.filter(num), mn = Math.min(...v), mx = Math.max(...v), out = [];
 for(let r = rows-1; r >= 0; r--){
  out.push(vals.map(x => { if(!num(x)) return ' '; const lvl = mx===mn ? rows*4 : (x-mn)/(mx-mn)*rows*8; const e = Math.max(0, Math.min(8, Math.round(lvl - r*8))); return e ? BARS[e-1] : ' '; }).join(''));
 }
 return out;
}
function timeAxis(times, step=6){
 const a = Array(times.length).fill(' ');
 times.forEach((t,i) => { if(i % step === 0){ const lab = t.slice(11,13); a[i] = lab[0]; if(i+1 < a.length) a[i+1] = lab[1]; } });
 return a.join('');
}

/* JSON as a collapsible tree (details/summary) */
function jsonTree(v, open = 1, key = null){
 const k = key === null ? '' : `<span class="tk-key">${esc(JSON.stringify(key))}</span>: `;
 if(v === null || v === undefined) return k + '<span class="tk-null">null</span>';
 if(typeof v === 'string') return k + `<span class="tk-str">${esc(JSON.stringify(v))}</span>`;
 if(typeof v === 'number') return k + `<span class="tk-num">${v}</span>`;
 if(typeof v === 'boolean') return k + `<span class="tk-bool">${v}</span>`;
 const arr = Array.isArray(v), ent = arr ? v.map((x,i)=>[i,x]) : Object.entries(v), o = arr ? '[' : '{', c = arr ? ']' : '}';
 if(!ent.length) return k + o + c;
 if(arr && v.length > 8 && v.every(x => x === null || typeof x !== 'object'))
  return `<details class="jt"><summary>${k}${o}<span class="tk-null"> ${v.length} items · ${esc(v.slice(0,4).join(', '))}, … </span>${c}</summary><div class="jt-in">${esc(v.join(', '))}</div></details>`;
 return `<details class="jt"${open>0?' open':''}><summary>${k}${o}<span class="tk-null"> ${ent.length} ${arr?'items':'keys'}</span></summary><div class="jt-in">${ent.map(([kk,x]) => `<div>${jsonTree(x, open-1, arr?null:kk)}</div>`).join('')}</div><div class="jt-end">${c}</div></details>`;
}

/* =====================================================================
   7. OUTPUT RENDERER  — stdout-style blocks appended to the DOM
   ===================================================================== */
function textTable(head, rows, align = []){
 const w = head.map((h,i) => Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length)));
 const cell = (s,i) => align[i] === 'r' ? String(s).padStart(w[i]) : String(s).padEnd(w[i]);
 const line = r => r.map((c,i) => cell(c ?? '', i)).join('  ').replace(/\s+$/,'');
 return { head:line(head), sep:w.map(n => '─'.repeat(n)).join('  '), rows:rows.map(line) };
}
class Out{
 constructor(el){ this.el = el; this.plain = []; }
 html(h, plain = ''){ const d = document.createElement('div'); d.className = 'cli-ln'; d.innerHTML = h; this.el.appendChild(d); this.plain.push(plain); return d; }
 line(t = '', cls = ''){ return this.html(`<span class="${cls}">${esc(t)}</span>`, t); }
 ok(t){ return this.line(t,'c-ok'); } err(t){ return this.line(t,'c-err'); } warn(t){ return this.line(t,'c-warn'); } dim(t){ return this.line(t,'c-dim'); } hd(t){ return this.line(t,'c-hd'); }
 pre(t, cls = ''){ return this.html(`<pre class="cli-pre ${cls}">${esc(t)}</pre>`, t); }
 table(head, rows, align){
  const t = textTable(head, rows, align);
  return this.html(`<pre class="cli-pre"><span class="c-hd">${esc(t.head)}</span>\n<span class="c-dim">${esc(t.sep)}</span>\n${esc(t.rows.join('\n'))}</pre>`, [t.head,t.sep,...t.rows].join('\n'));
 }
 kv(pairs, indent = 2){
  const w = Math.max(...pairs.map(p => String(p[0]).length));
  const txt = pairs.map(([k,v]) => ' '.repeat(indent) + String(k).padEnd(w) + '  ' + v).join('\n');
  const htm = pairs.map(([k,v]) => ' '.repeat(indent) + `<span class="c-dim">${esc(String(k).padEnd(w))}</span>  ${esc(v)}`).join('\n');
  return this.html(`<pre class="cli-pre">${htm}</pre>`, txt);
 }
 section(t){ return this.html(`<span class="c-hd">${esc(t)}</span>`, t); }
}

/* =====================================================================
   8. TERMINAL CLASS  — state, input handling, routing
   ===================================================================== */
class Terminal{
 constructor({ outEl, inEl, psEl, scrollEl }){
  const HIST0 = (Array.isArray(lsGet('termHist')) ? lsGet('termHist') : []).filter(x => typeof x === 'string').slice(-CFG.histMax);
  Object.assign(this, { outEl, inEl, psEl, scrollEl, history:HIST0, hIdx:HIST0.length, draft:'', ctx:null, busy:false, lastText:'', theme:'modern' });
  this.inEl.addEventListener('keydown', e => this.onKey(e));
  const hlSpan = inEl.parentElement && inEl.parentElement.querySelector('.cli-hl > span');
  if(hlSpan){                                                   // camada colorida por baixo do <input> (texto do input é transparente)
   const sync = () => { hlSpan.innerHTML = hlCmd(inEl.value); hlSpan.style.transform = `translateX(${-inEl.scrollLeft}px)`; };
   const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
   Object.defineProperty(inEl, 'value', { configurable:true, get(){ return d.get.call(this); }, set(v){ d.set.call(this, v); sync(); } });   // apanha também histórico, Tab e limpeza após Enter
   ['input','keydown','keyup','click','mouseup','focus','select','scroll'].forEach(ev => inEl.addEventListener(ev, () => requestAnimationFrame(sync)));
   sync();
  }
 }
 ps1(){ const slug = this.ctx ? this.ctx.place.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') : 'void'; return `skylab@${slug}:~$`; }
 paintPrompt(){ this.psEl.innerHTML = esc(this.ps1()).replace('@','<i>@</i>').replace(':~$','<i>:~$</i>'); }
 clear(){ this.outEl.innerHTML = ''; }
 reset(){ this.clear(); this.ctx = null; this.lastText = ''; this.paintPrompt(); }
 block(cmd){
  const b = document.createElement('div'); b.className = 'cli-block';
  b.innerHTML = `<div class="cli-echo"><span class="cli-ps1">${esc(this.ps1())}</span> ${hlCmd(cmd)}</div><div class="cli-res"></div>`;
  this.outEl.appendChild(b);
  return new Out(b.querySelector('.cli-res'));
 }
 scroll(){ this.scrollEl.scrollTop = this.scrollEl.scrollHeight; }
 setBusy(v){ this.busy = v; this.inEl.disabled = v; this.inEl.closest('.cli-prompt').classList.toggle('busy', v); if(!v) this.inEl.focus(); }

 async exec(raw){
  let line = String(raw||'').trim();
  const bang = /^!(!|\d+)$/.exec(line);
  if(bang){ const i = bang[1] === '!' ? this.history.length : +bang[1]; line = this.history[i-1] || ''; if(!line){ this.block(raw).err('history: event not found'); return; } }
  const out = this.block(line);
  if(!line) return;
if(this.history[this.history.length-1] !== line){ this.history.push(line); if(this.history.length > CFG.histMax) this.history.shift(); lsSet('termHist', this.history); }
  this.hIdx = this.history.length; this.draft = '';
  let tokens;
  try{ tokens = tokenize(line); }catch(e){ out.err(`parse error: ${e.message}`); return; }
      if(!tokens.length) return;
      const name = tokens.shift().toLowerCase(), def = commands.get(name);
      if(!def){
        out.err(`Error: Command not found. Type 'help' for available commands.`);
        const near = suggest(name, commands.names());
        if(near.length) out.dim(`did you mean: ${near.join(', ')}?`);
        this.scroll(); return;
      }
      const { args, flags, errors } = parseArgs(tokens, def.flags);
      if(errors.length){ 
        out.err(`Error: Syntax/argument error in '${def.name}': ${errors.join('; ')}`); 
        out.dim(`Usage: ${def.usage}`); 
        this.scroll(); return; 
      }
      // Central command contract: commands may only receive positional arguments
      // explicitly supported by their existing syntax. This closes the old gap
      // where commands without maxArgs silently accepted arbitrary trailing words.
      const positionalLimits = {
        help:1, fetch:1, filter:1, vars:1, calc:1, delta:1, plot:1, stats:1,
        simulate:1, export:1, theme:1, mock:1, echo:Infinity, storms:1
      };
      const maxArgs = def.maxArgs !== undefined ? def.maxArgs : (positionalLimits[def.name] ?? 0);
      const fallbackArgFlags = { fetch:'loc', filter:'vars', delta:'time', plot:'var', stats:'var', export:'format' };
      const fallbackFlag = fallbackArgFlags[def.name];
      if(fallbackFlag && flags[fallbackFlag] !== undefined && args.length){
        out.err(`Error: '${def.name}' received both '--${fallbackFlag}' and positional argument(s). Choose one input form.`);
        out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
      }
      if(args.length > maxArgs){
        out.err(`Error: Unexpected argument(s) for '${def.name}': ${args.slice(maxArgs).map(a => `'${a}'`).join(', ')}.`);
        out.dim(`Usage: ${def.usage || def.name}`);
        this.scroll(); return;
      }
      if(def.minArgs !== undefined && args.length < def.minArgs){
        out.err(`Error: Missing required arguments for '${def.name}'. Expected at least ${def.minArgs} argument(s).`);
        out.dim(`Usage: ${def.usage || def.name}`);
        this.scroll(); return;
      }
      // Reject invalid inline boolean values and duplicate flags instead of
      // coercing arbitrary text into true or silently overriding earlier input.
      const flagTokens = tokens.filter(t => /^--?[A-Za-z_][\w-]*(?:=.*)?$/.test(t));
      const seenFlags = new Set();
      for(const token of flagTokens){
        const rawFlag = token.split('=',1)[0].replace(/^--?/,'').toLowerCase();
        const specEntry = Object.entries(def.flags||{}).find(([k,v]) => k.toLowerCase()===rawFlag || (v.alias||[]).some(a=>a.toLowerCase()===rawFlag));
        if(!specEntry) continue; // parseArgs already reports unknown flags
        const [key, spec] = specEntry;
        if(seenFlags.has(key)){
          out.err(`Error: Flag '${token.split('=',1)[0]}' was supplied more than once.`);
          out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
        }
        seenFlags.add(key);
        const eq = token.indexOf('=');
        if((spec.type||'bool')==='bool' && eq>=0 && !/^(1|0|true|false|yes|no|on|off)$/i.test(token.slice(eq+1))){
          out.err(`Error: '${token}' is not a valid boolean flag value (use true/false or omit '=…').`);
          out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
        }
      }
      // Validate common numeric options before any command executes; otherwise
      // strings such as '--hours banana' could silently fall back to defaults.
      // [min, max] per flag; a "command.flag" entry overrides the generic "flag" one.
      const RANGES = { at:[-48,168], time:[-48,168], hours:[1,216], 'plot.hours':[2,168], 'stats.hours':[2,216], 'export.hours':[0,216], back:[0,48], rows:[1,12],
        'view.depth':[0,10], depth:[1,5000], alt:[1,6000], dtemp:[0,30], wind:[0,300], source:[0.001,100000], t:[-90,60], rh:[0,100], p:[100,1100], days:[7,46] };
      const NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;
      const bail = msg => { out.err('Error: ' + msg); out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); };
      for(const [key, value] of Object.entries(flags)){
        const rg = RANGES[def.name + '.' + key] || RANGES[key];
        if(!rg) continue;
        if(typeof value !== 'string' || !NUM.test(value.trim())){ bail(`'--${key}' requires a number; received '${value}'.`); return; }
        if(+value < rg[0] || +value > rg[1]){ bail(`'--${key}' must be between ${rg[0]} and ${rg[1]}; received ${value}.`); return; }
      }
      if(flags.steps !== undefined && !splitList(flags.steps).every(x => /^[+-]?\d+$/.test(x))){ bail(`'--steps' must be whole hour offsets such as 3,6,12,24; received '${flags.steps}'.`); return; }
      if(flags.stability !== undefined && !/^[A-Fa-f]$/.test(flags.stability)){ bail(`'--stability' must be a Pasquill class A-F; received '${flags.stability}'.`); return; }
      // Validate command-specific enumerated values centrally.
      const enumArgs = { theme:['modern','retro','amber'], mock:['on','off','1','0','true','false'] };
      if(enumArgs[def.name] && args[0] && !enumArgs[def.name].includes(args[0].toLowerCase())){
        out.err(`Error: Invalid value '${args[0]}' for '${def.name}'. Expected: ${enumArgs[def.name].join(' | ')}.`);
        out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
      }
      const enumFlags = { format: exporters.names() };
      for(const [key, allowed] of Object.entries(enumFlags)){
        if(flags[key] !== undefined && !allowed.includes(String(flags[key]).toLowerCase())){
          out.err(`Error: Invalid value '${flags[key]}' for '--${key}'. Expected: ${allowed.join(' | ')}.`);
          out.dim(`Usage: ${def.usage || def.name}`); this.scroll(); return;
        }
      }
      // Reject placeholder-like syntax for any positional argument (except echo,
      // whose purpose is to print literal text), not just the fetch command.
      const malformedValue = value => /[()[\]{}]/.test(String(value));
      const malformedArgs = def.name !== 'echo' && args.some(malformedValue);
      const malformedFlags = Object.values(flags).some(value => typeof value === 'string' && malformedValue(value));
      if(malformedArgs || malformedFlags){
        out.err(`Error: Invalid argument syntax for '${def.name}'. Remove placeholder brackets/parentheses and provide a real value.`);
        out.dim(`Usage: ${def.usage || def.name}`);
        this.scroll(); return;
      }
  this.setBusy(true);
  try{ await def.run({ term:this, out, args, flags, line }); }
  catch(e){ out.err(`${def.name}: ${e.message}`); }
  finally{
   if(!def.keepLast) this.lastText = out.plain.join('\n');
   this.paintPrompt(); this.setBusy(false); this.scroll();
  }
 }

 onKey(e){
  const el = this.inEl;
  if(e.key === 'Enter'){ e.preventDefault(); if(this.busy) return; const v = el.value; el.value = ''; this.exec(v); }
  else if(e.key === 'ArrowUp'){
   e.preventDefault(); if(!this.history.length) return;
   if(this.hIdx === this.history.length) this.draft = el.value;
   this.hIdx = Math.max(0, this.hIdx-1); el.value = this.history[this.hIdx]; el.setSelectionRange(el.value.length, el.value.length);
  } else if(e.key === 'ArrowDown'){
   e.preventDefault(); if(this.hIdx >= this.history.length) return;
   this.hIdx++; el.value = this.hIdx === this.history.length ? this.draft : this.history[this.hIdx];
  } else if(e.key === 'Tab'){ e.preventDefault(); this.complete(); }
  else if(e.ctrlKey && e.key.toLowerCase() === 'l'){ e.preventDefault(); this.clear(); }
  else if(e.ctrlKey && e.key.toLowerCase() === 'c' && el.selectionStart === el.selectionEnd){ e.preventDefault(); if(el.value){ this.block(el.value + '^C'); el.value = ''; } }
 }

 complete(){
  const el = this.inEl, head = el.value.slice(0, el.selectionStart ?? el.value.length), parts = head.split(/\s+/), last = parts[parts.length-1] || '';
  let pool = [];
  if(parts.length <= 1) pool = commands.names();
  else { const def = commands.get(parts[0]); if(def && def.complete) pool = def.complete(parts.slice(1), this) || []; }
  const cut = last.lastIndexOf(',') + 1, pre = last.slice(0,cut), seg = last.slice(cut).toLowerCase();
  const hits = [...new Set(pool)].filter(n => n.toLowerCase().startsWith(seg));
  if(!hits.length) return;
  let cp = hits[0]; for(const h of hits) while(!h.toLowerCase().startsWith(cp.toLowerCase())) cp = cp.slice(0,-1);
  const rest = el.value.slice(el.selectionStart ?? el.value.length);
  const base = head.slice(0, head.length - last.length) + pre + cp + (hits.length === 1 ? ' ' : '');
  el.value = base + rest;
  if(hits.length > 1){ const o = this.block(head); o.dim(hits.slice(0,40).join('  ')); this.scroll(); }
 }

 async boot(){
  this.reset();
  const o = this.block('boot --skylab');
  const logo = ['╔═╗╦╔═╦ ╦╦  ╔═╗╔╗ ','╚═╗╠╩╗╚╦╝║  ╠═╣╠╩╗','╚═╝╩ ╩ ╩ ╩═╝╩ ╩╚═╝'];
  const retro = this.theme !== 'modern', delay = (retro && !reduced()) ? 70 : 0;
  for(const l of logo){ o.pre(l, 'c-acc cli-logo'); if(delay) await sleep(delay); }
  o.dim(`SkyLab Terminal v${CFG.version} · atmospheric physics CLI · type 'help' or press Tab`);
  if(delay){ await sleep(120); o.ok('[ OK ] telemetry link established'); await sleep(90); o.ok('[ OK ] physics kernel loaded: ' + metrics.list().length + ' metrics, ' + exporters.list().length + ' exporters'); await sleep(90); }
  this.scroll();
  await this.exec('fetch');
 }
}

/* =====================================================================
   9. COMMANDS
   ===================================================================== */
const GROUPS = { data:'DATA & STATE', parse:'PARSING & FILTERING', math:'ATMOSPHERIC MATH', compare:'COMPARISON', viz:'VISUALIZATION', export:'EXPORT', sys:'SYSTEM' };
const varComplete = (parts, t) => varNamesFor(t.ctx);
const plusH = n => (n>=0?'+':'') + n + 'h';

commands
.register('help', { group:'sys', alias:['?','man'], usage:'help [command]', summary:'List commands, or show the manual of one',
 complete:(p)=>commands.names(),
 run({ out, args }){
  if(args[0]){
   const d = commands.get(args[0]); if(!d) throw new Error(`no manual entry for '${args[0]}'`);
   out.section(d.name.toUpperCase() + (d.alias && d.alias.length ? `   (aliases: ${d.alias.join(', ')})` : ''));
   out.line('  ' + d.summary); out.line(); out.line('  usage:    ' + d.usage);
   const fl = Object.entries(d.flags||{}); if(fl.length){ out.line('  flags:'); out.kv(fl.map(([n,f]) => ['--'+n+(f.alias&&f.alias.length?' (-'+f.alias.join(', -')+')':''), (f.type||'bool')+(f.help?' · '+f.help:'')]), 4); }
   if(d.examples){ out.line('  examples:'); d.examples.forEach(x => out.line('    $ ' + x, 'c-acc')); }
   if(d.name === 'calc'){ out.line(); out.line('  metrics:'); out.kv(metrics.list().map(m => [m.name, m.summary]), 4); }
   if(d.name === 'export'){ out.line(); out.line('  formats:'); out.kv(exporters.list().map(m => [m.name, m.summary]), 4); }
   return;
  }
  for(const [g,label] of Object.entries(GROUPS)){
   const list = commands.list().filter(c => c.group === g); if(!list.length) continue;
   out.section(label); out.kv(list.map(c => [c.name, c.summary])); out.line();
  }
  out.dim("tips: Tab = autocomplete · ↑/↓ = history · !! / !n = re-run · Ctrl+L = clear · Esc = close");
  out.dim("      'fetch -loc \"new york\"' loads a city; every other command works on that context");
 }})
.register('fetch', { group:'data', alias:['load'], usage:'fetch [-loc <city|lat,lon>] [--refresh]', summary:'Fetch Open-Meteo data for a city and set it as the active context', maxArgs:1,
 flags:{ loc:{type:'list',alias:['l'],help:'city name, "lat,lon", or "here"'}, refresh:{type:'bool',alias:['r'],help:'bypass the 10-min cache'} },
 examples:['fetch -loc lisbon','fetch -loc "new york"','fetch --loc 35.68,139.69','fetch   # reload the SkyLab location'],
 async run({ term, out, args, flags }){
  const q = flags.loc || args.join(' ');
  out.dim(q ? `resolving "${q}" …` : 'resolving SkyLab location …');
  const pl = await resolvePlace(q);
  if(pl.fuzzy) out.warn(`  ! no exact match for "${q}" — using the closest result. Check it is the place you meant, or use lat,lon.`);
  out.dim(CFG.mock ? 'GET mock://skylab …' : 'GET api.open-meteo.com/v1/forecast …');
  const r = await fetchWeather(pl, { refresh:flags.refresh });
  term.ctx = buildCtx(pl, r.raw, { cached:r.cached, dropped:r.dropped });
  const h = r.raw.hourly, nv = Object.keys(h).length - 1;
  out.ok(`✓ context set — ${h.time.length} hourly rows × ${nv} variables · ${r.raw.daily ? r.raw.daily.time.length : 0} days · elevation ${r.raw.elevation ?? '?'} m · ${r.raw.timezone || ''}`);
  out.dim(`  now = ${r.raw.current ? r.raw.current.time : h.time[term.ctx.i0]}${r.cached ? ' · served from cache' : ''}${r.raw._mock ? ' · MOCK DATA' : ''}`);
  if(r.dropped.length) out.warn(`  ! API rejected ${r.dropped.length} variable(s): ${r.dropped.join(', ')} — they are skipped`);
 }})
.register('clear', { group:'data', alias:['cls'], usage:'clear', summary:'Clear the terminal output', maxArgs:0, keepLast:true, run({ term }){ term.clear(); }})
.register('history', { group:'data', alias:['hist'], usage:'history [-c]', summary:'List the command history (-c to wipe it)',
 flags:{ c:{type:'bool',help:'clear history'} },
 run({ term, out, flags }){
  if(flags.c){ term.history.length = 0; term.hIdx = 0; out.ok('history cleared'); return; }
  if(!term.history.length){ out.dim('(empty)'); return; }
  out.pre(term.history.map((h,i) => String(i+1).padStart(4) + '  ' + h).join('\n'));
  out.dim('re-run with !<n> or !!');
 }})
.register('status', { group:'data', alias:['info','ctx'], usage:'status', summary:'Show the active context (location, rows, variables, cache)', maxArgs:0,
 run({ term, out }){
  const c = term.ctx; if(!c){ out.warn('context: empty — run  fetch -loc <city>'); return; }
  const h = c.raw.hourly;
  out.kv([['location', `${c.place.name}${c.place.sub ? ', ' + c.place.sub : ''}`],['coordinates', `${c.place.lat.toFixed(4)}, ${c.place.lon.toFixed(4)}`],['elevation', `${c.raw.elevation ?? '?'} m`],['timezone', c.raw.timezone || '?'],
   ['now (row)', `${h.time[c.i0]}  [${c.i0}]`],['range', `${h.time[0]} → ${h.time[h.time.length-1]}  (${h.time.length} rows)`],['variables', `${Object.keys(h).length-1} hourly · ${Object.keys(c.raw.daily||{}).length-1} daily`],
   ['fetched', c.fetchedAt.toLocaleTimeString()],['cache', `${cache.size} location(s) · TTL ${CFG.cacheMs/60000} min`],['mode', CFG.mock ? 'MOCK' : 'live Open-Meteo'],['theme', term.theme]]);
  if(c.dropped && c.dropped.length) out.warn(`  skipped by API: ${c.dropped.join(', ')}`);
 }})
.register('view', { group:'parse', alias:['cat'], usage:'view --raw [--path hourly.cape] [--depth n]', summary:'Dump the current state as a collapsible JSON tree',
 flags:{ raw:{type:'bool',help:'full JSON tree'}, path:{type:'str',help:'dot path, e.g. current or hourly.temperature_2m'}, depth:{type:'str',help:'levels opened by default (1)'} },
 examples:['view --raw','view --raw --path current','view --raw --path daily --depth 2'],
 complete:()=>['--raw','--path','--depth'],
 run({ term, out, flags }){
  const c = needCtx(term);
  if(!flags.raw){ out.dim('tip: use --raw for the JSON tree · see also: now, status'); return; }
  let v = { place:c.place, i0:c.i0, ...c.raw };
  if(flags.path){ for(const k of flags.path.split('.')){ if(v === null || typeof v !== 'object' || !(k in v)) throw new Error(`path not found: ${flags.path}`); v = v[k]; } }
  out.html(jsonTree(v, flags.depth ? +flags.depth : 1), JSON.stringify(v, null, 2));
 }})
.register('filter', { group:'parse', alias:['grep'], usage:'filter --vars v1,v2,… [--steps 3,6,12,24]', summary:'Table of selected variables: now + forecast steps',
 flags:{ vars:{type:'list',alias:['v'],help:'comma list; aliases ok (uv, cape, soil_moisture, cloud_low…)'}, steps:{type:'str',help:'hour offsets (default 3,6,12,24)'} },
 examples:['filter --vars shortwave_radiation,cape,soil_moisture,uv_index,cloud_cover_low','filter --vars temp,wind,pressure --steps 1,2,3'],
 complete:varComplete,
 run({ term, out, args, flags }){
  const c = needCtx(term), want = flags.vars || args.join(' ');
  if(!want) throw new Error('missing --vars (try: filter --vars temp,cape,uv)');
  const { ok, bad } = resolveVars(c, want);
  if(bad.length) out.warn(`unknown variable(s): ${bad.join(', ')}  (see: vars)`);
  if(!ok.length) return;
  const steps = splitList(flags.steps || '3,6,12,24').map(Number).filter(Number.isFinite), n = c.raw.hourly.time.length;
  const rows = ok.map(k => { const a = c.raw.hourly[k], now = nowVals(c)[k];
   return [k, dispU(unitOf(c,k)) || '-', fmt(now,2), ...steps.map(s => c.i0+s < n && c.i0+s >= 0 ? fmt(a[c.i0+s],2) : '—')]; });
  out.table(['VARIABLE','UNIT','NOW', ...steps.map(plusH)], rows, ['l','l','r', ...steps.map(()=>'r')]);
 }})
.register('vars', { group:'parse', alias:['ls'], usage:'vars [prefix]', summary:'List every variable in the context with unit and current value',
 complete:varComplete,
 run({ term, out, args }){
  const c = needCtx(term), v = nowVals(c), pf = (args[0]||'').toLowerCase();
  const keys = Object.keys(c.raw.hourly).filter(k => k !== 'time' && (!pf || k.includes(pf)));
  if(!keys.length) throw new Error(`no variable matches '${pf}'` + hint(pf, varNamesFor(c)));
  const al = {}; for(const [a,k] of Object.entries(ALIAS)) (al[k] = al[k] || []).push(a);
  out.table(['VARIABLE','UNIT','NOW','ALIASES'], keys.map(k => [k, dispU(unitOf(c,k)) || '-', fmt(v[k],2), (al[k]||[]).join(' ')]), ['l','l','r','l']);
  out.dim(`${keys.length} variable(s)`);
 }})
.register('now', { group:'parse', alias:['matrix','snapshot'], usage:'now [--at <hours>]', summary:'Full atmospheric snapshot: thermo, wind, radiation, convection, soil, upper air',
 flags:{ at:{type:'str',help:'hour offset from now (e.g. 6, -3)'} },
 run({ term, out, flags }){
  const c = needCtx(term), off = flags.at ? +flags.at : 0, i = c.i0 + off, n = c.raw.hourly.time.length;
  if(!Number.isFinite(off) || i < 0 || i >= n) throw new Error(`--at out of range (${-c.i0}…${n-1-c.i0})`);
  const v = off ? hourAt(c,i) : nowVals(c), d = derivedOf(v), U = k => dispU(unitOf(c,k));
  const row = (label,k,dec=1,u) => [label, `${fmt(v[k],dec)} ${u ?? U(k)}`.trim()];
  out.hd(`▌ ${c.place.name} · ${v.time || c.raw.hourly.time[i]} ${off ? `(${plusH(off)})` : '(now)'}`);
  out.section('[01] THERMODYNAMICS & MOISTURE');
  out.kv([row('temperature','temperature_2m'),row('apparent','apparent_temperature'),row('dew point','dew_point_2m'),['spread T−Td', fmt(v.temperature_2m-v.dew_point_2m,1)+' °C'],row('humidity','relative_humidity_2m',0),
   row('surface pressure','surface_pressure'),row('MSL pressure','pressure_msl'),row('VPD','vapor_pressure_deficit',2),['wet-bulb', fmt(d.wet_bulb,1)+' °C'],['θ / θe', fmt(d.theta,1)+' K / '+fmt(d.theta_e,1)+' K'],
   ['air density', fmt(d.air_density,4)+' kg/m³'],['mixing ratio', fmt(d.mixing_ratio,2)+' g/kg'],['LCL', fmt(d.lcl,0)+' m AGL']]);
  out.section('[02] KINEMATICS');
  out.kv([['wind 10 m', `${fmt(v.wind_speed_10m,1)} km/h @ ${fmt(v.wind_direction_10m,0)}° ${cardinal(v.wind_direction_10m)}  (Bft ${num(v.wind_speed_10m)?beaufort(v.wind_speed_10m):'—'})`],
   ['wind 80 m', `${fmt(v.wind_speed_80m,1)} km/h @ ${fmt(v.wind_direction_80m,0)}° ${cardinal(v.wind_direction_80m)}`],row('gusts','wind_gusts_10m'),['shear 10→80 m', fmt(d.shear,2)+' m/s'],row('boundary layer','boundary_layer_height',0),['speed of sound', fmt(d.sound_speed,1)+' m/s']]);
  out.section('[03] RADIATION & CLOUDS');
  out.kv([row('shortwave (GHI)','shortwave_radiation',0),row('direct normal (DNI)','direct_normal_irradiance',0),row('diffuse (DHI)','diffuse_radiation',0),row('UV index','uv_index'),row('clouds total','cloud_cover',0),
   ['clouds L / M / H', `${fmt(v.cloud_cover_low,0)} / ${fmt(v.cloud_cover_mid,0)} / ${fmt(v.cloud_cover_high,0)} %`],['visibility', num(v.visibility) ? fmt(v.visibility/1000,1)+' km' : '—']]);
  out.section('[04] CONVECTION & PRECIPITATION');
  out.kv([['CAPE', `${fmt(v.cape,0)} J/kg${num(v.cape) ? '  ('+classify(v.cape,CAPE_CLS)+')' : ''}`],row('CIN','convective_inhibition',0),['lifted index', `${fmt(v.lifted_index,1)}${num(v.lifted_index) ? '  ('+classify(v.lifted_index,LI_CLS)+')' : ''}`],
   row('freezing level','freezing_level_height',0),row('precipitation','precipitation',2),row('precip. prob.','precipitation_probability',0),row('snowfall','snowfall',2)]);
  out.section('[05] SURFACE & SOIL');
  out.kv([row('soil temp (0 cm)','soil_temperature_0cm'),row('soil moisture (0–1 cm)','soil_moisture_0_to_1cm',3),row('ET₀','et0_fao_evapotranspiration',2)]);
  out.section('[06] UPPER AIR');
  out.kv([['850 hPa', `${fmt(v.temperature_850hPa,1)} °C · ${fmt(v.wind_speed_850hPa,0)} km/h @ ${fmt(v.wind_direction_850hPa,0)}° · Z ${fmt(v.geopotential_height_850hPa,0)} m`],
   ['500 hPa', `${fmt(v.temperature_500hPa,1)} °C · ${fmt(v.wind_speed_500hPa,0)} km/h @ ${fmt(v.wind_direction_500hPa,0)}° · Z ${fmt(v.geopotential_height_500hPa,0)} m`]]);
 }})
.register('daily', { group:'parse', alias:['week'], usage:'daily', summary:'7-day table: min/max, rain, wind, UV, sunrise/sunset, solar energy', maxArgs:0,
 run({ term, out }){
  const c = needCtx(term), d = c.raw.daily; if(!d) throw new Error('no daily data in context');
  const g = (k,i,dec=1) => d[k] ? fmt(d[k][i],dec) : '—';
  const rows = d.time.map((t,i) => [t.slice(5), g('temperature_2m_min',i), g('temperature_2m_max',i), g('precipitation_sum',i), g('precipitation_probability_max',i,0), g('wind_speed_10m_max',i,0), g('wind_gusts_10m_max',i,0), g('uv_index_max',i),
   d.sunrise ? hhmm(d.sunrise[i]) : '—', d.sunset ? hhmm(d.sunset[i]) : '—', d.shortwave_radiation_sum ? g('shortwave_radiation_sum',i) : '—', g('et0_fao_evapotranspiration',i,1)]);
  out.table(['DATE','TMIN','TMAX','RAIN','POP%','WIND','GUST','UVMAX','RISE','SET','MJ/m²','ET0'], rows, ['l','r','r','r','r','r','r','r','l','l','r','r']);
 }})
.register('upper', { group:'parse', alias:['sounding'], usage:'upper [--at <hours>]', summary:'Upper-air levels (850/500 hPa), lapse rate and stability', maxArgs:0,
 flags:{ at:{type:'str',help:'hour offset from now'} },
 run({ term, out, flags }){
  const c = needCtx(term), off = flags.at ? +flags.at : 0, v = off ? hourAt(c, c.i0+off) : nowVals(c);
  const rows = [['SFC', fmt(v.surface_pressure,0), fmt(c.raw.elevation,0), fmt(v.temperature_2m,1), fmt(v.relative_humidity_2m,0), fmt(v.wind_speed_10m,0), fmt(v.wind_direction_10m,0)],
   ['850', '850', fmt(v.geopotential_height_850hPa,0), fmt(v.temperature_850hPa,1), fmt(v.relative_humidity_850hPa,0), fmt(v.wind_speed_850hPa,0), fmt(v.wind_direction_850hPa,0)],
   ['500', '500', fmt(v.geopotential_height_500hPa,0), fmt(v.temperature_500hPa,1), fmt(v.relative_humidity_500hPa,0), fmt(v.wind_speed_500hPa,0), fmt(v.wind_direction_500hPa,0)]];
  out.table(['LEVEL','hPa','Z(m)','T(°C)','RH(%)','V(km/h)','DIR(°)'], rows, ['l','r','r','r','r','r','r']);
  if(num(v.temperature_850hPa) && num(v.temperature_500hPa) && num(v.geopotential_height_850hPa) && num(v.geopotential_height_500hPa)){
   const lr = (v.temperature_850hPa - v.temperature_500hPa)/((v.geopotential_height_500hPa - v.geopotential_height_850hPa)/1000);
   out.kv([['lapse rate 850–500', fmt(lr,2)+' °C/km  ('+(lr > 9.8 ? 'absolutely unstable' : lr > 7 ? 'conditionally unstable' : lr > 5 ? 'near moist-adiabatic' : 'stable')+')'],
    ['T850 − T500', fmt(v.temperature_850hPa - v.temperature_500hPa,1)+' °C'],['wind 850→500 shear', fmt(vecShear(v.wind_speed_850hPa,v.wind_direction_850hPa,v.wind_speed_500hPa,v.wind_direction_500hPa)/3.6,1)+' m/s'],
    ['CAPE / CIN / LI', `${fmt(v.cape,0)} / ${fmt(v.convective_inhibition,0)} J/kg / ${fmt(v.lifted_index,1)}`],['freezing level', fmt(v.freezing_level_height,0)+' m']]);
  } else out.warn('upper-air variables are not available for this location/model');
 }})
.register('sun', { group:'parse', usage:'sun', summary:'Sunrise, sunset, day length and next solar event', maxArgs:0,
 run({ term, out }){
  const c = needCtx(term), d = c.raw.daily; if(!d || !d.sunrise) throw new Error('no sunrise/sunset data');
  const day = (c.raw.current && c.raw.current.time || c.raw.hourly.time[c.i0]).slice(0,10), i = Math.max(0, d.time.indexOf(day));
  const nowT = new Date(c.raw.current ? c.raw.current.time : c.raw.hourly.time[c.i0]), r = new Date(d.sunrise[i]), s = new Date(d.sunset[i]), dl = (s-r)/60000;
  out.kv([['date', day],['sunrise', hhmm(d.sunrise[i])],['solar noon', hhmm(isoLocal(new Date((r.getTime()+s.getTime())/2)))],['sunset', hhmm(d.sunset[i])],['day length', `${Math.floor(dl/60)} h ${Math.round(dl%60)} min`],
   ['UV max today', fmt(d.uv_index_max && d.uv_index_max[i],1)],['next event', nowT < r ? `sunrise in ${Math.round((r-nowT)/60000)} min` : nowT < s ? `sunset in ${Math.round((s-nowT)/60000)} min` : 'sun is down']]);
 }})
.register('calc', { group:'math', usage:'calc <metric|all> [--at h] [--moist] [--t °C --rh % --p hPa]', summary:'Run an atmospheric calculation on the current state (calc to list metrics)', maxArgs:1,
 flags:{ at:{type:'str',help:'evaluate at hour offset (forecast)'}, moist:{type:'bool',help:'humid-air variant where supported'}, t:{type:'str',help:'override temperature °C'}, rh:{type:'str',help:'override humidity %'}, p:{type:'str',help:'override pressure hPa'} },
 examples:['calc air_density','calc dew_point','calc lcl --at 6','calc cape','calc air_density --t 30 --rh 70 --p 1000 --moist','calc all'],
 complete:(p)=>[...metrics.names(),'all'],
 run({ term, out, args, flags }){
  if(!args.length){ out.section('METRICS'); out.kv(metrics.list().map(m => [m.name, m.summary])); out.dim("usage: calc <metric> · calc all · help calc"); return; }
  let v = {};
  if(term.ctx){ const off = flags.at ? +flags.at : 0, i = term.ctx.i0 + off; if(!Number.isFinite(off) || i < 0 || i >= term.ctx.raw.hourly.time.length) throw new Error('--at out of range'); v = off ? hourAt(term.ctx,i) : nowVals(term.ctx); }
  if(flags.t !== undefined) v.temperature_2m = +flags.t;
  if(flags.rh !== undefined) v.relative_humidity_2m = +flags.rh;
  if(flags.t !== undefined || flags.rh !== undefined) v.dew_point_2m = undefined;   // recompute Td from the overrides
  if(flags.p !== undefined) v.surface_pressure = +flags.p;
  const names = args[0].toLowerCase() === 'all' ? metrics.list().map(m => m.name) : [args[0]];
  const summary = [];
  for(const n of names){
   const m = metrics.get(n); if(!m) throw new Error(`unknown metric '${n}' (type: calc)`);
   let r; try{ r = m.run(v, flags); }catch(e){ if(names.length > 1){ summary.push([m.name,'—','','n/a: '+e.message.replace(/ \(.*/,'')]); continue; } throw e; }
   if(names.length > 1){ summary.push([m.name, r.value === null ? '—' : fmt(r.value, r.d ?? 2), dispU(r.unit), r.note || '']); continue; }
   out.section(m.name); out.dim('  ' + m.formula);
   out.kv([...(r.inputs||[]).map(([k,x]) => ['input '+k, x]), ['RESULT', r.value === null ? 'n/a' : `${fmt(r.value, r.d ?? 2)} ${r.unit}`], ...(r.extra||[])]);
   if(r.note) out.line('  ↳ ' + r.note, 'c-acc');
  }
  if(summary.length) out.table(['METRIC','VALUE','UNIT','NOTE'], summary, ['l','r','l','l']);
 }})
.register('compare', { group:'compare', alias:['cmp'], usage:'compare -loc1 <cityA> -loc2 <cityB>', summary:'Fetch two places and print a side-by-side Δ matrix',
 flags:{ loc1:{type:'list',alias:['a']}, loc2:{type:'list',alias:['b']} },
 examples:['compare -loc1 lisbon -loc2 madrid','compare -loc1 "new york" -loc2 tokyo'],
 async run({ term, out, flags }){
  if(!flags.loc1 || !flags.loc2) throw new Error('both -loc1 and -loc2 are required');
  out.dim('resolving both locations …');
  const [A,B] = await Promise.all([resolvePlace(flags.loc1), resolvePlace(flags.loc2)]);
  out.dim(`fetching ${A.name} ∥ ${B.name} …`);
  const [ra,rb] = await Promise.all([fetchWeather(A), fetchWeather(B)]);
  const ca = buildCtx(A,ra.raw), cb = buildCtx(B,rb.raw), va = nowVals(ca), vb = nowVals(cb), da = derivedOf(va), db = derivedOf(vb);
  const spec = [['temperature_2m','°C',1],['apparent_temperature','°C',1],['dew_point_2m','°C',1],['relative_humidity_2m','%',0],['surface_pressure','hPa',1],['pressure_msl','hPa',1],['wind_speed_10m','km/h',1],['wind_gusts_10m','km/h',1],
   ['wind_speed_80m','km/h',1],['@shear','m/s',2],['cloud_cover','%',0],['precipitation','mm',2],['shortwave_radiation','W/m2',0],['uv_index','',1],['cape','J/kg',0],['boundary_layer_height','m',0],['@lcl','m',0],['@air_density','kg/m3',4],['@wet_bulb','°C',1],['@theta_e','K',1]];
  const rows = spec.map(([k,u,d]) => { const x = k[0]==='@' ? da[k.slice(1)] : va[k], y = k[0]==='@' ? db[k.slice(1)] : vb[k];
   return [k[0]==='@' ? k.slice(1)+'*' : k, dispU(u)||'-', fmt(x,d), fmt(y,d), (num(x)&&num(y)) ? sgn(y-x,d) : '—']; });
  const nm = s => s.length > 12 ? s.slice(0,11)+'…' : s;
  out.table(['VARIABLE','UNIT',nm(A.name),nm(B.name),`Δ (B−A)`], rows, ['l','l','r','r','r']);
  out.dim(`A = ${A.name}${A.sub?', '+A.sub:''}   B = ${B.name}${B.sub?', '+B.sub:''}   (* = derived)`);
  const dist = (() => { const R = 6371, r = x => x*Math.PI/180, dl = r(B.lat-A.lat), dn = r(B.lon-A.lon), a = Math.sin(dl/2)**2 + Math.cos(r(A.lat))*Math.cos(r(B.lat))*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(a)); })();
  out.dim(`great-circle distance: ${dist.toFixed(0)} km`);
 }})
.register('delta', { group:'compare', alias:['diff'], usage:'delta --time <hours>', summary:'Compare now with the value N hours ahead (+) or behind (−)',
 flags:{ time:{type:'str',alias:['t','h'],help:'hours: 6, +6, -3'} },
 examples:['delta --time 6','delta --time -3','delta --time 24'],
 run({ term, out, args, flags }){
  const c = needCtx(term), h = Number(flags.time ?? args[0]);
  if(!Number.isFinite(h)) throw new Error('missing --time <hours>  (e.g. delta --time 6)');
  const j = c.i0 + Math.round(h), n = c.raw.hourly.time.length;
  if(j < 0 || j >= n) throw new Error(`out of range — the context covers ${-c.i0}h … +${n-1-c.i0}h`);
  const a = nowVals(c), b = hourAt(c,j), da = derivedOf(a), db = derivedOf(b);
  out.hd(`Δ ${c.place.name}: now (${a.time || c.raw.hourly.time[c.i0]})  →  ${plusH(Math.round(h))} (${b.time})`);
  const spec = [['Temp','temperature_2m','°C',1],['Feels','apparent_temperature','°C',1],['Dew pt','dew_point_2m','°C',1],['RH','relative_humidity_2m','%',0],['Pressure','surface_pressure','hPa',1],['Wind 10m','wind_speed_10m','km/h',1],['Gusts','wind_gusts_10m','km/h',1],
   ['Wind 80m','wind_speed_80m','km/h',1],['Cloud','cloud_cover','%',0],['Precip','precipitation','mm',2],['Solar','shortwave_radiation','W/m2',0],['UV','uv_index','',1],['CAPE','cape','J/kg',0],['PBL','boundary_layer_height','m',0],['Freezing lvl','freezing_level_height','m',0]];
  const rows = spec.map(([lab,k,u,d]) => { const x = a[k], y = b[k], dx = (num(x)&&num(y)) ? y-x : null; return [lab, fmt(x,d), fmt(y,d), `${sgn(dx,d)}${dispU(u)}`, dx === null ? '' : dx > 0 ? '▲' : dx < 0 ? '▼' : '='] ; });
  const dd = (a.wind_direction_10m !== undefined && num(a.wind_direction_10m) && num(b.wind_direction_10m)) ? ((b.wind_direction_10m - a.wind_direction_10m + 540) % 360) - 180 : null;
  rows.push(['Wind dir', fmt(a.wind_direction_10m,0), fmt(b.wind_direction_10m,0), `${sgn(dd,0)}°`, dd === null ? '' : dd > 0 ? '↻' : dd < 0 ? '↺' : '=']);
  rows.push(['Air density*', fmt(da.air_density,4), fmt(db.air_density,4), sgn(num(da.air_density)&&num(db.air_density) ? db.air_density-da.air_density : null,4)+'kg/m3', '']);
  rows.push(['LCL*', fmt(da.lcl,0), fmt(db.lcl,0), sgn(num(da.lcl)&&num(db.lcl) ? db.lcl-da.lcl : null,0)+'m', '']);
  out.table(['VARIABLE','NOW',plusH(Math.round(h)),'Δ',''], rows, ['l','r','r','r','l']);
  const dp = b.surface_pressure - a.surface_pressure;
  if(num(dp) && Math.abs(Math.round(h)) === 3){
   const t = Math.round(h) > 0 ? dp : -dp, cls = t > 6 ? 'rising rapidly' : t > 1.6 ? 'rising' : t > -1.6 ? 'steady' : t > -6 ? 'falling' : 'falling rapidly';
   out.line(`  pressure tendency (3 h): ${cls}`, 'c-acc');
  }
  out.dim(`  summary → Temp: ${sgn(b.temperature_2m-a.temperature_2m,1)}°C · Pressure: ${sgn(dp,1)}hPa · Wind: ${sgn(b.wind_speed_10m-a.wind_speed_10m,1)}km/h   (* = derived)`);
 }})
.register('plot', { group:'viz', alias:['spark'], usage:'plot --var <v[,v2]> [--hours 24] [--back 0] [--rows 1]', summary:'ASCII sparkline / block chart of an hourly series',
 flags:{ var:{type:'list',alias:['v','vars']}, hours:{type:'str',alias:['n'],help:'window length (default 24)'}, back:{type:'str',help:'start N hours before now'}, rows:{type:'str',help:'chart height; 1 = sparkline'} },
 examples:['plot --var wind_speed_10m','plot --var temp,pressure --hours 48','plot --var cape --rows 6','plot --var temp --back 24 --hours 48'],
 complete:varComplete,
 run({ term, out, args, flags }){
  const c = needCtx(term), want = flags.var || args.join(' ');
  if(!want) throw new Error('missing --var (try: plot --var wind_speed_10m)');
  const { ok, bad } = resolveVars(c, want); if(bad.length) out.warn(`unknown variable(s): ${bad.join(', ')}`);
  const hours = Math.max(2, Math.min(168, +flags.hours || 24)), rows = Math.max(1, Math.min(12, +flags.rows || 1)), [a,b] = winIdx(c, c.i0 - (+flags.back || 0), hours);
  const times = c.raw.hourly.time.slice(a,b), nowAt = c.i0 - a;
  for(const k of ok){
   const ser = c.raw.hourly[k].slice(a,b), s = stats(ser);
   if(!s){ out.warn(`${k}: no data in this window`); continue; }
   const iMax = ser.indexOf(s.max), iMin = ser.indexOf(s.min);
   out.hd(`${k}  [${dispU(unitOf(c,k)) || '-'}]  ${c.place.name} · ${times[0]} → ${times[times.length-1]} (${times.length} h)`);
   const lines = rows > 1 ? blockChart(ser, rows) : [sparkline(ser)];
   const pad = rows > 1 ? 8 : 0;
   lines.forEach((l,i) => { const lab = rows > 1 ? (i===0 ? fmt(s.max,1) : i===lines.length-1 ? fmt(s.min,1) : '').padStart(pad-1) + ' ' : ''; out.line(lab + l, 'c-spark'); });
   out.line(' '.repeat(pad) + timeAxis(times), 'c-dim');
   if(nowAt >= 0 && nowAt < times.length) out.line(' '.repeat(pad + nowAt) + '▲ now', 'c-acc');
   out.dim(`min ${fmt(s.min,1)} @ ${hhmm(times[iMin])}   max ${fmt(s.max,1)} @ ${hhmm(times[iMax])}   avg ${fmt(s.mean,1)}   Δ ${sgn(ser.filter(num).slice(-1)[0]-ser.filter(num)[0],1)}`);
   out.line();
  }
 }})
.register('stats', { group:'viz', alias:['stat'], usage:'stats --var <v> [--hours 24] [--back 0]', summary:'Min / max / mean / median / σ / trend for a variable over a window',
 flags:{ var:{type:'list',alias:['v','vars']}, hours:{type:'str',alias:['n']}, back:{type:'str'} }, complete:varComplete,
 run({ term, out, args, flags }){
  const c = needCtx(term), want = flags.var || args.join(' '); if(!want) throw new Error('missing --var');
  const { ok, bad } = resolveVars(c, want); if(bad.length) out.warn(`unknown variable(s): ${bad.join(', ')}`);
  const hours = Math.max(2, Math.min(216, +flags.hours || 24)), [a,b] = winIdx(c, c.i0 - (+flags.back || 0), hours), times = c.raw.hourly.time.slice(a,b);
  const rows = ok.map(k => { const ser = c.raw.hourly[k].slice(a,b), s = stats(ser); if(!s) return [k,'—','—','—','—','—','—','—'];
   return [k, fmt(s.min,2)+' @'+hhmm(times[ser.indexOf(s.min)]), fmt(s.max,2)+' @'+hhmm(times[ser.indexOf(s.max)]), fmt(s.mean,2), fmt(s.med,2), fmt(s.sd,2), sgn(s.slope,3)+'/h', sparkline(ser)]; });
  out.table(['VARIABLE','MIN','MAX','MEAN','MEDIAN','σ','TREND','SHAPE'], rows, ['l','r','r','r','r','r','r','l']);
  out.dim(`window: ${times[0]} → ${times[times.length-1]} (${times.length} h)`);
 }})
/* =====================================================================
 ADVANCED ATMOSPHERIC SIMULATION ENGINE (Inversion, Plume, Parcel)
 ===================================================================== */
commands.register('simulate', {
 group:'math', alias:['sim'],
 usage:'simulate <inversion|plume|parcel> [--alt m] [--depth m] [--dtemp °C] [--wind km/h] [--source g/s]',
 summary:'Run dynamic physics simulations (thermal inversion, Gaussian plume dispersion, parcel sounding)',
 minArgs: 1, maxArgs: 1,
 flags:{
  alt:{type:'str',alias:['a'],help:'inversion capping altitude (m AGL)'},
  depth:{type:'str',alias:['d'],help:'inversion layer thickness (m)'},
  dtemp:{type:'str',alias:['dt'],help:'temperature inversion magnitude (°C)'},
  wind:{type:'str',alias:['w'],help:'wind speed override (km/h)'},
  source:{type:'str',alias:['q','s'],help:'source pollutant emission rate (g/s)'},
  stability:{type:'str',help:'Pasquill stability class A-F (default: D)'}
 },
 examples:[
  'simulate inversion',
  'simulate inversion --alt 400 --depth 200 --dtemp 6.0',
  'simulate plume --wind 12 --source 150',
  'simulate parcel'
 ],
 complete: () => ['inversion', 'plume', 'parcel'],
 async run({ term, out, args, flags }){
  const sub = (args[0] || '').toLowerCase();
  const c = needCtx(term);
  const v = nowVals(c);


  /* -----------------------------------------------------------
     1. INVERSION SIMULATION
     ----------------------------------------------------------- */
  if(sub === 'inversion'){
    const t0 = v.temperature_2m;
    const p0 = v.surface_pressure || 1013.25;
    const u10 = num(+flags.wind) ? +flags.wind : Math.max(0.5, v.wind_speed_10m || 8.0);
    const pblh = num(v.boundary_layer_height) ? v.boundary_layer_height : 750;
    const invBase = num(+flags.alt) ? +flags.alt : Math.round(pblh * 0.65);
    const invDepth = num(+flags.depth) ? +flags.depth : 220;
    const invTop = invBase + invDepth;
    const dTemp = num(+flags.dtemp) ? +flags.dtemp : 4.8;

    // Environmental temperature lapse below inversion (-6.5 °C / km)
    const gammaStd = 0.0065;
    const tBase = t0 - (gammaStd * invBase);
    const tTop = tBase + dTemp; // Inversion: temperature increases with height!
    const invGradient = (dTemp / invDepth) * 100; // °C per 100m

    // Ventilation Index (m²/s) = Mixing Height (m) * Wind Speed (m/s)
    const u10ms = u10 / 3.6;
    const ventIndex = Math.round(invBase * u10ms);
    const ventRating = ventIndex < 1500 ? 'HAZARDOUS (Severe Trapping)' :
                       ventIndex < 3000 ? 'POOR (Stagnant Airshed)' :
                       ventIndex < 5000 ? 'MARGINAL (Moderate Retention)' : 'GOOD (Active Cleansing)';

    // Stagnation Factor (0 to 100%)
    const windPenalty = Math.max(0, 1 - (u10 / 25));
    const invPenalty = Math.min(1.0, dTemp / 8.0);
    const altPenalty = Math.max(0.2, Math.min(1.0, 1000 / invBase));
    const stagnation = Math.min(99, Math.round((windPenalty * 0.45 + invPenalty * 0.35 + altPenalty * 0.20) * 100));

    // Trapped Pollutant Dispersion Index (PDI) [1 - 100]
    const pdi = Math.min(99, Math.max(1, Math.round((10000 / (ventIndex + 120)) * (dTemp / 2.5))));

    out.hd(`SIMULATION // LOW-LEVEL THERMAL INVERSION & AIRSHED STAGNATION`);
    out.dim(`Context: ${c.place.name} · Baseline Surface Temp: ${t0.toFixed(1)} °C · Surface Wind: ${u10.toFixed(1)} km/h`);
    out.line();

    const metricsTable = [
      ['Inversion Base Height', `${invBase} m AGL`],
      ['Inversion Top Height', `${invTop} m AGL`],
      ['Inversion Thickness', `${invDepth} m`],
      ['Thermal Inversion Jump (ΔT)', `+${dTemp.toFixed(1)} °C (dT/dz = +${invGradient.toFixed(2)} °C/100m)`],
      ['Ventilation Index (V_i)', `${ventIndex} m²/s [${ventRating}]`],
      ['Surface Stagnation Factor', `${stagnation}% [${stagnation > 75 ? 'CRITICAL' : stagnation > 45 ? 'ELEVATED' : 'NOMINAL'}]`],
      ['Trapped Dispersion Index (PDI)', `${pdi} / 100`],
      ['Stability Regimes', `Sub-inversion: Neutral/Stable | Inversion Lid: Strongly Inverted (LID)`]
    ];
    out.kv(metricsTable);
    out.line();

    // ASCII Vertical Profile Matrix
    out.section('VERTICAL THERMAL SOUNDING PROFILE:');
    const zLevels = [
      { name:'TROPO FREE ', z: invTop + 350, t: tTop - (gammaStd * 350), tag:'COOLING' },
      { name:'INV TOP    ', z: invTop,       t: tTop,                  tag:'WARM CAP' },
      { name:'INV BASE   ', z: invBase,      t: tBase,                 tag:'COLD BASE' },
      { name:'MID BOUND  ', z: Math.round(invBase * 0.5), t: t0 - (gammaStd * invBase * 0.5), tag:'MIXING' },
      { name:'SURFACE    ', z: 0,            t: t0,                    tag:'GROUND' }
    ];
    const profRows = zLevels.map(lvl => [
      lvl.name,
      `${lvl.z} m`,
      `${lvl.t.toFixed(1)} °C`,
      `[${'='.repeat(Math.max(1, Math.min(18, Math.round((lvl.t + 10) * 0.4))))}]`,
      lvl.tag
    ]);
    out.table(['ATMOS LAYER','ALTITUDE','TEMP','GRAPH','LAYER DYNAMICS'], profRows, ['l','r','r','l','l']);
    return;
  }

  /* -----------------------------------------------------------
     2. GAUSSIAN PLUME DISPERSION SIMULATION
     ----------------------------------------------------------- */
  if(sub === 'plume'){
    const qRate = num(+flags.source) ? +flags.source : 100; // g/s
    const windKmh = num(+flags.wind) ? +flags.wind : (v.wind_speed_10m || 14.0);
    const u = Math.max(0.8, windKmh / 3.6); // wind speed m/s
    const stackH = 25; // Release height (m)

    out.hd(`SIMULATION // 2D ATMOSPHERIC GAUSSIAN PLUME DISPERSION`);
    out.dim(`Source Emission: ${qRate.toFixed(1)} g/s | Advection Wind: ${windKmh.toFixed(1)} km/h (${u.toFixed(1)} m/s) | Effective Stack H: ${stackH} m`);
    out.line();

    // Crosswind Y grid (-250m to +250m) vs Downwind X grid (100m to 1500m)
    const yGrid = [250, 150, 80, 0, -80, -150, -250];
    const xGrid = [100, 200, 350, 500, 700, 950, 1200, 1500];

    // Compute ground-level concentration matrix (mg/m³)
    let maxC = 0, xPeak = 0;
    const matrix = [];
    for(const y of yGrid){
      const row = [];
      for(const x of xGrid){
        // Briggs dispersion coefficients for neutral (Class D) conditions
        const sigY = 0.08 * x * Math.pow(1 + 0.0001 * x, -0.5);
        const sigZ = 0.06 * x * Math.pow(1 + 0.0015 * x, -0.5);
        const cVal = (qRate / (Math.PI * u * sigY * sigZ)) *
                     Math.exp(-0.5 * Math.pow(y / sigY, 2)) *
                     Math.exp(-0.5 * Math.pow(stackH / sigZ, 2));
        if(cVal > maxC){ maxC = cVal; xPeak = x; }
        row.push(cVal);
      }
      matrix.push(row);
    }

    // ASCII Density Shading
    const charShade = val => {
      const r = maxC > 0 ? val / maxC : 0;
      if(r >= 0.75) return '█';
      if(r >= 0.45) return '▓';
      if(r >= 0.20) return '▒';
      if(r >= 0.05) return '░';
      return '·';
    };

    let asciiMap = '    Y (cross) │ Downwind Distance X ──► (100 m to 1500 m)\n';
    asciiMap   += '  ────────────┼─────────────────────────────────────────────\n';
    yGrid.forEach((y, i) => {
      const yLabel = (y >= 0 ? `+${y}` : `${y}`).padStart(6, ' ') + ' m │ ';
      const cells = matrix[i].map(cVal => '  ' + charShade(cVal) + '  ').join('');
      asciiMap += yLabel + cells + '\n';
    });
    asciiMap   += '              │  100m   200m   350m   500m   700m   950m  1200m  1500m\n';

    out.pre(asciiMap, 'c-spark');
    out.line();
    out.kv([
      ['Peak Ground Level Conc. (C_max)', `${(maxC * 1000).toFixed(2)} µg/m³`],
      ['Peak Ground Impact Distance', `~${xPeak} m downwind`],
      ['Plume Lateral Spread (2·σ_y @ 1km)', `~${Math.round(2 * (0.08 * 1000 * Math.pow(1 + 0.0001 * 1000, -0.5)))} m`],
      ['Dilution Rate (X=200m vs X=1500m)', `1 : ${(matrix[3][1] / Math.max(1e-6, matrix[3][7])).toFixed(1)}`],
      ['Legend', '· <5%  |  ░ 5-20%  |  ▒ 20-45%  |  ▓ 45-75%  |  █ ≥75% of C_max']
    ]);
    return;
  }

  /* -----------------------------------------------------------
     3. SOUNDING PARCEL ASCENT SIMULATION
     ----------------------------------------------------------- */
  if(sub === 'parcel'){
    const t0 = v.temperature_2m;
    const td0 = tdOf(v);
    const p0 = v.surface_pressure || 1013.25;
    const lclH = Math.max(0, 125 * (t0 - td0));

    out.hd(`SIMULATION // CONVECTIVE PARCEL ASCENT & THERMODYNAMIC SOUNDING`);
    out.dim(`Parcel Source: Ground (${p0.toFixed(0)} hPa, T₀=${t0.toFixed(1)} °C, Td₀=${td0.toFixed(1)} °C)`);
    out.line();

    // Ascent steps: Surface, 300m, LCL, 1500m, 3000m, 5000m
    const zSteps = [0, 300, Math.round(lclH), 1500, 3000, 5000].sort((a,b)=>a-b);
    const uniqueSteps = [...new Set(zSteps)];

    const parcelSounding = uniqueSteps.map(z => {
      let tParcel, phase;
      if(z <= lclH){
        // Dry adiabatic cooling (9.8 °C / km)
        tParcel = t0 - (0.0098 * z);
        phase = 'DRY ADIABATIC (Unsaturated)';
      } else {
        // Moist pseudo-adiabatic cooling (~5.5 °C / km)
        const tAtLcl = t0 - (0.0098 * lclH);
        tParcel = tAtLcl - (0.0055 * (z - lclH));
        phase = 'MOIST ADIABATIC (Condensing)';
      }
      // Estimated environmental ambient temperature
      const tEnv = t0 - (0.0065 * z);
      const buoyancy = tParcel - tEnv; // Virtual temperature buoyancy approximation
      return [
        `${z} m`,
        `${tParcel.toFixed(1)} °C`,
        `${tEnv.toFixed(1)} °C`,
        `${buoyancy >= 0 ? '+' : ''}${buoyancy.toFixed(1)} °C`,
        buoyancy > 0.5 ? 'ACCELERATING (Pos. Buoyant)' : buoyancy >= -0.5 ? 'NEUTRAL' : 'STABLE (Inhibited)',
        phase
      ];
    });

    out.table(['ALTITUDE','PARCEL TEMP','ENV TEMP','BUOYANCY (ΔT)','PARCEL VECTOR','STATE'], parcelSounding, ['r','r','r','r','l','l']);
    out.dim(`Lifting Condensation Level (LCL): ${Math.round(lclH)} m AGL. Above LCL, latent heat of condensation offsets dry expansion.`);
    return;
  }

  // If sub-command is not recognized:
  out.err(`Error: Unknown simulation '${sub}'.`);
  out.dim(`Available simulations: 'simulate inversion', 'simulate plume', 'simulate parcel'`);
 }
});
commands.register('export', { group:'export', alias:['exp'], usage:'export --format <csv|cpp_struct|json> [--vars a,b] [--hours n] [--all] [--copy] [--download]', summary:'Export the context as CSV, a C++ struct for ESP32/Arduino, or JSON',
 flags:{ format:{type:'str',alias:['f']}, vars:{type:'list',alias:['v']}, hours:{type:'str',alias:['n'],help:'rows (csv, default 24) / forecast arrays (cpp_struct, default 0)'}, name:{type:'str',help:'C++ struct name'}, all:{type:'bool',help:'every variable'}, copy:{type:'bool'}, download:{type:'bool'} },
 examples:['export --format csv','export --format cpp_struct','export --format cpp_struct --vars temp,pressure,wind --hours 12','export --format csv --all --hours 48 --download'],
 complete:(p)=> /^(--?f(ormat)?)$/.test(p[p.length-2]||'') ? exporters.names() : ['--format','--vars','--hours','--all','--copy','--download'],
 async run({ term, out, args, flags }){
  const c = needCtx(term), fmtName = flags.format || args[0];
  if(!fmtName){ out.section('FORMATS'); out.kv(exporters.list().map(e => [e.name, e.summary])); return; }
  const ex = exporters.get(fmtName); if(!ex) throw new Error(`unknown format '${fmtName}' (${exporters.names().join(', ')})`);
  let keys = DEFAULT_EXPORT.filter(k => c.raw.hourly[k]);
  if(flags.all) keys = Object.keys(c.raw.hourly).filter(k => k !== 'time');
  if(flags.vars){ const r = resolveVars(c, flags.vars); if(r.bad.length) out.warn(`unknown variable(s): ${r.bad.join(', ')}`); keys = r.ok; }
  if(!keys.length) throw new Error('no variables selected');
  const text = ex.run(c, { keys, hours:flags.hours, name:flags.name });
  out.pre(text, 'c-code');
  if(flags.copy){ await navigator.clipboard.writeText(text); out.ok('✓ copied to clipboard'); }
  if(flags.download){
   const a = document.createElement('a'), blob = new Blob([text], { type:ex.mime });
   a.href = URL.createObjectURL(blob); a.download = `skylab_${c.place.name.toLowerCase().replace(/[^a-z0-9]+/g,'_')}.${ex.ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
   out.ok(`✓ downloaded ${a.download}`);
  }
  if(!flags.copy && !flags.download) out.dim('tip: add --copy or --download');
 }})
.register('copy', { group:'sys', alias:['clip'], usage:'copy', summary:'Copy the output of the previous command to the clipboard', keepLast:true,
 async run({ term, out }){ if(!term.lastText) throw new Error('nothing to copy'); await navigator.clipboard.writeText(term.lastText); out.ok(`✓ copied ${term.lastText.length} characters`); }})
.register('theme', { group:'sys', usage:'theme [modern|retro|amber]', summary:'Switch look: modern (light), retro (green phosphor CRT), amber (amber CRT)', keepLast:true,
 complete:()=>['modern','retro','amber'],
 run({ term, out, args }){
  const t = (args[0] || '').toLowerCase();
  if(!['modern','retro','amber'].includes(t)){ out.line(`current: ${term.theme}`); out.dim('usage: theme modern | retro | amber'); return; }
  SkyTerm.setTheme(t); out.ok(`theme → ${t}`);
 }})
.register('mock', { group:'sys', usage:'mock [on|off]', summary:'Use offline synthetic data instead of the live API', keepLast:true,
 complete:()=>['on','off'],
 run({ out, args }){ if(args[0]) CFG.mock = /^(on|1|true)$/i.test(args[0]); cache.clear(); out.line(`mock data: ${CFG.mock ? 'ON' : 'OFF'}  (cache cleared — run fetch)`); }})
.register('echo', { group:'sys', usage:'echo <text>', summary:'Print text', run({ out, args }){ out.line(args.join(' ')); }})
.register('date', { group:'sys', alias:['utc'], usage:'date', summary:'Current UTC time and local time at the context location', maxArgs:0, keepLast:true,
 run({ term, out }){ out.kv([['UTC', new Date().toISOString().replace('T',' ').slice(0,19)+'Z'], ['location now', term.ctx && term.ctx.raw.current ? term.ctx.raw.current.time.replace('T',' ') + '  ' + (term.ctx.raw.timezone||'') : '—']]); }});

/* =====================================================================
   MONTHLY OUTLOOK — ECMWF EC46 (46 days) via the Open-Meteo seasonal API
   ===================================================================== */
const monthlyCache = new Map();
const avgOf = a => { const v = a.filter(num); return v.length ? v.reduce((s,x) => s+x, 0)/v.length : null; };
const pctl = (a, p) => { const s = a.filter(num).sort((x,y) => x-y); if(!s.length) return null; const i = (s.length-1)*p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi]-s[lo])*(i-lo); };
async function fetchMonthly(pl, days, refresh){
 if(CFG.mock) throw new Error('monthly needs the live API — turn mock off with:  mock off');
 const key = `${pl.lat.toFixed(2)},${pl.lon.toFixed(2)}|${days}`, hit = monthlyCache.get(key);
 if(hit && !refresh && Date.now() - hit.t < 6*3600e3) return { ...hit.d, cached:true };
 const url = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${pl.lat}&longitude=${pl.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=${days}&timezone=auto`;
 const r = await fetch(url);
 if(!r.ok){ let j = {}; try{ j = await r.json(); }catch(e){} throw new Error(j.reason || `Open-Meteo seasonal HTTP ${r.status}`); }
 const raw = await r.json(), d = raw.daily;
 if(!d || !Array.isArray(d.time) || !d.time.length) throw new Error('the seasonal API returned no daily data for this location');
 // one column per ensemble member (temperature_2m_max, …_member01, …) or a single mean column
 const members = v => Object.keys(d).filter(k => k === v || k.startsWith(v + '_member')).map(k => d[k]);
 const mx = members('temperature_2m_max'), mn = members('temperature_2m_min'), pr = members('precipitation_sum');
 if(!mx.length) throw new Error('the seasonal API did not return temperature data');
 const col = (ms, i) => ms.map(m => m[i]).filter(num);
 const rows = d.time.slice(0, days).map((date, i) => { const x = col(mx,i), n = col(mn,i), p = col(pr,i);
  return { date, tmax:avgOf(x), lo:pctl(x,.1), hi:pctl(x,.9), tmin:avgOf(n), rain:avgOf(p), wet:p.length ? p.filter(v => v >= 1).length/p.length : null }; });
 const res = { rows, members:mx.length };
 monthlyCache.set(key, { t:Date.now(), d:res });
 return { ...res, cached:false };
}
commands.register('monthly', { group:'parse', alias:['month','outlook'], usage:'monthly [--days 7-46] [--daily] [--refresh]',
 summary:'Monthly outlook (ECMWF ensemble, up to 46 days): weekly temperature, rain and member spread', maxArgs:0,
 flags:{ days:{type:'str',alias:['n'],help:'outlook length, 7–46 (default 30)'}, daily:{type:'bool',help:'also print the day-by-day table'}, refresh:{type:'bool',alias:['r'],help:'bypass the 6 h cache'} },
 examples:['monthly','monthly --days 45','monthly --daily'],
 complete:()=>['--days','--daily','--refresh'],
 async run({ term, out, flags }){
  const c = needCtx(term), days = flags.days ? Math.round(+flags.days) : 30;
  out.dim(`GET seasonal-api.open-meteo.com/v1/seasonal …  (${days} days · ECMWF ensemble)`);
  const m = await fetchMonthly(c.place, days, flags.refresh), R = m.rows;
  out.hd(`▌ ${c.place.name} · monthly outlook · ${R[0].date} → ${R[R.length-1].date} · ${m.members} member${m.members > 1 ? 's' : ''}${m.cached ? ' · cached' : ''}`);
  const sum = a => a.reduce((s,x) => s + (num(x) ? x : 0), 0), weeks = [];
  for(let i = 0; i < R.length; i += 7) weeks.push(R.slice(i, i+7));
  out.table(['WEEK','DATES','TMAX','TMIN','TMAX p10…p90','RAIN mm','WET DAYS'],
   weeks.map((w,k) => [`W${k+1}`, `${w[0].date.slice(5)} … ${w[w.length-1].date.slice(5)}`, fmt(avgOf(w.map(x => x.tmax)),1), fmt(avgOf(w.map(x => x.tmin)),1),
    `${fmt(avgOf(w.map(x => x.lo)),0)}…${fmt(avgOf(w.map(x => x.hi)),0)}`, fmt(sum(w.map(x => x.rain)),1), fmt(sum(w.map(x => x.wet)),1)]),
   ['l','l','r','r','r','r','r']);
  out.line();
  out.line('  Tmax  ' + sparkline(R.map(x => x.tmax)), 'c-spark');
  out.line('  Tmin  ' + sparkline(R.map(x => x.tmin)), 'c-spark');
  out.line('  rain  ' + sparkline(R.map(x => x.rain), 0), 'c-spark');
  out.dim('        ' + R[0].date.slice(5) + ' '.repeat(Math.max(1, R.length - 10)) + R[R.length-1].date.slice(5));
  out.kv([['mean Tmax / Tmin', `${fmt(avgOf(R.map(x => x.tmax)),1)} / ${fmt(avgOf(R.map(x => x.tmin)),1)} °C`],
   ['total rain (ens. mean)', `${fmt(sum(R.map(x => x.rain)),0)} mm over ${R.length} days`],
   ['wettest week', (() => { const t = weeks.map(w => sum(w.map(x => x.rain))), k = t.indexOf(Math.max(...t)); return `W${k+1} · ${fmt(t[k],1)} mm`; })()]]);
  if(flags.daily) out.table(['DATE','TMAX','p10','p90','TMIN','RAIN mm','WET %'],
   R.map(x => [x.date.slice(5), fmt(x.tmax,1), fmt(x.lo,1), fmt(x.hi,1), fmt(x.tmin,1), fmt(x.rain,1), num(x.wet) ? fmt(x.wet*100,0) : '—']), ['l','r','r','r','r','r','r']);
  out.warn('Read weeks, not days: beyond ~2 weeks single days are not predictable. 36 km grid, not bias-corrected — an area outlook, not a point forecast.');
  out.dim('p10…p90 = range across ensemble members · WET DAYS = expected days with ≥ 1 mm · source: ECMWF EC46/SEAS5 via Open-Meteo');
 }});

/* =====================================================================
   10. EXPORTERS  (add yours with exporters.register)
   ===================================================================== */
const fNum = x => num(x) ? (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(4))) + 'f' : 'NAN';
const ident = s => s.replace(/[^A-Za-z0-9_]/g,'_').replace(/^(\d)/,'_$1');
const cStr = s => '"' + String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"';

exporters
.register('csv', { ext:'csv', mime:'text/csv', summary:'Hourly rows as CSV (--hours rows from now, default 24)',
 run(c,{ keys, hours }){
  const n = Math.max(1, Math.min(216, +hours || 24)), [a,b] = winIdx(c, c.i0, n), h = c.raw.hourly;
  const rows = [['time', ...keys].join(',')];
  for(let i=a;i<b;i++) rows.push([h.time[i], ...keys.map(k => num(h[k][i]) ? h[k][i] : '')].join(','));
  return rows.join('\n');
 }})
.register('cpp_struct', { ext:'h', mime:'text/x-c++hdr', alias:['cpp','arduino','esp32'], summary:'C++ struct + const instance for ESP32/Arduino (--hours N adds forecast arrays)',
 run(c,{ keys, hours, name }){
  const v = nowVals(c), d = derivedOf(v), sName = ident(name || 'SkyLabWeather'), inst = (name ? ident(name).toLowerCase() : 'skylab') + '_now';
  const L = [];
  L.push('// ─────────────────────────────────────────────────────────');
  L.push(`// SkyLab export · ${unitAscii(c.place.name)}${c.place.sub ? ', ' + unitAscii(c.place.sub) : ''}`);
  L.push(`// ${c.place.lat.toFixed(4)}, ${c.place.lon.toFixed(4)} · ${c.raw.elevation ?? '?'} m · ${v.time} (${c.raw.timezone || 'local'}) · source: Open-Meteo`);
  L.push('// units: degC, %, hPa, km/h, W/m2, J/kg, m   ·   NAN = value unavailable');
  L.push('// ─────────────────────────────────────────────────────────');
  L.push('#pragma once', '#include <math.h>   // NAN', '');
  L.push(`struct ${sName} {`, '  const char* location;', '  const char* time_iso;', '  float latitude;', '  float longitude;', '  float elevation_m;');
  keys.forEach(k => L.push(`  float ${ident(k)};${' '.repeat(Math.max(1, 34 - ident(k).length))}// ${unitAscii(unitOf(c,k)) || '-'}`));
  const DN = { air_density:'air_density_kgm3', dew_point:'dew_point_c', lcl:'lcl_m', wet_bulb:'wet_bulb_c', theta_e:'theta_e_k', shear:'shear_ms', density_alt:'density_alt_m' };
  const dk = Object.keys(DN).filter(k => num(d[k]));
  dk.forEach(k => L.push(`  float ${DN[k]};${' '.repeat(Math.max(1, 34 - DN[k].length))}// derived`));
  L.push('};', '');
  L.push(`static const ${sName} ${inst} = {`);
  L.push(`  ${cStr(c.place.name.normalize('NFD').replace(/[\u0300-\u036f]/g,''))},`, `  ${cStr(v.time)},`, `  ${fNum(c.place.lat)},`, `  ${fNum(c.place.lon)},`, `  ${fNum(c.raw.elevation)},`);
  [...keys.map(k => [k, v[k]]), ...dk.map(k => [DN[k], d[k]])].forEach(([k,x],i,all) => L.push(`  ${fNum(x)}${i < all.length-1 ? ',' : ' '} // ${k}`));
  L.push('};');
  const n = Math.max(0, Math.min(168, +hours || 0));
  if(n){
   L.push('', `#define SKYLAB_FCST_HOURS ${n}`);
   keys.forEach(k => L.push(`static const float skylab_${ident(k)}_fcst[SKYLAB_FCST_HOURS] = { ${c.raw.hourly[k].slice(c.i0, c.i0+n).map(fNum).join(', ')} };`));
  }
  return L.join('\n');
 }})
.register('json', { ext:'json', mime:'application/json', summary:'Current snapshot + derived metrics as JSON',
 run(c,{ keys }){ const v = nowVals(c), o = { location:c.place.name, latitude:c.place.lat, longitude:c.place.lon, elevation_m:c.raw.elevation, time:v.time, values:{}, derived:derivedOf(v) };
  keys.forEach(k => o.values[k] = { value:v[k] ?? null, unit:unitOf(c,k) }); return JSON.stringify(o, null, 2); }});

/* =====================================================================
   11. PUBLIC API
   ===================================================================== */
return { commands, metrics, exporters, CFG, Terminal, tokenize, parseArgs, fetchWeather, math:{ dewPoint, airDensity, wetBulb, thetaE, lclTemp, sparkline },
 setTheme(t){ const dr = document.getElementById('termDrawer'); if(!dr) return; dr.classList.remove('retro','amber'); if(t !== 'modern') dr.classList.add(t);
  if(termInst) termInst.theme = t; lsSet('termTheme', t);
  const b = document.getElementById('cliThemeBtn'); if(b) b.textContent = 'Theme: ' + t; } };
})();
/* ============ CLI: Hurricane Tracker storm reports ============ */
SkyTerm.commands.register('storms', {
  group: 'data',
  alias: ['storm', 'hurricane', 'hurricanes', 'cyclone', 'cyclones', 'tc'],

  usage: 'storms [name|id|number] [--refresh] [--all] [--raw]',
  summary: 'Hurricane Tracker: list active cyclones or inspect detailed storm reports',

  flags: {
    refresh: {
      type: 'bool',
      alias: ['r'],
      help: 'Refresh the shared Hurricane Tracker data'
    },
    all: {
      type: 'bool',
      alias: ['a'],
      help: 'Print detailed reports for every tracked storm'
    },
    raw: {
      type: 'bool',
      help: 'Also print the exact tracker data as JSON'
    }
  },

  examples: [
    'storms',
    'storms 1',
    'storms "<storm name>"',
    'storms --all',
    'storms --refresh',
    'storms 1 --raw'
  ],

  complete() {
    const list = hurrD && Array.isArray(hurrD.storms)
      ? hurrD.storms
      : [];

    return [
      '--refresh',
      '--all',
      '--raw',
      ...list.map(s => s.name.toLowerCase())
    ];
  },

  async run({ term, out, args, flags }) {
    out.dim('Reading the shared Hurricane Tracker feed…');

    // Same cache, requests, data and ordering as the tracker.
    const tracker = await hurrGet(!!flags.refresh);

    if (!tracker || !Array.isArray(tracker.storms)) {
      throw new Error('Hurricane Tracker returned invalid data.');
    }

    hurrBadge();

    // Do not filter out weak storms or systems with unknown winds.
    const list = tracker.storms;

    // Respect a city loaded with "fetch -loc", not just the website city.
    const reference = term.ctx && term.ctx.place
      ? term.ctx.place
      : place;

    const valid = n =>
      typeof n === 'number' && Number.isFinite(n);

    const missing = 'Not supplied';

    const timestamp = value => {
      const ms = typeof value === 'number'
        ? value
        : Date.parse(value || '');

      return Number.isFinite(ms)
        ? `${new Date(ms).toISOString()} (${hAgo(ms)})`
        : missing;
    };

    const coordinates = (lat, lon) => {
      if (!valid(lat) || !valid(lon)) return missing;

      const normalizedLon = ((lon + 180) % 360 + 360) % 360 - 180;

      return (
        `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ` +
        `${Math.abs(normalizedLon).toFixed(3)}° ` +
        `${normalizedLon >= 0 ? 'E' : 'W'}`
      );
    };

    const distance = s => {
      if (
        !reference ||
        !valid(reference.lat) ||
        !valid(reference.lon) ||
        !valid(s.lat) ||
        !valid(s.lon)
      ) return null;

      return hav(reference.lat, reference.lon, s.lat, s.lon);
    };

    const report = s => {
      const category = hCat(s.windKt);
      const km = distance(s);

      out.line();
      out.hd(`HURRICANE TRACKER // ${s.name.toUpperCase()}`);

      out.section('[01] SOURCE & ADVISORY');
      out.kv([
        ['Tracker ID', s.id || missing],
        ['Source', s.src || missing],
        ['Advisory timestamp', timestamp(s.updated)],
        ['Tracker dataset timestamp', timestamp(tracker.at)],
        ['Advisory / event report', s.url || missing]
      ]);

      out.section('[02] REPORTED INTENSITY');
      out.kv([
        ['Classification', hLabel(s)],
        [
          'Wind-based category',
          category >= 2
            ? `Saffir–Simpson Category ${category - 1}`
            : category === 1
              ? 'Tropical storm'
              : category === 0
                ? 'Tropical depression'
                : 'Unknown'
        ],
        [
          'Reported wind',
          valid(s.windKt)
            ? `${s.windKt.toFixed(1)} kt · ` +
              `${(s.windKt * 1.852).toFixed(1)} km/h · ` +
              `${(s.windKt * 1.15078).toFixed(1)} mph`
            : missing
        ],
        [
          'Central pressure',
          valid(s.pressure) ? `${s.pressure} hPa` : missing
        ],
        ['Wind averaging interval', 'Not specified in tracker data']
      ]);

      out.section('[03] POSITION & MOTION');
      out.kv([
        ['Centre coordinates', coordinates(s.lat, s.lon)],
        [
          'Hemisphere',
          s.lat > 0 ? 'Northern' : s.lat < 0 ? 'Southern' : 'Equator'
        ],
        ['Movement summary', hMove(s)],
        [
          'Movement bearing',
          valid(s.moveDir)
            ? `${(((s.moveDir % 360) + 360) % 360).toFixed(0)}°`
            : missing
        ],
        [
          'Translation speed',
          valid(s.moveMph)
            ? `${s.moveMph.toFixed(1)} mph · ` +
              `${(s.moveMph * 1.609344).toFixed(1)} km/h`
            : missing
        ],
        ['Distance reference', reference ? reference.name : 'No city loaded'],
        [
          'Distance to reference',
          valid(km)
            ? `${Math.round(km)} km · ${Math.round(km * 0.621371)} mi`
            : 'Unavailable'
        ]
      ]);

      // Same illustrative projection used by the tracker's dashed line.
      if (
        valid(s.moveDir) &&
        valid(s.moveMph) &&
        s.moveMph >= 1
      ) {
        const projected = hDest(
          s.lat,
          s.lon,
          s.moveDir,
          s.moveMph * 1.609 * 24
        );

        out.section('[04] CONSTANT-MOTION ILLUSTRATION');
        out.kv([
          ['Position after 24 hours', coordinates(projected[0], projected[1])]
        ]);
        out.warn(
          'Illustration only: assumes unchanged speed and direction. ' +
          'Not an official forecast or landfall prediction.'
        );
      }

      out.dim(
        'Peak gusts, wind radii and storm-surge forecasts are not supplied ' +
        'by the current tracker schema; they are not inferred here.'
      );

      if (flags.raw) {
        out.section('EXACT TRACKER RECORD');
        out.pre(JSON.stringify(s, null, 2), 'c-code');
      }
    };

    out.hd(`HURRICANE TRACKER // ${list.length} TRACKED SYSTEMS`);
    out.dim(`Dataset timestamp: ${timestamp(tracker.at)}`);

    if (!list.length) {
      out.line('The tracker currently lists no active tropical cyclones.');
      if (flags.raw) out.pre(JSON.stringify(tracker, null, 2), 'c-code');
      return;
    }

    const query = args.join(' ').trim().toLowerCase();

    if (query) {
      let matches;

      if (/^#?\d+$/.test(query)) {
        const index = Number(query.replace(/^#/, '')) - 1;
        matches = list[index] ? [list[index]] : [];
      } else {
        const exact = list.filter(s =>
          s.name.toLowerCase() === query ||
          String(s.id || '').toLowerCase() === query
        );

        matches = exact.length ? exact : list.filter(s =>
          s.name.toLowerCase().includes(query) ||
          String(s.id || '').toLowerCase().includes(query)
        );
      }

      if (!matches.length) {
        throw new Error(`no tracked storm matches "${query}" — run "storms" for the list`);
      }

      if (matches.length > 1) {
        out.warn(
          'Multiple matches: ' +
          matches.map(s => `${s.name} [${s.id}]`).join(', ')
        );
        out.dim('Use an exact name, ID or list number.');
        return;
      }

      report(matches[0]);
      return;
    }

    if (flags.all) {
      list.forEach(report);
      return;
    }

    out.dim(`Distance reference: ${reference ? reference.name : 'No city loaded'}`);
    out.line();

    out.table(
      ['#', 'NAME', 'CLASS', 'WIND', 'PRESSURE', 'MOTION', 'DISTANCE', 'SOURCE'],
      list.map((s, index) => {
        const km = distance(s);

        return [
          String(index + 1),
          s.name,
          hLabel(s),
          valid(s.windKt) ? hWind(s.windKt) : '—',
          valid(s.pressure) ? `${s.pressure} hPa` : '—',
          hMove(s),
          valid(km) ? hDist(km) : '—',
          s.src || '—'
        ];
      }),
      ['r', 'l', 'l', 'r', 'r', 'l', 'r', 'l']
    );

    out.line();
    out.dim('Detailed report: storms 1 | storms "<name>" | storms <id>');
    out.dim('Every report: storms --all | Refresh: storms --refresh');

    if (flags.raw) {
      out.pre(JSON.stringify(tracker, null, 2), 'c-code');
    }
  }
});
/* ============ Terminal lifecycle ============ */
function termShell(){
 let ov = $('#termOverlay');
 if(ov) return ov;
 ov = document.createElement('div');
 ov.className = 'term-overlay';
 ov.id = 'termOverlay';
 ov.setAttribute('aria-hidden', 'true');
 ov.innerHTML = `<aside class="term-drawer" id="termDrawer" role="dialog" aria-modal="true" aria-label="Skylab Atmospheric Physics Terminal">
  <div class="term-header">
   <div class="term-brand">
    <div class="term-brand-icon">
     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
    </div>
    <div class="term-titles">
     <h2>SKYLAB // ATMOSPHERIC PHYSICS TERMINAL <span class="term-cursor">_</span></h2>
     <p id="termOpTag">OPERATOR: LEVEL-2 TELEMETRY LINK</p>
    </div>
   </div>
   <div class="term-controls">
    <button class="term-btn-icon" id="termFsBtn" title="Toggle Fullscreen" aria-label="Toggle Fullscreen">⛶</button>
    <button class="term-btn-icon" id="termCloseBtn" title="Close Terminal (Esc)" aria-label="Close Terminal">✕</button>
   </div>
  </div>

  <div class="term-meta-strip">
   <div style="display:flex;align-items:center;gap:12px">
    <span><span class="term-dot" style="display:inline-block"></span> STREAM: ACTIVE</span>
    <span id="termCoords">LAT: --.---- LON: --.----</span>
    <span id="termElev">ELEV: -- m</span>
   </div>
   <div id="termUtc">UTC: ----/--/-- --:--:--</div>
  </div>

  <div class="term-nav-bar">
   <div class="term-chips" id="cliChips" role="toolbar" aria-label="Quick commands">
    <button class="term-chip" data-cmd="help">help</button>
    <button class="term-chip" data-cmd="now">now</button>
    <button class="term-chip" data-cmd="storms">storms</button>
    <button class="term-chip" data-cmd="monthly">monthly</button>
    <button class="term-chip" data-cmd="calc all">calc all</button>
    <button class="term-chip" data-cmd="simulate inversion">sim inversion</button>
    <button class="term-chip" data-cmd="simulate plume --wind 12 --source 120">sim plume</button>
    <button class="term-chip" data-cmd="simulate parcel">sim parcel</button>
   </div>
   <div class="term-actions">
    <button class="term-act-btn" id="cliCopyBtn" title="Copy the previous output">Copy last</button>
    <button class="term-act-btn" id="cliThemeBtn" title="Cycle modern / retro / amber">Theme: modern</button>
   </div>
  </div>

  <!-- Intentionally empty of data: output is written strictly after an authenticated open -->
  <div class="term-body cli" id="termBody">
   <div class="cli-out" id="cliOut" aria-live="polite"></div>
   <div class="cli-prompt"><label class="cli-ps1" id="cliPs1" for="cliIn"></label><div class="cli-inw"><div class="cli-hl" aria-hidden="true"><span></span></div><input id="cliIn" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Terminal command"></div></div>
  </div>
 </aside>`;
 document.body.appendChild(ov);

 $('#termCloseBtn').onclick = () => termClose();
 $('#termFsBtn').onclick = () => $('#termDrawer').classList.toggle('fullscreen');
 $('#termOverlay').onclick = (e) => { if(e.target === $('#termOverlay')) termClose(); };
 $('#termBody').addEventListener('click', () => { if(!getSelection().toString()) $('#cliIn').focus(); });
 $('#cliChips').addEventListener('click', e => {
  const b = e.target.closest('.term-chip'); if(!b || !termInst || termInst.busy) return;
  termInst.exec(b.dataset.cmd);
 });
 $('#cliCopyBtn').onclick = () => termInst && termInst.exec('copy');
 $('#cliThemeBtn').onclick = () => {
  const order = ['modern','retro','amber'], cur = termInst ? termInst.theme : 'modern';
  SkyTerm.setTheme(order[(order.indexOf(cur)+1) % order.length]);
 };
 return ov;
}

function termOpen(){
 if(!isUserAuth()){
  authOpen();
  toast(LANG==='pt'?'Terminal restrito a utilizadores registados. Inicia sessão.':'Terminal restricted to registered users. Please sign in.');
  return;
 }
 if(!data || !place){
  toast(LANG==='pt'?'A aguardar dados meteorológicos...':'Waiting for meteorological data...');
  return;
 }
 const ov = termShell();
 termIsOpen = true;
 ov.classList.add('active');
 ov.setAttribute('aria-hidden','false');
 document.documentElement.classList.add('hlock');

 $('#termOpTag').textContent = `OPERATOR: @${currentUser.username.toUpperCase()} // LEVEL-2 TELEMETRY LINK`;
 $('#termCoords').textContent = `LAT: ${place.lat.toFixed(4)}° LON: ${place.lon.toFixed(4)}°`;
 $('#termElev').textContent = `ELEV: ${data.elevation ?? 0} m`;
 const tick = () => { $('#termUtc').textContent = `UTC: ${new Date().toISOString().replace('T',' ').slice(0,19)}Z`; };
 tick(); clearInterval(termClockT); termClockT = setInterval(tick, 1000);

 if(!termInst){
  termInst = new SkyTerm.Terminal({ outEl:$('#cliOut'), inEl:$('#cliIn'), psEl:$('#cliPs1'), scrollEl:$('#termBody') });
 }
 let th = lsGet('termTheme') || 'modern';
 SkyTerm.setTheme(th);
 termInst.boot();
 setTimeout(() => { const i = $('#cliIn'); if(i && termIsOpen) i.focus(); }, 380);
}

function termClose(){
 termIsOpen = false;
 clearInterval(termClockT);
 const ov = $('#termOverlay');
 if(ov){
  ov.classList.remove('active');
  ov.setAttribute('aria-hidden','true');
 }
 document.documentElement.classList.remove('hlock');
 if(termInst) termInst.reset();   // purge telemetry from the DOM and from memory (history of typed commands is kept)
}

/* Event bindings */
const termBtnEl = $('#termBtn');
if(termBtnEl) termBtnEl.onclick = () => termOpen();
document.addEventListener('keydown', e => {
 if(e.key !== 'Escape' || !termIsOpen) return;
 const i = $('#cliIn');
 if(i && i.value){ i.value = ''; return; }
 termClose();
});


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
  }).catch(e => console.warn('[AutoStorms]', e));
  // Atualiza automaticamente a cada 10 minutos
  setInterval(() => {
    hurrGet(true).then(() => hurrBadge()).catch(() => {});
  }, 10 * 60 * 1000);
}
initAutoStorms();

// Carrega automaticamente os ciclones e furacões ativos em background
hurrGet().then(() => hurrBadge()).catch(() => {});
setInterval(() => { hurrGet(true).then(() => hurrBadge()).catch(() => {}); }, 10 * 60 * 1000);

/* ============ boot ============ */
(async()=>{
  if(currentToken){
    const serverPrefs = await prefsPull();
    if(prefsMerge(serverPrefs)) prefsApplied();
  }
  progUI(); favUI();
  const saved=lsGet('place')||(isUserAuth()&&lsGet('homeCity'))||null;   // sem local guardado → cidade principal
  const sh=sharedPlace();                                                  // ligação partilhada (#p=…) tem prioridade
  if(sh){clearHash();show(sh.lat,sh.lon,sh.name,sh.sub)}
  else if(saved)show(saved.lat,saved.lon,saved.name,saved.sub);else{landing();if(!navigator.onLine)offlineBar(true,0)}
})();

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
 const G={today:'now',week:'week',radar:'map',air:'air',sky:'sci',sci:'sci'};
 const NAV_L=()=>[T2('Now','Agora'),T2('Week','Semana'),T2('Maps','Mapas'),T2('Air','Ar'),T2('Science','Ciência')];
 const NAV=[['now','today'],['week','week'],['map','radar'],['air','air'],['sci','sky']];
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
<div class="m-list">${row('fav','star',T2('Favourite cities','Cidades favoritas'))}${row('hur','hur',T2('Hurricane tracker','Seguimento de furacões'),hn?`<span class="bd">${hn}</span>`:'',hot?' hot':'')}${wOn?row('wrn','warn',escH(wr.textContent.trim()),'<span class="em">IPMA</span>',' hot'):''}${$('#termBtn')&&!$('#termBtn').hidden?row('term','term',T2('Terminal','Terminal')):''}${$('#inst')&&!$('#inst').hidden?row('inst','dl',T2('Install app','Instalar app')):''}</div>
<div class="m-h">${T2('Preferences','Preferências')}</div>
<div class="m-pref"><span>${T2('Units','Unidades')}</span><div class="m-seg" role="group"><button type="button" data-u="c" aria-pressed="${unit==='c'}">°C</button><button type="button" data-u="f" aria-pressed="${unit==='f'}">°F</button></div></div>
<div class="m-pref"><span>${T2('Language','Idioma')}</span><div class="m-seg" role="group"><button type="button" data-l="pt" aria-pressed="${LANG==='pt'}">PT</button><button type="button" data-l="en" aria-pressed="${LANG==='en'}">EN</button></div></div>
<div class="m-pref"><span>${T2('Ambient sound','Som ambiente')}<small>${T2('Weather sounds that follow the sky','Sons do tempo que acompanham o céu')}</small></span><button type="button" class="m-sw" data-act="snd" role="switch" aria-pressed="${!!sOn}" aria-label="${T2('Ambient sound','Som ambiente')}"></button></div>
<p class="m-credits">${T2('Weather by','Tempo por')} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · ${T2('Places by','Locais por')} <a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener">BigDataCloud</a> · ${T2('Pollen by','Pólen por')} <a href="https://atmospore.ai/" target="_blank" rel="noopener">Atmospore</a> · ${T2('Portugal forecasts and warnings by','Previsões e avisos de Portugal pelo')} <a href="https://www.ipma.pt/" target="_blank" rel="noopener">IPMA</a> · <a href="mailto:${CONTACT_EMAIL}">${T2('Contact','Contacto')}</a> · <button type="button" class="priv-link" data-priv>${T2('Privacy','Privacidade')}</button></p>`}
 function menuOpen(){$('#mMenuB').innerHTML=menuHTML();openSheet('mMenu')}
 const PROXY={auth:'#authBtn',fav:'#favBtn',hur:'#hbtn',term:'#termBtn',inst:'#inst'};
 function menuClick(e){
  const u=e.target.closest('[data-u]'),l=e.target.closest('[data-l]'),a=e.target.closest('[data-act]');
  if(u){setUnit(u.dataset.u,true);if(openId==='mMenu')$('#mMenuB').innerHTML=menuHTML();return}
  if(l){setLang(l.dataset.l);setTimeout(()=>{if(openId==='mMenu')$('#mMenuB').innerHTML=menuHTML()},60);return}
  if(!a)return;const k=a.dataset.act;
  if(k==='snd'){const s=$('#snd');if(s)s.click();a.setAttribute('aria-pressed',s&&s.getAttribute('aria-pressed')==='true');return}
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
 let eng=null,clicks=[],bag=[],thinking=false,angry=false,calmT=0,thinkT=0,hue=0,madN=0,lastTxt='';
 function say(txt,mad){
  const b=$('#orbB'),p=$('#orbT');if(!b||!p)return;
  p.textContent=txt;b.classList.toggle('mad',!!mad);b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');lastTxt=txt
 }
 function dots(){const p=$('#orbT');if(p)p.innerHTML='<span class="orb-dots" aria-label="…"><i></i><i></i><i></i></span>'}
 function nextLine(){
  if(!bag.length){bag=[plan().text,...weatherLines(),...CUR[P()?'pt':'en']];for(let i=bag.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[bag[i],bag[j]]=[bag[j],bag[i]]}}
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
 function goAngry(){
  if(!angry){angry=true;clearTimeout(thinkT);thinking=false;eng.mode='angry';eng.set(RED,500);$('#orb').classList.add('angry');madN=0}
  const L=MAD[P()?'pt':'en'];say(L[Math.min(madN,L.length-1)],true);madN++;fx('ping',700);
  clearTimeout(calmT);calmT=setTimeout(calm,6500);
 }
 function calm(){
  angry=false;clicks=[];madN=0;const o=$('#orb');if(o)o.classList.remove('angry');
  eng.mode='idle';eng.set(palHue(hue||basePal().hue),1400);say(CALM[P()?'pt':'en']);
 }
 function onClick(){
  const now=Date.now();clicks=clicks.filter(t=>now-t<4000);clicks.push(now);
  if(angry||clicks.length>=6)return goAngry();
  think();
 }
 function mount(){
  const cv=$('#orbCv');if(!cv)return;
  if(eng)eng.stop();
  clicks=[];bag=[];thinking=false;angry=false;clearTimeout(calmT);clearTimeout(thinkT);hue=0;madN=0;lastTxt='';
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
 const _st=setTab;setTab=function(k){_st(k);if(k==='today')mount()};
})();
