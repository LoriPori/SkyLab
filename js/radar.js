/* Skylab · radar.js — radar tab: wind, tiles, geo-referencing, temperature, borders, isobars · load order 20/28 (classic script, shared global scope) */
/* ═══════════ RADAR — radar tab: wind particles, geo-referencing, temperature, borders, isobars ═══════════ */
/* ============ Radar tab ============ */
const RADAR_KINDS = [
  ['rain', 'Rain'],
  ['wind', 'Wind'],
  ['cloud', 'Clouds'],
  ['temp', 'Temperature'],
  ['sat', 'Satellite']
];
const OWM_KINDS={wind:{
 layer:'wind_new',
 note:'Wind speed (colours) and direction (moving particles) · OpenWeatherMap + NOAA GFS',
 lo:()=>unit=='c'?'0 km/h':'0 kt',
 hi:()=>unit=='c'?'120+ km/h':'65+ kt',
 grad:'linear-gradient(90deg,#cfe6f5 0%,#aacbe6 15%,#b364bc 40%,#7a4cac 65%,#46009f 100%)'
}};
let radarMap,radarLayers=[],radarFrames=[],radarIdx=0,radarTimer,radarPlay=!still,radarKind='rain',radarMeta=null,radarMetaT=0,radarTok=0,leafletP;
let radarScope = lsGet('radarScope') || 'pt';
let radarKT=0;
const BLANK='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/* ============ Tiles GFS próprios (Cloudflare R2) · NOAA/NCEP GFS 0,25°, análise ============
   O GitHub Actions (PYTHON/gfs_tiles.py) descodifica o GRIB2 de 6 em 6 h e guarda no R2 três ficheiros globais
   (1440×721, uint16 + delta por linha + gzip): wind (u,v), temp, pmsl. O worker serve-os em /gfs/…
   O cliente descarrega cada campo UMA vez por ciclo e amostra-o localmente: sem pedidos ao arrastar, sem 429.
   Se os tiles faltarem ou estiverem com mais de 14 h, tudo cai no método antigo (Open-Meteo /grid e /pressure). */
const TL_MAXAGE=14*3600e3;
let tlMan=null,tlManAt=0,tlManP=null,tlFail=0,tlF={},tlFP={},tlWG=null,tlPG=null;
const tlFresh=m=>!!m&&Date.now()-m.ts<TL_MAXAGE;
async function tlManifest(){
  if(tlMan&&Date.now()-tlManAt<6e5)return tlMan;
  if(tlManP)return tlManP;
  if(Date.now()<tlFail)return tlFresh(tlMan)?tlMan:null;
  tlManP=(async()=>{
    try{
      const r=await fetch(WORKER+'/gfs/manifest',{signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const m=await r.json();
      if(!m||m.v!==1||!(m.w>=8)||!(m.h>=8)||!(m.st>0)||!/^\d{10}$/.test(m.run||'')||!m.wind||!m.temp||!m.pmsl)throw new Error('forma');
      if(!tlFresh(m))throw new Error('desatualizado');
      if(!tlMan||tlMan.run!==m.run){tlF={};tlFP={};tlWG=null;tlPG=null}
      tlMan=m;tlManAt=Date.now();tlFail=0;return m;
    }catch(e){console.warn('[Tiles]',e.message);tlFail=Date.now()+12e4;return tlFresh(tlMan)?tlMan:null}
    finally{tlManP=null}
  })();
  return tlManP;
}
/* descarrega e descodifica um campo ('wind' | 'temp' | 'pmsl') → {run, planes:[Float32Array…]} (linha 0 = sul, coluna 0 = lon0) */
async function tlField(name){
  const m=await tlManifest();if(!m)return null;
  const c=tlF[name];if(c&&c.run===m.run)return c;
  if(tlFP[name]&&tlFP[name].run===m.run)return tlFP[name].p;
  const slot={run:m.run};tlFP[name]=slot;
  slot.p=(async()=>{
    try{
      const d=m[name],r=await fetch(`${WORKER}/gfs/f/${m.run}/${d.f}`,{signal:AbortSignal.timeout(45000)});
      if(!r.ok)throw new Error('HTTP '+r.status);
      let buf=await r.arrayBuffer();
      const h8=new Uint8Array(buf,0,Math.min(2,buf.byteLength));
      if(h8[0]===0x1f&&h8[1]===0x8b)                                // ainda em gzip (cabeçalho Content-Encoding perdido pelo caminho): descomprime aqui
        buf=await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const q=new Uint16Array(buf),n=m.w*m.h;
      if(q.length!==n*d.planes)throw new Error('tamanho');
      const planes=[];
      for(let k=0;k<d.planes;k++){
        const f=new Float32Array(n);
        for(let y=0;y<m.h;y++){let prev=0;const o=k*n+y*m.w;for(let x=0;x<m.w;x++){prev=(prev+q[o+x])&65535;f[y*m.w+x]=prev/d.sc-d.off}}
        planes.push(f);
      }
      const o={run:m.run,planes};
      if(tlMan&&tlMan.run===m.run)tlF[name]=o;
      return o;
    }catch(e){console.warn('[Tiles]',name,e.message);return null}
    finally{if(tlFP[name]===slot)delete tlFP[name]}
  })();
  return slot.p;
}
/* bilinear no campo global (a longitude dá a volta ao mundo) */
function tlBil(m,f,lat,lon){
  const w=m.w,h=m.h,st=m.st,la=Math.max(m.lat0,Math.min(m.lat0+(h-1)*st,lat)),fy=(la-m.lat0)/st,y0=Math.min(h-2,Math.floor(fy)),ty=fy-y0;
  const fx=((((lon-m.lon0)%360)+360)%360)/st,xf=Math.floor(fx),tx=fx-xf,x0=xf%w,x1=(x0+1)%w,r0=y0*w,r1=r0+w;
  return f[r0+x0]*(1-tx)*(1-ty)+f[r0+x1]*tx*(1-ty)+f[r1+x0]*(1-tx)*ty+f[r1+x1]*tx*ty;
}
const tlTempReady=()=>!!(tlMan&&tlF.temp&&tlF.temp.run===tlMan.run);
function tlTempAt(lat,lon){return tlTempReady()?tlBil(tlMan,tlF.temp.planes[0],lat,lon):NaN}
/* vento: grelha global em km/h, no formato que windSample/windBuild já usam (g.global) */
async function tlWindGrid(){
  const c=await tlField('wind'),m=tlMan;if(!c||!m||c.run!==m.run)return null;
  if(tlWG&&tlWG.run===c.run){tlWG.t=Date.now();return tlWG}
  const n=m.w*m.h,u=new Float32Array(n),v=new Float32Array(n),a=c.planes[0],b=c.planes[1];
  for(let k=0;k<n;k++){u[k]=a[k]*3.6;v[k]=b[k]*3.6}                 // m/s → km/h
  tlWG={global:true,run:c.run,s:m.lat0,n:m.lat0+(m.h-1)*m.st,w:m.lon0,e:m.lon0+360,rows:m.h,cols:m.w,st:m.st,u,v,z:99,t:Date.now()};
  return tlWG;
}
/* pressão: 1 nó em cada 3 (0,75°) → mesmo formato do /pressure (hPa, linha 0 = sul) */
async function tlPressureGrid(){
  const c=await tlField('pmsl'),m=tlMan;if(!c||!m||c.run!==m.run)return null;
  if(tlPG&&tlPG.rid===c.run){tlPG.at=Date.now();return tlPG}
  const S=3,w=Math.floor(m.w/S),h=Math.floor((m.h-1)/S)+1,p=new Float32Array(w*h),f=c.planes[0];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)p[y*w+x]=f[y*S*m.w+x*S];
  tlPG={rid:c.run,w,h,st:m.st*S,lat0:m.lat0,lon0:m.lon0,p,at:Date.now(),run:new Date(m.ts).toISOString(),src:m.src||'NOAA/NCEP GFS 0.25°',ext:[]};
  return tlPG;
}
/* ===== Vento: partículas animadas (substitui as setas) ===== */
let windTok=0,windT=0,windCv=null,windCx=null,windRaf=0,windLast=0,windGrid=null,windFld=null,windP=[];
// Change from {rows:6, cols:8} to:
const WGR = { rows: 8, cols: 12 }, WSTEP = 6, WK = .045, WFADE = .045;const WBK=[[0,12,.38,1],[12,35,.58,1.2],[35,60,.78,1.5],[60,1e9,.92,1.8]];

function windStopLoop(){cancelAnimationFrame(windRaf);windRaf=0}
function windClear(){if(windCx&&windCv)windCx.clearRect(0,0,windCv.width,windCv.height)}
function windPause(){windStopLoop();windClear()}                    // durante o arrasto/zoom o canvas fica limpo
function windMoved(){clearTimeout(windT);windT=setTimeout(updateWindVectors,700)}
function windStop(){
  windTok++;windStopLoop();clearTimeout(windT);
  if(radarMap){try{radarMap.off('movestart zoomstart',windPause);radarMap.off('moveend resize',windMoved)}catch(e){}}
  if(windCv)windCv.remove();
  windCv=windCx=windFld=null;windP=[];
}
function clearWindMarkers(){windStop()}                              // mantém o nome usado por clearRadarLayers()

function windEnsure(){
  const cont=radarMap.getContainer();
  if(!windCv||windCv.parentNode!==cont){
    windCv=document.createElement('canvas');windCv.className='windfx';windCv.setAttribute('aria-hidden','true');
    cont.appendChild(windCv);windCx=windCv.getContext('2d');
    radarMap.on('movestart zoomstart',windPause);radarMap.on('moveend resize',windMoved);
  }
  const dpr=Math.min(2,window.devicePixelRatio||1),W=cont.clientWidth,H=cont.clientHeight;
  if(windCv.width!==Math.round(W*dpr)||windCv.height!==Math.round(H*dpr)){windCv.width=Math.round(W*dpr);windCv.height=Math.round(H*dpr)}
  windCx.setTransform(dpr,0,0,dpr,0,0);
  return{W,H};
}

/* grelha de vento sobre a área visível (+35% de margem), numa só chamada à Open-Meteo */
async function windFetchGrid(b){                                   // vento na mesma grelha (e cache) da temperatura
  try{const tg=await tlWindGrid();if(tg)return tg}catch(e){console.warn('[Tiles] vento',e.message)}   // 1.º: tiles próprios (global, sem pedidos ao arrastar)
  const z=tempZ(),st=tempStepOf(z),N=Math.round(360/st),jm=Math.floor(84/st);
  const dl=b.getNorth()-b.getSouth(),dg=b.getEast()-b.getWest();
  const i0=Math.floor((b.getWest()-dg*.35)/st),i1=Math.ceil((b.getEast()+dg*.35)/st);
  const j0=Math.max(-jm,Math.floor((b.getSouth()-dl*.35)/st)),j1=Math.min(jm,Math.ceil((b.getNorth()+dl*.35)/st));
  const wm=windCache[z]||(windCache[z]=new Map()),need=[],seen=new Set(),now=Date.now();
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const ii=((i%N)+N)%N,k=tempKey(j,ii);
    if(seen.has(k))continue;seen.add(k);
    const c=wm.get(k);if(!c||now-c[2]>WIND_TTL)need.push([ii,j,k]);
  }
  if(need.length)await gridLoad(z,need);
  const cols=i1-i0+1,rows=j1-j0+1;
  if(cols<2||rows<2)throw new Error('grid too small');
  const u=new Float32Array(cols*rows),v=new Float32Array(cols*rows);let have=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const e=wm.get(tempKey(j0+r,(((i0+c)%N)+N)%N)),sp=e?e[0]:0,fl=(((e?e[1]:0)+180)%360)*Math.PI/180;
    if(e)have++;
    u[r*cols+c]=sp*Math.sin(fl);v[r*cols+c]=sp*Math.cos(fl);
  }
  if(!have)throw new Error('no wind data');
  return{s:j0*st,n:j1*st,w:i0*st,e:i1*st,rows,cols,u,v,z:radarMap.getZoom(),t:Date.now()};
}
/* interpolação bilinear dos vetores (u,v) – nunca se interpolam ângulos */
function windSample(g, lat, lng, o){
  if(g.global){                                                   // grelha global dos tiles: nó i na longitude w+i·st, linha 0 = sul
    const w=g.cols,h=g.rows,st=g.st,la=Math.max(g.s,Math.min(g.n,lat)),fy=(la-g.s)/st,y0=Math.min(h-2,Math.floor(fy)),ty=fy-y0;
    const fx=((((lng-g.w)%360)+360)%360)/st,xf=Math.floor(fx),tx=fx-xf,x0=xf%w,x1=(x0+1)%w,a=y0*w+x0,b=y0*w+x1,e=(y0+1)*w+x0,d=(y0+1)*w+x1;
    const k0=(1-tx)*(1-ty),k1=tx*(1-ty),k2=(1-tx)*ty,k3=tx*ty;
    o[0]=g.u[a]*k0+g.u[b]*k1+g.u[e]*k2+g.u[d]*k3;
    o[1]=g.v[a]*k0+g.v[b]*k1+g.v[e]*k2+g.v[d]*k3;
    return;
  }
  const span = g.e - g.w;
  let x;
  // If global (full 360), wrap around; otherwise clamp to grid edges smoothly
  if (span >= 355) {
    x = ((lng - g.w) % 360 + 360) % 360;
  } else {
    const clampedLng = Math.max(g.w, Math.min(g.e, lng));
    x = clampedLng - g.w;
  }

  const clampedLat = Math.max(g.s, Math.min(g.n, lat));
  const fx = span > 0 ? (x / span) * (g.cols - 1) : 0;
  const fy = (g.n - g.s) > 0 ? ((clampedLat - g.s) / (g.n - g.s)) * (g.rows - 1) : 0;

  const x0 = Math.min(g.cols - 2, Math.floor(fx));
  const y0 = Math.min(g.rows - 2, Math.floor(fy));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const i = y0 * g.cols + x0, c = g.cols;

  const bl = a => a[i]*(1 - tx)*(1 - ty) + a[i + 1]*tx*(1 - ty) + a[i + c]*(1 - tx)*ty + a[i + c + 1]*tx*ty;
  o[0] = bl(g.u);
  o[1] = bl(g.v);
}

