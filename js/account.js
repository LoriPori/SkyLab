/* Skylab · account.js — auth client, Turnstile, preference sync, notifications, quick tools · load order 22/28 (classic script, shared global scope) */
/* ═══════════ ACCOUNT — auth client, Turnstile, preference sync, notifications ═══════════ */
/* ============ Skylab Auth Client ============ */
const AUTH_CONFIG = {
  apiUrl: (typeof ATMO !== 'undefined' && ATMO.base) 
    ? ATMO.base.replace(/\/v1\/?$/, '/api/auth') 
    : 'https://aged-mountain-a883.lourencoalvesfonseca2011.workers.dev/api/auth',
  googleClientId: '175966063647-g97am2pbroisp0oiuqp8p5ek052ins8p.apps.googleusercontent.com',
  turnstileSiteKey: '0x4AAAAAAFXe8LEPrrxgCRnj'   // Site Key do Turnstile (pública). Enquanto não a colares, o Turnstile fica desligado.
};

/* ============ Terceiros do login: só carregam quando abres a janela de início de sessão ============ */
const _once = {};
function loadScriptOnce(src){
  if(_once[src]) return _once[src];
  return _once[src] = new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = res; s.onerror = ()=>{ delete _once[src]; rej(new Error('load '+src)); };
    document.head.appendChild(s);
  });
}
function authLoadThirdParty(){
  loadScriptOnce('https://accounts.google.com/gsi/client').catch(()=>{});                                   // Google Sign-In
  if(tsActive()) loadScriptOnce('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit').catch(()=>{});   // Turnstile
}

/* ============ Cloudflare Turnstile (anti-robôs) ============ */
let tsWidgetId = null;        // widget do formulário email/password
let tsGoogleId = null;        // widget invisível do botão Google

function tsActive(){ return !!AUTH_CONFIG.turnstileSiteKey && AUTH_CONFIG.turnstileSiteKey !== 'COLA_AQUI_A_SITE_KEY'; }
function tsEnsure(tries){
  tries = tries || 0;
  if(!tsActive()) return;

  // Widget do formulário (visível / managed)
  if(tsWidgetId === null){
    const box = document.getElementById('authTurnstile');
    if(box && window.turnstile){
      tsWidgetId = window.turnstile.render(box, {
        sitekey: AUTH_CONFIG.turnstileSiteKey,
        theme: 'auto',
        size: 'flexible'
      });
    }
  }

  // Widget do Google (invisível). Só é executado depois do clique no botão.
  if(tsGoogleId === null){
    const gbox = document.getElementById('authGoogleTurnstile');
    if(gbox && window.turnstile){
      tsGoogleId = window.turnstile.render(gbox, {
        sitekey: AUTH_CONFIG.turnstileSiteKey,
        theme: 'auto',
        size: 'flexible',
        appearance: 'execute',          // fica escondido até chamarmos turnstile.execute()
        execution: 'execute',           // só corre quando pedimos o token
        'refresh-expired': 'auto'
      });
    }
  }

  // Se algum dos dois ainda não tem o script carregado, tenta de novo.
  if((tsWidgetId === null || tsGoogleId === null) && tries < 25){
    setTimeout(() => tsEnsure(tries + 1), 600);
  }
}
function tsToken(){ try{ return tsWidgetId !== null ? (window.turnstile.getResponse(tsWidgetId) || '') : ''; }catch(e){ return ''; } }
// Devolve uma Promise<string> com o token do widget Google.
// Se o widget ainda não existir, resolve com '' (o chamador mostra erro).
function tsGoogleToken(){
  return new Promise(resolve => {
    if(!tsActive()) return resolve('');
    if(tsGoogleId === null) return resolve('');

    let done = false;
    const finish = t => { if(!done){ done = true; resolve(t || ''); } };

    try{
      window.turnstile.execute(tsGoogleId, {
        action: 'google_signin',
        callback: token => finish(token)
      });
    }catch(e){ finish(''); return; }

    // Rede de segurança: se o callback nunca disparar (raro), resolve vazio após 15 s.
    setTimeout(() => finish(''), 15000);
  });
}
function tsReset(){ try{ if(tsWidgetId !== null) window.turnstile.reset(tsWidgetId); }catch(e){} }   // cada token só serve uma vez
function tsResetGoogle(){ try{ if(tsGoogleId !== null) window.turnstile.reset(tsGoogleId); }catch(e){} }

