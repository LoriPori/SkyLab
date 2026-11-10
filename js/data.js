/* Skylab · data.js — weather fetching, offline cache, show/locate/error · load order 06/28 (classic script, shared global scope) */
/* ============ fetching ============ */
const bootWait=p=>Promise.race([p,new Promise(r=>setTimeout(()=>r(null),2500))]);
async function getWeather(lat,lon){
 const bt=window.__skyBoot;   // pedido ao worker (/boot) lançado pelo early.js enquanto o app.js descarregava
 if(bt&&!bt.used&&bt.key===lat+','+lon&&Date.now()-bt.t<9e4){
  bt.used=true;
  try{const j=await bootWait(bt.p);if(j&&j.data&&j.data.current&&j.data.hourly)return j.data}catch(e){}
 }
 const cur = 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,dew_point_2m,pressure_msl,wind_gusts_10m,wind_speed_80m,wind_direction_80m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation,uv_index,vapor_pressure_deficit';
 const hourly = 'temperature_2m,weather_code,precipitation_probability,is_day,surface_pressure,dew_point_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_direction_80m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation,uv_index,vapor_pressure_deficit,boundary_layer_height';
 const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${cur}&hourly=${hourly}&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&minutely_15=precipitation&forecast_minutely_15=8&timezone=auto&forecast_days=7`;
 const r=await fetch(u);if(!r.ok)throw new Error('Weather service unavailable');return r.json();
}
async function reverse(lat,lon){
 const bt=window.__skyBoot;
 if(bt&&!bt.revUsed&&bt.key===lat+','+lon){bt.revUsed=true;try{const j=await bootWait(bt.p);if(j&&j.rev&&j.rev.name)return j.rev}catch(e){}}
 try{
  const r=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${LANG}`);const j=await r.json();
    return{name:j.locality||j.city||'Your location',sub:[j.principalSubdivision,j.countryName].filter(Boolean).join(', ')};   // locality = freguesia/localidade (Castanheira); city = concelho (Vila Franca de Xira)
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
