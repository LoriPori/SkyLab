/* Skylab · landing.js — landing page + city list · load order 14/28 (classic script, shared global scope) */
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
