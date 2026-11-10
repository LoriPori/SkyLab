/* Skylab · theme.js — colour theme (temperature → palette) · load order 03/28 (classic script, shared global scope) */
/* ============ colour theme: cool blue -> teal -> gold -> orange (never red) ============ */
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const toHex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>{const x=hex(a),y=hex(b);return toHex(x.map((v,i)=>v+(y[i]-v)*t))};
const STOPS=[[-8,'#4d8dff'],[6,'#33b0ea'],[14,'#36c5b4'],[21,'#c4952c'],[28,'#c97a34'],[36,'#bf5a3a']];
function tempBase(t){
 if(t<=STOPS[0][0])return STOPS[0][1];
 for(let i=1;i<STOPS.length;i++){
  if(t<=STOPS[i][0]){const[t0,c0]=STOPS[i-1],[t1,c1]=STOPS[i];return mix(c0,c1,(t-t0)/(t1-t0))}
 }
 return STOPS[STOPS.length-1][1];
}
const COND_MIX={clear:null,cloud:['#8a9bb0',.36],rain:['#6f84a3',.42],snow:['#86a6c4',.38],fog:['#93a0ad',.48],storm:['#5d6391',.52],night:['#3d4394',.52]};
/* A cor da barra de estado (topo) e da barra de navegação do Android acompanha o fundo da página em vez do azul fixo do index.html */
function themeMeta(a,b){const m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',mix(a,b,.4))}
function theme(tC,k){
 let base=tempBase(tC);const m=COND_MIX[k];if(m)base=mix(base,m[0],m[1]);
 if(IS_MOBILE){const ext=Math.max(0,Math.min(1,Math.max((tC-24)/10,(6-tC)/12)));base=mix(base,'#ffffff',.07+.17*ext)}   // telemóvel: mais claro, sobretudo no calor e no frio extremos
 const w=m?0:Math.max(0,Math.min(1,(tC-16)/8));            // 0 = fresco/nublado, 1 = dia quente de céu limpo
 const s=document.documentElement.style;
 s.setProperty('--a',base);
 const b2=mix(mix(base,'#ffffff',.42),mix(base,'#4a2410',IS_MOBILE?.14:.34),w);
 s.setProperty('--b',b2);   // quente: o fim do degradê escurece em vez de clarear
 s.setProperty('--acc',mix(base,'#0c2a52',.52));
 themeMeta(base,b2);
}
function landTheme(night,k){                       // página inicial: cor própria, não depende da temperatura
 if(night){theme(10,k);return}                     // noite: igual ao que já tinhas
 const base='#2b8fd6',s=document.documentElement.style;
 s.setProperty('--a',base);
 s.setProperty('--b',mix(base,'#0c2a52',.30));     // o fim do degradê escurece em vez de clarear
 s.setProperty('--acc',mix(base,'#0c2a52',.52));
 themeMeta(base,mix(base,'#0c2a52',.30));
}
function tempColor(c){const t=Math.max(-10,Math.min(38,c)),hue=208-((t+10)/48)*182;return`hsl(${hue.toFixed(0)},72%,58%)`}