/* Sessão revogada no servidor (ex.: lockdown ou sessão expirada): sai localmente, sem apagar favoritos/preferências */
function authSessionDead(){
  if(!currentToken) return;
  currentUser = null; currentToken = null;
  try{ localStorage.removeItem('skylab_auth_user'); localStorage.removeItem('skylab_auth_token'); }catch(e){}
  try{ updateAuthUI(); }catch(e){}
}
/* ==== sync de preferências (v2: um documento, "a escrita mais recente ganha") ==== */
let syncT = null;
async function prefsPush(){
  if(!currentToken) return;
  const payload = {};
  for(const k of SYNC_KEYS){ const v = lsGet(k); if(v!=null) payload[k]=v; }
  if(!Object.keys(payload).length) return;
  payload._ts = +localStorage.getItem('prefsTs') || Date.now();     // carimbo da última alteração local
  try{
    const pr = await fetch(`${AUTH_CONFIG.apiUrl.replace('/auth','')}/prefs`,{
      method:'PUT',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${currentToken}`},
      body:JSON.stringify(payload)
    });
    if(pr.status===401) authSessionDead();
  }catch(e){}
  if(typeof pushSyncLoc==='function')pushSyncLoc();
}
function prefsSchedulePush(){
  clearTimeout(syncT);
  syncT = setTimeout(prefsPush, 800);
}
async function prefsPull(){
  if(!currentToken) return null;
  try{
    const r = await fetch(`${AUTH_CONFIG.apiUrl.replace('/auth','')}/prefs`,{
      headers:{'Authorization':`Bearer ${currentToken}`}
    });
    if(r.status===401){ authSessionDead(); return null; }
    if(!r.ok) return null;
    const j = await r.json();
    return j.prefs || null;
  }catch(e){ return null; }
}
/* first=true → acabou de iniciar sessão neste dispositivo: junta listas locais + nuvem.
   first=false → arranque normal: o documento mais recente (local ou nuvem) ganha, por isso apagar um favorito num dispositivo também o apaga nos outros. */
function prefsMerge(server, first){
  if(!server) return false;
  const sTs = +server._ts || 0, lTs = +localStorage.getItem('prefsTs') || 0, LIM = {favs:20, recent:5, termHist:200};
  let changed = false, push = false;
  const put = (k,v) => { if(JSON.stringify(lsGet(k)) !== JSON.stringify(v)){ lsSet(k,v); changed = true; } };
  window.__prefsApplying = true;
  try{
    if(first){
      for(const k of SYNC_KEYS){
        if(k in LIM){
          const seen = new Set(), out = [];
          for(const f of [...(Array.isArray(server[k])?server[k]:[]), ...(lsGet(k)||[])]){
            const id = typeof f==='string' ? f : f.name+'|'+(f.sub||'');
            if(!seen.has(id)){ seen.add(id); out.push(f); }
          }
          put(k, out.slice(0, LIM[k]));
        }else if(k in server) put(k, server[k]);
      }
      localStorage.setItem('prefsTs', String(Date.now())); push = true;
    }else if(sTs > lTs || !lTs){
      for(const k of SYNC_KEYS) if(k in server) put(k, server[k]);
      localStorage.setItem('prefsTs', String(sTs || Date.now()));
    }else if(lTs > sTs) push = true;
  }finally{ window.__prefsApplying = false; }
  if(push) prefsSchedulePush();
  return changed;
}
/* aplica ao ecrã o que veio da nuvem (o antigo só gravava no localStorage: LANG e unit só mudavam no reload seguinte) */
function prefsApplied(){
  const l = lsGet('lang'), u = lsGet('unitPick');                    // ler ANTES: o setLang reescreve a unidade
  window.__prefsApplying = true;
  try{
    if((l==='pt'||l==='en') && l!==LANG) setLang(l);
    if(u==='c'||u==='f'){ lsSet('unitPick',u); if(u!==unit) setUnit(u,false,true); }
    if(termInst){
      const h = lsGet('termHist'); termInst.history = Array.isArray(h) ? h.slice(-SkyTerm.CFG.histMax) : []; termInst.hIdx = termInst.history.length;
      const th = lsGet('termTheme'); if(th) SkyTerm.setTheme(th);
    }
  }finally{ window.__prefsApplying = false; }
  if(typeof progUI==='function') progUI();
  if(typeof favUI==='function') favUI();
  if(typeof favOpen!=='undefined' && favOpen) favPaint(false);
  if(data) render();
}
async function prefsAfterLogin(){                                    // chamar depois de guardar currentToken (email, registo e Google)
  const sp = await prefsPull();
  if(sp){ if(prefsMerge(sp,true)) prefsApplied(); }
  else{ localStorage.setItem('prefsTs', String(Date.now())); prefsSchedulePush(); }   // conta nova: sobe o que já existe localmente
}

function imgFBAuth(el){
  const tries=['imgs/icons/person.png','person.png','imgs/logos/FullLogo_Transparent_NoBuffer-resized-128x128.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
    svg.innerHTML='<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>';
    svg.style.width='18px';svg.style.height='18px';el.replaceWith(svg);
  }
}

function imgFBEmail(el){
  const tries=['imgs/icons/email.png','email.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','#64748b');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
    svg.innerHTML='<rect width="20" height="16" x="2" y="4" rx="3"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>';
    svg.style.width='18px';svg.style.height='18px';el.replaceWith(svg);
  }
}

function imgFBLock(el){
  const tries=['imgs/icons/lock.png','lock.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','#64748b');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
    svg.innerHTML='<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
    svg.style.width='18px';svg.style.height='18px';el.replaceWith(svg);
  }
}

function imgFBGoogle(el){
  const tries=['imgs/icons/google.png','google.png'];
  const i=+(el.dataset.t||0);
  if(i<tries.length){el.dataset.t=i+1;el.src=tries[i]}
  else{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.innerHTML='<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>';
    svg.style.width='19px';svg.style.height='19px';el.replaceWith(svg);
  }
}

function renderEyeIcon(isOpen){
  const btn=$('#authTogglePass');if(!btn)return;
  const path=isOpen?'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>':'<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
  btn.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

let authMode = 'signup';
let currentUser = lsGet('skylab_auth_user');
let currentToken = lsGet('skylab_auth_token');
if(typeof currentToken==='string'&&currentToken.indexOf('dcy.')===0){currentToken=null;currentUser=null;try{localStorage.removeItem('skylab_auth_token');localStorage.removeItem('skylab_auth_user')}catch(e){}}   // token-isco (recebido quando o IP está banido): descartar, senão apresentá-lo volta a banir 7 dias
let authModalOpen = false;

function updateAuthUI(){
 const btn=$('#authBtn');const txt=$('#authTxt');const ico=$('#authIco');
 if(!btn||!txt)return;
 if(currentUser&&currentUser.username){
  btn.classList.remove('pulse-btn');btn.classList.add('is-in');
  if(ico)ico.style.display='none';
  const rawName=currentUser.username.trim();
  const av=$('#authAv');
  if(av){
   if(currentUser.avatar_url){av.textContent='';av.style.backgroundImage=`url("${String(currentUser.avatar_url).replace(/"/g,'%22')}")`}
   else{av.style.backgroundImage='';av.textContent=(rawName[0]||'?').toUpperCase()}
  }
  const displayName=rawName.length>15?rawName.slice(0,15):rawName;
  txt.innerHTML=`<span class="auth-u-id" title="${escH(rawName)}">${escH(displayName)}</span>`;
  btn.setAttribute('title',`Conta: ${rawName}`);
 }else{
  btn.classList.add('pulse-btn');btn.classList.remove('is-in');
  if(ico)ico.style.display='';
  const av0=$('#authAv');if(av0){av0.textContent='';av0.style.backgroundImage=''}
  // Destaque limpo de Sign Up / Criar Conta
  txt.textContent=LANG==='pt'?'Criar Conta':'Sign Up';
  btn.setAttribute('title',LANG==='pt'?'Criar Conta / Iniciar Sessão':'Sign Up / Sign In');
 }
}

