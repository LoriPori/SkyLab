/* Skylab · sky-explained.js — Céu Explicado: pattern detection, Iberia, isobars, hand-drawn diagrams · load order 08/28 (classic script, shared global scope) */
/* ============ Céu Explicado: deteção de padrões ============ */
const dec1=v=>(LANG==='pt'?v.toFixed(1).replace('.',','):v.toFixed(1));
const T2=(en,pt)=>LANG==='pt'?pt:en;
const Traw=c=>unit=='c'?c:c*9/5+32; // igual a T(), mas sem arredondar (mantém casas decimais)
const decT=v=>{const n=Traw(v);return LANG==='pt'?n.toFixed(1).replace('.',','):n.toFixed(1)}; // valor ABSOLUTO de temperatura, 1 casa decimal, sensível à unidade
const decDT=v=>{const n=unit=='c'?v:v*9/5;return LANG==='pt'?n.toFixed(1).replace('.',','):n.toFixed(1)}; // DIFERENÇA de temperatura (sem +32!), sensível à unidade

function skySignals(){
  const c=data.current,h=data.hourly,i0=idx0();
  const p3=Math.max(0,i0-3);
  const dP=c.surface_pressure-h.surface_pressure[p3];
  const dDew=(h.dew_point_2m&&isFinite(h.dew_point_2m[p3]))?c.dew_point_2m-h.dew_point_2m[p3]:0;
  const dT=c.temperature_2m-h.temperature_2m[p3];
  return {syn:synGet(),pmsl:c.pressure_msl,dP,dDew,dT,dewNow:c.dew_point_2m,rhNow:c.relative_humidity_2m,wind:c.wind_speed_10m,dir:c.wind_direction_10m,temp:c.temperature_2m,code:c.weather_code,isDay:c.is_day,p:p3,i0};
}

/* ============ Céu Explicado: Península Ibérica ============ */
function isIberia(lat,lon){
 if(place && place.countryCode) return place.countryCode==='PT'||place.countryCode==='ES';
 return lat>=35.8&&lat<=43.9&&lon>=-9.6&&lon<=3.5; // fallback sem countryCode
}
function isAtlanticPT(lat,lon){return isIberia(lat,lon)&&lon<=-7.4}
function isStraitZone(lat,lon){return isIberia(lat,lon)&&lat<=37.6&&lon>=-7&&lon<=-4.5}
function isMedSpain(lat,lon){return isIberia(lat,lon)&&lon>=-1.2}
const monthNow=()=>new Date().getMonth()+1;

function patternDetectIberia(s){
 if(!place||!isIberia(place.lat,place.lon))return null;
 const m=monthNow();
 const fromN=(s.dir>=315||s.dir<=45),fromE=(s.dir>=55&&s.dir<=125);
 if(isAtlanticPT(place.lat,place.lon)&&fromN&&s.wind>=25&&m>=4&&m<=9&&s.code<=3)return'ib-nortada';
 if(isStraitZone(place.lat,place.lon)&&fromE&&s.wind>=30)return'ib-levante';
 if(isIberia(place.lat,place.lon)&&fromE&&s.temp>=26&&s.rhNow<35&&m>=5&&m<=9)return'ib-suao';
 if(isIberia(place.lat,place.lon)&&s.dir>=100&&s.dir<=220&&s.temp>=20&&s.rhNow<=30&&(s.code==2||s.code==3))return'ib-calima';
 if(isMedSpain(place.lat,place.lon)&&m>=9&&m<=11&&s.dP<=-1.2&&(s.code>=61&&s.code<=82))return'ib-gotafria';
 return null;
}

function patternDetectGlobalExtra(s){
 const lat = place ? place.lat : 0;
 const tropical = Math.abs(lat) <= 35;
 const dP = Number(s.dP)||0, wind = Number(s.wind)||0, temp = Number(s.temp)||0, rh = Number(s.rhNow)||0;

 if(dP<=-6 && wind>=55 && s.code>=51 && s.code<=86) return 'bomb-cyclone';
 if(wind>=70 && s.code>=95 && dP<=-3) return 'derecho';
 if(s.code>=71 && s.code<=86 && wind>=40 && temp<=-2) return 'blizzard';
 if((s.code===95||s.code===96||s.code===99) && temp<=1) return 'thundersnow';
 if(temp>=35 && rh<=40 && wind<20 && s.code<=3) return 'heatwave';
 if(tropical && s.code>=61 && s.code<=82 && rh>=80 && temp>=24 && wind>=15) return 'monsoon';
 if(!tropical && s.code>=51 && s.code<=67 && wind>=35 && rh>=85 && temp>=4 && temp<=16) return 'atm-river';
 if(rh<=20 && wind>=35 && temp>=25 && tropical) return 'dust-storm';
 if(rh<=30 && wind>=20 && wind<=50 && s.code<=2 && dP>=-1 && dP<=1) return 'foehn';
 return null;
}

function patternDetect(){
 const s=skySignals();
 const ibId=patternDetectIberia(s);
 if(ibId)return{id:ibId,cat:'Iberia',s};
 const globalId=patternDetectGlobalExtra(s);
 if(globalId)return{id:globalId,cat:'Global extremes',s};
 const code=s.code;
 // ...resto da função original mantém-se inalterado...
  // ...o resto da função mantém-se exatamente igual...
  const isRain=(code>=51&&code<=67)||(code>=80&&code<=82);
  const isStorm=code>=95;
  const isClear=code<=2;
  const isFog=code===45||code===48;
  const fromN=(s.dir>=315||s.dir<=45);
  const fromS=(s.dir>=135&&s.dir<=225);
  const wkAvg=data.daily.temperature_2m_max.reduce((a,b)=>a+b,0)/data.daily.temperature_2m_max.length;
  const anomaly=s.temp-wkAvg;

  if(isStorm&&s.temp>20&&s.isDay)   return{id:'storm-conv',cat:'Meteorology',s};
  if(isFog&&s.wind<8&&!s.isDay)     return{id:'fog-rad',cat:'Atmosphere',s};
  if(s.dP<=-1.5&&s.dDew>0.8&&isRain)return{id:'front-cold',cat:'Meteorology',s};
  if(s.dP<=-0.5&&s.dewNow>=14&&isRain)return{id:'front-warm',cat:'Meteorology',s};
  if(s.dP>=0.5&&s.dDew<-0.5&&isClear)return{id:'post-front',cat:'Meteorology',s};
  if(s.pmsl>=1020&&isClear&&s.dP>=0)return{id:'high',cat:'Atmosphere',s};
  if(s.dewNow>=18&&s.temp>=22&&isClear)return{id:'tropical',cat:'Climate',s};
  if(anomaly<-3&&s.dewNow<5&&fromN)  return{id:'polar',cat:'Climate',s};
  if(isRain&&Math.abs(s.dP)<0.8)     return{id:'showers',cat:'Meteorology',s};
  const syn=synPick(s);                       // A/B do mapa de isóbaras perto do local
  if(syn)return{id:syn,cat:'Atmosphere',s};
  return{id:'transition',cat:'Atmosphere',s};
}

