/* Skylab · early.js — tiny, loaded in <head> before app.js.
   1) picks the mobile/desktop layout right away (the page was hidden until app.js had downloaded);
   2) when ONLINE, asks the worker for the forecast + a server-rendered first-paint card while app.js is still downloading.
   Offline (or if the worker fails) nothing happens here and app.js renders on the client from its own cache, as before. */
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
  d.classList.add(mob?'is-mobile':'is-desktop');d.dataset.ui=mob?'mobile':'desktop';

  /* Natal: só de 1 de dezembro a 1 de janeiro (a virada de ano está coberta: mês 11, ou mês 0 e dia 1).
     ?xmas=1 / ?xmas=0 forçam ligado/desligado durante a sessão (para testar). Fora de época, nada disto é descarregado. */
  try{
    var qx=new URLSearchParams(location.search).get('xmas');if(qx==='1'||qx==='0')sessionStorage.setItem('xmas',qx);
    var qd=new URLSearchParams(location.search).get('xmasdate');   // ex.: ?xmasdate=2026-12-24T10:30:00Z  (relógio falso; ?xmasdate=off limpa)
    if(qd==='off')sessionStorage.removeItem('xmasdate');else if(qd&&!isNaN(Date.parse(qd)))sessionStorage.setItem('xmasdate',qd);
    var fd=sessionStorage.getItem('xmasdate'),sk=fd?Date.parse(fd)-Date.now():0,nw=new Date(Date.now()+sk);
    var fx=sessionStorage.getItem('xmas'),xm=fd?true:fx==='1'?true:fx==='0'?false:(nw.getMonth()===11||(nw.getMonth()===0&&nw.getDate()===1));
    if(xm){
      d.classList.add('xmas');
      var lk=document.createElement('link');lk.rel='stylesheet';lk.href='xmas.css';document.head.appendChild(lk);
      var sc=document.createElement('script');sc.src='xmas.js';sc.defer=true;document.head.appendChild(sc);
    }
  }catch(e){}

  try{
    if(navigator.onLine===false||/^#p=/.test(location.hash))return;
    var p=JSON.parse(localStorage.getItem('place'));
    if(!p||!isFinite(p.lat)||!isFinite(p.lon))return;
    var lang=JSON.parse(localStorage.getItem('lang'))||((navigator.language||'').toLowerCase().indexOf('pt')===0?'pt':'en');
    var u=JSON.parse(localStorage.getItem('unitPick'))||(lang==='pt'?'c':'f');
    var W='https://aged-mountain-a883.lourencoalvesfonseca2011.workers.dev';
    var url=W+'/boot?lat='+p.lat+'&lon='+p.lon+'&lang='+lang+'&u='+u+(p.name?'&name='+encodeURIComponent(String(p.name).slice(0,80))+'&sub='+encodeURIComponent(String(p.sub||'').slice(0,100)):'');
    var pr=fetch(url,{mode:'cors',credentials:'omit'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});
    window.__skyBoot={key:p.lat+','+p.lon,t:Date.now(),p:pr};
    pr.then(function(j){
      var m=document.getElementById('main');
      if(j&&j.html&&m&&!m.querySelector('.sheet,#hero'))m.innerHTML=j.html;   // só se o app.js ainda não desenhou nada
    });
  }catch(e){}
})();