/* ============ Notificações Periódicas de 10 em 10 min (Apenas Logged In) ============ */
let userWeatherTimer = null;

async function sendUserWeatherStatus() {
  if (!currentUser || !currentUser.username) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Se já temos dados carregados do local atual
  if (data && place) {
    const c = data.current;
    const tStr = `${T(c.temperature_2m)}°`;
    const condStr = tr(LABEL[c.weather_code] || 'Tempo atual');
    const wStr = W(c.wind_speed_10m);
    const title = `Skylab · ${place.name}: ${tStr}`;
    const body = `${condStr} · Vento: ${wStr} · Humidade: ${c.relative_humidity_2m}%`;

    skyNotify(title,{body,tag:'skylab-user-live-weather'});
  } else if (navigator.geolocation) {
    // Caso ainda não tenha dados, obtém a localização atual
    navigator.geolocation.getCurrentPosition(p => {
      show(+p.coords.latitude.toFixed(3), +p.coords.longitude.toFixed(3));
    });
  }
}

function startUserWeatherLoop() {} //Antiga, já não é usada, mas mantida para referência //



function stopUserWeatherLoop() {
  if (userWeatherTimer) {
    clearInterval(userWeatherTimer);
    userWeatherTimer = null;
  }
}

function authSetMode(mode){
  authMode=mode;
  const isUp=mode==='signup';
  $('#authTabSignup').classList.toggle('active',isUp);
  $('#authTabSignup').setAttribute('aria-selected',isUp);
  $('#authTabSignin').classList.toggle('active',!isUp);
  $('#authTabSignin').setAttribute('aria-selected',!isUp);

  $('#fieldUsername').hidden=!isUp;
  $('#authTitle').textContent=isUp 
    ?(LANG==='pt'?'Criar Conta Skylab':'Create Skylab Account')
    :(LANG==='pt'?'Iniciar Sessão':'Welcome Back');
  $('#authSubtitle').textContent=isUp
    ?(LANG==='pt'?'Cria a tua conta para guardar locais e preferências':'Create your account to sync settings & places')
    :(LANG==='pt'?'Entra com a tua conta para sincronizar dados':'Sign in to access your saved places');
  $('#authSubmitTxt').textContent=isUp
    ?(LANG==='pt'?'Criar Conta':'Sign Up')
    :(LANG==='pt'?'Iniciar Sessão':'Sign In');
  $('#authSwitchMsg').textContent=isUp
    ?(LANG==='pt'?'Já tens conta?':'Already have an account?')
    :(LANG==='pt'?'Ainda não tens conta?':"Don't have an account?");
  $('#authSwitchLink').textContent=isUp
    ?(LANG==='pt'?'Iniciar sessão':'Sign In')
    :(LANG==='pt'?'Regista-te':'Sign Up');
  if($('#authLegal'))$('#authLegal').innerHTML=LANG==='pt'?`Os teus dados são tratados como descrito na <button type="button" class="priv-link" data-priv>Privacidade</button>. Contacto: ${CONTACT_EMAIL}`:`Your data is handled as described in <button type="button" class="priv-link" data-priv>Privacy</button>. Contact: ${CONTACT_EMAIL}`;
  if($('#lblUsername'))$('#lblUsername').textContent=LANG==='pt'?'Nome de utilizador':'Username';
  if($('#profUserLbl'))$('#profUserLbl').textContent=LANG==='pt'?'Nome de utilizador':'Username';
  if($('#profEmailLbl'))$('#profEmailLbl').textContent=LANG==='pt'?'Email':'Email';

  authClearAlert();
}

function authShowAlert(msg,type='err'){
  const el=$('#authAlert');if(!el)return;
  el.className=`auth-alert ${type}`;
  el.textContent=msg;
  el.hidden=false;
}
function authClearAlert(){
  const el=$('#authAlert');if(el)el.hidden=true;
}

