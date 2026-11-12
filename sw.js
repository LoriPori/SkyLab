const C='skylab-v18';   // sobe sempre que mudares index.html / styles.css / js/: apaga a cache antiga no 'activate'
/* A lista do 'install' tem de existir TODA, senão caches.addAll falha e o SW nunca activa (era o caso do app.js).
   Por isso: poucos ficheiros essenciais, cada um tolerante a falha; o resto entra na cache à medida que é usado. */
const SHELL=['./','index.html','styles.css','early.js','js/nowcast.js','js/nowcast_worker.js'];
self.addEventListener('install',e=>{
 self.skipWaiting();
 e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))));
});
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>clients.claim())
));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin)return; // never cache weather, radar or pollen
 e.respondWith(fetch(e.request).then(r=>{
   if(r.ok&&r.status===200){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp)).catch(()=>{})}   // não tenta guardar respostas parciais (206)
   return r;
 }).catch(()=>caches.match(e.request)));
});

/* ---- notificações push ---- */
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(_){}
  e.waitUntil(self.registration.showNotification(d.title||'Skylab',{
    body:d.body||'',icon:'icon-web.png',badge:'icon-web.png',
    tag:d.tag||'skylab-weather',data:{url:d.url||'./'}
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  let url=(e.notification.data&&e.notification.data.url)||'./';
  try{ if(new URL(url,location.href).origin!==location.origin) url='./'; }catch(_){ url='./'; }   // só abre páginas do próprio site
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l) if('focus' in c) return c.focus();
    return clients.openWindow(url);
  }));
});
