/* Skylab · alerts.js — silent severe-weather alerts · load order 19/28 (classic script, shared global scope) */
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