/* ============ Verificação de email: código de 6 dígitos ============ */
let authVerifyEmail='',authResendT=null,authCool=0;
function authResendPaint(){
  const b=$('#authResend');if(!b)return;const pt=LANG==='pt';
  b.disabled=authCool>0;
  b.textContent=authCool>0?(pt?`Reenviar código (${authCool}s)`:`Resend code (${authCool}s)`):(pt?'Reenviar código':'Resend code');
}
function authStartCooldown(s){
  clearInterval(authResendT);authCool=Math.max(0,Math.ceil(s||0));authResendPaint();
  if(authCool>0)authResendT=setInterval(()=>{authCool--;authResendPaint();if(authCool<=0)clearInterval(authResendT)},1000);
}
function authShowVerify(d){
  const pt=LANG==='pt';authVerifyEmail=d.email;
  $('#authLoggedOutView').dataset.step='verify';
  $('#authTitle').textContent=pt?'Confirma o teu email':'Confirm your email';
  $('#authSubtitle').textContent=pt?'Enviámos-te um código de 6 dígitos':'We sent you a 6-digit code';
  const m=$('#authVerifyMsg');m.textContent='';
  const b=document.createElement('b');b.textContent=d.email;
  m.append(pt?'Enviámos um código para ':'We sent a code to ',b,pt?'. Vê também o spam. O código expira em 10 minutos.':'. Check your spam folder too. It expires in 10 minutes.');
  $('#lblCode').textContent=pt?'Código de verificação':'Verification code';
  $('#authCodeTxt').textContent=pt?'Confirmar':'Confirm';
  $('#authVerifyBack').textContent=pt?'Mudar de email':'Change email';
  authClearAlert();authStartCooldown(d.resend_in||45);
  const c=$('#authCode');c.value='';setTimeout(()=>c.focus(),60);
}
function authVerifyReset(){
  clearInterval(authResendT);authVerifyEmail='';
  const v=$('#authLoggedOutView');if(v&&v.dataset.step)delete v.dataset.step;
}

function authShell(){
  let ov=$('#authOv');if(ov)return ov;
  ov=document.createElement('div');
  ov.className='hov auth-ov';ov.id='authOv';ov.hidden=true;
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','authTitle');
  ov.innerHTML=`<div class="hcard auth-card">
  <div class="hh">
   <div class="hht">
    <div class="auth-avatar-ico" id="authHeaderAvatar">
      <img id="authCardIco" src="imgs/icons/person.png" alt="" width="22" height="22" data-fb="Auth">
    </div>
    <div>
     <h2 id="authTitle">Skylab Account</h2>
     <p id="authSubtitle">Join Skylab to access your profile & settings</p>
    </div>
   </div>
   <button class="hx" id="authClose" aria-label="Close">✕</button>
  </div>

  <!-- Profile View (When Logged In) -->
  <div id="authLoggedInView" hidden class="auth-profile-view">
   <div class="auth-clean-card">
    <div class="auth-prof-user-row">
     <span class="auth-prof-label" id="profUserLbl">Nome de utilizador</span>
     <b id="profUsername" class="auth-prof-username"></b>
    </div>
    <div class="auth-prof-email-row">
     <span class="auth-prof-label" id="profEmailLbl">Email</span>
     <span class="auth-prof-email" id="profEmail"></span>
    </div>
   </div>
   <div class="auth-prog">
    <button type="button" class="auth-prog-btn" id="progBtn" aria-pressed="false" aria-describedby="progDesc">
     <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    </button>
    <label class="auth-prog-txt" for="progBtn">
     <b id="progLbl">Programmer mode</b>
     <span id="progDesc">Terminal, raw data and technical detail</span>
    </label>
    <span class="auth-prog-state" id="progState">OFF</span>
   </div>
   <div class="auth-prog" id="pushRow">
    <button type="button" class="auth-prog-btn" id="pushBtn" aria-pressed="false" aria-describedby="pushDesc">
     <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    </button>
    <label class="auth-prog-txt" for="pushBtn">
     <b id="pushLbl">Weather notifications</b>
     <span id="pushDesc">Now and what’s coming</span>
    </label>
    <span class="auth-prog-state" id="pushState">OFF</span>
   </div>
   <div class="auth-prog" id="skjRow">
    <button type="button" class="auth-prog-btn" id="skjBtn" data-sk="journal" aria-describedby="skjDesc">
     <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M8 8h8M8 12h5"/></svg>
    </button>
    <label class="auth-prog-txt" for="skjBtn">
     <b>Climate journal</b>
     <span id="skjDesc">The weather you lived through, month by month</span>
    </label>
    <span class="auth-prog-state">→</span>
   </div>
   <div class="auth-profile-actions">
    <button type="button" class="pill solid big auth-logout-btn" id="authLogoutBtn">Terminar Sessão</button>
    <button type="button" class="pill solid big auth-delete-btn" id="authDeleteBtn">Apagar Conta</button>
   </div>
  </div>

  <!-- Auth Form View (When Logged Out) -->
  <div id="authLoggedOutView">
   <div class="auth-tabs" role="tablist">
    <button type="button" id="authTabSignup" class="auth-tab active" role="tab" aria-selected="true">Criar Conta</button>
    <button type="button" id="authTabSignin" class="auth-tab" role="tab" aria-selected="false">Iniciar Sessão</button>
   </div>

   <!-- Google Sign-In Button -->
   <div class="auth-google-wrap">
    <button type="button" class="auth-google-btn" id="authGoogleBtn">
     <img src="imgs/icons/google.png" alt="" width="19" height="19" data-fb="Google">
     <span id="googleBtnTxt">Continuar com o Google</span>
    </button>
    <!-- Turnstile invisível para o botão Google. Só é executado depois do clique. -->
    <div id="authGoogleTurnstile" hidden></div>
   </div>

   <div class="auth-divider">
    <span id="authDividerTxt">ou com email</span>
   </div>

   <div class="auth-alert" id="authAlert" hidden></div>

   <!-- Passo 2: código enviado por email -->
   <div id="authVerifyView">
    <p class="auth-verify-msg" id="authVerifyMsg"></p>
    <form id="authCodeForm" class="auth-form" novalidate>
     <div class="auth-field">
      <label for="authCode" class="auth-label"><span id="lblCode">Código de verificação</span></label>
      <div class="auth-input-wrap">
       <input type="text" id="authCode" class="auth-input auth-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="000000" aria-describedby="authVerifyMsg">
      </div>
     </div>
     <button type="submit" class="pill solid big auth-submit-btn" id="authCodeBtn"><span id="authCodeTxt">Confirmar</span></button>
    </form>
    <div class="auth-verify-actions">
     <button type="button" class="auth-switch-link" id="authResend">Reenviar código</button>
     <button type="button" class="auth-switch-link" id="authVerifyBack">Mudar de email</button>
    </div>
   </div>

   <form id="authForm" class="auth-form" novalidate>
    <!-- Username (Sign Up only) -->
    <div class="auth-field" id="fieldUsername">
     <label for="authUsername" class="auth-label">
      <span id="lblUsername">Nome de utilizador</span>
     </label>
     <div class="auth-input-wrap">
      <input type="text" id="authUsername" class="auth-input" placeholder="ex: sky_explorer" maxlength="15" autocomplete="username">
      <span class="auth-char-count" id="authCharCount">0/15</span>
     </div>
    </div>

    <!-- Email -->
    <div class="auth-field" id="fieldEmail">
     <label for="authEmail" class="auth-label"><span id="lblEmail">Email</span></label>
     <div class="auth-input-wrap">
      <input type="email" id="authEmail" class="auth-input has-dyn-icon" placeholder="o.teu.email@exemplo.com" autocomplete="email" required>
      <span class="auth-dyn-ico" aria-hidden="true">
       <img src="imgs/icons/email.png" alt="" data-fb="Email">
      </span>
     </div>
    </div>

    <!-- Password -->
    <div class="auth-field" id="fieldPassword">
     <label for="authPassword" class="auth-label"><span id="lblPassword">Palavra-passe</span></label>
     <div class="auth-input-wrap">
      <input type="password" id="authPassword" class="auth-input has-dyn-icon" placeholder="••••••••" autocomplete="current-password" required>
      <span class="auth-dyn-ico" aria-hidden="true">
       <img src="imgs/icons/lock.png" alt="" data-fb="Lock">
      </span>
      <button type="button" class="auth-eye-btn" id="authTogglePass" title="Ver / ocultar senha" aria-label="Ver / ocultar senha"></button>
     </div>
    </div>

    <!-- Cloudflare Turnstile (anti-robôs) -->
    <div id="authTurnstile" style="margin:6px 0"></div>

    <!-- Submit Button -->
    <button type="submit" class="pill solid big auth-submit-btn" id="authSubmitBtn">
     <span id="authSubmitTxt">Criar Conta</span>
    </button>
   </form>
   <p class="auth-legal" id="authLegal"></p>

   <div class="auth-switch-prompt">
    <span id="authSwitchMsg">Já tens conta?</span>
    <button type="button" class="auth-switch-link" id="authSwitchLink">Iniciar sessão</button>
   </div>
  </div>
 </div>`;
  document.body.appendChild(ov);
  initAuthInputs();
  if(typeof progUI==='function') progUI();
  if(typeof pushUI==='function') pushUI();
  const pb=$('#progBtn');if(pb)pb.onclick=progToggle;
  const psb=$('#pushBtn');if(psb)psb.onclick=pushToggle;
  trTree(ov);
  return ov;
}

