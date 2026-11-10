/* Skylab · helpers.js — text helpers: hero lines, comfort, moon, advice, sound, signals · load order 07/28 (classic script, shared global scope) */
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