/* campo em pixéis: um vetor por cada 6 px do ecrã, recalculado só quando a vista muda */
function windBuild(W,H){
  const fw=Math.ceil(W/WSTEP)+2,fh=Math.ceil(H/WSTEP)+2,fu=new Float32Array(fw*fh),fv=new Float32Array(fw*fh),o=[0,0];
  for(let j=0;j<fh;j++)for(let i=0;i<fw;i++){
    const ll=radarMap.containerPointToLatLng([i*WSTEP,j*WSTEP]);
    windSample(windGrid,ll.lat,ll.lng,o);fu[j*fw+i]=o[0];fv[j*fw+i]=o[1];
  }
  windFld={fw,fh,fu,fv,W,H};
  const n=Math.max(300,Math.min(3500,Math.round(W*H/380)));
  windP=Array.from({length:n},()=>{const p=windSpawn({});p.a=Math.random()*p.m;return p});
}
function windSpawn(p){
  const f=windFld;p.x=Math.random()*(f?f.W:300);p.y=Math.random()*(f?f.H:200);
  p.ox=p.x;p.oy=p.y;p.a=0;p.m=45+Math.random()*75;p.s=-1;return p;      // s=-1: não desenha o 1.º passo
}
function windAt(x,y,o){
  const f=windFld,gx=x/WSTEP,gy=y/WSTEP,i=Math.min(f.fw-2,gx|0),j=Math.min(f.fh-2,gy|0),tx=gx-i,ty=gy-j,k=j*f.fw+i,c=f.fw;
  const a=(1-tx)*(1-ty),b=tx*(1-ty),d=(1-tx)*ty,e=tx*ty;
  o[0]=f.fu[k]*a+f.fu[k+1]*b+f.fu[k+c]*d+f.fu[k+c+1]*e;
  o[1]=f.fv[k]*a+f.fv[k+1]*b+f.fv[k+c]*d+f.fv[k+c+1]*e;
}
function windStep(dt,fade){
  const cx=windCx,f=windFld,o=[0,0];
  if(fade){cx.globalCompositeOperation='destination-out';cx.fillStyle=`rgba(0,0,0,${WFADE})`;cx.fillRect(0,0,f.W,f.H);cx.globalCompositeOperation='source-over'}
  for(const p of windP){
    windAt(p.x,p.y,o);
    const sp=Math.hypot(o[0],o[1]);
    p.ox=p.x;p.oy=p.y;p.x+=o[0]*WK*dt;p.y-=o[1]*WK*dt;p.a+=dt;p.s=sp;     // no ecrã o Norte é y negativo
    if(p.a>p.m||p.x<0||p.y<0||p.x>f.W||p.y>f.H||sp<.3)windSpawn(p);
  }
  cx.lineCap='round';
  for(const[lo,hi,al,lw] of WBK){
    cx.lineWidth=lw; cx.strokeStyle=`rgba(255,255,255,${al})`;
    cx.beginPath();
    for(const p of windP) if(p.s>=lo&&p.s<hi){cx.moveTo(p.ox,p.oy);cx.lineTo(p.x,p.y)}
    cx.stroke();
  }
}
function windFrame(t){
  if(!windFrame._logged){windFrame._logged=1;console.info('[Wind] first frame', windP.length, 'particles, field', !!windFld);}
  if(!windCx||!windFld||radarKind!=='wind'||!radarMap){windRaf=0;return}
  const dt=Math.min(2.5,(t-(windLast||t))/16.67);windLast=t;
  windStep(dt||1,true);
  windRaf=requestAnimationFrame(windFrame);
}

async function updateWindVectors(){
  const tok=++windTok;
  if(!radarMap||radarKind!=='wind'){windStop();return}
  const b=radarMap.getBounds(),z=radarMap.getZoom(),g=windGrid;
  const ok=g&&(g.global||(g.s<=b.getSouth()&&g.n>=b.getNorth()&&g.w<=b.getWest()&&g.e>=b.getEast()&&z-g.z<1))&&Date.now()-g.t<9e5;
  if(!ok){
    try{
      const ng=await windFetchGrid(b);
      if(tok!==windTok||radarKind!=='wind'||!radarMap)return;     // trocou de camada entretanto
      windGrid=ng;
    }catch(err){console.warn('[Wind]',err.message);if(tok!==windTok)return;if(!windGrid){const n=$('#rnote');if(n)n.textContent='Wind particles unavailable right now.';return}}
  }
  const{W,H}=windEnsure();
  windStopLoop();windClear();windBuild(W,H);
  if(still){for(let i=0;i<70;i++)windStep(1,false)}                // movimento reduzido: linhas de corrente estáticas
  else{windLast=0;windRaf=requestAnimationFrame(windFrame)}
}

