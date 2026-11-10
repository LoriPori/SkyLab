/* Skylab · search.js — fuzzy city search (results page) · load order 15/28 (classic script, shared global scope) */
/* ============ fuzzy city search (fallback results page) ============ */
{const q=$('#q'),c=$('#qClear');
 if(q&&c){const sync=()=>{c.hidden=!q.value};
  q.addEventListener('input',sync);q.addEventListener('change',sync);
  c.addEventListener('click',()=>{q.value='';sync();q.dispatchEvent(new Event('input',{bubbles:true}));q.focus()});sync()}}

function levenshtein(a,b){
  a=a.toLowerCase();b=b.toLowerCase();
  const m=a.length,n=b.length;
  if(!m)return n; if(!n)return m;
  const d=Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=0;i<=m;i++)d[i][0]=i;
  for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  }
  return d[m][n];
}
function strSim(a,b){
  a=String(a||'').trim().toLowerCase();b=String(b||'').trim().toLowerCase();
  if(!a||!b)return 0;
  if(a===b)return 1;
  if(b.startsWith(a)||a.startsWith(b))return .92;
  if(b.includes(a))return .8;
  const dist=levenshtein(a,b),maxLen=Math.max(a.length,b.length);
  return Math.max(0,1-dist/maxLen);
}
const SEARCH_POOL=[
  ...CITIES.map(c=>({name:c[0],sub:c[1],lat:c[2],lon:c[3]})),
  ...EXTREMES.map(e=>({name:e[0],sub:e[1],lat:e[2],lon:e[3]}))
];
function citySimilarityList(query,extra=[],n=10){
  const pool=[...extra.map(c=>({name:c.name,sub:c.sub||'',lat:c.lat,lon:c.lon})),...SEARCH_POOL];
  const seen=new Set(),out=[];
  for(const c of pool){
    const id=c.name.toLowerCase()+'|'+(c.sub||'').toLowerCase();
    if(seen.has(id))continue; seen.add(id);
    out.push({...c,score:strSim(query,c.name)});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,n);
}
async function handleSearchEnter(){
  const v=q.value.trim();
  if(!v)return;
  let candidates = items && items.length ? items : [];
  if(!candidates.length){
    try{ candidates = await geo(v,5) || []; }catch(e){ candidates = []; }
  }
  const best=candidates[0];
  if(best && strSim(v,best.name) >= .45){
    items=candidates; closeSg(); pick(0); return;
  }
  showSearchResultsPage(v, candidates);
}
async function showSearchResultsPage(query, apiCandidates=[]){
  closeSg(); q.blur();
  clearInterval(tickT);
  if(typeof radarStop==='function')try{radarStop()}catch(e){}
  const list = citySimilarityList(query, apiCandidates);
  main.className='enter';
  main.innerHTML = `<section class="pane src-results">
    <button class="pill" id="srcBack" style="margin-bottom:18px">${tr('Back')}</button>
    <h2 class="story" style="margin-bottom:4px">${tr('No exact match for')} “${escH(query)}”</h2>
    <p class="note" style="margin-bottom:18px">${tr('Here are the closest cities we could find.')}</p>
    <div class="src-list" id="srcList">
      ${list.map((c,i)=>`
        <button class="src-row" data-i="${i}" style="--n:${i}">
          <span class="src-main"><b>${escH(c.name)}</b><small>${escH(c.sub||'')}</small></span>
          <span class="src-wx" id="srcWx${i}"><span class="sk" style="display:inline-block;width:46px;height:14px;border-radius:7px;background:rgba(20,49,79,.1)"></span></span>
        </button>`).join('')}
    </div>
  </section>`;
  $('#srcBack').onclick=()=>{ place?render():landing(); };
  $('#srcList').addEventListener('click',e=>{
    const b=e.target.closest('.src-row'); if(!b)return;
    const c=list[+b.dataset.i]; if(!c)return;
    lsSet('recent',[c,...(lsGet('recent')||[]).filter(x=>!(x.name==c.name&&x.sub==c.sub))].slice(0,5));
    show(c.lat,c.lon,c.name,c.sub);
  });
  list.forEach(async(c,i)=>{
    try{
      const w = await getWeather(c.lat,c.lon);
      const cur = w.current;
      const el = document.getElementById('srcWx'+i);
      if(el) el.innerHTML = `${emoji(cur.weather_code, cur.is_day)}<b>${T(cur.temperature_2m)}°</b>`;
    }catch(e){}
  });
}
