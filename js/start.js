/* Skylab · start.js — app start-up (must load LAST: runs after every file has defined/patched everything) · load order 28/28 (classic script, shared global scope) */
/* ============ boot ============ */
(async()=>{
  const sh=sharedPlace();                                                  // ligação partilhada (#p=…) tem prioridade
  let pp=currentToken?prefsPull():null;                                    // em paralelo com a previsão
  if(pp&&!lsGet('place')&&!sh){ const sp=await pp; pp=null; if(prefsMerge(sp)) prefsApplied(); }   // sem local guardado: precisa da nuvem (cidade principal)
  progUI(); favUI();
  const saved=lsGet('place')||(isUserAuth()&&lsGet('homeCity'))||null;
  if(sh){clearHash();show(sh.lat,sh.lon,sh.name,sh.sub)}
  else if(saved)show(saved.lat,saved.lon,saved.name,saved.sub);else{landing();if(!navigator.onLine)offlineBar(true,0)}
  if(pp)pp.then(sp=>{ if(prefsMerge(sp)){ const np=lsGet('place'); prefsApplied();
    if(np&&lastTry&&!sh&&(np.lat!==lastTry.lat||np.lon!==lastTry.lon))show(np.lat,np.lon,np.name,np.sub) } });
})();