/* ---- tile cache: every tile is downloaded once per session ---- */
const tileCache=new Map(),tilePending=new Map(),noCors=new Set(),tileQ=[];
const TILE_MAX=900;let tileActive=0;
const tileSlot=()=>new Promise(res=>{const go=()=>{tileActive++;res()};tileActive<4?go():tileQ.push(go)});
const tileDone=()=>{tileActive--;const n=tileQ.shift();if(n)n()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function tileBlob(url){
  if(tileCache.has(url)){const v=tileCache.get(url);tileCache.delete(url);tileCache.set(url,v);return Promise.resolve(v)}
  if(tilePending.has(url))return tilePending.get(url);
  const p=(async()=>{
    const host=new URL(url).origin;
    if(noCors.has(host))return url;                 // server has no CORS: plain <img>, browser cache
    await tileSlot();
    try{
      for(let a=0;a<3;a++){
        let r;
        try{r=await fetch(url)}catch(e){if(a<1){await sleep(1200);continue}noCors.add(host);return url}
        if(r.status==429){await sleep(900*(a+1));continue}
        if(!r.ok)throw new Error('HTTP '+r.status);
        const u=URL.createObjectURL(await r.blob());
        tileCache.set(url,u);
        if(tileCache.size>TILE_MAX){const k=tileCache.keys().next().value;URL.revokeObjectURL(tileCache.get(k));tileCache.delete(k)}
        return u;
      }
      throw new Error('429');
    }finally{tileDone()}
  })();
  tilePending.set(url,p);
  p.then(()=>tilePending.delete(url),()=>tilePending.delete(url));
  return p;
}

let CachedTiles;
const mkLayer=(url,opts)=>{
  CachedTiles=CachedTiles||L.TileLayer.extend({
    createTile(coords,done){
      const img=document.createElement('img');
      img.alt='';img.setAttribute('role','presentation');
      const set=src=>{img.onload=()=>done(null,img);img.onerror=()=>done(null,img);img.src=src};
      tileBlob(this.getTileUrl(coords)).then(set).catch(()=>set(BLANK));
      return img;
    }
  });
  return new CachedTiles(url,{pane:'radar',className:'rlayer',opacity:0,
    updateWhenZooming:false,updateWhenIdle:true,keepBuffer:2,...opts});
};

const WORKER=ATMO.base.replace('/v1','');
/* (SAT_ID was a fixed layer; the satellite tab now picks the freshest product — see SAT_PREF) */

function loadLeaflet(){
 if(window.L){installFourCorners();return Promise.resolve()}
 return leafletP||(leafletP=Promise.all([
  new Promise((res,rej)=>{const c=document.createElement('link');c.rel='stylesheet';c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';c.integrity='sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';c.crossOrigin='anonymous';c.onload=res;c.onerror=rej;document.head.appendChild(c)}),
  new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.integrity='sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';s.crossOrigin='anonymous';s.onload=res;s.onerror=rej;document.head.appendChild(s)})
 ]).then(installFourCorners).catch(e=>{leafletP=null;throw e}));
}

/* ===== Geo-referenciação por 4 cantos (instalado após o Leaflet carregar) ===== */
function solveHomography(src, dst){
  const A = [];
  for(let i=0;i<4;i++){
    const [x,y]=src[i], [X,Y]=dst[i];
    A.push([x,y,1,0,0,0,-x*X,-y*X,X]);
    A.push([0,0,0,x,y,1,-x*Y,-y*Y,Y]);
  }
  for(let i=0;i<8;i++){
    let piv=i;
    for(let r=i+1;r<8;r++) if(Math.abs(A[r][i])>Math.abs(A[piv][i])) piv=r;
    [A[i],A[piv]]=[A[piv],A[i]];
    const d=A[i][i]||1e-12;
    for(let c=i;c<9;c++) A[i][c]/=d;
    for(let r=0;r<8;r++){
      if(r===i) continue;
      const f=A[r][i];
      for(let c=i;c<9;c++) A[r][c]-=f*A[i][c];
    }
  }
  const h=A.map(r=>r[8]); h.push(1);
  return h;
}

function installFourCorners(){
  if(!window.L||L.ImageOverlay.FourCorners) return;
  L.ImageOverlay.FourCorners = L.Layer.extend({
    initialize(url, corners, options){
      this._url=url; this._corners=corners;
      L.setOptions(this, options);
    },
    onAdd(map){
      this._map=map;
      const img=this._image=document.createElement('img');
      img.src=this._url; img.alt='';
      img.className='leaflet-image-layer '+(this.options.className||'');
      Object.assign(img.style,{position:'absolute',transformOrigin:'0 0',pointerEvents:'none',opacity:this.options.opacity??0});
      (this.options.pane?map.getPane(this.options.pane):map.getPanes().overlayPane).appendChild(img);
      this._onMove=()=>this._reset();
      map.on('move zoom moveend zoomend resize', this._onMove);
      img.onload=()=>{ this._reset(); this.fire('load'); };
      img.onerror=()=>this.fire('error');
      this._reset();
      return this;
    },
    onRemove(map){
      map.off('move zoom moveend zoomend resize', this._onMove);
      if(this._image&&this._image.parentNode) this._image.parentNode.removeChild(this._image);
    },
    setOpacity(op){ this.options.opacity=op; if(this._image) this._image.style.opacity=op; return this; },
    _reset(){
      if(!this._map||!this._image) return;
      const map=this._map,c=this._corners,p=ll=>map.latLngToLayerPoint(ll);
      const nw=p(c.nw),ne=p(c.ne),sw=p(c.sw),se=p(c.se);
      const w=this._image.naturalWidth||1,h=this._image.naturalHeight||1;
      const m=solveHomography([[0,0],[w,0],[0,h],[w,h]],[[nw.x,nw.y],[ne.x,ne.y],[sw.x,sw.y],[se.x,se.y]]);
      this._image.style.width=w+'px'; this._image.style.height=h+'px';
      this._image.style.transform=`matrix3d(${m[0]},${m[3]},0,${m[6]}, ${m[1]},${m[4]},0,${m[7]}, 0,0,1,0, ${m[2]},${m[5]},0,1)`;
    }
  });
  L.imageOverlay.fourCorners=(url,corners,opts)=>new L.ImageOverlay.FourCorners(url,corners,opts);
}

function radarPane(){
 return`<div class="pane"><section class="card radar">
 <div class="rtop">
  <div class="sw" id="rsw">${RADAR_KINDS.map(([k,n])=>`<button data-rk="${k}" aria-pressed="${k==radarKind}">${n}</button>`).join('')}</div>
  <div class="sw rscope" id="rscope" role="group" aria-label="${tr('Scope')}">
    <button data-rs="pt" aria-pressed="${radarScope==='pt'}">${tr('Portugal')}</button>
    <button data-rs="global" aria-pressed="${radarScope==='global'}">${tr('World')}</button>
  </div>
  <span class="rnow" id="rnote"></span>
 </div>
 <div id="rmap" role="application" aria-label="Weather radar map">Loading map…</div>
 <div class="rctl"><button class="pill dk" id="rplay" aria-label="Pause">❚❚</button><button type="button" class="ncbtn" id="rnc" aria-pressed="false" aria-label="${tr('Rain nowcast (optical flow)')}" title="${tr('Extrapolate the radar 60 minutes with optical flow')}" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.4V12l3 1.9"/></svg><span>${tr('Nowcast')}</span></button><input type="range" id="rsl" min="0" max="0" value="0" aria-label="Radar time"><span class="rtime" id="rtime"></span></div>
 <div class="rleg" id="rleg"><span>Light</span><i></i><span>Heavy</span></div>
 <div class="rleg rleg2" id="rleg2" hidden><span>Rain rate</span><span id="rlmin">— mm/h</span><i id="rlbar"></i><span id="rlmax">— mm/h</span><span id="rlsrc"></span></div>
  <div class="rleg rleg3" id="rleg3" hidden><span class="tunit" id="tunit">°C</span><div class="tscale"><div class="tbar" id="tbar"></div><div class="tticks" id="tticks"></div></div><a class="tsrc" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a></div>
 </section></div>`;
}
function clearRadarLayers(){
  tempStop();
  isoStop();
  if(!radarMap)return;
  windTok++;   // cancela pedidos de vento a meio
  clearWindMarkers();
  radarMap.eachLayer(l=>{
    if(l.options && (l.options.pane === 'radar' || (l.options.className && l.options.className.includes('rlayer')))){
      try { radarMap.removeLayer(l); } catch(e){}
    }
  });
}

function radarStop(){
 radarTok++;clearTimeout(radarTimer);
 ncDrop();
 clearRadarLayers();
 if(radarMap){try{radarMap.remove()}catch(e){}radarMap=null}
 radarLayers=[];radarFrames=[];
}


function radarBtn(){const b=$('#rplay');if(b){b.textContent=radarPlay?'❚❚':'▶';b.setAttribute('aria-label',radarPlay?'Pause':'Play')}}
function radarShow(i){
  if(!radarMap||!radarLayers.length||!$('#rtime'))return;
  radarIdx=i;
   const cur=radarLayers[i],op=(radarKind=='sat'||radarKind=='cloud'||OWM_KINDS[radarKind])?.95:.8;
  if(!radarMap.hasLayer(cur))cur.addTo(radarMap);
  cur.setOpacity(op);
  /* as outras frames ficam no mapa (tiles já carregados), só ficam invisíveis */
  const hide=()=>{if(radarIdx!==i||!radarMap)return;radarLayers.forEach((l,j)=>{if(j!==i)l.setOpacity(0)})};
  if(cur._loading)cur.once('load',hide);else hide();

  const f=radarFrames[i];$('#rsl').value=i;
  if(f.time){
    const d=new Date(f.time*1000);
    if(f.day){
      $('#rtime').innerHTML=`${d.toLocaleDateString('en',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})} · <em>daily</em>`;
    }else{
      const m=Math.round((d-Date.now())/6e4),t=d.toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'});
      $('#rtime').innerHTML=`${t} · ${f.fc?`<em>forecast</em> +${Math.max(m,0)} min`:m>-3?'now':m<-90?`${(-m/60).toFixed(1)} h ago`:`${-m} min ago`}`;
    }
  }
}
function radarBuffering(b){const t=$('#rtime');if(t)t.classList.toggle('buf',b)}

function radarTick(){
  clearTimeout(radarTimer);radarBuffering(false);
  if(!radarPlay||radarFrames.length<2)return;
  const n=radarFrames.length,layers=radarLayers,step=radarKind=='sat'?900:650;
  const advance=t0=>{
    if(layers!==radarLayers||!radarPlay)return;
    const nx=(radarIdx+1)%n,l=layers[nx];
    if(l&&l._loading&&performance.now()-t0<5000){      // frame seguinte ainda a carregar: espera (máx. 5 s)
      radarBuffering(true);
      radarTimer=setTimeout(()=>advance(t0),150);
      return;
    }
    radarShow(nx);radarTick();
  };
  radarTimer=setTimeout(()=>advance(performance.now()),radarIdx==n-1?1800:step);
}

/* pré-carrega todas as frames: ficam no mapa com opacidade 0 */
function radarWarm(){
  const layers=radarLayers,n=layers.length,note=$('#rnote');
  if(!radarMap||n<2||!note)return;
  const base=note.textContent;
  const upd=()=>{
    if(layers!==radarLayers||!note.isConnected)return;
    const rdy=layers.filter(l=>!l._loading).length;
    note.textContent=rdy<n?`Loading frames ${rdy}/${n}…`:base;
  };
  for(let k=0;k<n;k++){
    const l=layers[(radarIdx+k)%n];                     // começa na frame atual
    l.on('load',upd);
    const add=()=>{if(layers!==radarLayers||!radarMap)return;if(!radarMap.hasLayer(l)){l.setOpacity(0);l.addTo(radarMap)}};
    if(k===0)add();else setTimeout(add,k*450);          // uma frame de cada vez, não 6 de uma vez
  }
  upd();
}
async function radarInit(){
 const tok=++radarTok;
 try{await loadLeaflet()}catch(e){const m=$('#rmap');if(m)m.textContent='The map library couldn’t load. Check your connection.';return}
 if(tok!==radarTok||!$('#rmap'))return;
 $('#rmap').textContent='';
  if(radarMap){try{radarMap.remove()}catch(e){}radarMap=null}
 const rmapEl=$('#rmap');if(rmapEl&&rmapEl._leaflet_id)delete rmapEl._leaflet_id;
const isPT = radarScope === 'pt';
const mapOpts = isPT
 ? { center:[place.lat,place.lon], zoom:7, minZoom:6, maxZoom:11, maxBounds:[[36.0,-10.8],[42.8,-5.4]], maxBoundsViscosity:1.0 }
 : { center:[place.lat,place.lon], zoom:6, minZoom:3, maxZoom:9, maxBounds:[[-85,-180],[85,180]], maxBoundsViscosity:1.0 };
 radarMap=L.map('rmap',{scrollWheelZoom:false,...mapOpts});
 radarMap.createPane('radar').style.zIndex=250;
 const lp=radarMap.createPane('labels');lp.style.zIndex=260;lp.style.pointerEvents='none';
 const MAP_KEY='cb1_4644_2_e1ddc0590e0bf3595329dba5';
 L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${MAP_KEY}`,{maxZoom:19}).addTo(radarMap);
 const att = radarScope === 'pt'
   ? '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/">CARTO</a> · rain <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> · wind/clouds <a href="https://openweathermap.org/">OpenWeatherMap</a> · sat <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
   : '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/">CARTO</a> · rain <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> · wind/clouds <a href="https://openweathermap.org/">OpenWeatherMap</a> · sat <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>';
 radarMap.attributionControl.addAttribution(att);
  radarMap.attributionControl.addAttribution('temp <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (CC BY 4.0)');
  radarMap.attributionControl.addAttribution('wind, temp &amp; isobars <a href="https://www.nco.ncep.noaa.gov/pmb/products/gfs/" target="_blank" rel="noopener">NOAA/NCEP GFS</a>');
 L.marker([place.lat,place.lon],{keyboard:false,icon:L.divIcon({className:'rpin',html:'<i></i>',iconSize:[18,18]})}).addTo(radarMap);
 radarMap.on('click focus',()=>radarMap.scrollWheelZoom.enable());
 radarMap.on('mouseout',()=>radarMap.scrollWheelZoom.disable());
 setTimeout(()=>radarMap&&radarMap.invalidateSize(),250);

 $('#rsw').onclick=e=>{const b=e.target.closest('[data-rk]');if(b&&b.dataset.rk!=radarKind)radarLoadKind(b.dataset.rk)};
 $('#rscope').onclick=e=>{
   const b=e.target.closest('[data-rs]');
   if(!b||b.dataset.rs===radarScope)return;
   radarScope=b.dataset.rs;
   lsSet('radarScope',radarScope);
   $$('#rscope button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.rs===radarScope));
   radarStop();
   radarInit();
 };
 $('#rplay').onclick=()=>{radarPlay=!radarPlay;radarBtn();radarTick()};
 $('#rsl').oninput=e=>{radarPlay=false;radarBtn();clearTimeout(radarTimer);radarShow(+e.target.value)};
 const rnc=$('#rnc');if(rnc)rnc.onclick=ncToggle;
 radarMap.on('moveend',()=>{                                        // saiu da área do nowcast: volta ao radar
  if(!ncPrev||!ncRes)return;
  const c=radarMap.getCenter(),b=ncRes.llBounds;
  if(c.lat<b[0][0]||c.lat>b[1][0]||c.lng<b[0][1]||c.lng>b[1][1])ncOff();
 });
 radarBtn();
 radarLoadKind(radarKind);
}
/* NASA IMERG: find the newest available times, then build an animation */
const nasaISO=t=>new Date(t).toISOString().slice(0,19)+'Z';
const NASA_URL=t=>`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/${nasaISO(t)}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
const NASA_PROBE=t=>NASA_URL(t).replace('{z}','0').replace('{y}','0').replace('{x}','0');
let nasaCache=null;
function imgOK(url){
 return new Promise(res=>{
  const im=new Image(),to=setTimeout(()=>{im.src='';res(false)},6000);
  im.onload=()=>{clearTimeout(to);res(true)};
  im.onerror=()=>{clearTimeout(to);res(false)};
  im.src=url;
 });
}
/* keep only frames whose image content is really different */
async function nasaDistinct(times){
 const sig=await Promise.all(times.map(async t=>{
  try{
   const r=await fetch(NASA_PROBE(t));
   if(!r.ok)return null;
   const b=new Uint8Array(await r.arrayBuffer());
   let h=2166136261;for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619)}
   return(h>>>0)+':'+b.length;
  }catch(e){return undefined}   // undefined = couldn't check (e.g. CORS)
 }));
 if(sig.every(s=>s===undefined)){console.warn('[NASA IMERG] could not compare frames, keeping all');return times}
 const seen=new Set(),out=[];
 times.forEach((t,i)=>{if(sig[i]&&!seen.has(sig[i])){seen.add(sig[i]);out.push(t)}});
 console.info('[NASA IMERG] distinct frames:',out.length,'of',times.length);
 return out;
}

