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
      if(j&&j.html&&m&&!m.firstElementChild)m.innerHTML=j.html;   // só se o app.js ainda não desenhou nada
    });
  }catch(e){}
})();