function authOpen(){
  const ov=authShell();
  authModalOpen=true;
  if(!(currentUser&&currentUser.username))authLoadThirdParty();
  tsEnsure();
  authClearAlert();

  if(currentUser&&currentUser.username){
    $('#authLoggedInView').hidden=false;
    $('#authLoggedInView').style.display='grid';
    $('#authLoggedOutView').hidden=true;
    $('#authLoggedOutView').style.display='none';
    if($('#authHeaderAvatar'))$('#authHeaderAvatar').style.display='none';

    const rawName=currentUser.username||'User';
    $('#profUsername').textContent=rawName.length>15?rawName.slice(0,15):rawName;
    $('#profEmail').textContent=currentUser.email||'';
    $('#authTitle').textContent=LANG==='pt'?'A tua Conta':'Your Account';
    $('#authSubtitle').textContent=LANG==='pt'?'Sessão iniciada no Skylab':'Signed in to Skylab';
    if($('#profUserLbl'))$('#profUserLbl').textContent=LANG==='pt'?'Nome de utilizador':'Username';
    if($('#profEmailLbl'))$('#profEmailLbl').textContent=LANG==='pt'?'Email':'Email';
    if($('#authLogoutBtn'))$('#authLogoutBtn').textContent=LANG==='pt'?'Terminar Sessão':'Log Out';
    if($('#authDeleteBtn'))$('#authDeleteBtn').textContent=LANG==='pt'?'Apagar Conta':'Delete Account';
  }else{
    $('#authLoggedInView').hidden=true;
    $('#authLoggedInView').style.display='none';
    $('#authLoggedOutView').hidden=false;
    $('#authLoggedOutView').style.display='block';
    if($('#authHeaderAvatar'))$('#authHeaderAvatar').style.display='grid';
    authSetMode(authMode);
  }

  ov.hidden=false;
  document.documentElement.classList.add('hlock');
  void ov.offsetWidth;
  ov.classList.add('on');
  $('#authBtn').setAttribute('aria-expanded','true');
}