async function nasaTimes(){
 if(nasaCache&&Date.now()-nasaCache.at<9e5)return nasaCache.times;
 const step=30*60e3;
 try{
  const r=await fetch(ATMO.base.replace('/v1','')+'/imerg-latest');
  if(!r.ok)throw new Error('HTTP '+r.status);
  const latest=Date.parse((await r.json()).latest);
  if(!isFinite(latest))throw new Error('bad date');
  console.info('[NASA IMERG] newest frame:',nasaISO(latest),'=',((Date.now()-latest)/36e5).toFixed(1),'h ago');
  const times=await nasaDistinct(Array.from({length:12},(_,k)=>latest-(11-k)*step));
  nasaCache={at:Date.now(),times};return times;
 }catch(e){console.warn('[NASA IMERG] latest lookup failed:',e.message);return[]}
}
const satCache={};
const satURL=(id,j,t)=>{
  const ts=j.stepMs>=864e5?new Date(t).toISOString().slice(0,10):nasaISO(t);   // daily layers use YYYY-MM-DD
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${id}/default/${ts}/${j.tms}/{z}/{y}/{x}.${j.ext}`;
};
async function satInfo(id){
  const c=satCache[id];
  if(c&&Date.now()-c.at<6e5)return c.v;
  let v;
  try{
    const r=await fetch(WORKER+'/gibs-latest?id='+id);
    if(!r.ok)throw new Error('HTTP '+r.status);
    v=await r.json();
    if(!v.found||!v.end||!v.stepMs||!v.tms)throw new Error('layer not found');
  }catch(e){
    console.warn('[SAT] worker lookup failed, using defaults:',e.message);
    v={found:true,fallback:true,end:new Date().toISOString(),start:new Date(Date.now()-30*864e5).toISOString(),
       stepMs:864e5,tms:'GoogleMapsCompatible_Level9',ext:'jpg'};
  }
  satCache[id]={at:Date.now(),v};return v;
}

let nasaLeg=null;
async function nasaLegend(){
  if(!nasaLeg){
    const urls=['https://gibs.earthdata.nasa.gov/colormaps/v1.3/IMERG_Precipitation_Rate.xml',
                ATMO.base.replace('/v1','')+'/colormap'];
    for(const u of urls){
      try{
        const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);
        const x=new DOMParser().parseFromString(await r.text(),'text/xml'),lg=x.querySelector('Legend');
        let cols=[...x.querySelectorAll('LegendEntry')].map(e=>e.getAttribute('rgb')).filter(Boolean);
        if(cols.length<2)cols=[...x.querySelectorAll('ColorMapEntry')].filter(e=>e.getAttribute('transparent')!='true').map(e=>e.getAttribute('rgb')).filter(Boolean);
        if(cols.length<2)throw new Error('no colours');
        const n=Math.min(24,cols.length);
        cols=Array.from({length:n},(_,i)=>cols[Math.round(i*(cols.length-1)/(n-1))]);
        nasaLeg={cols,min:lg&&lg.getAttribute('minLabel'),max:lg&&lg.getAttribute('maxLabel')};
        break;
      }catch(e){console.warn('[NASA legend] failed:',u,e.message)}
    }
    if(!nasaLeg)nasaLeg={cols:null};
  }
  const bar=$('#rlbar');if(!bar)return;
  if(nasaLeg.cols)bar.style.background=`linear-gradient(90deg,${nasaLeg.cols.map(c=>`rgb(${c})`).join(',')})`;
  const min=+nasaLeg.min||0,max=+nasaLeg.max||0;
  const fmt=v=>v<1?v.toFixed(2):v<10?v.toFixed(1):Math.round(v);
  $('#rlmin').textContent=nasaLeg.min!=null?rateS(min):'light';
  $('#rlmax').textContent=nasaLeg.max!=null?rateS(max):'heavy';
}


async function radarLoadKind(k){
  if(!radarMap)return;
  if(place) radarMap.setView([place.lat, place.lon], radarMap.getZoom(), {animate:false});
  const tok=radarTok,kt=++radarKT;
  const stale=()=>tok!==radarTok||kt!==radarKT||!radarMap;
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');

  clearTimeout(radarTimer);
  ncDrop();
  clearRadarLayers();
  radarLayers=[];radarFrames=[];
  radarKind=k;
  $$('#rsw button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.rk==k));
  radarPlay=!still;radarBtn();
  note.textContent='';$('#rtime').textContent='';

  const isPT = radarScope==='pt';
  $('#rmap').classList.toggle('cloudy',k==='cloud'||k==='wind');
  $('#rleg').hidden = k!=='wind';
  $('#rleg2').hidden = k!=='rain';
  $('#rleg3').hidden = k!=='temp';
  if(ISO_KINDS.includes(k)) isoStart();

  try{
    if(k==='rain')    return loadRainGlobal(stale);
    if(k==='wind')    return loadWind(stale);
    if(k==='cloud')   return loadCloud(stale,isPT);
    if(k==='temp')    return loadTemp(stale);
    if(k==='sat')     return loadSat(stale);
  }catch(e){
    console.warn('[Radar]',k,e.message);
    if(!stale()&&note)note.textContent='Layer unavailable right now.';
  }
}

/* ---- Rain: IPMA (PT) ---- */
async function loadRainPT(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading IPMA radar…';
  const frames=await ipmaRadarFrames();
  if(stale())return;
  if(!frames||!frames.length){note.textContent='IPMA radar unavailable right now.';return}
  await ipmaResolvePrefix(frames[0].path);
  const sliced=frames.slice(-12);
  const IPMA_CORNERS = {
    nw:[43.705, -12.345], ne:[43.066, -6.279],
    sw:[35.953, -12.986], se:[36.097, -5.948]
  };
  radarLayers=sliced.map(f=>L.imageOverlay.fourCorners(ipmaRadarURL(f.path), IPMA_CORNERS, {opacity:0,pane:'radar',className:'rlayer'}));
  radarFrames=sliced.map(f=>({time:f.time/1000,fc:false}));
  sl.disabled=false;pl.disabled=false;sl.max=radarFrames.length-1;
  note.textContent='IPMA radar · 5 min resolution · Portugal';
  $('#rlmin').textContent=rateS(.1);
  $('#rlmax').textContent='> '+rateS(30);
  $('#rlbar').style.background='linear-gradient(90deg,#c8e6c9,#81c784,#4caf50,#ffeb3b,#ff9800,#f44336,#9c27b0)';
  $('#rlsrc').textContent='IPMA · 5 min';
  radarShow(0);radarWarm();radarBtn();radarTick();
}

/* ---- Rain: RainViewer (global) ---- */
async function loadRainGlobal(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading RainViewer…';
  const rv=await rainViewerLoad();
  if(stale())return;
  if(!rv||!rv.all.length){note.textContent='RainViewer unavailable right now.';return}
  const frames=rv.all.slice(-6);
  radarFrames=frames.map(f=>({time:f.time/1000,fc:!!f.fc}));
    console.info('[RainViewer] host=%s first-path=%s tile=%s',
    rv.host, frames[0].path,
    rainViewerTileURL(rv.host, frames[0].path, 2, '0_0'));
  radarLayers=frames.map(f=>mkLayer(`${WORKER}/rv/${f.path.split('/').pop()}/256/{z}/{x}/{y}/2/0_0.png`,{maxNativeZoom:7,maxZoom:radarScope==='pt'?11:9}));
  sl.disabled=false;pl.disabled=false;sl.max=frames.length-1;
  note.textContent='RainViewer · 10 min · past 2 h'+(radarScope==='pt'?' · Portugal':' · Global');
  $('#rlmin').textContent=rateS(.1);
  $('#rlmax').textContent='> '+rateS(50);
  $('#rlbar').style.background='linear-gradient(90deg,#88ddee,#36bae5,#00a3e0,#007fb4,#005588,#c2b482,#cec087,#ffee00,#ffd200,#ffaa00,#ff8100,#ff4400)';
  $('#rlsrc').textContent=NC_SRC;                                    // rodapé: há nowcast + previsão LK
  const nb=$('#rnc');if(nb){nb.hidden=false;nb.disabled=false;nb.title=NC_TITLE}
  ncEngineLoad();                                                    // deixa o motor pronto para o 1.º clique
  radarShow(0);radarWarm();radarBtn();radarTick();
}

/* ---- Nowcast: extrapola o radar com fluxo ótico (Lucas-Kanade) ---- */
/* A matemática vive no worker (nowcast_worker.js) e o motor de dados em nowcast.js. Aqui só há camada,
   estados do botão e conversa com o mapa. As 6 frames de previsão (+10 … +60 min) são canvases locais,
   por isso entram no mapa como qualquer outra camada e o slider/play existentes funcionam sem alterações. */
let ncRes=null,ncLayers=[],ncUrls=[],ncPrev=null,ncTok=0,ncBusy=false;

/* O motor tem de estar carregado. Se o index.html não tiver a tag (acontece), carrega-se daqui:
   o caminho sai do próprio radar.js, por isso vale em js/ ou na raiz, sem tocar no index. */
const RADAR_SELF=(document.currentScript&&document.currentScript.src)||'';
let ncEngineP=null;
function ncEngineLoad(){
 if(typeof NC!=='undefined')return Promise.resolve(true);
 if(ncEngineP)return ncEngineP;
 ncEngineP=new Promise(res=>{
  let dir='js/';
  try{if(RADAR_SELF)dir=new URL('.',RADAR_SELF).href}catch(e){}
  const s=document.createElement('script');
  s.src=dir+'nowcast.js';s.async=true;
  s.onload=()=>res(typeof NC!=='undefined');
  s.onerror=()=>{ncEngineP=null;res(false)};
  document.head.appendChild(s);
 });
 return ncEngineP;
}

function ncZoom(){const z=radarMap?radarMap.getZoom():7;return Math.max(6,Math.min(8,Math.round(z)))}
/* o mosaico tem de cobrir o que se vê: 2–4 tiles por lado, no zoom que couber */
function ncFit(){
 try{return NC.fit(radarMap.getBounds())}catch(e){return {z:ncZoom(),grid:3}}
}
function ncCompass(d){
 const a=LANG=='pt'?['N','NNE','NE','ENE','L','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
                   :['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
 return a[Math.round(((d%360)+360)%360/22.5)%16];
}
/* só para o tooltip: o rodapé do card fica com a etiqueta fixa e curta */
const NC_SRC='RainViewer · nowcast Lucas–Kanade +60 min';
const NC_TITLE='Extrapolate the radar 60 minutes with optical flow (Lucas–Kanade)';
function ncTip(res){
 const sk=res.skill,csi=sk&&sk.t15?sk.t15.csi:null,per=sk&&sk.p15?sk.p15.csi:null;
 const bits=[T2('Rain nowcast: Lucas–Kanade optical flow, 60 min ahead','Nowcast de chuva: fluxo ótico Lucas–Kanade, 60 min à frente')];
 bits.push(res.damp<0.05?T2('motion not stable — field held','movimento instável — campo parado')
  :Math.round(res.speed)+' km/h '+ncCompass(res.bearing));
 if(res.nObj>0)bits.push(res.nObj+' '+T2('cells','células'));
 const g=res.objGF||0;
 if(Math.abs(g)>0.004)bits.push(T2('area ','área ')+(g>0?'+':'')+Math.round((Math.exp(g*6)-1)*100)+'%/h');
 if(csi!=null)bits.push('CSI '+csi.toFixed(2)+(per!=null?' / '+per.toFixed(2):''));
 return bits.join(' · ');
}
function ncDrop(){                                                    // esquece tudo (mudança de camada/aba)
 ncTok++;
 if(radarMap)ncLayers.forEach(l=>{try{radarMap.removeLayer(l)}catch(e){}});
 ncUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});
 ncLayers=[];ncUrls=[];ncPrev=null;ncRes=null;ncBusy=false;
 const b=$('#rnc');if(b){b.disabled=false;b.setAttribute('aria-pressed','false');b.hidden=true}
}
function ncOff(){                                                     // volta às observações, mantém o botão
 if(!ncPrev)return;
 ncTok++;
 ncLayers.forEach(l=>{try{radarMap.removeLayer(l)}catch(e){}});
 ncUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});
 radarLayers=ncPrev.layers;radarFrames=ncPrev.frames;
 const sl=$('#rsl');if(sl){sl.max=ncPrev.max;sl.value=ncPrev.idx}
 const b=$('#rnc');if(b){b.setAttribute('aria-pressed','false');b.disabled=false}
 radarShow(ncPrev.idx);radarPlay=false;radarBtn();
 if($('#rnote'))$('#rnote').textContent=ncPrev.note;
 if($('#rlsrc'))$('#rlsrc').textContent=NC_SRC;
 const b2=$('#rnc');if(b2)b2.title=NC_TITLE;
 ncPrev=null;ncRes=null;ncLayers=[];ncUrls=[];ncBusy=false;
}
async function ncToggle(){
 if(ncBusy||!radarMap||radarKind!=='rain')return;
 if(ncPrev){ncOff();return}
 const tok=++ncTok,btn=$('#rnc'),note=$('#rnote'),sl=$('#rsl'),prevNote=note?note.textContent:'';
 ncBusy=true;if(btn){btn.disabled=true;btn.setAttribute('aria-pressed','true')}
 /* o motor pode ainda não estar cá: carrega-se agora, sem depender do index.html */
 if(typeof NC==='undefined'&&note)note.textContent=T2('Loading the nowcast engine…','A carregar o motor do nowcast…');
 if(!(await ncEngineLoad())||tok!==ncTok){ 
  if(tok===ncTok){if(note)note.textContent=T2('Nowcast engine unavailable (js/nowcast.js).','Motor do nowcast indisponível (js/nowcast.js).');
   if(btn){btn.setAttribute('aria-pressed','false');btn.disabled=false}}
  ncBusy=false;return;
 }
 const c=radarMap.getCenter(), geom=ncFit();
 const stage=(s,a,b)=>{
  if(tok!==ncTok||!note)return;
  note.textContent=s==='tiles'?T2('Loading radar frames','A carregar imagens de radar')+' '+a+'/'+b+'…'
   :s==='flow'?T2('Tracking rain cells…','A seguir as células de chuva…')
   :T2('Loading radar frames…','A carregar imagens de radar…');
 };
 stage('frames');
 try{
  const res=await NC.forecast({lat:c.lat,lon:c.lng,grid:geom.grid,z:geom.z,horizon:6,verify:true,onStage:stage});
  if(tok!==ncTok||!radarMap)return;
  if(!res.ok){
   if(note)note.textContent=res.why==='dry'?T2('No rain around here to extrapolate.','Sem chuva aqui para extrapolar.')
    :T2('Not enough texture to track the rain.','Textura insuficiente para seguir a chuva.');
   if(btn){btn.setAttribute('aria-pressed','false');btn.disabled=false}
   ncBusy=false;return;
  }
  const urls=[],layers=[],nframes=[];
  for(let i=0;i<res.steps.length;i++){
   const url=await NC.blobURL(NC.canvas(res,i));
   if(!url)continue;
   urls.push(url);
   nframes.push({time:res.steps[i].time,fc:i>0});
   layers.push(L.imageOverlay(url,res.llBounds,{pane:'radar',opacity:0,interactive:false,className:'rlayer ncfc'}));
  }
  if(!layers.length)throw new Error('could not rasterise the forecast frames');
  if(tok!==ncTok||!radarMap){urls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});return}
  ncPrev={layers:radarLayers,frames:radarFrames,idx:radarIdx,max:sl?sl.max:0,note:prevNote};
  ncRes=res;ncLayers=layers;ncUrls=urls;
  radarLayers.forEach(l=>{try{l.setOpacity(0)}catch(e){}});           // as observações saem de baixo do nowcast
  radarLayers=layers;radarFrames=nframes;
  layers.forEach(l=>{l.setOpacity(0);l.addTo(radarMap)});
  if(sl){sl.max=layers.length-1;sl.value=0;sl.disabled=false}
  radarPlay=false;radarBtn();radarShow(0);
  if(note)note.textContent=prevNote;                               // a nota fica como estava: sem bloco de texto
  if(btn)btn.title=ncTip(res);
  if($('#rlsrc'))$('#rlsrc').textContent=NC_SRC;
 }catch(e){
  console.warn('[Nowcast]',e.message);
  if(tok===ncTok&&note)note.textContent=T2('Nowcast unavailable right now.','Nowcast indisponível neste momento.');
  const b=$('#rnc');if(b)b.setAttribute('aria-pressed','false');
 }finally{
  ncBusy=false;
  if(tok===ncTok){const b=$('#rnc');if(b)b.disabled=false}
 }
}

/* ---- Wind (OpenWeatherMap + ECMWF particles) ---- */
async function loadWind(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  const ow=OWM_KINDS.wind;
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading wind layer…';
  let ok=false;
  try{ok=(await fetch(`${WORKER}/owm/${ow.layer}/0/0/0.png`)).ok}catch(e){}
  if(stale())return;
  const isPT=radarScope==='pt';
  radarLayers=ok?[mkLayer(`${WORKER}/owm/${ow.layer}/{z}/{x}/{y}.png`,
    {maxNativeZoom:6,maxZoom:isPT?11:9,className:'rlayer rcloud'})]:[];
  radarFrames=[{}];sl.max=0;
  note.textContent=ok?ow.note+(isPT?' · Portugal':' · Global'):'Wind particles · NOAA GFS 0.25° (colour layer needs OWM_KEY in the worker)';
  $('#rtime').textContent='Current';
  $('#rleg').innerHTML=`<span>${ow.lo()}</span><i style="background:${ow.grad}"></i><span>${ow.hi()}</span><span style="margin-left:8px;font-size:10px;opacity:.7">NOAA GFS</span>`;
  $('#rleg').hidden=!ok;
  radarShow(0);radarBtn();
  requestAnimationFrame(()=>requestAnimationFrame(updateWindVectors));
}

/* ---- Clouds (OpenWeatherMap) ---- */
async function loadCloud(stale,isPT){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading cloud layer…';
  let ok=false;
  try{ok=(await fetch(WORKER+'/clouds/0/0/0.png')).ok}catch(e){}
  if(stale())return;
  if(!ok){
    note.textContent='Cloud layer needs OWM_KEY, showing satellite instead.';
    isoStop();
    return loadSat(stale);
  }
  radarLayers=[mkLayer(WORKER+'/clouds/{z}/{x}/{y}.png',
    {maxNativeZoom:6,maxZoom:isPT?11:9,className:'rlayer rcloud'})];
  radarFrames=[{}];sl.max=0;
  note.textContent='Clouds · OpenWeatherMap'+(isPT?' · Portugal':' · Global');
  $('#rtime').textContent='Current';
  radarShow(0);radarBtn();
}

/* ---- Satellite (NASA GIBS true colour, idêntico nos dois âmbitos) ---- */
/* Nenhum produto verdadeiro-cor está sempre fresco: a NASA atrasa um satélite durante dias (o Suomi NPP
   ficou em 2026-11-02 com o resto do mundo em 11-11). Por isso não há um ID fixo: pede-se a disponibilidade
   a vários satélites e usa-se o mais recente. */
const SAT_PREF=[
 ['VIIRS_NOAA20_CorrectedReflectance_TrueColor','NOAA-20 VIIRS'],
 ['VIIRS_NOAA21_CorrectedReflectance_TrueColor','NOAA-21 VIIRS'],
 ['MODIS_Terra_CorrectedReflectance_TrueColor','Terra MODIS'],
 ['MODIS_Aqua_CorrectedReflectance_TrueColor','Aqua MODIS'],
 ['VIIRS_SNPP_CorrectedReflectance_TrueColor','Suomi NPP VIIRS']
];
let satPick=null;
async function satBest(){
  if(satPick&&Date.now()-satPick.at<6e5)return satPick;
  const all=await Promise.all(SAT_PREF.map(async([id,name])=>{
    try{
      const j=await satInfo(id);
      /* o compósito do dia corrente ainda está a meio, por isso mostramos sempre o anterior:
         é essa a data que conta para decidir qual o produto está mais fresco */
      const eff=(Date.parse(j.end)||0)-(j.stepMs>=864e5?j.stepMs:0);
      return {id,name,j,end:eff,fb:!!j.fallback};
    }catch(e){return null}
  }));
  const good=all.filter(r=>r&&!r.fb&&r.end).sort((a,b)=>b.end-a.end);
  let pick=good[0]||null;
  if(!pick){                                                         // sem metadados: tenta o preferido
    const [id,name]=SAT_PREF[0];
    pick={id,name,j:await satInfo(id),end:0,fb:true};
  }
  satPick={at:Date.now(),...pick};
  return satPick;
}
async function loadSat(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;
  note.textContent='Loading satellite frames…';
  let pick;
  try{pick=await satBest()}catch(e){
    if(!stale()&&note)note.textContent='Satellite imagery unavailable right now.';
    return;
  }
  if(stale())return;
  const j=pick.j;
  const daily=j.stepMs>=864e5;
  let end=Date.parse(j.end);
  const start=Date.parse(j.start),N=daily?7:12;
  if(daily)end-=j.stepMs;                                            // o compósito de hoje ainda está a meio
  const times=Array.from({length:N},(_,i)=>end-(N-1-i)*j.stepMs).filter(t=>t>=start);
  const nz=+((j.tms.match(/Level(\d+)/)||[0,9])[1]);
  radarFrames=times.map(t=>({time:t/1000,fc:false,day:daily}));
  radarLayers=times.map(t=>mkLayer(satURL(pick.id,j,t),{maxNativeZoom:nz,maxZoom:9}));
  sl.disabled=false;pl.disabled=false;sl.max=times.length-1;
  sl.value=times.length-1;
  note.textContent='NASA '+pick.name+' · '+T2('true colour','cor real')+' · '+(daily?T2('daily composite','compósito diário'):T2('30 min frames','imagens de 30 min'));
  radarShow(times.length-1);
  radarPlay=false;radarBtn();radarWarm();
}

/* ============ Temperature radar (Open-Meteo · free, no key) ============ */
/* Reticulado fixo (alinhado com o globo): ~114 px entre nós em qualquer zoom, em cache por nível.
   Só se pedem à Open-Meteo os nós que faltam, por isso arrastar o mapa quase não gasta pedidos. */
const TEMP_MIN=-40,TEMP_MAX=50,TEMP_TTL=9e5;                       // escala em °C · dados válidos 15 min
const TEMP_RAMP=[[-40,'#4b1d91'],[-30,'#3a3fc4'],[-20,'#2f6fe0'],[-10,'#3fa7f0'],[0,'#9fe3f5'],[5,'#74dcc0'],[10,'#7bd37a'],
  [15,'#c5e04a'],[20,'#fbe03a'],[25,'#f9b233'],[30,'#f58220'],[35,'#e8452c'],[40,'#c2192d'],[50,'#5a0a3a']];
const TEMP_LUT=(()=>{                                              // cor a cada 0,25 °C
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),st=TEMP_RAMP.map(([t,h])=>[t,rgb(h)]);
  const n=Math.round((TEMP_MAX-TEMP_MIN)/.25)+1,lut=new Uint8ClampedArray(n*3);
  for(let k=0;k<n;k++){
    const t=TEMP_MIN+k*.25;let a=st[0],b=st[st.length-1];
    for(let s=0;s<st.length-1;s++)if(t>=st[s][0]&&t<=st[s+1][0]){a=st[s];b=st[s+1];break}
    const f=b[0]===a[0]?0:(t-a[0])/(b[0]-a[0]);
    for(let c=0;c<3;c++)lut[k*3+c]=Math.round(a[1][c]+(b[1][c]-a[1][c])*f);
  }
  return lut;
})();
const tempIdx=c=>Math.round((Math.max(TEMP_MIN,Math.min(TEMP_MAX,c))-TEMP_MIN)*4)*3;
const tempRgb=c=>{const k=tempIdx(c);return`rgb(${TEMP_LUT[k]},${TEMP_LUT[k+1]},${TEMP_LUT[k+2]})`};

const tempStepOf=z=>320/Math.pow(2,z);                             // reticulado ~230 px (menos pedidos); divide 360 e 80
const tempKey=(j,i)=>(j+1100)*10000+i;
const tempZ=()=>Math.max(3,Math.min(11,Math.round(radarMap.getZoom())));
let tempCache={},tempOv=null,tempGen=0,tempMoveT=0,tempTimer=0,tempHoverT=0,tempStamp=0,tempBlock=0,tempTip=null,tempHov=null,tempMoving=false;
const tempBusy=new Set(),tempExactC=new Map(),tempNameC=new Map();

function tempNode(L,i,j){
  const m=tempCache[L];if(!m)return NaN;
  const N=Math.round(360/tempStepOf(L)),e=m.get(tempKey(j,((i%N)+N)%N));
  return e?e[0]:NaN;
}
/* interpolação bilinear; se faltar um nó, recorre ao nível mais grosseiro (zoom–1, –2…) */
function tempAt(lat,lng,z){
  lat=Math.max(-80,Math.min(80,lat));lng=((lng+180)%360+360)%360-180;
  {const tv=tlTempAt(lat,lng);if(tv===tv)return tv}                // tiles GFS próprios, se já carregados
  for(let L=z;L>=3;L--){
    const s=tempStepOf(L),fx=lng/s,fy=lat/s,i0=Math.floor(fx),j0=Math.min(Math.round(80/s)-1,Math.floor(fy));
    const tx=fx-i0,ty=fy-j0;
    const a=tempNode(L,i0,j0),b=tempNode(L,i0+1,j0),c=tempNode(L,i0,j0+1),d=tempNode(L,i0+1,j0+1);
    if(a===a&&b===b&&c===c&&d===d)return a*(1-tx)*(1-ty)+b*tx*(1-ty)+c*(1-tx)*ty+d*tx*ty;
  }
  return NaN;
}
function tempNeeded(z,s,n,w,e){                                    // nós da caixa que faltam / expiraram
  if(tlTempReady())return[];                                       // com tiles não há nada para pedir
  const st=tempStepOf(z),N=Math.round(360/st),jm=Math.round(80/st),m=tempCache[z]||new Map(),now=Date.now(),out=[],seen=new Set();
  const i0=Math.floor(w/st),i1=Math.ceil(e/st),j0=Math.max(-jm,Math.floor(s/st)),j1=Math.min(jm,Math.ceil(n/st));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const ii=((i%N)+N)%N,k=tempKey(j,ii);
    if(seen.has(k))continue;seen.add(k);
    const c=m.get(k);
    if((!c||now-c[1]>TEMP_TTL)&&!tempBusy.has(z+':'+k))out.push([ii,j,k]);
  }
  return out;
}

async function gridBlock(z,bi,bj){                                 // worker primeiro; se falhar, plano B direto ao Open-Meteo
  const st=tempStepOf(z);
  try{
    const r=await fetch(`${WORKER}/grid?step=${st}&bi=${bi}&bj=${bj}`);
    if(r.ok)return await r.json();
    if(r.status===429)throw new Error('429');
    console.warn('[Grid] worker',r.status,await r.text().catch(()=>''));
  }catch(e){if(e.message==='429')throw e}
  return gridDirect(z,bi,bj);
}
async function gridDirect(z,bi,bj){
  const st=tempStepOf(z),N=Math.round(360/st),lats=[],lons=[],idx=[];
  for(let b=0;b<GRID_B;b++)for(let a=0;a<GRID_B;a++){
    const lat=(bj*GRID_B+b)*st;if(lat>84||lat<-84)continue;
    const x=((((bi*GRID_B+a)%N)+N)%N)*st;
    lats.push(lat.toFixed(4));lons.push((x>=180?x-360:x).toFixed(4));idx.push(b*GRID_B+a);
  }
  const t=Array(GRID_B*GRID_B).fill(null),p=t.slice(),out={t,p,ts:0};
  if(!idx.length)return out;
  const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=temperature_2m,pressure_msl&timeformat=unixtime`);
  if(!r.ok)throw new Error(r.status==429?'429':'HTTP '+r.status);
  const j=await r.json(),arr=Array.isArray(j)?j:[j];
  idx.forEach((k,n)=>{const c=arr[n]&&arr[n].current;if(!c)return;if(c.temperature_2m!=null)t[k]=c.temperature_2m;if(c.pressure_msl!=null)p[k]=c.pressure_msl;if(c.time)out.ts=Math.max(out.ts,c.time*1000)});
  return out;
}
const GRID_B=8;                                                    // blocos 8×8 nós, iguais aos do worker (/grid)
let windCache={};
const WIND_TTL=18e5;
async function gridLoad(z,nodes){                                  // pede blocos ao worker e preenche as caches (temperatura, pressão, vento)
  const st=tempStepOf(z),N=Math.round(360/st),blocks=new Map();
  nodes.forEach(n=>{const bi=Math.floor(n[0]/GRID_B),bj=Math.floor(n[1]/GRID_B);blocks.set(bi+','+bj,[bi,bj])});
  const tm=tempCache[z]||(tempCache[z]=new Map()),pm=isoCache[z]||(isoCache[z]=new Map()),wm=windCache[z]||(windCache[z]=new Map());
  await Promise.all([...blocks.values()].slice(0,16).map(async([bi,bj])=>{
    const g=await gridBlock(z,bi,bj),now=Date.now();
    for(let b=0;b<GRID_B;b++)for(let a=0;a<GRID_B;a++){
      const k=b*GRID_B+a,t=g.t[k],p=g.p[k],s=g.ws&&g.ws[k],d=g.wd&&g.wd[k];
      if(t==null&&p==null&&s==null)continue;
      const key=tempKey(bj*GRID_B+b,(((bi*GRID_B+a)%N)+N)%N);
      if(t!=null)tm.set(key,[+t,now]);
      if(p!=null)pm.set(key,[+p,now]);
      if(s!=null&&d!=null)wm.set(key,[+s,+d,now]);
    }
    if(g.ts)tempStamp=Math.max(tempStamp,g.ts);
  }));
  for(const m of [tm,pm,wm])if(m.size>6000){let k=0;for(const key of m.keys()){m.delete(key);if(++k>1500)break}}
}

