/* Skylab · render.js — main render() · load order 13/28 (classic script, shared global scope) */
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
 setTab(tab);loadExtras();loadXtra();
 checkAlerts();
 document.title=`${T(c.temperature_2m)}° ${place.name} — Skylab`;
  if(fresh){
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    // Preserve scroll position when updating state
    window.scrollTo(0, y);
  }
}