function authClose(){
  authVerifyReset();
  const ov=$('#authOv');if(!ov||ov.hidden)return;
  authModalOpen=false;
  ov.classList.remove('on');
  document.documentElement.classList.remove('hlock');
  $('#authBtn').setAttribute('aria-expanded','false');
  setTimeout(()=>{if(!authModalOpen)ov.hidden=true},360);
}

function initAuthInputs(){
  const emailIn=$('#authEmail');
  const passIn=$('#authPassword');
  const userIn=$('#authUsername');

  const checkDyn=(inp)=>{
    if(!inp)return;
    inp.classList.toggle('has-val',(inp.value||'').length>0);
  };

  [emailIn,passIn].forEach(inp=>{
    if(!inp)return;
    inp.addEventListener('input',()=>checkDyn(inp));
    inp.addEventListener('change',()=>checkDyn(inp));
  });

  if(userIn){
    userIn.addEventListener('input',(e)=>{
      let val=e.target.value;
      if(val.length>15){val=val.slice(0,15);userIn.value=val}
      $('#authCharCount').textContent=`${val.length}/15`;
    });
  }

  let passVisible=false;
  renderEyeIcon(false);
  const togglePassBtn=$('#authTogglePass');
  if(togglePassBtn&&passIn){
    togglePassBtn.onclick=(e)=>{
      e.preventDefault();e.stopPropagation();
      passVisible=!passVisible;
      passIn.type=passVisible?'text':'password';
      renderEyeIcon(passVisible);
    };
  }

  $('#authBtn').onclick=()=>authModalOpen?authClose():authOpen();
  $('#authClose').onclick=authClose;
  $('#authTabSignup').onclick=()=>authSetMode('signup');
  $('#authTabSignin').onclick=()=>authSetMode('signin');
  $('#authSwitchLink').onclick=()=>authSetMode(authMode==='signup'?'signin':'signup');

  // Terminar Sessão
  $('#authLogoutBtn').onclick=async()=>{
    termClose();
    pushDisable(currentToken);                       // desliga as notificações push deste dispositivo
    if(termInst){termInst.history=[];termInst.hIdx=0}// o histórico de comandos não fica para o próximo utilizador
    stopUserWeatherLoop();
    const tok=currentToken;
    currentUser=null;
    currentToken=null;
    try{
      localStorage.removeItem('skylab_auth_user');
      localStorage.removeItem('skylab_auth_token');
      for(const k of SYNC_KEYS) localStorage.removeItem(k);
    }catch(e){}
    if(data){ place=null; data=null; landing(); }

    if(tok){
      fetch(`${AUTH_CONFIG.apiUrl}/logout`,{
        method:'POST',
        headers:{'Authorization':`Bearer ${tok}`}
      }).catch(()=>{});
    }

    updateAuthUI();
    startUserWeatherLoop();
    if(emailIn)emailIn.value='';
    if(passIn)passIn.value='';
    if(userIn)userIn.value='';
    if(emailIn)emailIn.classList.remove('has-val');
    if(passIn)passIn.classList.remove('has-val');

    $('#authLoggedInView').hidden=true;
    $('#authLoggedInView').style.display='none';
    $('#authLoggedOutView').hidden=false;
    $('#authLoggedOutView').style.display='block';
    authSetMode('signin');

    toast(LANG==='pt'?'Sessão terminada com sucesso':'Logged out successfully');
    authClose();
  };

  // Apagar Conta
  if($('#authDeleteBtn')){
    $('#authDeleteBtn').onclick=async()=>{
      const msg = LANG==='pt'
        ? 'Tem a certeza de que pretende apagar a sua conta permanentemente? Esta ação removerá os seus dados da base de dados e não pode ser desfeita.'
        : 'Are you sure you want to permanently delete your account? This action will remove your data from the database and cannot be undone.';
      
      if(!confirm(msg)) return;

      const tok = currentToken;
      const deleteBtn = $('#authDeleteBtn');
      deleteBtn.disabled = true;
      const oldTxt = deleteBtn.textContent;
      deleteBtn.textContent = LANG==='pt' ? 'A apagar…' : 'Deleting…';

      try {
        if(tok){
          const res = await fetch(`${AUTH_CONFIG.apiUrl}/delete-account`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tok}` 
            }
          });
          const data = await res.json().catch(()=>({}));
          if(!res.ok || data.error) {
            throw new Error(data.error || (LANG==='pt'?'Erro ao apagar a conta.':'Failed to delete account.'));
          }
        }

        currentUser = null;
        currentToken = null;
        try {
          localStorage.removeItem('skylab_auth_user');
          localStorage.removeItem('skylab_auth_token');
          for(const k of SYNC_KEYS) localStorage.removeItem(k);
        } catch(e) {}
        if(data){ place=null; data=null; landing(); }

        updateAuthUI();
        startUserWeatherLoop();
        if(emailIn) emailIn.value = '';
        if(passIn) passIn.value = '';
        if(userIn) userIn.value = '';
        if(emailIn) emailIn.classList.remove('has-val');
        if(passIn) passIn.classList.remove('has-val');

        $('#authLoggedInView').hidden = true;
        $('#authLoggedInView').style.display = 'none';
        $('#authLoggedOutView').hidden = false;
        $('#authLoggedOutView').style.display = 'block';
        authSetMode('signin');

        toast(LANG==='pt' ? 'Conta apagada com sucesso.' : 'Account deleted successfully.');
        authClose();
      } catch(err) {
        console.warn('[Delete Account Error]', err);
        alert(err.message || (LANG==='pt' ? 'Erro ao apagar a conta.' : 'Error deleting account.'));
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = oldTxt;
      }
    };
  }

  $('#authForm').onsubmit=async(e)=>{
    e.preventDefault();
    authClearAlert();

    const email=(emailIn.value||'').trim();
    const password=passIn.value||'';
    const username=userIn?(userIn.value||'').trim():'';

    if(authMode==='signup'){
      if(!username)return authShowAlert(LANG==='pt'?'Por favor introduz o nome de utilizador.':'Please choose a username.');
      if(username.length>15)return authShowAlert(LANG==='pt'?'O nome de utilizador não pode ter mais de 15 carateres.':'Username must be at most 15 characters.');
      if(!/^[a-zA-Z0-9_-]+$/.test(username))return authShowAlert(LANG==='pt'?'O nome de utilizador apenas pode conter letras, números, _ ou -.':'Username can only contain letters, numbers, _ and -.');
    }
    if(!email)return authShowAlert(LANG==='pt'?'Por favor introduz o teu email.':'Please enter your email.');
    const minPw = authMode==='signup' ? 8 : 6;
    if(!password||password.length<minPw)return authShowAlert(LANG==='pt'?`A palavra-passe deve ter pelo menos ${minPw} carateres.`:`Password must be at least ${minPw} characters.`);
    if(password.length>128)return authShowAlert(LANG==='pt'?'A palavra-passe não pode ter mais de 128 carateres.':'Password must be at most 128 characters.');
    const cf_turnstile = tsToken();
    if(tsActive() && !cf_turnstile)return authShowAlert(window.turnstile
      ?(LANG==='pt'?'A confirmar que és humano… tenta de novo dentro de segundos.':'Verifying you are human… try again in a moment.')
      :(LANG==='pt'?'Não foi possível carregar a verificação anti-robôs. Desativa bloqueadores de anúncios e recarrega a página.':'Could not load the anti-bot check. Disable ad blockers and reload the page.'));

    const submitBtn=$('#authSubmitBtn');
    submitBtn.disabled=true;
    const oldTxt=$('#authSubmitTxt').textContent;
    $('#authSubmitTxt').textContent=LANG==='pt'?'A processar…':'Processing…';

    try{
      const endpoint=authMode==='signup'?`${AUTH_CONFIG.apiUrl}/signup`:`${AUTH_CONFIG.apiUrl}/signin`;
      const payload=authMode==='signup' 
        ?{username,email,password,cf_turnstile,lang:LANG}
        :{identifier:email,password,cf_turnstile,lang:LANG};

      const res=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });

      const data=await res.json();
      if(res.ok&&data&&data.pending){authShowVerify(data);return}      // falta confirmar o email com o código
      if(!res.ok||!data.success){
        throw new Error(data.error||(LANG==='pt'?'Falha na autenticação.':'Authentication failed.'));
      }

      currentUser=data.user;
      currentToken=data.token;
      lsSet('skylab_auth_user',currentUser);
      lsSet('skylab_auth_token',currentToken);
      updateAuthUI();
      startUserWeatherLoop();
      await prefsAfterLogin();

      toast(authMode==='signup' 
        ?(LANG==='pt'?`Bem-vindo ao Skylab, ${currentUser.username}!`:`Welcome to Skylab, ${currentUser.username}!`)
        :(LANG==='pt'?`Sessão iniciada como ${currentUser.username}`:`Signed in as ${currentUser.username}`));

      authClose();
    }catch(err){
      console.warn('[Auth Error]',err);
      authShowAlert(err.message||(LANG==='pt'?'Erro de ligação ao servidor.':'Server connection error.'));
    }finally{
      submitBtn.disabled=false;
      $('#authSubmitTxt').textContent=oldTxt;
      tsReset();
    }
  };

  $('#authGoogleBtn').onclick=()=>authTriggerGoogle();

  $('#authCode').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
  $('#authCodeForm').onsubmit=async(e)=>{
    e.preventDefault();authClearAlert();
    const pt=LANG==='pt',code=$('#authCode').value.trim();
    if(!/^\d{6}$/.test(code))return authShowAlert(pt?'Introduz os 6 dígitos do código.':'Enter the 6-digit code.');
    const btn=$('#authCodeBtn');btn.disabled=true;
    try{
      const res=await fetch(`${AUTH_CONFIG.apiUrl}/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:authVerifyEmail,code})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.success)throw new Error(data.error||(pt?'Código incorreto ou expirado.':'Wrong or expired code.'));
      currentUser=data.user;currentToken=data.token;
      lsSet('skylab_auth_user',currentUser);lsSet('skylab_auth_token',currentToken);
      updateAuthUI();startUserWeatherLoop();await prefsAfterLogin();
      toast(data.welcome
        ?(pt?`Bem-vindo ao Skylab, ${currentUser.username}!`:`Welcome to Skylab, ${currentUser.username}!`)
        :(pt?`Sessão iniciada como ${currentUser.username}`:`Signed in as ${currentUser.username}`));
      authClose();
    }catch(err){
      authShowAlert(err.message||(pt?'Erro de ligação ao servidor.':'Server connection error.'));
    }finally{btn.disabled=false}
  };
  $('#authResend').onclick=async()=>{
    if(authCool>0)return;authClearAlert();const pt=LANG==='pt';
    try{
      const res=await fetch(`${AUTH_CONFIG.apiUrl}/resend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:authVerifyEmail,lang:LANG})});
      const data=await res.json().catch(()=>({}));
      if(res.status===429&&data.retry_after)authStartCooldown(data.retry_after);
      if(!res.ok)throw new Error(data.error||(pt?'Não foi possível reenviar o código.':'Could not resend the code.'));
      if(data.sent===false){authVerifyReset();authSetMode(authMode);authShowAlert(pt?'O pedido expirou. Volta a preencher o formulário.':'The request expired. Please fill in the form again.');return}
      authStartCooldown(data.resend_in||45);authShowAlert(pt?'Enviámos-te um novo código.':'We sent you a new code.','ok');
    }catch(err){authShowAlert(err.message)}
  };
  $('#authVerifyBack').onclick=()=>{authVerifyReset();authSetMode(authMode)};

  $('#authOv').addEventListener('click',(e)=>{
    if(e.target===$('#authOv'))authClose();
  });
}

// Fluxo de Autenticação com Google (Google Identity Services)
async function authTriggerGoogle(){
  authClearAlert();
  const rawInput = $('#authUsername') ? $('#authUsername').value.trim() : '';
  const chosenUsername = (rawInput && rawInput.length <= 15 && /^[a-zA-Z0-9_-]+$/.test(rawInput)) ? rawInput : '';

  if(!(window.google && window.google.accounts && window.google.accounts.oauth2 && AUTH_CONFIG.googleClientId)){
    if(AUTH_CONFIG.googleClientId){
      authLoadThirdParty();
      authShowAlert(LANG==='pt'?'A carregar o início de sessão Google… carrega no botão outra vez dentro de um instante.':'Loading Google sign-in… press the button again in a moment.','ok');
    }else{
      authShowAlert(LANG==='pt'
        ?'Para ativar o início de sessão Google, configure o Google Client ID no AUTH_CONFIG (ou utilize o registo com email/palavra-passe).'
        :'To enable Google Sign-In, add your Google Client ID to AUTH_CONFIG (or use email/password sign-in).');
    }
    return;
  }

  // 1) Pede o token Turnstile ANTES de tocar no Google.
  const btn = $('#authGoogleBtn');
  if(btn) btn.disabled = true;
  authShowAlert(LANG==='pt'?'A confirmar que és humano…':'Verifying you are human…','ok');

  let cfToken = '';
  try{
    cfToken = await tsGoogleToken();
  }finally{
    if(btn) btn.disabled = false;
  }

  if(tsActive() && !cfToken){
    authShowAlert(LANG==='pt'
      ? 'Não foi possível concluir a verificação anti-robôs. Desativa bloqueadores de anúncios e recarrega a página.'
      : 'Could not complete the anti-bot check. Disable ad blockers and reload the page.');
    tsResetGoogle();
    return;
  }

  // 2) Só agora abrimos o popup do Google.
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: AUTH_CONFIG.googleClientId,
    scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    callback: async (tokenResponse) => {
      if(!tokenResponse || !tokenResponse.access_token){
        tsResetGoogle();
        return;
      }
      try{
        authShowAlert(LANG==='pt'?'A autenticar com a Google…':'Signing in with Google…','ok');
        const gUserInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        }).then(r => r.json());

        const defaultName = (gUserInfo.name || gUserInfo.email || 'user').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,15) || 'google_user';
        const finalUsername = chosenUsername || defaultName;

        const res = await fetch(`${AUTH_CONFIG.apiUrl}/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credential: tokenResponse.access_token,
            email: gUserInfo.email,
            google_id: gUserInfo.sub,
            username: finalUsername,
            picture: gUserInfo.picture,
            cf_turnstile: cfToken              // ← enviado para o worker verificar
          })
        });
        const data = await res.json();
        if(!res.ok || !data.success) throw new Error(data.error || 'Erro Google Sign-In');

        currentUser = data.user;
        currentToken = data.token;
        lsSet('skylab_auth_user', currentUser);
        lsSet('skylab_auth_token', currentToken);
        updateAuthUI();
        startUserWeatherLoop();
        await prefsAfterLogin();
        toast(LANG==='pt'?`Autenticado como ${currentUser.username}!`:`Signed in as ${currentUser.username}!`);
        authClose();
      }catch(e){
        authShowAlert(e.message || 'Erro ao autenticar com a Google.');
      }finally{
        tsResetGoogle();                        // token é de uso único
      }
    }
  });
  client.requestAccessToken({ prompt: 'select_account' });
}