async function tempFetch(z,nodes){
  nodes.forEach(n=>tempBusy.add(z+':'+n[2]));
  try{await gridLoad(z,nodes)}
  finally{nodes.forEach(n=>tempBusy.delete(z+':'+n[2]))}
}

/* caixa visível + margem (25 % para a imagem, que assim acompanha o mapa sem cortes ao arrastar) */
function tempBox(f=.15){
  const sz=radarMap.getSize(),px=sz.x*f,py=sz.y*f;
  return{sz,px,py,nw:radarMap.containerPointToLatLng([-px,-py]),se:radarMap.containerPointToLatLng([sz.x+px,sz.y+py])};
}
function tempRender(){
  if(!radarMap||radarKind!=='temp'||!window.L)return;
  const z=tempZ(),{sz,px,py,nw,se}=tempBox(),pw=sz.x+2*px,ph=sz.y+2*py;
  const cw=Math.max(48,Math.min(360,Math.ceil(pw/6))),ch=Math.max(32,Math.ceil(cw*ph/pw));
  const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
  const cx=cv.getContext('2d'),img=cx.createImageData(cw,ch),d=img.data,lons=new Float64Array(cw),lats=new Float64Array(ch);
  for(let x=0;x<cw;x++)lons[x]=radarMap.containerPointToLatLng([-px+(x+.5)/cw*pw,0]).lng;
  for(let y=0;y<ch;y++)lats[y]=radarMap.containerPointToLatLng([0,-py+(y+.5)/ch*ph]).lat;
  let hit=0;
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const t=tempAt(lats[y],lons[x],z);
    if(t!==t)continue;                                             // ainda sem dados: transparente
    const k=tempIdx(t),o=(y*cw+x)*4;
    d[o]=TEMP_LUT[k];d[o+1]=TEMP_LUT[k+1];d[o+2]=TEMP_LUT[k+2];d[o+3]=255;hit++;
  }
  if(!hit)return;
  cx.putImageData(img,0,0);
  const bounds=L.latLngBounds(nw,se),ov=L.imageOverlay(cv.toDataURL('image/png'),bounds,{pane:'radar',className:'rlayer rtemp',opacity:0,interactive:false});
  ov._z=z;ov._b=bounds;ov._at=Date.now();
  ov.addTo(radarMap);
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.setOpacity(.8)));
  const old=tempOv;tempOv=ov;
  if(old)setTimeout(()=>{try{radarMap&&radarMap.removeLayer(old)}catch(e){}},1100);   // o novo faz fade por cima do antigo
}