const PATTERNS={
 'front-cold':s=>({
  title:T2('A cold front is passing overhead','Uma frente fria está a passar'),
  body:T2(
   `In the last three hours <i>pressure has dropped ${pdS(s.dP)}</i> and the <i>dew point has climbed ${decDT(s.dDew)}°</i>. Rain is falling. Warm, humid air ahead of the front is being forced up over the colder air arriving behind it. As it rises it cools, the vapour condenses, and the drops fall. This is the most active phase of a frontal passage — expect the rain to ease within a few hours, then pressure to rise and the sky to clear.`,
   `Nas últimas três horas a <i>pressão caiu ${pdS(s.dP)}</i> e o <i>ponto de orvalho subiu ${decDT(s.dDew)}°</i>. Está a chover. O ar quente e húmido à frente da frente está a ser forçado a subir sobre o ar mais frio que chega por trás. Ao subir, arrefece, o vapor condensa-se e as gotas caem. Esta é a fase mais ativa de uma passagem frontal — é de esperar que a chuva abrande dentro de poucas horas, a pressão comece a subir e o céu a limpar.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Dew +${decDT(s.dDew)}° in 3h`,`Orvalho +${decDT(s.dDew)}° em 3h`),
   T2(`Code ${s.code} — rain`,`Código ${s.code} — chuva`)
  ]
 }),
 'front-warm':s=>({
  title:T2('A warm front is moving through','Uma frente quente está a passar'),
  body:T2(
   `Pressure is falling gently (${pdS(s.dP)} over 3h), the dew point is high at ${decT(s.dewNow)}°, and rain is falling. Warm air is sliding up over cooler air ahead of the front — but the slope is shallow, so the rain is steady rather than heavy and can last for hours. Behind the front the air will be noticeably warmer and more humid.`,
   `A pressão está a descer suavemente (${pdS(s.dP)} em 3 h), o ponto de orvalho está alto, em ${decT(s.dewNow)}°, e está a chover. O ar quente desliza sobre o ar mais frio à frente da frente — mas o declive é suave, por isso a chuva é contínua em vez de forte e pode durar horas. Depois da frente, o ar estará claramente mais quente e húmido.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 }),
 'post-front':s=>({
  title:T2('The front has passed — clearing','A frente passou — céu a limpar'),
  body:T2(
   `Pressure is rising, the <i>dew point is dropping (${decDT(s.dDew)}° in 3h)</i>, and the sky is clearing. A cooler, drier air mass has moved in behind the front. This is the clearest weather of the whole frontal cycle: crisp, stable, often with excellent visibility. It is also the moment when the temperature can drop fastest.`,
   `A pressão está a subir, o <i>ponto de orvalho está a descer (${decDT(s.dDew)}° em 3 h)</i> e o céu está a limpar. Entrou uma massa de ar mais fria e seca por trás da frente. Este é o tempo mais limpo de todo o ciclo frontal: nítido, estável, muitas vezes com visibilidade excelente. É também o momento em que a temperatura pode descer mais depressa.`
  ),
  signals:[
   T2(`ΔP +${pdS(s.dP)}/3h`,`ΔP +${pdS(s.dP)}/3h`),
   T2(`Dew ${decDT(s.dDew)}° in 3h`,`Orvalho ${decDT(s.dDew)}° em 3h`),
   T2(`Code ${s.code} — clear`,`Código ${s.code} — limpo`)
  ]
 }),
 'high':s=>({
  title:T2('An anticyclone sits over the region','Um anticiclone está sobre a região'),
  body:T2(
   `Pressure is ${pf(pMSL())}, the sky is clear and there is little wind. In a high-pressure system, <i>air descends from aloft</i>, warming and drying as it sinks. That sinking is what clears the sky — clouds cannot survive the descent. It also explains why nights are colder than expected under a high: with no clouds to trap heat, the ground radiates it straight to space.`,
   `A pressão está a ${pf(pMSL())}, o céu está limpo e há pouco vento. Num anticiclone, o <i>ar desce de níveis altos</i>, aquecendo e secando à medida que afunda. Essa descida é o que limpa o céu — as nuvens não sobrevivem ao movimento descendente. Também explica porque é que as noites são mais frias do que se esperaria sob um anticiclone: sem nuvens para reter calor, o solo irradia-o direto para o espaço.`
  ),
  signals:[
   T2(`Pressure ${pf(pMSL())}`,`Pressão ${pf(pMSL())}`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`),
   T2(`Code ${s.code} — clear`,`Código ${s.code} — limpo`)
  ]
 }),
 'tropical':s=>({
  title:T2('A warm, humid air mass','Uma massa de ar quente e húmida'),
  body:T2(
   `The temperature is ${decT(s.temp)}° and the dew point is ${decT(s.dewNow)}° — the air is loaded with water vapour. It feels heavy because it is: at this humidity, sweat evaporates more slowly, so your body cannot shed heat as efficiently. This air mass typically arrives from the south or southwest, often ahead of an approaching front.`,
   `A temperatura está a ${decT(s.temp)}° e o ponto de orvalho a ${decT(s.dewNow)}° — o ar está carregado de vapor de água. Sente-se pesado porque é: com esta humidade, o suor evapora mais devagar e o corpo não consegue libertar calor com a mesma eficiência. Esta massa de ar chega tipicamente de sul ou sudoeste, muitas vezes à frente de uma frente que se aproxima.`
  ),
  signals:[
   T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Humidity ${s.rhNow}%`,`Humidade ${s.rhNow}%`)
  ]
 }),
 'polar':s=>({
  title:T2('Cold, dry polar air','Ar polar, frio e seco'),
  body:T2(
   `The dew point is below ${decT(s.dewNow)}°, which means almost no water vapour in the air. A wind blowing from ${LANG==='pt'?'norte':'north'} is the signature of a polar outbreak. Expect very clear skies — dry air has no moisture to form clouds — sharp shadows, and a wind that bites. Nights under this air mass are the coldest of the winter.`,
   `O ponto de orvalho está abaixo de ${decT(s.dewNow)}°, o que significa quase nenhum vapor de água no ar. O vento a soprar de norte é a assinatura de uma entrada de ar polar. Espera céu muito limpo — o ar seco não tem humidade para formar nuvens —, sombras nítidas e um vento que corta. As noites sob esta massa de ar são as mais frias do inverno.`
  ),
  signals:[
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Wind from N · ${W(s.wind)}`,`Vento de N · ${W(s.wind)}`),
   T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`)
  ]
 }),
 'storm-conv':s=>({
  title:T2('A convective thunderstorm','Uma trovoada de convecção'),
  body:T2(
   `On a day this warm (${decT(s.temp)}°), the ground heats up, the air above it rises, cools, and the water vapour condenses into towering cumulonimbus clouds. The energy released inside the cloud drives the lightning, hail, and bursts of heavy rain typical of this kind of storm. It is usually short-lived — most convective cells pass within an hour or two — but the downburst of cold air underneath can be surprisingly strong.`,
   `Num dia tão quente (${decT(s.temp)}°), o solo aquece, o ar por cima sobe, arrefece, e o vapor de água condensa-se em nuvens cumulonimbus altas. A energia libertada dentro da nuvem alimenta os relâmpagos, o granizo e os aguaceiros fortes típicos deste tipo de tempestade. Costuma ser curta — a maioria das células convectivas passa em uma ou duas horas — mas a corrente descendente de ar frio por baixo pode ser surpreendentemente forte.`
  ),
  signals:[
   T2(`Code ${s.code} — thunder`,`Código ${s.code} — trovoada`),
   T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 }),
 'fog-rad':s=>({
  title:T2('Radiation fog','Nevoeiro de radiação'),
  body:T2(
   `Overnight the ground lost its heat to space by radiation, cooling the air directly above it to the dew point. With almost no wind (${W(s.wind)}), the air cannot mix with drier air above, so the fog sits and thickens. It will lift in the morning when the Sun warms the ground — but until then, visibility can drop below a few hundred metres.`,
   `Durante a noite o solo perdeu calor para o espaço por radiação, arrefecendo o ar logo acima até ao ponto de orvalho. Com quase nenhum vento (${W(s.wind)}), o ar não se mistura com o ar mais seco de cima, por isso o nevoeiro instala-se e adensa-se. Levanta pela manhã, quando o Sol aquecer o solo — mas até lá a visibilidade pode descer abaixo dos duzentos metros.`
  ),
  signals:[
   T2(`Code ${s.code} — fog`,`Código ${s.code} — nevoeiro`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`),
   T2(`Humidity ${s.rhNow}%`,`Humidade ${s.rhNow}%`)
  ]
 }),
 'showers':s=>({
  title:T2('Scattered showers, not a front','Aguaceiros dispersos, não uma frente'),
  body:T2(
   `Pressure is stable, so there is no large-scale system driving these showers — they are individual convective cells forming where the air is locally unstable. They pass quickly, and between them there are often long gaps of sunshine. This is the kind of weather where one side of a hill can be in rain and the other in full sun.`,
   `A pressão está estável, por isso não há nenhum sistema de grande escala a empurrar estes aguaceiros — são células convectivas individuais que se formam onde o ar está localmente instável. Passam depressa e entre eles há muitas vezes longos períodos de sol. É o tipo de tempo em que um lado de uma colina pode estar à chuva e o outro ao sol.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Code ${s.code} — showers`,`Código ${s.code} — aguaceiros`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 }),
 'transition':s=>({
  title:T2('No single pattern dominates','Nenhum padrão domina neste momento'),
  body:T2(
   `Pressure is steady, the dew point is close to normal, and the wind is light. The atmosphere is in transition — none of the classic signatures (a passing front, a settled high, a tropical or polar air mass) is present strongly enough to explain the weather on its own. This is the most common state of all: not dramatic, not chaotic, just the atmosphere quietly doing its thing.`,
   `A pressão está estável, o ponto de orvalho perto do normal e o vento fraco. A atmosfera está em transição — nenhuma das assinaturas clássicas (uma frente a passar, um anticiclone instalado, uma massa de ar tropical ou polar) está presente com força suficiente para explicar o tempo por si só. Este é o estado mais comum de todos: nem dramático, nem caótico, apenas a atmosfera a fazer o que faz.`
  ),
  signals:[
   T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`),
   T2(`Dew ${decT(s.dewNow)}°`,`Orvalho ${decT(s.dewNow)}°`),
   T2(`Wind ${W(s.wind)}`,`Vento ${W(s.wind)}`)
  ]
 })
};

Object.assign(PATTERNS,{
 'bomb-cyclone':(s)=>({
  title:T2('Bomb cyclone','Ciclone-bomba'),
  body:T2('Pressure is falling very fast — a sign of explosive cyclogenesis. Expect rapid intensification of wind and rain over the next hours.',
          'A pressão está a cair muito depressa — sinal de ciclogénese explosiva. Espera-se intensificação rápida de vento e chuva nas próximas horas.'),
  signals:[T2(`Pressure drop ${s.dP!=null?pdS(s.dP):'–'}`,`Queda de pressão ${s.dP!=null?pdS(s.dP):'–'}`),
           T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2('Rapid intensification','Intensificação rápida')]
 }),
 'derecho':(s)=>({
  title:T2('Derecho / severe wind line','Derecho / linha de vento severo'),
  body:T2('A fast-moving band of thunderstorms is producing widespread damaging straight-line winds.',
          'Uma linha de trovoadas em movimento rápido está a produzir ventos retilíneos generalizados e destrutivos.'),
  signals:[T2(`Gusts ${Math.round(s.wind)} km/h`,`Rajadas ${Math.round(s.wind)} km/h`),
           T2('Thunderstorm activity','Atividade de trovoada'),
           T2('Sudden pressure drop','Queda súbita de pressão')]
 }),
 'blizzard':(s)=>({
  title:T2('Blizzard','Nevão com vento (blizzard)'),
  body:T2('Heavy snow combined with strong winds is sharply reducing visibility — classic blizzard conditions.',
          'Neve intensa combinada com vento forte reduz drasticamente a visibilidade — condições clássicas de blizzard.'),
  signals:[T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
           T2('Heavy snowfall','Queda de neve intensa')]
 }),
 'thundersnow':(s)=>({
  title:T2('Thundersnow','Trovoada com neve'),
  body:T2('A rare combination of thunder and snowfall — strong upward motion occurring even in near-freezing air.',
          'Uma combinação rara de trovão e neve — há movimento ascendente forte mesmo com ar próximo de 0°C.'),
  signals:[T2('Thunderstorm code active','Código de trovoada ativo'),
           T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`)]
 }),
 'heatwave':(s)=>({
  title:T2('Heatwave','Onda de calor'),
  body:T2('Persistently high temperatures with low humidity and light wind. Stay hydrated and avoid peak sun hours.',
          'Temperaturas persistentemente altas, humidade baixa e vento fraco. Hidrate-se e evite as horas de maior sol.'),
  signals:[T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
           T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2('Light wind','Vento fraco')]
 }),
 'monsoon':(s)=>({
  title:T2('Active monsoon burst','Episódio ativo de monção'),
  body:T2('Warm, moisture-loaded air is producing sustained heavy rainfall — consistent with an active monsoon phase.',
          'Ar quente e carregado de humidade produz chuva intensa e sustentada — consistente com uma fase ativa de monção.'),
  signals:[T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2(`Temp ${decT(s.temp)}°`,`Temp ${decT(s.temp)}°`),
           T2('Sustained heavy rain','Chuva forte sustentada')]
 }),
 'atm-river':(s)=>({
  title:T2('Atmospheric river','Rio atmosférico'),
  body:T2('A narrow corridor of concentrated moisture is funnelling sustained rain and strong wind into the region.',
          'Um corredor estreito de humidade concentrada canaliza chuva sustentada e vento forte para a região.'),
  signals:[T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2('Persistent rain','Chuva persistente')]
 }),
 'dust-storm':(s)=>({
  title:T2('Dust storm / Haboob','Tempestade de poeira (haboob)'),
  body:T2('Strong, dry winds are lifting large amounts of sand and dust, sharply reducing visibility.',
          'Ventos fortes e secos levantam grandes quantidades de areia e poeira, reduzindo drasticamente a visibilidade.'),
  signals:[T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2('Low visibility risk','Risco de baixa visibilidade')]
 }),
 'foehn':(s)=>({
  title:T2('Foehn / Chinook wind','Vento foehn / Chinook'),
  body:T2('Air descending from high terrain is warming and drying rapidly, producing an unusually warm, dry, gusty wind.',
          'O ar que desce de terreno elevado aquece e seca rapidamente, produzindo um vento invulgarmente quente, seco e forte.'),
  signals:[T2(`Humidity ${Math.round(s.rhNow)}%`,`Humidade ${Math.round(s.rhNow)}%`),
           T2(`Wind ${Math.round(s.wind)} km/h`,`Vento ${Math.round(s.wind)} km/h`),
           T2('Clear sky','Céu limpo')]
 })
});
Object.assign(PT,{'Global extremes':'Fenómenos extremos'});