addEventListener('keydown',e=>{
 if(authModalOpen){
  if(e.key=='Escape'){e.preventDefault();e.stopPropagation();authClose();return}
  if(e.key=='Tab'){
   const f=$$('#authOv button,#authOv input,#authOv a[href]').filter(x=>!x.disabled&&x.getClientRects().length);
   if(!f.length)return;
   const a=f[0],z=f[f.length-1];
   if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
   else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
   return;
  }
  if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.key.length==1)e.stopPropagation();
 }
},true);

const authBtnEl = $('#authBtn');
if(authBtnEl) authBtnEl.onclick = () => authModalOpen ? authClose() : authOpen();
updateAuthUI();
if (currentUser) startUserWeatherLoop();
/* ============ Quick Tools Popover Toggle ============ */
const toolsBtn = $('#toolsBtn');
const toolsPop = $('#toolsPop');
if(toolsBtn && toolsPop){
 toolsBtn.onclick = (e) => {
  e.stopPropagation();
  const on = toolsPop.classList.toggle('on');
  toolsBtn.setAttribute('aria-expanded', String(on));
 };
 document.addEventListener('click', (e) => {
  if(!toolsPop.contains(e.target) && e.target !== toolsBtn){
   toolsPop.classList.remove('on');
   toolsBtn.setAttribute('aria-expanded', 'false');
  }
 });
}