function tempStatus(){
  const nt=$('#rnote'),tm=$('#rtime');
  if(nt)nt.textContent=tlTempReady()?tr('Air temperature · NOAA GFS 0.25° · hover for exact values'):tr('Air temperature · Open-Meteo · hover for exact values');
  if(tm)tm.textContent=tr('Current')+' · '+new Date(tempStamp||Date.now()).toLocaleTimeString(LOC(),{hour:'2-digit',minute:'2-digit'});
}
function tempSchedule(){
  clearTimeout(tempTimer);
  tempTimer=setTimeout(()=>{if(radarMap&&radarKind==='temp'){if(document.hidden)tempSchedule();else tempUpdate()}},TEMP_TTL+5e3);
}
async function tempUpdate(){
  if(!radarMap||radarKind!=='temp')return;
  await tlField('temp');                                            // tiles próprios; se falharem, o método antigo (/grid) trata de tudo
  if(!radarMap||radarKind!=='temp')return;
  if(tlTempReady())tempStamp=tlMan.ts;
  const gen=tempGen,z=tempZ(),box=b=>[Math.max(-85,b.se.lat),Math.min(85,b.nw.lat),b.nw.lng,b.se.lng];
  const need=tempNeeded(z,...box(tempBox())),core=tempNeeded(z,...box(tempBox(.12)));
  if(!core.length&&tempOv&&tempOv._z===z&&tempOv._b.contains(radarMap.getBounds())&&Date.now()-tempOv._at<TEMP_TTL)return tempSchedule();
  tempRender();                                                    // já com o que existe em cache
  if(tempOv&&!need.length)tempStatus();
  if(need.length&&Date.now()>tempBlock){
    try{await tempFetch(z,need)}
    catch(err){
      console.warn('[Temp]',err.message);
      tempBlock=Date.now()+(err.message==='429'?3e5:3e4);
      const nt=$('#rnote');
      if(gen===tempGen&&nt&&!tempOv)nt.textContent=tr(err.message==='429'?'Temperature data rate-limited — try again in a few minutes.':'Temperature unavailable right now.');
      return;
    }
    if(gen!==tempGen||!radarMap||radarKind!=='temp')return;
    tempRender();tempStatus();tempSave();
  }
  tempSchedule();
}

/* ---- escala (muda com °C / °F) ---- */
function tempLegend(){
  const bar=$('#tbar'),tk=$('#tticks'),un=$('#tunit');if(!bar||!tk)return;
  const pos=c=>((c-TEMP_MIN)/(TEMP_MAX-TEMP_MIN)*100).toFixed(2),f=unit==='f';
  bar.style.background=`linear-gradient(90deg,${TEMP_RAMP.map(([t,h])=>`${h} ${pos(t)}%`).join(',')})`;
  const vals=f?[-40,-20,0,20,40,60,80,100,120]:[-40,-30,-20,-10,0,10,20,30,40,50];
  tk.innerHTML=vals.map(v=>`<span style="left:${pos(f?(v-32)*5/9:v)}%">${v<0?'−'+(-v):v}</span>`).join('');
  if(un)un.textContent=deg();
}

/* ---- tooltip ao passar o rato (ou tocar) ---- */
const tempFmt2=v=>LANG==='pt'?v.toFixed(2).replace('.',','):v.toFixed(2);
function tempCoords(ll){
  const lat=ll.lat,lon=((ll.lng+180)%360+360)%360-180;
  return`${tempFmt2(Math.abs(lat))}° ${lat>=0?'N':'S'} · ${tempFmt2(Math.abs(lon))}° ${lon>=0?'E':(LANG==='pt'?'O':'W')}`;
}
function tempTipPaint(c,ll,pending,name){
  if(!tempTip)return;
  if(!(c===c)){tempTip.innerHTML=`<b>—</b><small>${T2('loading…','a carregar…')}</small>`;return}
  tempTip.innerHTML=`<b><i style="background:${tempRgb(c)}"></i>${decT(c)} ${deg()}</b><small>${name?escH(name)+' · ':''}${tempCoords(ll)}${pending?' · …':''}</small>`;
}
function tempTipPlace(pt){
  const el=tempTip,W=radarMap.getContainer().clientWidth,hw=el.offsetWidth/2+8;
  el.style.left=Math.max(hw,Math.min(W-hw,pt.x))+'px';el.style.top=pt.y+'px';
  el.classList.toggle('below',pt.y<92);el.classList.add('on');
}
function tempTipHide(){clearTimeout(tempHoverT);tempHov=null;if(tempTip)tempTip.classList.remove('on')}
function tempHover(e){
  if(!radarMap||radarKind!=='temp'||tempMoving||!tempTip)return;
  const ll=e.latlng,h=tempHov={ll,pt:e.containerPoint,c:tempAt(ll.lat,ll.lng,tempZ()),click:e.type==='click'};
  tempTipPaint(h.c,ll,true,'');tempTipPlace(h.pt);
  clearTimeout(tempHoverT);tempHoverT=setTimeout(()=>tempExact(h),800);   // só se o rato parar
}
async function tempName(lat,lon){
  const k=lat.toFixed(2)+','+lon.toFixed(2);
  if(tempNameC.has(k))return tempNameC.get(k);
  let n='';
  try{
    const j=await(await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=${LANG}`)).json();
    n=[j.city||j.locality||j.principalSubdivision,j.countryName].filter(Boolean).join(', ');
  }catch(e){}
  tempNameC.set(k,n);return n;
}
async function tempExact(h){                                       // nome do sítio sempre; valor exato só ao clicar (poupa pedidos)
  if(h!==tempHov||!radarMap||radarKind!=='temp')return;
  const gen=tempGen,lat=Math.max(-85,Math.min(85,h.ll.lat)),lon=((h.ll.lng+180)%360+360)%360-180,key=lat.toFixed(2)+','+lon.toFixed(2);
  let v=tempExactC.get(key);
  const fresh=v&&v.at&&Date.now()-v.at<TEMP_TTL;
  try{
    const name=await tempName(lat,lon);
    let c=fresh?v.c:h.c,at=fresh?v.at:0;
    if(h.click&&!fresh&&!tlTempReady()&&Date.now()>tempBlock){
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m&timeformat=unixtime`);
      if(r.status===429)tempBlock=Date.now()+3e5;
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      if(!j.current||j.current.temperature_2m==null)throw new Error('no data');
      c=+j.current.temperature_2m;at=Date.now();
    }
    v={c,name,at};
    tempExactC.set(key,v);if(tempExactC.size>300)tempExactC.delete(tempExactC.keys().next().value);
  }catch(err){console.warn('[Temp hover]',err.message);if(gen===tempGen&&h===tempHov)tempTipPaint(h.c,h.ll,false,'');return}
  if(gen!==tempGen||h!==tempHov||!tempTip)return;
  tempTipPaint(v.c,h.ll,false,v.name);tempTipPlace(h.pt);
}

const tempMoveStart=()=>{tempMoving=true;tempTipHide()};
function tempMoved(){tempMoving=false;clearTimeout(tempMoveT);tempMoveT=setTimeout(tempUpdate,700)}
function tempMount(){
  const cont=radarMap.getContainer();
  if(!tempTip||tempTip.parentNode!==cont){tempTip=document.createElement('div');tempTip.className='rttip';tempTip.setAttribute('aria-hidden','true');cont.appendChild(tempTip)}
  radarMap.on('movestart zoomstart',tempMoveStart);radarMap.on('moveend',tempMoved);
  radarMap.on('mousemove click',tempHover);radarMap.on('mouseout',tempTipHide);
}
function tempStop(){
  tempGen++;clearTimeout(tempMoveT);clearTimeout(tempTimer);clearTimeout(tempHoverT);
  tempHov=null;tempMoving=false;
  if(radarMap){
    try{radarMap.off('movestart zoomstart',tempMoveStart);radarMap.off('moveend',tempMoved);radarMap.off('mousemove click',tempHover);radarMap.off('mouseout',tempTipHide)}catch(e){}
    if(tempOv){try{radarMap.removeLayer(tempOv)}catch(e){}}
    if(tempBd){try{radarMap.removeLayer(tempBd)}catch(e){}}
    if(tempLab){try{radarMap.removeLayer(tempLab)}catch(e){}}
  }
  tempBd=null;tempLab=null;
  if(false){
  }
  tempOv=null;
  if(tempTip){tempTip.remove();tempTip=null}
}

/* ---- Temperature (Open-Meteo) ---- */
async function loadTemp(stale){
  const note=$('#rnote'),sl=$('#rsl'),pl=$('#rplay');
  sl.disabled=true;pl.disabled=true;sl.max=0;radarFrames=[{}];radarPlay=false;radarBtn();
  note.textContent=tr('Loading temperature…');
  $('#rtime').textContent=tr('Current');
  tempLegend();
  if(stale())return;
  tempMount();
  tempBordersOn();
  await tempUpdate();
}

/* cache da temperatura sobrevive a recarregamentos (15 min) */
const TEMP_LS='skylabTempCache1';
function tempSave(){try{const o={};for(const z in tempCache){const a=[];for(const[k,e]of tempCache[z])if(Date.now()-e[1]<TEMP_TTL)a.push([k,e[0],e[1]]);if(a.length)o[z]=a.slice(-1200)}localStorage.setItem(TEMP_LS,JSON.stringify(o))}catch(e){}}
function tempLoad(){try{const o=JSON.parse(localStorage.getItem(TEMP_LS)||'{}');for(const z in o)tempCache[z]=new Map(o[z].filter(a=>Date.now()-a[2]<TEMP_TTL).map(a=>[a[0],[a[1],a[2]]]))}catch(e){}}
tempLoad();