Object.assign(PT,{'Iberia':'Península Ibérica','Signals right now':'Sinais neste momento'});

Object.assign(PT,{
  'No exact match for':'Sem correspondência exata para',
  'Here are the closest cities we could find.':'Estas são as cidades mais parecidas que encontrámos.',
  'Back':'Voltar'
});

/* ============ Céu Explicado × isóbaras ============ */
/* Usa o MESMO campo de pressão do mapa (isoCache + gridLoad + isoBuild), por isso o A/B que vês no radar é o A/B que o Céu Explicado conhece. */
const pMSL=()=>{const c=data.current;return isFinite(c.pressure_msl)?c.pressure_msl:c.surface_pressure};   // pressão ao nível do mar (a de superfície engana em locais altos)
const SYN_Z=6;                                                     // passo de 5°: escala regional
let synMemo={k:'',t:0,a:null},synBusy=false;
const synKey=()=>place.lat.toFixed(2)+','+place.lon.toFixed(2);
function synBox(){                                                 // caixa de ±24° à volta do local (≈ ±2 600 km)
  const st=tempStepOf(SYN_Z),jm=Math.floor(84/st),R=24;
  const kx=Math.min(1.6,1/Math.max(.3,Math.cos(Math.min(75,Math.abs(place.lat))*Math.PI/180)));
  return{z:SYN_Z,st,i0:Math.floor((place.lon-R*kx)/st),i1:Math.ceil((place.lon+R*kx)/st),
         j0:Math.max(-jm,Math.floor((place.lat-R)/st)),j1:Math.min(jm,Math.ceil((place.lat+R)/st))};
}
function synAnalyseGlobal(){                                      // mesmo campo NOAA GFS do mapa → o A/B do mapa é o A/B que o Céu Explicado conhece
  const p0=pMSL(),la=place.lat,lo=place.lon,rad=Math.PI/180;
  const brg=(la2,lo2)=>{const f1=la*rad,f2=la2*rad,dl=(lo2-lo)*rad;
    return(Math.atan2(Math.sin(dl)*Math.cos(f2),Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl))/rad+360)%360};
  const list=PG.ext.map(e=>({hi:e.hi,p:e.p,lat:e.lat,lng:e.lng,d:hav(la,lo,e.lat,e.lng),b:brg(e.lat,e.lng)})).filter(e=>e.d<=2800).sort((x,y)=>x.d-y.d);
  let sum=0,cnt=0;                                                 // anel de 600–1 200 km à volta do local
  for(const km of[600,900,1200])for(let k=0;k<12;k++){
    const t=k*30*rad,d=km/111.2,v=pgAt(la+d*Math.cos(t),lo+d*Math.sin(t)/Math.max(.2,Math.cos(la*rad)));
    if(v===v){sum+=v;cnt++}
  }
  return{p0,rel:cnt>=8?p0-sum/cnt:null,hi:list.find(e=>e.hi)||null,lo:list.find(e=>!e.hi)||null};
}
function synAnalyse(){
  if(PG)return synAnalyseGlobal();
  const g=synBox(),M=isoBuild(g);
  if(!M)return null;
  const p0=pMSL(),la=place.lat,lo=place.lon,rad=Math.PI/180;
  const brg=(la2,lo2)=>{const f1=la*rad,f2=la2*rad,dl=(lo2-lo)*rad;
    return(Math.atan2(Math.sin(dl)*Math.cos(f2),Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl))/rad+360)%360};
  const list=M.ext.map(e=>({hi:e.hi,p:e.p,lat:e.lat,lng:e.lng,d:hav(la,lo,e.lat,e.lng),b:brg(e.lat,e.lng)})).sort((a,b)=>a.d-b.d);
  /* anel de 600–1 200 km: diz se o local está acima ou abaixo da pressão que o rodeia (dorsal / cavado) */
  const N=Math.round(360/g.st);let sum=0,cnt=0;
  for(let j=g.j0;j<=g.j1;j++)for(let i=g.i0;i<=g.i1;i++){
    const v=isoNode(g.z,((i%N)+N)%N,j);if(v!==v)continue;
    const d=hav(la,lo,j*g.st,i*g.st);if(d>=600&&d<=1200){sum+=v;cnt++}
  }
  return{p0,rel:cnt>=4?p0-sum/cnt:null,hi:list.find(e=>e.hi)||null,lo:list.find(e=>!e.hi)||null};
}
function synGet(){                                                 // análise em cache (1 min); null se o campo ainda não chegou
  if(!place||!data)return null;
  const k=synKey();
  if(synMemo.k===k&&Date.now()-synMemo.t<6e4)return synMemo.a;
  let a=null;try{a=synAnalyse()}catch(e){console.warn('[Synoptic]',e.message)}
  synMemo={k,t:Date.now(),a};
  return a;
}
async function synEnsure(){                                        // pede o campo global (worker /pressure) — ou, se falhar, os nós em falta (/grid) — e repinta o herói
  if(!place||synBusy)return;
  const k=synKey();
  if(PG&&Date.now()-PG.at<PG_TTL)return;                           // campo global fresco: nada a pedir
  synBusy=true;let G=null;
  try{G=await pgLoad()}catch(e){}finally{synBusy=false}
  if(G){synMemo.t=0;if(tab==='sky'&&place&&synKey()===k)skyRepaint();return}
  const g=synBox(),need=isoMissing(g);
  if(!need.length||Date.now()<Math.max(isoBlock,tempBlock))return;
  synBusy=true;
  try{await gridLoad(g.z,need)}
  catch(err){
    console.warn('[Synoptic]',err.message);
    isoBlock=Date.now()+(err.message==='429'?3e5:3e4);
    if(err.message==='429')tempBlock=Math.max(tempBlock,isoBlock);
    return;
  }finally{synBusy=false}
  synMemo.t=0;
  if(tab==='sky'&&place&&synKey()===k)skyRepaint();
}
const SYN_DIR_EN=['N','NE','E','SE','S','SW','W','NW'],SYN_DIR_PT=['N','NE','E','SE','S','SO','O','NO'];
const synDir=b=>(LANG==='pt'?SYN_DIR_PT:SYN_DIR_EN)[Math.round(b/45)%8];
const synDist=d=>unit=='c'?(Math.round(d/10)*10)+' km':(Math.round(d*.621371/10)*10)+' mi';
const synWhere=e=>e.d<150?T2('right over this area','mesmo sobre esta zona'):T2(`about ${synDist(e.d)} ${synDir(e.b)} of here`,`a cerca de ${synDist(e.d)} a ${synDir(e.b)} daqui`);
const synStr=e=>e.hi
  ?(e.p>=1030?T2('strong','forte'):e.p>=1020?T2('well-marked','bem marcado'):T2('weak','fraco'))
  :(e.p<=990?T2('deep','cavada'):e.p<=1004?T2('moderate','moderada'):T2('shallow','pouco cavada'));
