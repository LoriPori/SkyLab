/* Skylab · boot.js — early mobile/desktop detection + delegated img/click fallbacks (must load first) · load order 01/28 (classic script, shared global scope) */
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