/* ============ Fronteiras + nomes dos países (radar de temperatura) ============ */
const mkPane=(n,z)=>{const p=radarMap.getPane(n)||radarMap.createPane(n);p.style.zIndex=z;p.style.pointerEvents='none';return p};
const BORDERS_URL='https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';   // Natural Earth 50m (TopoJSON)
const BORDERS_KEY='cb1_4644_2_e1ddc0590e0bf3595329dba5';                                  // a mesma MAP_KEY do radarInit
let bordersP=null,tempBd=null,tempLab=null;
function bordersLoad(){                                                                   // descodifica os arcos → [[lat,lng],…] sem artefactos de recorte
  return bordersP||(bordersP=fetch(BORDERS_URL).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(t=>{
    const[sx,sy]=t.transform.scale,[tx,ty]=t.transform.translate;
    const lines=[];
    const isArtifact=pts=>{
      let minLng=1e9,maxLng=-1e9,minLat=1e9,maxLat=-1e9;
      for(const p of pts){
        if(p[1]<minLng)minLng=p[1];if(p[1]>maxLng)maxLng=p[1];
        if(p[0]<minLat)minLat=p[0];if(p[0]>maxLat)maxLat=p[0];
      }
      return (maxLng - minLng > 60 && maxLat - minLat < 0.6);
    };
    for(const a of t.arcs){
      let x=0,y=0,seg=[];
      for(const p of a){
        x+=p[0];y+=p[1];
        const lat=y*sy+ty,lng=x*sx+tx;
        if(seg.length){
          const prev=seg[seg.length-1];
          // Evita unir pontos através do antimeridiano (salto > 180° cria linha horizontal pelo mapa todo)
          if(Math.abs(lng-prev[1])>180){
            if(seg.length>=2&&!isArtifact(seg))lines.push(seg);
            seg=[[lat,lng]];
            continue;
          }
        }
        seg.push([lat,lng]);
      }
      if(seg.length>=2&&!isArtifact(seg))lines.push(seg);
    }
    return lines;
  }).catch(e=>{bordersP=null;throw e}));
}
async function tempBordersOn(){
  if(!radarMap||tempBd||tempLab)return;
  const map=radarMap,gen=tempGen;
  mkPane('rborders',254);
  tempLab=L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png?key=${BORDERS_KEY}`,{pane:'labels',maxZoom:19,opacity:.95}).addTo(map);
  try{
    const lines=await bordersLoad();
    if(gen!==tempGen||radarMap!==map)return;                         // mudou de radar entretanto
    const r=L.canvas({pane:'rborders',padding:.3}),o={renderer:r,pane:'rborders',interactive:false,smoothFactor:1.2,lineJoin:'round',lineCap:'round'};
    tempBd=L.layerGroup([
      L.polyline(lines,{...o,color:'#ffffff',weight:3.4,opacity:.7}),   // contorno branco (lê-se sobre qualquer cor)
      L.polyline(lines,{...o,color:'#14314f',weight:1.2,opacity:.9})
    ]).addTo(map);
  }catch(e){console.warn('[Borders]',e.message)}
}

/* ============ Campo GLOBAL de pressão · NOAA/NCEP GFS (0,25°, reduzido a 1,5°) via worker /pressure ============
   Um único campo para o planeta inteiro (carrega 1×, cache 45 min), independente do zoom e do ecrã:
   as isóbaras são calculadas localmente a partir dele (Catmull-Rom + marching squares), por isso já não há
   "buracos" quando o Open-Meteo recusa blocos (429) nem linhas em faixas a zoom baixo.
   Se o /pressure falhar, cai no método antigo (blocos Open-Meteo /grid) e tenta de novo mais tarde. */
const PG_TTL=45*60e3;
let PG=null,PGp=null,PGfail=0;
async function pgLoad(){
  if(PG&&Date.now()-PG.at<PG_TTL)return PG;
  if(PGp)return PGp;
  if(Date.now()<PGfail)return PG;                                  // falhou há pouco: usa o que houver (ou null → método antigo)
  PGp=(async()=>{
    try{
      const T=await tlPressureGrid();                                // 1.º: tiles próprios (0,75°)
      if(T){PG=T;T.ext=pgExtremes(T);PGfail=0;return T}
      const r=await fetch(WORKER+'/pressure',{signal:AbortSignal.timeout(25000)});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      if(!j||!(j.w>=8)||!(j.h>=8)||!(j.st>0)||!Array.isArray(j.p)||j.p.length!==j.w*j.h)throw new Error('forma');
      const p=new Float32Array(j.p.length);
      for(let k=0;k<p.length;k++){const v=j.p[k];p[k]=v==null?NaN:v/10}      // décimos de hPa → hPa
      const G={w:j.w,h:j.h,st:j.st,lat0:j.lat0,lon0:j.lon0,p,at:Date.now(),run:j.run||'',src:j.src||'NOAA GFS',ext:[]};
      PG=G;G.ext=pgExtremes(G);PGfail=0;
      return G;
    }catch(e){
      console.warn('[Pressure]',e.message);PGfail=Date.now()+6e4;return PG;      // mantém o campo antigo se o refresh falhar
    }finally{PGp=null}
  })();
  return PGp;
}
/* valor de pressão (hPa) num ponto: Catmull-Rom bicúbico, com a longitude a dar a volta ao mundo */
function pgAt(lat,lon){
  const G=PG;if(!G)return NaN;
  const w=G.w,h=G.h,p=G.p,la=Math.max(G.lat0,Math.min(G.lat0+(h-1)*G.st,lat)),fy=(la-G.lat0)/G.st,y=Math.min(h-2,Math.floor(fy)),ty=fy-y;
  let fx=((lon-G.lon0)/G.st)%w;if(fx<0)fx+=w;
  const x=Math.floor(fx),tx=fx-x,xs=[0,1,2,3].map(k=>(((x-1+k)%w)+w)%w),r=[];
  for(let k=0;k<4;k++){const o=Math.max(0,Math.min(h-1,y-1+k))*w;r.push(isoCR(p[o+xs[0]],p[o+xs[1]],p[o+xs[2]],p[o+xs[3]],tx))}
  return isoCR(r[0],r[1],r[2],r[3],ty);
}
/* amostra o campo numa malha regular (lat sul→norte, lon oeste→leste) com passo ds, alinhada ao mundo */
function pgSample(la0,lo0,ds,nx,ny){
  const G=PG,w=G.w,h=G.h,p=G.p,F=new Float32Array(nx*ny),cx=new Int32Array(nx*4),ct=new Float32Array(nx),r=[0,0,0,0];
  for(let X=0;X<nx;X++){let fx=((lo0+X*ds-G.lon0)/G.st)%w;if(fx<0)fx+=w;const x=Math.floor(fx);ct[X]=fx-x;for(let k=0;k<4;k++)cx[X*4+k]=(((x-1+k)%w)+w)%w}
  for(let Y=0;Y<ny;Y++){
    const la=Math.max(G.lat0,Math.min(G.lat0+(h-1)*G.st,la0+Y*ds)),fy=(la-G.lat0)/G.st,y=Math.min(h-2,Math.floor(fy)),ty=fy-y;
    const o=[0,1,2,3].map(k=>Math.max(0,Math.min(h-1,y-1+k))*w);
    for(let X=0;X<nx;X++){
      const c=X*4,t=ct[X];
      for(let k=0;k<4;k++)r[k]=isoCR(p[o[k]+cx[c]],p[o[k]+cx[c+1]],p[o[k]+cx[c+2]],p[o[k]+cx[c+3]],t);
      F[Y*nx+X]=isoCR(r[0],r[1],r[2],r[3],ty);
    }
  }
  return F;
}
/* altas (A) e baixas (B) do planeta: extremos locais a ~7° com proeminência mínima, afinados no campo suave */
function pgExtremes(G){
  const w=G.w,h=G.h,p=G.p,R=Math.max(3,Math.round(7/G.st)),cand=[];
  const at=(x,y)=>p[y*w+(((x%w)+w)%w)];
  for(let y=R;y<h-R;y++){
    const lat=G.lat0+y*G.st;if(Math.abs(lat)>78)continue;           // perto dos polos a redução ao nível do mar é pouco fiável
    for(let x=0;x<w;x++){
      const c=at(x,y);if(c!==c)continue;
      let mx=true,mn=true,sum=0,cnt=0;
      scan:for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
        if(!dx&&!dy)continue;const q=at(x+dx,y+dy);
        if(q!==q){mx=mn=false;break scan}
        if(q>c)mx=false;if(q<c)mn=false;
        if(!mx&&!mn)break scan;
        if(Math.max(Math.abs(dx),Math.abs(dy))===R){sum+=q;cnt++}
      }
      if(!mx&&!mn)continue;
      const d=c-sum/Math.max(1,cnt);
      if((mx&&d>=2)||(mn&&-d>=2))cand.push({hi:mx&&d>=2,p:c,d:Math.abs(d),lat,lng:G.lon0+x*G.st});
    }
  }
  cand.sort((a,b)=>b.d-a.d);
  const out=[],near=(a,b)=>{let dl=Math.abs(a.lng-b.lng)%360;if(dl>180)dl=360-dl;return Math.hypot(a.lat-b.lat,dl*Math.cos(a.lat*Math.PI/180))<2*R*G.st};
  for(const e of cand){
    if(out.some(o=>o.hi===e.hi&&near(o,e)))continue;
    let bl=e.lat,bo=e.lng,bv=e.p;                                    // afina a posição e o valor no campo bicúbico (passos de ¼ de nó)
    for(let a=-4;a<=4;a++)for(let b=-4;b<=4;b++){
      const la=e.lat+a*G.st/4,lo=e.lng+b*G.st/4,v=pgAt(la,lo);
      if(v===v&&(e.hi?v>bv:v<bv)){bv=v;bl=la;bo=lo}
    }
    out.push({hi:e.hi,p:bv,lat:bl,lng:bo});
  }
  return out;
}
/* isóbaras do que está no ecrã, a partir do campo global. Malha alinhada ao mundo (não ao ecrã) → as linhas não "tremem" ao arrastar. */
function isoBuildGlobal(){
  const G=PG;if(!G||!radarMap)return null;
  const b=radarMap.getBounds(),z=radarMap.getZoom();
  const ds=G.st/(z<=3?2:z<=5?3:4),iv=z<=3?4:z<=6?2:1;              // mais linhas e mais juntas que antes (8/4/2 hPa)
  const pla=(b.getNorth()-b.getSouth())*.1+2*ds,plo=Math.min(360,(b.getEast()-b.getWest())*.1+2*ds);
  const s=Math.max(-84,b.getSouth()-pla),n=Math.min(84,b.getNorth()+pla);
  let w=b.getWest()-plo,e=b.getEast()+plo;if(e-w>720){const m=(w+e)/2;w=m-360;e=m+360}
  const la0=Math.floor(s/ds)*ds,lo0=Math.floor(w/ds)*ds,ny=Math.ceil((n-la0)/ds)+1,nx=Math.ceil((e-lo0)/ds)+1;
  if(nx<4||ny<4)return null;
  const F=pgSample(la0,lo0,ds,nx,ny);
  let lo=1e9,hi=-1e9;for(let k=0;k<F.length;k++){const v=F[k];if(v===v){if(v<lo)lo=v;if(v>hi)hi=v}}
  if(!(hi>lo))return null;
  const lines=[];
  for(let lv=Math.ceil(lo/iv)*iv;lv<=hi;lv+=iv){
    const segs=[];isoMarch(F,nx,ny,lv,(x1,y1,x2,y2)=>segs.push([x1,y1,x2,y2]));
    if(!segs.length)continue;
    const chains=isoChain(segs).filter(c=>c.length>2).map(c=>isoSmooth(isoThin(c),1).map(q=>[la0+q[1]*ds,lo0+q[0]*ds]));
    const sg=[];chains.forEach(c=>{for(let i=0;i<c.length-1;i++)sg.push([c[i][0],c[i][1],c[i+1][0],c[i+1][1]])});
    lines.push({lv,segs:sg,chains});
  }
  return{lines,ext:G.ext,iv};
}

/* ============ Linhas de pressão (isóbaras) + A/B · campo global NOAA GFS (com Open-Meteo /grid como reserva) ============ */
const ISO_KINDS=['rain','cloud','temp'];                           // radares com isóbaras (sem vento nem satélite)
const ISO_TTL=18e5;                                                // dados válidos 30 min
const isoStepOf=z=>tempStepOf(z);                                  // mesmo reticulado da temperatura → um único pedido serve os dois               // independente da temperatura
let isoRef=0,isoCache={},isoGrp=null,isoOld=new Set(),isoGen=0,isoT=0,isoBlock=0,isoRun=false,isoAgain=false,isoOn=false;

const isoZ=()=>Math.max(5,tempZ());                                // isóbaras: nunca com passo > 10° (a 40°/20° só há 5–9 filas de latitude e as linhas ficam em faixas horizontais)
const isoNode=(z,i,j)=>{const m=isoCache[z],e=m&&m.get(tempKey(j,i)),v=e?e[0]:NaN;return v>850&&v<1090?v:NaN};   // valores absurdos contam como "sem dados"
function isoGridBox(){
  const b=radarMap.getBounds(),z=isoZ(),st=isoStepOf(z),jm=Math.floor(84/st);      // nunca pedir latitudes > 84°
  const mLa=Math.max((b.getNorth()-b.getSouth())*.12,2*st),mLo=Math.max((b.getEast()-b.getWest())*.12,2*st);
  const s=b.getSouth()-mLa,n=b.getNorth()+mLa,w=b.getWest()-mLo,e=b.getEast()+mLo;
  return{z,st,i0:Math.floor(w/st),i1:Math.ceil(e/st),j0:Math.max(-jm,Math.floor(s/st)),j1:Math.min(jm,Math.ceil(n/st))};
}
function isoMissing(g){                                            // nós em falta / expirados
  const N=Math.round(360/g.st),m=isoCache[g.z]||new Map(),now=Date.now(),out=[],seen=new Set();
  for(let j=g.j0;j<=g.j1;j++)for(let i=g.i0;i<=g.i1;i++){
    const ii=((i%N)+N)%N,k=tempKey(j,ii);
    if(seen.has(k))continue;seen.add(k);
    const c=m.get(k);if(!c||now-c[1]>ISO_TTL)out.push([ii,j,k]);
  }
  return out;
}
async function isoFetch(z,nodes){await gridLoad(z,nodes)}

/* marching squares: emite segmentos (x1,y1,x2,y2) em coordenadas de grelha */
function isoMarch(F,nx,ny,lv,emit){
  for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
    const a=F[y*nx+x],b=F[y*nx+x+1],c=F[(y+1)*nx+x+1],d=F[(y+1)*nx+x];
    if(a!==a||b!==b||c!==c||d!==d)continue;
    const k=(a>=lv?1:0)|(b>=lv?2:0)|(c>=lv?4:0)|(d>=lv?8:0);
    if(k===0||k===15)continue;
    const T=[x+(lv-a)/(b-a),y],R=[x+1,y+(lv-b)/(c-b)],B=[x+(lv-d)/(c-d),y+1],W=[x,y+(lv-a)/(d-a)],m=(a+b+c+d)/4>=lv;
    const S=({1:[W,T],2:[T,R],3:[W,R],4:[R,B],5:m?[T,R,W,B]:[W,T,R,B],6:[T,B],7:[W,B],8:[W,B],9:[T,B],10:m?[W,T,R,B]:[T,R,W,B],11:[R,B],12:[W,R],13:[T,R],14:[W,T]})[k];
    for(let s=0;s<S.length;s+=2)emit(S[s][0],S[s][1],S[s+1][0],S[s+1][1]);
  }
}
/* junta os segmentos do marching squares em linhas contínuas e arredonda os cantos (Chaikin) */
function isoChain(segs){
  const key=(x,y)=>Math.round(x*1e4)+','+Math.round(y*1e4),m=new Map();
  segs.forEach((q,i)=>{for(const k of[key(q[0],q[1]),key(q[2],q[3])]){let a=m.get(k);if(!a)m.set(k,a=[]);a.push(i)}});
  const used=new Uint8Array(segs.length),out=[];
  for(let i=0;i<segs.length;i++){
    if(used[i])continue;used[i]=1;
    const pts=[[segs[i][0],segs[i][1]],[segs[i][2],segs[i][3]]];
    for(let dir=0;dir<2;dir++){
      for(;;){
        const e=pts[pts.length-1],k=key(e[0],e[1]),a=m.get(k);let j=-1;
        if(a)for(const t of a)if(!used[t]){j=t;break}
        if(j<0)break;used[j]=1;const q=segs[j];
        pts.push(key(q[0],q[1])===k?[q[2],q[3]]:[q[0],q[1]]);
      }
      pts.reverse();
    }
    out.push(pts);
  }
  return out;
}
const isoThin=c=>{if(c.length<9)return c;const o=[];for(let i=0;i<c.length;i+=2)o.push(c[i]);if((c.length-1)%2)o.push(c[c.length-1]);return o};
function isoSmooth(p,it){
  const same=(a,b)=>Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6,closed=p.length>3&&same(p[0],p[p.length-1]);
  for(;it>0;it--){
    const q=[];if(!closed)q.push(p[0]);
    for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];
      q.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]])}
    if(closed)q.push(q[0]);else q.push(p[p.length-1]);
    p=q;
  }
  return p;
}
const isoCR=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));   // Catmull-Rom (suaviza o campo)
function isoBuild(g){
  const nx=g.i1-g.i0+1,ny=g.j1-g.j0+1,N=Math.round(360/g.st),P=new Float64Array(nx*ny);let ok=0;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const v=isoNode(g.z,((g.i0+x)%N+N)%N,g.j0+y);P[y*nx+x]=v;if(v===v)ok++}
  if(nx<5||ny<5||ok<nx*ny*.5)return null;
  const K=g.z<=5?8:6,fx=(nx-1)*K+1,fy=(ny-1)*K+1,F=new Float32Array(fx*fy);
  const at=(x,y)=>P[Math.max(0,Math.min(ny-1,y))*nx+Math.max(0,Math.min(nx-1,x))];
  for(let Y=0;Y<fy;Y++){const y=Math.floor(Y/K),ty=Y/K-y;
    for(let X=0;X<fx;X++){const x=Math.floor(X/K),tx=X/K-x,c=[-1,0,1,2].map(dy=>isoCR(at(x-1,y+dy),at(x,y+dy),at(x+1,y+dy),at(x+2,y+dy),tx));
      F[Y*fx+X]=isoCR(c[0],c[1],c[2],c[3],ty)}}
  let lo=1e9,hi=-1e9;for(const v of F)if(v===v){if(v<lo)lo=v;if(v>hi)hi=v}
  if(!(hi>lo))return null;
  const iv=g.z<=5?8:g.z<=8?4:2;                                    // intervalo fixo por zoom: arrastar o mapa já não subdivide as linhas
  const X2=x=>(g.i0+x/K)*g.st,Y2=y=>(g.j0+y/K)*g.st,lines=[];
  for(let lv=Math.ceil(lo/iv)*iv;lv<=hi;lv+=iv){
    const segs=[];isoMarch(F,fx,fy,lv,(x1,y1,x2,y2)=>segs.push([x1,y1,x2,y2]));
    if(!segs.length)continue;
    const chains=isoChain(segs).map(c=>isoSmooth(isoThin(c),2).map(q=>[Y2(q[1]),X2(q[0])]));
    const sg=[];chains.forEach(c=>{for(let i=0;i<c.length-1;i++)sg.push([c[i][0],c[i][1],c[i+1][0],c[i+1][1]])});
    lines.push({lv,segs:sg,chains});
  }
  /* máximos (A) e mínimos (B): extremos locais com raio de 2 nós e proeminência mínima */
  const ext=[],R=g.st>=20?1:2,prom=g.z<=5?2:1;                     // passos grandes → vizinhança mais curta
  for(let y=R;y<ny-R;y++)for(let x=R;x<nx-R;x++){
    const p=P[y*nx+x];if(p!==p)continue;
    let mx=true,mn=true,sum=0,cnt=0;
    for(let dy=-R;dy<=R&&(mx||mn);dy++)for(let dx=-R;dx<=R;dx++){
      if(!dx&&!dy)continue;const q=P[(y+dy)*nx+x+dx];
      if(q!==q){mx=mn=false;break}
      if(q>p)mx=false;if(q<p)mn=false;
      if(Math.max(Math.abs(dx),Math.abs(dy))===R){sum+=q;cnt++}
    }
    const d=p-sum/cnt,isHi=mx&&d>=prom,isLo=mn&&-d>=prom;
    if(!isHi&&!isLo)continue;
    let bx=x*K,by=y*K,bv=F[by*fx+bx];                              // afina o ponto na grelha suavizada
    for(let Y=by-K;Y<=by+K;Y++)for(let X=bx-K;X<=bx+K;X++){const v=F[Y*fx+X];if(v===v&&(isHi?v>bv:v<bv)){bv=v;bx=X;by=Y}}
    const e={hi:isHi,p:bv,lat:Y2(by),lng:X2(bx)};
    if(!ext.some(o=>o.hi===e.hi&&Math.hypot(o.lat-e.lat,o.lng-e.lng)<2*R*g.st))ext.push(e);
  }
  return{lines,ext};
}
function isoDraw(M){
  if(!radarMap||!isoGrp)return;
  const nu=L.layerGroup(),old=isoGrp;
  if(M){
    const multi=M.lines.flatMap(l=>l.chains),o={pane:'isobars',className:'isoln',interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:.6};
    if(multi.length){
      const maj=M.iv?M.lines.filter(l=>l.lv%20===0).flatMap(l=>l.chains):[],mnr=M.iv?M.lines.filter(l=>l.lv%20!==0).flatMap(l=>l.chains):multi;
      L.polyline(multi,{...o,color:'#ffffff',weight:M.iv&&M.iv<=2?3:3.6,opacity:.6}).addTo(nu);     // halo
      if(mnr.length)L.polyline(mnr,{...o,color:'#14314f',weight:M.iv&&M.iv<=2?.95:1.4,opacity:.82}).addTo(nu);
      if(maj.length)L.polyline(maj,{...o,color:'#0b2340',weight:1.9,opacity:.95}).addTo(nu);          // 1000, 1020, 1040… em destaque
    }
    /* etiquetas hPa: posição ligada à grelha do mundo (não ao ecrã) → não saltam ao arrastar */
    const cd=260*360/(256*Math.pow(2,tempZ())),best=new Map(),bd=radarMap.getBounds().pad(-.04);
    const lblEvery=M.iv&&M.iv<4?4:1;                                // com linhas de 1–2 hPa só se escreve a cada 4 hPa
    M.lines.forEach(l=>{if(l.lv%lblEvery)return;l.segs.forEach(s=>{
      const lat=(s[0]+s[2])/2,lng=(s[1]+s[3])/2,ci=Math.floor(lat/cd),cj=Math.floor(lng/cd),k=l.lv+'|'+ci+'|'+cj;
      const d=Math.hypot(lat-(ci+.5)*cd,lng-(cj+.5)*cd),b=best.get(k);
      if(!b||d<b.d)best.set(k,{d,lat,lng,lv:l.lv});
    })});
    const placed=[];
    [...best.values()].sort((a,b)=>a.d-b.d).forEach(c=>{
      const ll=L.latLng(c.lat,c.lng);if(!bd.contains(ll))return;
      const p=radarMap.latLngToContainerPoint(ll);
      if(placed.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<150))return;
      placed.push(p);
      L.marker(ll,{pane:'isolab',interactive:false,keyboard:false,icon:L.divIcon({className:'isolbl',html:`<span>${Math.round(c.lv)}</span>`,iconSize:[0,0]})}).addTo(nu);
    });
    /* A = alta pressão · B = baixa pressão */
    const vb=radarMap.getBounds();
    M.ext.forEach(e=>{
      for(let k=Math.floor((vb.getWest()-e.lng)/360);k<=Math.ceil((vb.getEast()-e.lng)/360);k++){       // o campo é global: aparece em todas as cópias do mundo visíveis
        const ll=L.latLng(e.lat,e.lng+360*k);if(!vb.contains(ll))continue;
        L.marker(ll,{pane:'isolab',interactive:false,keyboard:false,zIndexOffset:500,icon:L.divIcon({className:'isoax '+(e.hi?'hi':'lo'),html:`<b>${e.hi?'A':'B'}</b><small>${Math.round(e.p)}</small>`,iconSize:[0,0]})}).addTo(nu)}});
  }
  nu.addTo(radarMap);isoGrp=nu;                                    // o novo entra com fade; o antigo sai logo a seguir
  isoOld.add(old);
  setTimeout(()=>{isoOld.delete(old);try{radarMap&&radarMap.removeLayer(old)}catch(e){}},900);
}
let isoRetry=0;
async function isoLegacy(gen){                                       // reserva: blocos Open-Meteo (/grid) por zoom e ecrã
  const g=isoGridBox();
  for(let pass=0;pass<3;pass++){                                   // cada ronda só traz 16 blocos: até 3 rondas
    const need=isoMissing(g);
    if(!need.length||Date.now()<=Math.max(isoBlock,tempBlock))break;   // respeita também o bloqueio do radar de temperatura
    try{await isoFetch(g.z,need)}
    catch(err){
      console.warn('[Isobars]',err.message);
      isoBlock=Date.now()+(err.message==='429'?3e5:3e4);
      if(err.message==='429')tempBlock=Math.max(tempBlock,isoBlock);   // 429: ambos param de pedir
      break;
    }
  }
  if(gen!==isoGen||!radarMap||!isoOn)return;
  const M=isoBuild(g);
  if(M){isoRetry=0;isoDraw(M)}                                     // só substitui as linhas se houver dados; antes apagava tudo
  else if(isoRetry<3){isoRetry++;clearTimeout(isoT);isoT=setTimeout(isoUpdate,6000)}   // volta a tentar em 6 s
}
async function isoUpdate(){
  if(!radarMap||!isoOn)return;
  if(isoRun){isoAgain=true;return}
  isoRun=true;const gen=isoGen;
  try{
    const G=await pgLoad();                                        // campo global (1 pedido, em cache); null se o worker/NOAA falhar
    if(gen!==isoGen||!radarMap||!isoOn)return;
    let M=null;if(G){try{M=isoBuildGlobal()}catch(e){console.warn('[Isobars]',e.message)}}
    if(M){isoRetry=0;isoDraw(M);return}
    await isoLegacy(gen);
  }finally{isoRun=false;if(isoAgain){isoAgain=false;isoUpdate()}}
}
const isoMoved=()=>{clearTimeout(isoT);isoT=setTimeout(isoUpdate,900)};
function isoStart(){
  if(!radarMap)return;
  isoStop();
  mkPane('isobars',258);mkPane('isolab',270);
  isoGrp=L.layerGroup().addTo(radarMap);isoOn=true;
  radarMap.on('moveend',isoMoved);
  clearInterval(isoRef);isoRef=setInterval(isoUpdate,9e5);        // refresca de 15 em 15 min (o pgLoad só vai à rede quando passam 45 min)
  isoUpdate();
}
function isoStop(){
  isoGen++;isoOn=false;clearTimeout(isoT);clearInterval(isoRef);
  if(radarMap){
    try{radarMap.off('moveend',isoMoved)}catch(e){}
    if(isoGrp){try{radarMap.removeLayer(isoGrp)}catch(e){}}
    isoOld.forEach(g=>{try{radarMap.removeLayer(g)}catch(e){}});
  }
  isoOld.clear();isoGrp=null;
}