function synNearest(s){                                            // A ou B mais próximo (≤ 1 800 km)
  const y=s&&s.syn;if(!y)return null;
  const A=y.hi&&y.hi.d<=1800?y.hi:null,B=y.lo&&y.lo.d<=1800?y.lo:null;
  return A&&B?(A.d<=B.d?A:B):(A||B);
}
function synPick(s){                                               // usado pelo patternDetect antes do "nenhum padrão domina"
  const e=synNearest(s);
  if(e)return e.hi?'high-near':'low-near';
  const r=s.syn&&s.syn.rel;
  if(r!=null&&r>=2)return'ridge';
  if(r!=null&&r<=-2)return'trough';
  return null;
}
function synLine(s){                                               // frase + chip para os padrões que NÃO são regionais
  const e=synNearest(s);if(!e)return null;
  const kind=e.hi?T2('high (A)','alta (A)'):T2('low (B)','baixa (B)');
  return{
    text:T2(`On the pressure map a ${kind} of ${pf(e.p)} sits ${synWhere(e)}.`,`No mapa de pressão há uma ${kind} de ${pf(e.p)} ${synWhere(e)}.`),
    chip:`${e.hi?'A':'B'} ${pf(e.p)} · ${e.d<150?T2('overhead','por cima'):synDist(e.d)+' '+synDir(e.b)}`
  };
}
const SKY_ALIAS={'high-near':'high','ridge':'high','low-near':'showers','trough':'showers'};   // ícones reutilizados
Object.assign(PATTERNS,{
 'high-near':s=>{
  const e=synNearest(s),rel=s.syn&&s.syn.rel,north=place.lat>=0;
  const relTxt=rel!=null&&rel>.5?T2(`, about ${pdS(rel)} above the surrounding area`,`, cerca de ${pdS(rel)} acima da zona envolvente`):'';
  const drift=Math.abs(s.dP)>=1.5?T2(` Pressure has moved ${pdS(s.dP)} in three hours, so the high is building or drifting rather than sitting still — expect conditions to keep changing.`,` A pressão variou ${pdS(s.dP)} em três horas, por isso a alta está a formar-se ou a deslocar-se em vez de estar parada — as condições devem continuar a mudar.`):'';
  const cloud=s.code===3?T2(` The sky is overcast here anyway: under a weak high, moisture trapped below the sinking air can form low cloud.`,` Aqui o céu está encoberto na mesma: sob uma alta fraca, a humidade presa por baixo do ar que desce pode formar nuvens baixas.`):'';
  return{
   title:T2('A high-pressure centre nearby','Um centro de alta pressão nas proximidades'),
   body:T2(
    `The pressure map shows a closed high, the <i>A of ${pf(e.p)}</i>, ${synWhere(e)}. It is a ${synStr(e)} anticyclone, but it does not need to be strong to matter: what counts is that pressure is higher here than around it${relTxt}. Air sinks inside a high and spirals ${north?'clockwise':'anticlockwise'} around it, which thins out cloud and keeps the wind light.${drift}${cloud}`,
    `O mapa de pressão mostra uma alta fechada, o <i>A de ${pf(e.p)}</i>, ${synWhere(e)}. É um anticiclone ${synStr(e)}, mas não precisa de ser forte para contar: o que interessa é que a pressão aqui é superior à do ar à volta${relTxt}. O ar desce dentro de uma alta e gira ${north?'no sentido dos ponteiros do relógio':'no sentido contrário ao dos ponteiros do relógio'} à volta dela, o que dissipa a nebulosidade e mantém o vento fraco.${drift}${cloud}`),
   signals:[synLine(s).chip,T2(`Pressure ${pf(pMSL())} (sea level)`,`Pressão ${pf(pMSL())} (nível do mar)`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
  };
 },
 'low-near':s=>{
  const e=synNearest(s),north=place.lat>=0;
  const calm=s.code<=2?T2(` The sky is clear here for now — the low is not directly affecting this spot, but it can bring cloud and wind as it moves.`,` Aqui o céu está limpo por agora — a baixa ainda não afeta este ponto, mas pode trazer nuvens e vento ao deslocar-se.`):'';
  return{
   title:T2('A low-pressure centre nearby','Um centro de baixa pressão nas proximidades'),
   body:T2(
    `The pressure map shows a closed low, the <i>B of ${pf(e.p)}</i>, ${synWhere(e)}: a ${synStr(e)} depression. Air converges and rises into a low and spirals ${north?'anticlockwise':'clockwise'} around its centre, which is why cloud, rain and wind tend to gather around it.${calm}`,
    `O mapa de pressão mostra uma baixa fechada, o <i>B de ${pf(e.p)}</i>, ${synWhere(e)}: uma depressão ${synStr(e)}. O ar converge e sobe numa baixa e gira ${north?'no sentido contrário ao dos ponteiros do relógio':'no sentido dos ponteiros do relógio'} à volta do centro, e é por isso que nuvens, chuva e vento tendem a juntar-se à volta dela.${calm}`),
   signals:[synLine(s).chip,T2(`Pressure ${pf(pMSL())} (sea level)`,`Pressão ${pf(pMSL())} (nível do mar)`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
  };
 },
 'ridge':s=>({
  title:T2('On a ridge of high pressure','Numa dorsal de pressão alta'),
  body:T2(
   `Pressure here (${pf(pMSL())} at sea level) is <i>${pdS(s.syn.rel)} above</i> the surrounding area, but there is no closed high close by. That is a ridge: a tongue of higher pressure where air gently sinks, so the weather tends to be calmer than around it even though no single feature dominates.`,
   `A pressão aqui (${pf(pMSL())} ao nível do mar) está <i>${pdS(s.syn.rel)} acima</i> da zona envolvente, mas não há nenhuma alta fechada por perto. É uma dorsal: uma língua de pressão mais alta onde o ar desce suavemente, por isso o tempo tende a ser mais calmo do que à volta, mesmo sem um único sistema a dominar.`),
  signals:[T2(`+${pdS(s.syn.rel)} vs surroundings`,`+${pdS(s.syn.rel)} face à envolvente`),T2(`Pressure ${pf(pMSL())}`,`Pressão ${pf(pMSL())}`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
 }),
 'trough':s=>({
  title:T2('In a trough of low pressure','Num cavado de baixa pressão'),
  body:T2(
   `Pressure here (${pf(pMSL())} at sea level) is <i>${pdS(-s.syn.rel)} below</i> the surrounding area, but no closed low is nearby. That is a trough: a stretched-out zone of lower pressure where air tends to rise, so cloud and showers can develop even without a clear front.`,
   `A pressão aqui (${pf(pMSL())} ao nível do mar) está <i>${pdS(-s.syn.rel)} abaixo</i> da zona envolvente, mas não há nenhuma baixa fechada por perto. É um cavado: uma zona alongada de pressão mais baixa onde o ar tende a subir, por isso podem surgir nuvens e aguaceiros mesmo sem uma frente clara.`),
  signals:[T2(`${pdS(s.syn.rel)} vs surroundings`,`${pdS(s.syn.rel)} face à envolvente`),T2(`Pressure ${pf(pMSL())}`,`Pressão ${pf(pMSL())}`),T2(`ΔP ${pdS(s.dP)}/3h`,`ΔP ${pdS(s.dP)}/3h`)]
 })
});

function synDebug(p){                                              // só com o modo programador ligado
  const y=p.s.syn,f=e=>e?`${e.hi?'A':'B'} ${e.p.toFixed(1)} hPa @ ${e.lat.toFixed(1)},${e.lng.toFixed(1)} · ${Math.round(e.d)} km · ${Math.round(e.b)}°`:'—';
  return`<pre class="expProg">${escH([
    'pattern    '+p.id,
    'grid       z='+SYN_Z+'  step='+tempStepOf(SYN_Z)+'°  cache='+(isoCache[SYN_Z]?isoCache[SYN_Z].size:0)+' nós',
    'p0 (MSL)   '+(+pMSL()).toFixed(1)+' hPa',
    'rel        '+(y&&y.rel!=null?y.rel.toFixed(2)+' hPa vs anel 600–1200 km':'—'),
    'nearest A  '+f(y&&y.hi),
    'nearest B  '+f(y&&y.lo)
  ].join('\n'))}</pre>`;
}
/* ícones dos sinais (cartões de evidência) */
const SI={
 map:'<ellipse cx="12" cy="12" rx="9" ry="6.6"/><ellipse cx="12" cy="12" rx="4.4" ry="3"/>',
 gauge:'<path d="M4.4 17.2a8.4 8.4 0 1 1 15.2 0"/><path d="m12 13.4 3.4-4.2"/><circle cx="12" cy="13.6" r="1.3"/>',
 trend:'<path d="M3.5 17.5 9 12l3.5 3L20.5 6.5"/><path d="M15.5 6.5h5v5"/>',
 wind:IC.wind,drop:IC.drop,cloud:IC.cloud,
 temp:'<path d="M14 14.6V5.5a2 2 0 1 0-4 0v9.1a4 4 0 1 0 4 0z"/>',
 dot:'<circle cx="12" cy="12" r="3.2"/>'};
function sigIcon(t){
  const k=/^[AB]\s/.test(t)?'map'
   :/ΔP|\/3h|hPa\/|inHg\//.test(t)?'trend'
   :/^(Pressure|Pressão)/i.test(t)?'gauge'
   :/(wind|vento|gust|rajada|km\/h|\bkt\b)/i.test(t)?'wind'
   :/(dew|orvalho|humid)/i.test(t)?'drop'
   :/^(temp|temperatura)/i.test(t)?'temp'
   :/(cloud|nuvem|nuvens|sky|céu)/i.test(t)?'cloud':'dot';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${SI[k]}</svg>`;
}
function sigTile(x){                                              // "B 980 hPa · 1390 km NO" → título + subtítulo
  let a=x,b='';const i=x.indexOf(' · ');
  if(i>0){a=x.slice(0,i);b=x.slice(i+3)}
  else{const m=/^(.*?)\s*\((.+)\)$/.exec(x);if(m){a=m[1];b=m[2]}}
  return `<li class="sgT"><span class="sgIc">${sigIcon(x)}</span><span class="sgTx"><b>${a}</b>${b?`<small>${b}</small>`:''}</span></li>`;
}
function skyKey(s){                                               // número-chave no palco: pressão ao nível do mar + tendência a 3 h
  const p0=Number(pMSL()),dP=Number(s&&s.dP)||0;
  if(!isFinite(p0))return'';
  const dir=dP>.05?'up':dP<-.05?'down':'flat',
   arr={up:'<path d="M12 19V6M6 11.5 12 5.5l6 6"/>',down:'<path d="M12 5v13M6 12.5l6 6 6-6"/>',flat:'<path d="M5 12h14M14 7l5 5-5 5"/>'}[dir];
  return `<div class="expKey"><span class="k1">${T2('Sea-level pressure','Pressão ao nível do mar')}</span>
   <span class="k2"><b>${pN(p0)}</b><small>${pU()}</small></span>
   <span class="k3 ${dir}"><svg viewBox="0 0 24 24" aria-hidden="true">${arr}</svg>${dP>0?'+':''}${pdS(dP)} ${T2('in 3 h','em 3 h')}</span></div>`;
}
function skyHero(p){
  const det=(PATTERNS[p.id]||PATTERNS.transition)(p.s);
  const icon=PD_ICONS[p.id]||PD_ICONS[SKY_ALIAS[p.id]]||PD_ICONS.transition;
  const isIb=p.cat==='Iberia',sl=SKY_ALIAS[p.id]?null:synLine(p.s);
  const all=sl?[...det.signals,sl.chip]:det.signals;
  const sig=all.filter(x=>!/^(Pressure|Pressão)\s+[\d.,]+\s*(hPa|inHg)/i.test(x)&&!/^ΔP\s/.test(x));   // pressão e ΔP já estão no número-chave do palco
  return`<section class="card expHero">
 <div class="expStage">
  <span class="expCat${isIb?' ib':''}">${tr(p.cat)}</span>
  <div class="expDiagram">${icon}</div>
  ${skyKey(p.s)}
 </div>
 <div class="expBody">
  <h2 class="expH">${det.title}</h2>
  <p class="expP">${det.body}</p>
  ${sl?`<p class="expSynP">${sl.text}</p>`:''}
  ${sig.length?`<ul class="expSig" aria-label="${T2('What the data shows','O que os dados mostram')}">${sig.map(sigTile).join('')}</ul>`:''}
  ${typeof progOn==='function'&&progOn()?synDebug(p):''}
 </div>
</section>`;
}
function skyRepaint(){
  const el=$('#pane .expHero');if(!el||tab!=='sky'||!data)return;
  const t=document.createElement('div');t.innerHTML=skyHero(patternDetect());
  el.replaceWith(t.firstElementChild);
}

/* ============ Céu Explicado: diagramas + sparkline ============ */
const SVG_CLOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const SVG_CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const SVG_PULSE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3.5l2.5 6 4-13 2.5 7H21"/></svg>';

/* ============ Diagramas do Céu Explicado · biblioteca desenhada à mão (viewBox 120×120) ============
   Mesmo vocabulário em todos: sol com 12 raios iguais e halo, nuvem cúmulo com gradiente, gota verdadeira (arredondada em baixo,
   ponta curva em cima), raio com cantos redondos, frentes com os símbolos meteorológicos corretos. Cada SVG leva os seus próprios
   gradientes com um sufixo único, por isso vários podem coexistir na página. */
let _pdU=0;
const PDK=(()=>{
 const f=v=>+v.toFixed(2),P=(cx,cy,r,a)=>[cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180)];
 const defs=u=>`<defs>
<linearGradient id="s${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#f6a623"/></linearGradient>
<radialGradient id="h${u}"><stop offset="0" stop-color="#ffd66e" stop-opacity=".65"/><stop offset="1" stop-color="#ffd66e" stop-opacity="0"/></radialGradient>
<linearGradient id="c${u}" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="24"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d8e8"/></linearGradient>
<linearGradient id="k${u}" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="24"><stop offset="0" stop-color="#a7b9d0"/><stop offset="1" stop-color="#5f7694"/></linearGradient>
<linearGradient id="d${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#2f78dc"/></linearGradient>
<linearGradient id="b${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe777"/><stop offset="1" stop-color="#f59a00"/></linearGradient>
<linearGradient id="i${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f6ff"/><stop offset="1" stop-color="#7cc3f0"/></linearGradient>
<linearGradient id="w${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4aa3f0" stop-opacity="0"/><stop offset=".5" stop-color="#3a8be6"/><stop offset="1" stop-color="#2f6fd6"/></linearGradient>
<linearGradient id="e${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c996"/><stop offset="1" stop-color="#c9a169"/></linearGradient>
</defs>`;
 const svg=(b,cls='')=>{const u=++_pdU;return `<svg viewBox="0 0 120 120" class="pdArt${cls?' '+cls:''}" aria-hidden="true">${defs(u)}${b(u)}</svg>`};
 /* sol: halo + 12 raios (longos e curtos alternados) + disco */
 const sun=(u,x,y,r,spin)=>{let g='';for(let k=0;k<12;k++){const a=k*30,[x0,y0]=P(x,y,r*1.42,a),[x1,y1]=P(x,y,r*(k%2?1.78:2.02),a);g+=`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`}
  return `<circle cx="${x}" cy="${y}" r="${f(r*2.6)}" fill="url(#h${u})"/><path d="${g}" stroke="#f7b733" stroke-width="${f(r*.26)}" stroke-linecap="round" fill="none"${spin?` class="pdRays" style="transform-origin:${x}px ${y}px"`:''}/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#s${u})"/><circle cx="${f(x-r*.3)}" cy="${f(y-r*.3)}" r="${f(r*.34)}" fill="#fff" opacity=".35"/>`};
 /* nuvem cúmulo (largura ≈ 70 × s) */
 const cloud=(u,x,y,s,dark)=>`<g transform="translate(${x} ${y}) scale(${s})" fill="url(#${dark?'k':'c'}${u})"><rect x="-34" y="0" width="68" height="22" rx="11"/><circle cx="-15" cy="-3" r="15"/><circle cx="6" cy="-9" r="19"/><circle cx="24" cy="1" r="13"/></g>`;
 /* gota verdadeira: topo curvo, base redonda */
 const drop=(u,x,y,s,o=1)=>`<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="M0-11C2.6-6.4 7.4-2.6 7.4 2.6A7.4 7.4 0 0 1-7.4 2.6C-7.4-2.6-2.6-6.4 0-11z" fill="url(#d${u})"/><ellipse cx="-2.6" cy="3.2" rx="1.5" ry="2.6" fill="#fff" opacity=".45" transform="rotate(14 -2.6 3.2)"/></g>`;
 const bolt=(u,x,y,s)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M3-13-8 3h6l-3 12L10-4H4z" fill="url(#b${u})" stroke="#f59a00" stroke-width="1.6" stroke-linejoin="round"/>`;
 /* floco de neve: 6 braços com ramificações */
 const flake=(x,y,r,col='url(#i0)',w=3)=>{let g='';for(let k=0;k<6;k++){const a=k*60,[ex,ey]=P(0,0,r,a),[bx,by]=P(0,0,r*.62,a);g+=`M0 0L${f(ex)} ${f(ey)}`;for(const d of[-40,40]){const[qx,qy]=P(bx,by,r*.3,a+d);g+=`M${f(bx)} ${f(by)}L${f(qx)} ${f(qy)}`}}
  return `<path transform="translate(${x} ${y})" d="${g}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`};
 /* ponto e tangente de uma Bézier quadrática (para colocar símbolos de frente ao longo da linha) */
 const qb=(p0,p1,p2,t)=>{const m=1-t,x=m*m*p0[0]+2*m*t*p1[0]+t*t*p2[0],y=m*m*p0[1]+2*m*t*p1[1]+t*t*p2[1],dx=2*m*(p1[0]-p0[0])+2*t*(p2[0]-p1[0]),dy=2*m*(p1[1]-p0[1])+2*t*(p2[1]-p1[1]),l=Math.hypot(dx,dy)||1;return[x,y,dx/l,dy/l]};
 const front=(u,kind)=>{const A=[10,92],B=[60,52],C=[110,84],cold=kind==='cold',c1=cold?'#5aa9f5':'#ff9a5a',c2=cold?'#2c6fd8':'#e2491f';let m='';
  for(const t of[.16,.42,.68,.92]){const[x,y,tx,ty]=qb(A,B,C,t),nx=ty,ny=-tx;   // normal para cima
   if(cold)m+=`<path d="M${f(x-tx*10)} ${f(y-ty*10)}L${f(x+tx*10)} ${f(y+ty*10)}L${f(x+nx*18)} ${f(y+ny*18)}z" fill="url(#f${u})" stroke="url(#f${u})" stroke-width="2" stroke-linejoin="round"/>`;
   else m+=`<path d="M${f(x-tx*10)} ${f(y-ty*10)}A10 10 0 0 1 ${f(x+tx*10)} ${f(y+ty*10)}z" transform="rotate(0)" fill="url(#f${u})"/>`.replace(/A10 10 0 0 1/,'A10 10 0 0 0');}
  return `<defs><linearGradient id="f${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<circle cx="60" cy="62" r="50" fill="${c1}" opacity=".12"/><path d="M${A}Q${B} ${C}" fill="none" stroke="url(#f${u})" stroke-width="5.5" stroke-linecap="round"/>${m}
<path d="M24 100h72" stroke="${c2}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9" opacity=".5"/>`};
 const wave=(x,y,w,col,sw=4,o=1)=>{const n=Math.round(w/14);let d=`M${x} ${y}`;for(let i=0;i<n;i++)d+=`q3.5-5 7 0t7 0`;return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity="${o}"/>`};
 const arrowL=(x,y,l,col,sw=5,cls='')=>`<path d="M${x} ${y}h${-l}M${x-l+9} ${y-8}l-9 8 9 8" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${cls?` class="${cls}"`:''}/>`;
 const arrowR=(x,y,l,col,sw=5,cls='')=>`<path d="M${x} ${y}h${l}M${x+l-9} ${y-8}l9 8-9 8" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${cls?` class="${cls}"`:''}/>`;
 const spiral=(cx,cy,r0,r1,turns,a0)=>{let d='';const n=Math.round(turns*28);for(let i=0;i<=n;i++){const t=i/n,[x,y]=P(cx,cy,r0+(r1-r0)*t,a0+t*turns*360);d+=(i?'L':'M')+f(x)+' '+f(y)}return d};
 return{svg,sun,cloud,drop,bolt,flake,front,wave,arrowL,arrowR,spiral,P,f};
})();
const PD_ICONS=(()=>{const{svg,sun,cloud,drop,bolt,flake,front,wave,arrowL,arrowR,spiral,P,f}=PDK;return{
 'front-cold':svg(u=>front(u,'cold')),
 'front-warm':svg(u=>front(u,'warm')),
 'post-front':svg(u=>sun(u,70,44,15,1)+`<g transform="translate(40 88)" opacity=".92">${cloud(u,0,0,.62)}</g>`+wave(10,106,44,'#7db8e8',3.5,.7)),
 'high':svg(u=>sun(u,60,56,20,1)+`<circle cx="60" cy="56" r="52" fill="none" stroke="#f6b13a" stroke-width="1.8" stroke-dasharray="2 7" stroke-linecap="round" opacity=".55"/>`+
   [[22,104],[60,110],[98,104]].map(([x,y])=>`<path d="M${x-6} ${y-8}l6 7 6-7" fill="none" stroke="#7bb4e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`).join('')),
 'tropical':svg(u=>sun(u,44,40,15,1)+wave(10,92,56,'#3f95e8',4)+wave(10,104,56,'#79b8f0',3.5,.7)+drop(u,90,62,1.6)+drop(u,104,84,1.1,.85)),
 'polar':svg(u=>`<circle cx="60" cy="60" r="50" fill="#8fd0ef" opacity=".16"/>`+flake(60,60,40,`url(#i${_pdU})`,4.4)+`<circle cx="60" cy="60" r="5" fill="#fff" stroke="#8fd0ef" stroke-width="2.4"/>`),
 'storm-conv':svg(u=>cloud(u,60,40,1.05,1)+bolt(u,56,90,1.5)+drop(u,86,86,.95)+drop(u,31,92,.8,.9)),
 'fog-rad':svg(u=>`<circle cx="60" cy="48" r="22" fill="url(#s${u})" opacity=".9"/><circle cx="60" cy="48" r="38" fill="url(#h${u})"/>`+
   [[16,68,88],[26,82,68],[12,96,96],[30,110,60]].map(([x,y,w],i)=>`<rect x="${x}" y="${y-5}" width="${w}" height="10" rx="5" fill="#a9bccf" opacity="${[.85,.7,.55,.4][i]}"/>`).join('')),
 'showers':svg(u=>sun(u,36,36,12,1)+cloud(u,68,52,.95)+drop(u,48,92,1)+drop(u,70,98,1)+drop(u,92,92,1)),
 'transition':svg(u=>sun(u,40,40,15,1)+cloud(u,68,70,1.02)),
 'ib-nortada':svg(u=>`<path d="M6 12h26c4 14-4 22 2 36s-6 26 0 40-2 14-2 22H6z" fill="url(#e${u})"/><path d="M32 12c4 14-4 22 2 36s-6 26 0 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`+
   [[66,22],[84,46],[66,70]].map(([x,y])=>`<path d="M${x} ${y}v18M${x-8} ${y+11}l8 9 8-9" fill="none" stroke="#2a73c9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')+wave(46,108,60,'#4aa0ee',3.5,.8)),
 'ib-levante':svg(u=>`<path d="M4 8h112v26c-18 6-30-2-50 2s-40 4-62-2z" fill="url(#e${u})"/><path d="M4 90c24-6 40 2 60-2s36-6 52 0v26H4z" fill="url(#e${u})"/>`+
   arrowL(106,52,64,'#c4602c',5.5)+arrowL(92,68,44,'#e08a4c',4.5)+wave(10,104,30,'#4aa0ee',3,.0)),
 'ib-suao':svg(u=>sun(u,36,34,13,1)+`<rect x="68" y="14" width="14" height="52" rx="7" fill="#fff" stroke="#d2dbe5" stroke-width="2"/><rect x="73" y="34" width="4" height="34" rx="2" fill="#e5402d"/><circle cx="75" cy="76" r="12" fill="#e5402d"/><circle cx="71.5" cy="72.5" r="3.4" fill="#fff" opacity=".4"/>`+
   [[26,32],[38,32]].map(([x,y])=>'').join('')+arrowR(14,96,52,'#c4602c',5)+wave(14,108,40,'#f0a96b',3.5,.8)),
 'ib-calima':svg(u=>sun(u,60,40,17,0)+[[14,74,92],[22,88,76],[12,102,96]].map(([x,y,w],i)=>`<rect x="${x}" y="${y-5}" width="${w}" height="10" rx="5" fill="#d8a352" opacity="${[.8,.65,.5][i]}"/>`).join('')+
   [[28,64],[92,70],[104,58],[16,84]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.4" fill="#c58f3e" opacity=".8"/>`).join('')),
 'ib-gotafria':svg(u=>`<circle cx="60" cy="56" r="44" fill="none" stroke="#6a72b8" stroke-width="2.4" stroke-dasharray="3 7" stroke-linecap="round" opacity=".6" class="pdSpin" style="transform-origin:60px 56px"/>`+cloud(u,60,50,.9,1)+drop(u,44,88,1)+drop(u,62,96,1)+drop(u,80,88,1)),
 'bomb-cyclone':svg(u=>`<circle cx="60" cy="60" r="52" fill="#5b8fe0" opacity=".12"/><g class="pdSpin" style="transform-origin:60px 60px"><path d="${PDK.spiral(60,60,5,46,1.7,-20)}" fill="none" stroke="url(#w${u})" stroke-width="6" stroke-linecap="round"/><path d="${PDK.spiral(60,60,5,46,1.7,160)}" fill="none" stroke="#7db8f0" stroke-width="4" stroke-linecap="round" opacity=".7"/></g><circle cx="60" cy="60" r="7" fill="#2f6fd6"/><circle cx="60" cy="60" r="3" fill="#fff" opacity=".7"/>`),
 'derecho':svg(u=>`<path d="M12 96Q60 6 108 96" fill="none" stroke="#cfdcea" stroke-width="16" stroke-linecap="round" opacity=".6"/>`+
   [[20,40,86],[16,60,92],[20,80,86]].map(([x,y,l],i)=>arrowR(x,y,l,['#5e86b8','#2f6fd6','#5e86b8'][i],5.5,'pdDash')).join('')),
 'blizzard':svg(u=>flake(46,52,26,`url(#i${_pdU})`,4)+flake(86,84,14,`url(#i${_pdU})`,3)+flake(92,32,9,`url(#i${_pdU})`,2.6)+
   [[10,92,50],[30,106,40]].map(([x,y,l])=>`<path d="M${x} ${y}h${l}" stroke="#9cc4e6" stroke-width="4.5" stroke-linecap="round" opacity=".8"/>`).join('')),
 'thundersnow':svg(u=>cloud(u,60,38,1.02,1)+bolt(u,60,88,1.45)+flake(30,94,9,`url(#i${_pdU})`,2.6)+flake(92,98,9,`url(#i${_pdU})`,2.6)),
 'heatwave':svg(u=>sun(u,60,48,19,1)+[96,106].map((y,i)=>`<path d="M16 ${y}q11-9 22 0t22 0t22 0t22 0" fill="none" stroke="${['#f08a4b','#f7b266'][i]}" stroke-width="4.2" stroke-linecap="round" class="pdDash"/>`).join('')),
 'monsoon':svg(u=>cloud(u,60,32,1.1,1)+[[34,74],[52,84],[70,74],[88,84],[43,100],[61,106],[79,100]].map(([x,y])=>drop(u,x,y,.8)).join('')),
 'atm-river':svg(u=>[[40,'#2f6fd6',7,1],[62,'#5aa3ee',6,.8],[84,'#8ec2f4',5,.6]].map(([y,c,w,o])=>`<path d="M8 ${y+8}q22-30 44-8t60-10" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${o}" class="pdDash"/>`).join('')+drop(u,100,96,1.2)+drop(u,84,104,.8,.8)),
 'dust-storm':svg(u=>`<g class="pdSpin" style="transform-origin:60px 56px"><path d="${PDK.spiral(60,56,6,40,1.5,0)}" fill="none" stroke="#d9a65c" stroke-width="5" stroke-linecap="round" opacity=".85"/></g>`+
   [[34,34],[88,40],[96,72],[26,76],[60,24]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${[3,2.4,3.2,2.4,2][i]}" fill="#c58f3e"/>`).join('')+`<rect x="14" y="98" width="92" height="9" rx="4.5" fill="#d8a352" opacity=".7"/>`),
 'foehn':svg(u=>`<path d="M4 98 40 36l16 24 12-16 48 54z" fill="url(#e${u})"/><path d="M40 36l-9 14 9-4 7 8 9-4-8-10z" fill="#fff" opacity=".95"/>`+
   `<path d="M10 44q40-16 62-4" fill="none" stroke="#5aa3ee" stroke-width="4.5" stroke-linecap="round"/><path d="M72 44q18 2 30 22" fill="none" stroke="#f08a4b" stroke-width="4.5" stroke-linecap="round" class="pdDash"/><path d="M96 58l7 11-12 2" fill="none" stroke="#f08a4b" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`+sun(u,100,20,7,1))
}})();

function pressureSeries(){
 if(!data||!data.hourly)return null;
 const h=data.hourly, i0=idx0();
 const back=6, fwd=6; // ~12h de janela centrada em "agora"
 const start=Math.max(0, i0-back);
 const end=Math.min(h.time.length-1, i0+fwd);
 const out=[];
 for(let i=start;i<=end;i++){
  const v=h.surface_pressure ? h.surface_pressure[i] : null;
  if(v==null||!isFinite(v))continue;
  out.push({
   t:new Date(h.time[i]).toLocaleTimeString(LOC(),{hour:'2-digit',minute:'2-digit'}),
   v:v,
   now:i===i0
  });
 }
 return out;
}

function pressureSparkSVG(){
 const hrs = pressureSeries(); // assume que já existe: [{t:'14:00', v:1013.2, now:false}, ...]
 if(!hrs || hrs.length<2){
  return `<div class="sp-empty">${T2('Not enough data yet','Dados insuficientes por agora')}</div>`;
 }
 const W=260,H=84,padX=8,padT=10,padB=10;
 const vals=hrs.map(p=>p.v);
 const min=Math.min(...vals), max=Math.max(...vals);
 const span=Math.max(max-min,1.5), mid=(max+min)/2, lo=mid-span/2*1.15;     // dá folga em cima e em baixo; tendências planas não ficam "esticadas"
 const pts=hrs.map((p,i)=>({
  x:padX+i*(W-2*padX)/(hrs.length-1),
  y:H-padB-((p.v-lo)/(span*1.15))*(H-padT-padB),
  t:p.t, v:p.v, now:p.now
 }));
 let line=`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;                 // curva suave (pontos médios)
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;line+=` Q${a.x.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`}
 const L=pts[pts.length-1];line+=` T${L.x.toFixed(1)},${L.y.toFixed(1)}`;
 const area=`${line} L${L.x.toFixed(1)},${H-padB+2} L${pts[0].x.toFixed(1)},${H-padB+2}Z`;
 const nowP=pts.find(p=>p.now);
 const grid=[.25,.5,.75].map(k=>`<line x1="${padX}" x2="${W-padX}" y1="${(padT+(H-padT-padB)*k).toFixed(1)}" y2="${(padT+(H-padT-padB)*k).toFixed(1)}" class="spGrid"/>`).join('');
 const circles=pts.map(p=>
  `<circle class="sp-pt${p.now?' sp-now':''}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.now?4.2:9}"
    data-t="${p.t}" data-v="${p.v.toFixed(1)}"></circle>`
 ).join('');
 return `<div class="sparkWrap">
  <div class="spRange"><span>${T2('low','mín.')} <b>${pf(min)}</b></span><span>${T2('high','máx.')} <b>${pf(max)}</b></span></div>
  <svg viewBox="0 0 ${W} ${H}" class="sparkline" role="img" aria-label="${T2('Pressure over about 12 hours','Pressão ao longo de cerca de 12 horas')}">
   <defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--acc)" stop-opacity=".34"/><stop offset="1" style="stop-color:var(--acc)" stop-opacity="0"/></linearGradient></defs>
   ${grid}
   <path d="${area}" class="spArea"/>
   <path d="${line}" class="spLine"/>
   ${nowP?`<line x1="${nowP.x.toFixed(1)}" x2="${nowP.x.toFixed(1)}" y1="${padT-4}" y2="${H-padB+2}" class="spNowLine"/>`:''}
   ${circles}
  </svg>
  <div class="spAx"><span>${hrs[0].t}</span><span>${T2('now','agora')}</span><span>${hrs[hrs.length-1].t}</span></div>
  <div class="sp-tooltip" id="spTip"></div>
 </div>`;
}

function initSparkTooltip(){
 const wrap=document.querySelector('.sparkWrap');
 if(!wrap)return;
 const tip=wrap.querySelector('.sp-tooltip');
 const show=(pt,x,y)=>{
  tip.textContent=`${pt.dataset.t} · ${unit=='c'?pt.dataset.v+' hPa':dcm(+pt.dataset.v*HPA_INHG,2)+' inHg'}`;
  tip.style.left=x+'px'; tip.style.top=y+'px';
  tip.classList.add('show');
 };
 wrap.querySelectorAll('.sp-pt').forEach(pt=>{
  pt.addEventListener('mouseenter',e=>{
   const r=wrap.getBoundingClientRect();
   show(pt, e.clientX-r.left, e.clientY-r.top);
  });
  pt.addEventListener('mousemove',e=>{
   const r=wrap.getBoundingClientRect();
   tip.style.left=(e.clientX-r.left)+'px';
   tip.style.top=(e.clientY-r.top)+'px';
  });
  pt.addEventListener('mouseleave',()=>tip.classList.remove('show'));
  pt.addEventListener('touchstart',e=>{
   const r=wrap.getBoundingClientRect();
   const t=e.touches[0];
   show(pt, t.clientX-r.left, t.clientY-r.top);
  },{passive:true});
 });
 document.addEventListener('touchstart',e=>{
  if(!wrap.contains(e.target))tip.classList.remove('show');
 },{passive:true});
}

function expMetricsHTML(s){
 const dP = Number(s.dP) || 0;
 const dDew = Number(s.dDew)|| 0;
 const wind = Number(s.wind)|| 0;
 const dDewD = unit=='c'?dDew:dDew*9/5; // diferença: só escala, nunca +32
 const rows=[
 {label:T2('Pressure (3h)','Pressão (3h)'),
 value:`${dP>0?'+':''}${pdS(dP)}`, trend:dP},
 {label:T2('Dew point (3h)','Ponto de orvalho (3h)'),
 value:`${dDewD>0?'+':''}${dDewD.toFixed(1)}°`, trend:dDew},
 {label:T2('Wind now','Vento agora'),
 value:W(wind), trend:null}
 ];
 return rows.map(r=>`
 <div class="sgRow">
 <span class="sgLabel">${r.label}</span>
 <span class="sgVal">${r.value}${trendIcon(r.trend)}</span>
 </div>`).join('');
}
function trendIcon(v){
 if(v==null)return'';
 if(v>0.05)return'<i class="sgUp">▲</i>';
 if(v<-0.05)return'<i class="sgDown">▼</i>';
 return'<i class="sgFlat">▬</i>';
}

function next6hText(){
  const h=data.hourly,i0=idx0();
  const i6=Math.min(i0+6,h.time.length-1);
  const c=data.current;
  const dP=h.surface_pressure[i6]-c.surface_pressure;
  const dDew=(h.dew_point_2m&&isFinite(h.dew_point_2m[i6]))?h.dew_point_2m[i6]-c.dew_point_2m:0;
  const dT=h.temperature_2m[i6]-c.temperature_2m;
  const rainMax=Math.max(...h.precipitation_probability.slice(i0,i6+1));
  const parts=[];
  if(Math.abs(dP)>=0.8) parts.push(T2(
    `<i>Pressure ${dP>0?'rising':'falling'} by ${pdS(Math.abs(dP))}</i> — ${dP>0?T2('settled weather is on the way','tempo estável a caminho'):T2('more active weather is likely','tempo mais ativo é provável')}.`,
    `<i>Pressão ${dP>0?'a subir':'a descer'} ${pdS(Math.abs(dP))}</i> — ${dP>0?'tempo mais estável a caminho':'tempo mais ativo é provável'}.`
  ));
  if(Math.abs(dDew)>=1) parts.push(T2(
    `<i>Dew point ${dDew>0?'rising':'falling'} by ${decDT(Math.abs(dDew))	}°</i> — the air is getting ${dDew>0?'more humid':'drier'}.`,
    `<i>Ponto de orvalho ${dDew>0?'a subir':'a descer'} ${decDT(Math.abs(dDew))	}°</i> — o ar está a ficar ${dDew>0?'mais húmido':'mais seco'}.`
  ));
  if(Math.abs(dT)>=1.5) parts.push(T2(
    `Temperature ${dT>0?'climbing':'dropping'} by about ${decDT(Math.abs(dT))}°.`,
    `Temperatura ${dT>0?'a subir':'a descer'} cerca de ${decDT(Math.abs(dT))}°.`
  ));
  if(rainMax>=50) parts.push(T2(
    `Rain probability peaks at ${rainMax}% in this window.`,
    `A probabilidade de chuva atinge ${rainMax}% nesta janela.`
  ));
  if(!parts.length) return T2(
    `Very little change expected over the next six hours — pressure, dew point and temperature all hold roughly steady. A good window for anything outdoors.`,
    `Muito pouca mudança esperada nas próximas seis horas — pressão, ponto de orvalho e temperatura mantêm-se praticamente constantes. Uma boa janela para estar ao ar livre.`
  );
  return parts.join(' ');
}

function contextWeekText(){
  const d=data.daily,c=data.current;
  const wkMax=d.temperature_2m_max.reduce((a,b)=>a+b,0)/d.temperature_2m_max.length;
  const diff=c.temperature_2m-wkMax;
  const hi=d.temperature_2m_max.indexOf(Math.max(...d.temperature_2m_max));
  const lo=d.temperature_2m_min.indexOf(Math.min(...d.temperature_2m_min));
  const wet=d.weather_code.filter(x=>x>=51).length;
  const parts=[];
  if(Math.abs(diff)<=1.5) parts.push(T2(
    `Today is close to the week's average (${decT(wkMax)}°).`,
    `Hoje está perto da média da semana (${decT(wkMax)}°).`
  ));
  else parts.push(T2(
    `Today is <b>${decDT(Math.abs(diff))}° ${diff>0?'warmer':'cooler'}</b> than the week's average (${decT(wkMax)}°).`,
    `Hoje está <b>${decDT(Math.abs(diff))}° ${diff>0?'mais quente':'mais frio'}</b> do que a média da semana (${decT(wkMax)}°).`
  ));
  parts.push(T2(
    `Warmest day: <b>${new Date(d.time[hi]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b> at ${T(d.temperature_2m_max[hi])}°. Coolest night: <b>${new Date(d.time[lo]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b> at ${T(d.temperature_2m_min[lo])}°.`,
    `Dia mais quente: <b>${new Date(d.time[hi]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b>, ${T(d.temperature_2m_max[hi])}°. Noite mais fria: <b>${new Date(d.time[lo]+'T12:00').toLocaleDateString('en',{weekday:'long'})}</b>, ${T(d.temperature_2m_min[lo])}°.`
  ));
  if(wet>=4) parts.push(T2(
    `${wet} of the next 7 days show rain.`,
    `${wet} dos próximos 7 dias mostram chuva.`
  ));
  else if(wet===0) parts.push(T2(
    `No rain in the seven-day window.`,
    `Sem chuva na janela de sete dias.`
  ));
  return parts.join(' ');
}

function skyPane(){
 synEnsure();                                   // pede o campo de pressão regional; o herói repinta-se quando chegar
 const p=patternDetect();
 return`<div class="pane exp">
 ${skyHero(p)}
 <section class="card expCard expNext"><h4>${SVG_CLOCK}${tr('Next 6 hours')}</h4>
  <div class="expNextBody"><p>${next6hText()}</p>
  <div class="expSpark"><h5>${T2('Pressure trend','Tendência da pressão')}</h5>${pressureSparkSVG()}</div></div></section>
 <div class="expGrid duo">
 <section class="card expCard"><h4>${SVG_CAL}${tr('This week in context')}</h4><p>${contextWeekText()}</p></section>
 <section class="card expCard"><h4>${SVG_PULSE}${T2('Signals right now','Sinais neste momento')}</h4><div class="expMetrics">${expMetricsHTML(p.s)}</div></section>
 </div>
 </div>`;
}
