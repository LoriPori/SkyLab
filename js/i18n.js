/* Skylab · i18n.js — PT/EN dictionaries, DOM translator, language switch · load order 05/28 (classic script, shared global scope) */
/* ============ idioma PT / EN ============ */
for(const m of['toLocaleString','toLocaleDateString','toLocaleTimeString']){
 const o=Date.prototype[m];
 Date.prototype[m]=function(l,...r){return o.call(this,l==='en'?LOC():l,...r)};   // datas no idioma ativo
}
const PT={
 /* topbar, landing, globo */
 'Search a city':'Pesquisar uma cidade','Install app':'Instalar app','Locate':'Localizar','Surprise':'Surpresa',
 'Jump to a place with interesting weather':'Saltar para um sítio com tempo interessante','Sound':'Som',
 'Ambient weather sound':'Som ambiente do tempo','Units':'Unidades',
 'Weather by Open-Meteo · Places by BigDataCloud · Pollen by Atmospore':'Meteorologia por Open-Meteo · Locais por BigDataCloud · Pólen por Atmospore',
 'Pressure & isobars by':'Pressão e isóbaras por',
 'The sky, explained.':'O céu, explicado.',
 'Live weather for anywhere on Earth, with the science behind what you’re looking at.':'Tempo em direto para qualquer ponto da Terra, com a ciência por trás do que estás a ver.',
 'Use my location':'Usar a minha localização','Surprise me':'Surpreende-me','Skylab — Weather & Science':'Skylab — Tempo e Ciência',
 'Interactive globe. Drag to rotate.':'Globo interativo. Arrasta para rodar.','You’re here':'Estás aqui','Near you':'Perto de ti',
 'Approximate, from your time zone. Use “Use my location” for the exact spot.':'Aproximado, a partir do teu fuso horário. Usa “Usar a minha localização” para o ponto exato.',
 'Tokyo':'Tóquio','New York':'Nova Iorque','Sydney':'Sidney','Reykjavík':'Reiquiavique','Cape Town':'Cidade do Cabo',
 /* IPMA */
 'IPMA warnings':'Avisos do IPMA','No active warnings for this area. ☀️':'Sem avisos ativos para esta zona. ☀️','Source: IPMA ↗':'Fonte: IPMA ↗',
 'No warnings':'Sem avisos','yellow':'amarelo','orange':'laranja','red':'vermelho',
 /* erros, localização, pesquisa, toasts */
 'Could not load the forecast':'Não foi possível carregar a previsão','You appear to be offline.':'Pareces estar sem ligação.',
 'Weather service unavailable':'Serviço meteorológico indisponível','Location isn’t supported':'A localização não é suportada',
 'This browser can’t share your location. Search for a city instead.':'Este navegador não consegue partilhar a tua localização. Pesquisa antes uma cidade.',
 'Finding you…':'A localizar-te…','Allow location access when your browser asks.':'Permite o acesso à localização quando o navegador perguntar.',
 'Location access is blocked':'O acesso à localização está bloqueado','Couldn’t get your location':'Não foi possível obter a tua localização',
 'Allow location for this page in your browser settings, or search for a city above.':'Permite a localização para esta página nas definições do navegador, ou pesquisa uma cidade acima.',
 'Try again, or search for a city above.':'Tenta de novo, ou pesquisa uma cidade acima.','Try my location again':'Tentar de novo a minha localização',
 'Your location':'A tua localização','No matches. Check the spelling.':'Sem resultados. Verifica a ortografia.',
 'Search is unavailable right now.':'A pesquisa não está disponível neste momento.',
 'Ambient sound off':'Som ambiente desligado','Ambient sound matches the weather':'O som ambiente acompanha o tempo','Refreshing…':'A atualizar…',
 'Loading…':'A carregar…','Loading map…':'A carregar o mapa…',
 /* tempo atmosférico */
 'Clear sky':'Céu limpo','Mostly clear':'Quase limpo','Partly cloudy':'Parcialmente nublado','Overcast':'Encoberto','Fog':'Nevoeiro',
 'Freezing fog':'Nevoeiro gelado','Light drizzle':'Chuvisco fraco','Drizzle':'Chuvisco','Heavy drizzle':'Chuvisco forte',
 'Freezing drizzle':'Chuvisco gelado','Light rain':'Chuva fraca','Rain':'Chuva','Heavy rain':'Chuva forte','Freezing rain':'Chuva gelada',
 'Light snow':'Neve fraca','Snow':'Neve','Heavy snow':'Neve forte','Snow grains':'Grãos de neve','Rain showers':'Aguaceiros',
 'Violent showers':'Aguaceiros violentos','Snow showers':'Aguaceiros de neve','Thunderstorm':'Trovoada','Thunderstorm with hail':'Trovoada com granizo',
 /* herói, separadores, hoje, semana */
 'Open in Science':'Abrir em Ciência','Save place':'Guardar local','Save this place':'Guardar este local','Remove from saved places':'Remover dos locais guardados',
 'Travel through the next 24 hours':'Viaja pelas próximas 24 horas','Drag to travel through the next 24 hours':'Arrasta para viajar pelas próximas 24 horas',
 'Now':'Agora','Today':'Hoje','Week':'Semana','Radar':'Radar','Air & pollen':'Ar e pólen','Science':'Ciência',
 'Dry for the next 2 hours':'Seco nas próximas 2 horas','Raining now':'A chover agora',
 'Comfort score':'Índice de conforto','Excellent':'Excelente','Comfortable':'Confortável','So-so':'Assim-assim','Rough':'Difícil',
 'Wind':'Vento','Humidity':'Humidade','Pressure':'Pressão','Sun and moon':'Sol e Lua','Best time outside:':'Melhor hora lá fora:',
 'Daylight has passed for today.':'O dia de sol já terminou por hoje.','Cooler':'Mais frio','Warmer':'Mais quente','▮ rain chance':'▮ prob. de chuva',
 'Temperature over the next 24 hours':'Temperatura nas próximas 24 horas','Sun position':'Posição do Sol','Next 24 hours':'Próximas 24 horas',
 'New moon':'Lua nova','Waxing crescent':'Lua crescente','First quarter':'Quarto crescente','Waxing gibbous':'Crescente gibosa','Full moon':'Lua cheia',
 'Waning gibbous':'Minguante gibosa','Last quarter':'Quarto minguante','Waning crescent':'Lua minguante',
 'Shorts and a light tee':'Calções e t-shirt leve','T-shirt weather':'Tempo de t-shirt','Long sleeves':'Mangas compridas','Warm jacket':'Casaco quente',
 'Heavy coat, hat, gloves':'Casaco grosso, gorro e luvas','Waterproof jacket':'Casaco impermeável','Take an umbrella':'Leva um guarda-chuva',
 'Sunscreen and sunglasses':'Protetor solar e óculos de sol','Sunglasses':'Óculos de sol','Windproof layer':'Camada corta-vento',
 'Drink plenty of water':'Bebe muita água','Ice risk outside':'Risco de gelo lá fora','Good for a walk':'Bom para passear',
 /* ar e pólen */
 'Air quality':'Qualidade do ar','Pollen & allergies':'Pólen e alergias','Good':'Bom','Fair':'Razoável','Moderate':'Moderado','Poor':'Mau',
 'Very poor':'Muito mau','Extremely poor':'Extremamente mau','Air is clean. Enjoy the outdoors.':'O ar está limpo. Aproveita o exterior.',
 'Fine for most people.':'Bom para a maioria das pessoas.','Sensitive people may notice effects.':'Pessoas sensíveis podem notar efeitos.',
 'Consider shorter time outside.':'Pondera passar menos tempo lá fora.','Limit strenuous outdoor activity.':'Limita a atividade física intensa ao ar livre.',
 'Stay indoors if you can.':'Fica em casa, se puderes.','Not available for this place right now.':'Indisponível para este local neste momento.',
 'None':'Nenhum','Low':'Baixo','High':'Alto','Very high':'Muito alto','Extreme':'Extremo',
 'Alder':'Amieiro','Birch':'Bétula','Grass':'Gramíneas','Mugwort':'Artemísia','Olive':'Oliveira','Ragweed':'Ambrósia',
 'Pollen is low across the board. A good day for allergy sufferers to be outside.':'O pólen está baixo em geral. Bom dia para alérgicos estarem ao ar livre.',
 'Rain is likely soon. It often rinses pollen out of the air, so levels can drop afterwards.':'É provável chuva em breve. Costuma lavar o pólen do ar, por isso os níveis podem descer depois.',
 'Dry and windy: pollen travels far today, and levels can peak around midday.':'Seco e ventoso: o pólen viaja longe hoje e os níveis podem atingir o pico por volta do meio-dia.',
 'Humid air makes pollen grains heavier, so they tend to settle closer to the ground.':'O ar húmido torna os grãos de pólen mais pesados, por isso tendem a assentar mais perto do chão.',
 'Calm, dry weather: pollen usually peaks from late morning to the afternoon. Mornings are gentler.':'Tempo calmo e seco: o pólen costuma atingir o pico do fim da manhã à tarde. As manhãs são mais suaves.',
 'Open-Meteo fallback · Europe only':'Alternativa Open-Meteo · só Europa',
 'Atmospore didn’t return usable data for this request. Check the browser console for details.':'A Atmospore não devolveu dados utilizáveis para este pedido. Vê a consola do navegador para mais detalhes.',
 'No pollen data is available for this location.':'Não há dados de pólen para este local.','Pollen data couldn’t be loaded right now.':'Não foi possível carregar os dados de pólen agora.',
 /* ciência */
 'Did you know':'Sabias que','Myth or fact':'Mito ou facto','Myth':'Mito','Fact':'Facto','Previous':'Anterior','Another':'Outro',
 'Next question':'Próxima pergunta','Correct.':'Certo.','Not quite.':'Quase.','The physics right now':'A física neste momento',
 'Dew point':'Ponto de orvalho','Dry and comfortable':'Seco e confortável','Pleasant':'Agradável','Slightly humid':'Ligeiramente húmido','Humid':'Húmido','Oppressive':'Abafado',
 'Cloud base':'Base das nuvens','Fog level':'Ao nível do nevoeiro','125 m per °C of spread':'125 m por °C de diferença','Wind chill':'Sensação de frio com vento',
 'Wind strips heat from skin':'O vento leva o calor da pele','Heat index':'Índice de calor','Humidity slows sweat':'A humidade atrasa o suor','Body heat':'Calor corporal',
 'Neutral':'Neutro','No chill or heat stress':'Sem stress de frio ou calor','Speed of sound':'Velocidade do som','Faster in warm air':'Mais rápido em ar quente',
 'Daylight':'Luz do dia','Low, unsettled':'Baixa, instável','High, settled':'Alta, estável','Near average':'Perto da média',
 'Optics':'Ótica','Astronomy':'Astronomia','Atmosphere':'Atmosfera','Fluid dynamics':'Dinâmica de fluidos','Chemistry':'Química','Meteorology':'Meteorologia',
 'Physics':'Física','Physiology':'Fisiologia','Thermodynamics':'Termodinâmica','Radiation':'Radiação',
 /* radar */
 'Weather radar map':'Mapa do radar meteorológico','Radar time':'Hora do radar','Pause':'Pausar','Play':'Reproduzir','Clouds':'Nuvens','Satellite':'Satélite',
 'Light':'Fraca','Heavy':'Forte','Rain rate':'Intensidade da chuva','light':'fraca','heavy':'forte','Current':'Atual','daily':'diário','Calm':'Calmo','Storm':'Tempestade',
 'Loading wind layer…':'A carregar a camada de vento…','Wind layer needs OWM_KEY in the worker.':'A camada de vento precisa da OWM_KEY no worker.',
 'Wind speed · OpenWeatherMap · updated regularly':'Velocidade do vento · OpenWeatherMap · atualizado regularmente',
 'Loading cloud layer…':'A carregar a camada de nuvens…','Global cloud cover · OpenWeatherMap · updated regularly':'Cobertura global de nuvens · OpenWeatherMap · atualizado regularmente',
 'Loading satellite frames…':'A carregar imagens de satélite…','Satellite imagery unavailable right now.':'Imagens de satélite indisponíveis neste momento.',
 'Temperature':'Temperatura','Loading temperature…':'A carregar a temperatura…','Temperature unavailable right now.':'Temperatura indisponível neste momento.',
 'Air temperature · Open-Meteo · hover for exact values':'Temperatura do ar · Open-Meteo · passa o rato para ver valores exatos',
 'Temperature data rate-limited — try again in a few minutes.':'Limite de pedidos atingido — tenta novamente dentro de alguns minutos.',
 'True-colour satellite · NASA VIIRS · global daily composite':'Satélite em cor real · NASA VIIRS · composição diária global',
 'Satellite rain estimate · worldwide · last ~6 h':'Estimativa de chuva por satélite · mundial · últimas ~6 h',
 /* alertas (notificações do navegador) */
 'High wind':'Vento forte','Extreme heat':'Calor extremo','Extreme cold':'Frio extremo','Very high UV':'UV muito alto','Rain approaching':'Chuva a aproximar-se',
 'Poor air quality':'Fraca qualidade do ar','High pollen':'Pólen elevado','Rain in the next hour':'Chuva na próxima hora',
 /* cartão de chuva */
 'Dismiss':'Fechar','Next 60 min':'Próximos 60 min',
 'Golden hour':'Hora dourada',
 'Stargazing index':'Índice de observação',
 'Optimal Seeing':'Visibilidade excelente',
 'Fair Seeing':'Visibilidade razoável',
 'Obscured / Hazy':'Encoberto / Turbulento',
 'Air density':'Densidade do ar',
 'Thin, low lift':'Rarefeito, menor sustentação',
 'Dense, high lift':'Denso, maior sustentação',
 'Standard atmosphere':'Atmosfera padrão',
 'Sign Up':'Criar Conta',
 'Barometric trend':'Tendência barométrica',
 'Falling rapidly (Front approaching)':'Queda rápida (Frente a aproximar-se)',
 'Falling (Unsettled)':'A descer (Instabilidade)',
 'Rising rapidly (High pressure)':'Subida rápida (Crista anticiclónica)',
 'Rising (Clearing)':'A subir (Céu a desanuviar)',
 'Steady (Stable mass)':'Estável (Massa de ar calma)',

 'Data by':'Dados por','Places by':'Locais por',
 'Source':'Fonte','Live':'Em direto','Stale data':'Dados desatualizados',

 'Sky Explained':'Céu Explicado','Next 6 hours':'Próximas 6 horas','This week in context':'Esta semana em contexto',
  
 'Forecast by':'Previsão do','based on':'baseada em',

 'Portugal':'Portugal','World':'Mundo','Scope':'Âmbito',
};
const FACTS_PT=[
 ['Porque é que o céu é azul','As moléculas do ar dispersam muito mais os comprimentos de onda curtos da luz solar do que os longos (dispersão de Rayleigh). O violeta dispersa-se ainda mais, mas o Sol emite menos dele e os nossos olhos respondem-lhe pouco, por isso vemos azul.'],
 ['Os pores do sol são vermelhos por uma razão','Ao pôr do sol, a luz atravessa muito mais atmosfera. A maior parte do azul é dispersada para fora do feixe pelo caminho, deixando os vermelhos e laranjas chegarem aos teus olhos.'],
 ['A luz do Sol tem 8 minutos','A luz do Sol demora cerca de 8 minutos e 20 segundos a chegar à Terra, por isso vês sempre o Sol como ele era há pouco tempo.'],
 ['A luz das estrelas é notícia velha','A luz da Lua demora cerca de 1,3 segundos a chegar até ti. A da estrela mais próxima, além do Sol, demora mais de quatro anos, por isso estás a ver o passado.'],
 ['Porque é que as estrelas cintilam','O ar turbulento desvia a luz das estrelas na descida, fazendo o ponto de luz tremeluzir. Os planetas cintilam menos porque são pequenos discos, não pontos.'],
 ['A Lua está a afastar-se','Afasta-se cerca de 3,8 cm da Terra por ano, mais ou menos à velocidade a que crescem as unhas.'],
 ['Uma nuvem é pesada','Um cúmulo típico de bom tempo contém cerca de 500 toneladas de água, sustentadas por ar ascendente e por gotículas tão pequenas que caem muito lentamente.'],
 ['Porque é que as nuvens parecem brancas','As gotículas de água dispersam todos os comprimentos de onda visíveis de forma quase igual, por isso a luz solar continua branca. As nuvens espessas parecem cinzentas porque pouca luz atravessa a base.'],
 ['As gotas de chuva não têm forma de lágrima','As gotas pequenas são quase esféricas. As maiores achatam-se numa forma de pão de hambúrguer à medida que o ar as empurra por baixo.'],
 ['O cheiro da chuva','O petricor vem dos óleos libertados pelas plantas e da geosmina, um composto produzido por bactérias do solo. As gotas, ao bater no chão seco, lançam-no para o ar.'],
 ['As gotas de chuva caem depressa','Uma gota grande atinge cerca de 9 m/s, aproximadamente 30 km/h. O chuvisco desce a menos de 1 m/s.'],
 ['A neve é branca, o gelo é azul','Os cristais de gelo dispersam todas as cores por igual, por isso a neve parece branca. O gelo espesso e transparente absorve um pouco de luz vermelha e mostra um azul ténue.'],
 ['Não há dois flocos de neve iguais','Cada cristal segue um caminho ligeiramente diferente de temperatura e humidade na queda, o que lhe dá uma forma única.'],
 ['O relâmpago é mais quente do que o Sol','Um canal de relâmpago atinge brevemente cerca de 30 000 °C, aproximadamente cinco vezes mais quente do que a superfície do Sol. O ar explode para fora: isso é o trovão.'],
 ['Conta até ao trovão','O som percorre cerca de 1 km em 3 segundos. Conta os segundos entre o clarão e o estrondo, divide por três e tens a distância em quilómetros.'],
 ['O nevoeiro é uma nuvem ao nível do chão','Forma-se como qualquer nuvem: o ar arrefece até ao ponto de orvalho e o vapor de água condensa-se em partículas minúsculas.'],
 ['O calor húmido custa mais do que o calor seco','À mesma temperatura, a humidade elevada atrasa a evaporação do suor, e o corpo não consegue libertar calor com tanta eficiência.'],
 ['Porque é que o ar frio parece seco','O ar frio comporta muito menos vapor de água. Se o aqueceres dentro de casa sem lhe juntar humidade, a humidade relativa desce bastante.'],
 ['As nuvens não bloqueiam todos os UV','Até 80% dos raios UV atravessam uma cobertura de nuvens ligeira, por isso dias nublados também podem queimar a pele.']
];

const firstS=s=>s.split('. ')[0].replace(/\.$/,'')+'.';          // o ticker mostra só a 1.ª frase do facto
FACTS.forEach((f,i)=>{const p=f[5]||FACTS_PT[i];if(p){PT[f[1]]=p[0];PT[f[2]]=p[1];PT[firstS(f[2])]=firstS(p[1])}});
QZ.forEach((z,i)=>{const p=z[3];if(p){PT[z[0]]=p[0];PT[z[2]]=p[1]}});
DAILY.forEach(f=>{PT[f[1]]=f[3][0];PT[f[2]]=f[3][1]});
Object.assign(PT,{ 'Fact of the day':'Facto do dia','See result':'Ver resultado','Play again':'Jogar outra vez',
 'Flawless. You could be on the forecasting desk.':'Impecável. Já podias estar na redação do tempo.',
 'Brilliant. Hardly any myth got past you.':'Brilhante. Quase nenhum mito te enganou.',
 'Solid. A few myths slipped through, and now you know.':'Bom resultado. Alguns mitos escaparam, e agora já sabes.',
 'Not bad. Weather myths are sneaky.':'Nada mau. Os mitos do tempo são traiçoeiros.',
  'The weather is full of surprises. Give it another go!':'O tempo está cheio de surpresas. Tenta outra vez!','Biology':'Biologia','Climate':'Clima','Planetary science':'Ciência planetária','Oceanography':'Oceanografia','Atmosphere':'Atmosfera','Meteorology':'Meteorologia','Physics':'Física','Thermodynamics':'Termodinâmica','Optics':'Ótica','Chemistry':'Química','Radiation':'Radiação','Astronomy':'Astronomia',
 'Precipitation forecast for the next 2 hours':'Previsão de precipitação para as próximas 2 horas',
 'Rain for the next 2 hours':'Chuva nas próximas 2 horas','Light rain expected':'Chuva fraca prevista',
 'Moderate rain expected':'Chuva moderada prevista','Heavy rain expected':'Chuva forte prevista',
 'Wind speed (colours) and direction (moving particles) · OpenWeatherMap + Open-Meteo':'Velocidade do vento (cores) e direção (partículas em movimento) · OpenWeatherMap + Open-Meteo',});
const LOW={};Object.values(LABEL).forEach(en=>{if(PT[en])LOW[en.toLowerCase()]=PT[en].toLowerCase()});
const TW={Freezing:'Gelado',Cold:'Frio',Cool:'Fresco',Mild:'Ameno',Warm:'Quente',Hot:'Muito quente'};
const WW={'calm':'calmo','a light breeze':'com brisa ligeira','breezy':'com vento moderado','windy':'ventoso','gusty':'com rajadas'};
const RCP={'within the hour':'com chuva provável na próxima hora','later today':'com chuva provável mais tarde','this evening':'com chuva provável ao fim do dia'};
const UVL={Low:'Baixo',Moderate:'Moderado',High:'Alto','Very high':'Muito alto',Extreme:'Extremo'};
const onD=x=>x=='today'?'hoje':/^(sábado|domingo)/i.test(x)?'no '+x:'na '+x;
const dec=s=>String(s).replace('.',',');
const polN=n=>{const c=n[0].toUpperCase()+n.slice(1);return PT[c]||c};
const PT_RX=[
 [/^Question (\d+) of (\d+)$/,'Pergunta $1 de $2'],
 [/^(Freezing|Cold|Cool|Mild|Warm|Hot) and (calm|a light breeze|breezy|windy|gusty), (.+?)(, rain falling now|, with rain likely (within the hour|later today|this evening))?\.$/,
  (m,a,b,c,rc,w)=>`${TW[a]} e ${WW[b]}, ${LOW[c]||c}${rc?(w?', '+RCP[w]:', a chover agora'):''}.`],
 [/^Feels like (-?\d+)° · High (-?\d+)° · Low (-?\d+)°$/,'Sensação de $1° · Máx. $2° · Mín. $3°'],
 [/^(\d+)% chance of rain$/,'$1% de probabilidade de chuva'],
 [/^(\d+)% rain chance in the next 3 hours$/,'$1% de probabilidade de chuva nas próximas 3 horas'],
 [/^Rain in about (\d+) min$/,'Chuva dentro de cerca de $1 min'],
 [/^This week: (?:snow arrives (.+?)|rain arrives (.+?)|skies stay dry all week)\. Warmest (.+) at (-?\d+)°, coolest (.+) at (-?\d+)°\.$/,
  (m,sn,rn,w,a,c,b)=>`Esta semana: ${sn?'neve '+onD(sn):rn?'chuva '+onD(rn):'o céu mantém-se limpo toda a semana'}. Mais quente ${onD(w)}, ${a}°; mais frio ${onD(c)}, ${b}°.`],
 [/^(\d+)% illuminated$/,'$1% iluminada'],
 [/^UV · (Low|Moderate|High|Very high|Extreme)$/,(m,l)=>'UV · '+UVL[l]],
 [/^(.*?)\s*· (\d+)% rain$/,(m,a,b)=>`${a?a+' ':''}· ${b}% de chuva`],
 [/^Comfort score (\d+) out of 100$/,'Índice de conforto $1 em 100'],
 [/^Air quality index (\d+)$/,'Índice de qualidade do ar $1'],
 [/^Tomorrow (\+|−)(\d+)s$/,'Amanhã $1$2 s'],
 [/^Next (\d+) days$/,'Próximos $1 dias'],
 [/^(\d+) right of (\d+)$/,'$1 certas em $2'],
 [/^(.+) pollen is running high\. Keep windows closed, consider an antihistamine before symptoms start, and shower after time outdoors\.$/,
  (m,n)=>`Pólen elevado (${polN(n.toLowerCase()).toLowerCase()}). Mantém as janelas fechadas, pondera tomar um anti-histamínico antes de os sintomas começarem e toma banho depois de estares ao ar livre.`],
 [/^Pollen is moderate, led by (.+)\. Sensitive people may notice mild symptoms\.$/,
  (m,n)=>`Pólen moderado, sobretudo de ${polN(n).toLowerCase()}. Pessoas sensíveis podem notar sintomas ligeiros.`],
 [/^(.*) · now$/,'$1 · agora'],[/^(.*) · (\d+) min ago$/,'$1 · há $2 min'],[/^(.*) · ([\d.]+) h ago$/,'$1 · há $2 h'],
 [/^Loading frames (\d+)\/(\d+)…$/,'A carregar imagens $1/$2…'],
 [/^Units: (.*)$/,'Unidades: $1'],
 [/^(\d+) warnings?$/,(m,n)=>`${n} aviso${n=='1'?'':'s'}`],
 [/^Open the forecast for (.+)$/,'Abrir a previsão de $1'],
 [/^(.*) Check your connection and try again\.$/,(m,a)=>`${PT[a]||a} Verifica a ligação e tenta novamente.`],
 [/^(Light|Moderate|Heavy) rain · up to ([\d.]+) mm\/h$/,(m,l,v)=>`Chuva ${l=='Light'?'fraca':l=='Moderate'?'moderada':'forte'} · até ${dec(v)} mm/h`],
 /* corpo das notificações */
 [/^Thunderstorm activity at (.+)\. Stay away from open ground and tall objects\.$/,'Atividade de trovoada em $1. Afasta-te de terrenos abertos e de objetos altos.'],
 [/^Heavy rain at (.+)\. Watch for flooded roads\.$/,'Chuva forte em $1. Atenção a estradas inundadas.'],
 [/^Heavy snow at (.+)\. Allow extra travel time\.$/,'Neve forte em $1. Conta com mais tempo de viagem.'],
 [/^Wind near (.+) at (.+)\. Secure loose objects\.$/,'Vento perto de $1 em $2. Prende os objetos soltos.'],
 [/^(-?\d+)° at (.+)\. Drink water and avoid the midday sun\.$/,'$1° em $2. Bebe água e evita o sol do meio-dia.'],
 [/^(-?\d+)° at (.+)\. Limit time outside and cover exposed skin\.$/,'$1° em $2. Limita o tempo lá fora e cobre a pele exposta.'],
 [/^UV index (\d+) today in (.+)\. Use sunscreen and seek shade\.$/,'Índice UV $1 hoje em $2. Usa protetor solar e procura sombra.'],
 [/^Heavy rain is likely within a few hours in (.+)\.$/,'É provável chuva forte dentro de poucas horas em $1.'],
 [/^Air quality index is (\d+) in (.+)\. Limit outdoor exertion\.$/,'O índice de qualidade do ar é $1 em $2. Limita o esforço ao ar livre.'],
 [/^(Low|Moderate|High|Very high) pollen risk in (.+?)(?:, led by (.+?))?\. Keep windows closed if you are allergic\.$/,
  (m,l,p,t)=>`Risco de pólen ${(UVL[l]||l).toLowerCase()} em ${p}${t?', sobretudo de '+polN(t).toLowerCase():''}. Mantém as janelas fechadas se fores alérgico.`],
 [/^It is raining at (.+)\.$/,'Está a chover em $1.'],
 [/^Rain expected at (.+) in about (\d+) min\.$/,'Chuva prevista em $1 dentro de cerca de $2 min.'],
 [/^Rain stops in about (\d+) min$/,'A chuva pára dentro de cerca de $1 min'],
];

/* nomes de pólen (Atmospore) → PT; comparação sem distinguir maiúsculas */
const PT_POLLEN={
 'Birch':'Bétula','Birch family':'Família da bétula','Hazel':'Aveleira','Alder':'Amieiro',
 'Pine':'Pinheiro','Spruce':'Abeto','Pine family':'Família do pinheiro',
 'Elm':'Ulmeiro','Willow':'Salgueiro','Oak':'Carvalho','Maple':'Bordo','Poplar':'Choupo',
 'Cypress':'Cipreste','Plane tree':'Plátano','Ash':'Freixo',
 'Timothy Grass':'Rabo-de-gato','Ryegrass':'Azevém',
 'Cock\'s-foot':'Panasco','Cock’s-foot':'Panasco',
 'False Oat-grass':'Aveia-Perene','Bluegrass':'Capim-Azul',
 'Nettle':'Urtiga','Mugwort':'Artemísia','Ragweed':'Ambrósia',
 'Very low':'Muito baixo',
 'Bermuda Grass':'Relva Bermuda'
};
const PTL=Object.fromEntries(Object.entries(PT_POLLEN).map(([k,v])=>[k.toLowerCase(),v]));

function trStr(s){
 if(LANG!='pt'||!/[A-Za-z]/.test(s))return s;
 const d=PT[s];if(d!==undefined)return d;
 const pl=PTL[s.toLowerCase()];if(pl!==undefined)return pl;
 for(const[rx,f]of PT_RX){const m=s.match(rx);if(m)return typeof f=='function'?f(...m):s.replace(rx,f)}
 return s;
}
const tr=trStr;

/* tradutor do DOM: guarda o inglês original de cada nó e reaplica ao mudar de idioma */
const ORIG=new WeakMap(),AORIG=new WeakMap(),TR_ATTRS=['placeholder','title','aria-label'];
function trText(n){
 if(!n.parentNode||/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName))return;
 const raw=n.nodeValue,rec=ORIG.get(n),en=rec&&raw===rec.pt?rec.en:raw;
 if(LANG!='pt'){if(en!==raw)n.nodeValue=en;ORIG.delete(n);return}
 const m=en.match(/^(\s*)([\s\S]*?)(\s*)$/);
 if(!m[2])return;
 const pt=trStr(m[2]);
 if(pt===m[2]){ORIG.delete(n);return}
 const out=m[1]+pt+m[3];ORIG.set(n,{en,pt:out});
 if(out!==raw)n.nodeValue=out;
}
function trAttr(el,a){
 const v=el.getAttribute(a);if(v==null)return;
 const o=AORIG.get(el)||{},rec=o[a],en=rec&&v===rec.pt?rec.en:v,pt=trStr(en);
 if(pt!==en)o[a]={en,pt};else delete o[a];
 AORIG.set(el,o);if(pt!==v)el.setAttribute(a,pt);
}
function trTree(root){
 if(root.nodeType==3)return trText(root);
 if(root.nodeType!=1)return;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let n;while((n=w.nextNode()))trText(n);
 const els=root.querySelectorAll?[...root.querySelectorAll('[placeholder],[title],[aria-label]')]:[];
 if(root.matches&&root.matches('[placeholder],[title],[aria-label]'))els.push(root);
 els.forEach(el=>TR_ATTRS.forEach(a=>trAttr(el,a)));
}
let indRaf=0;
new MutationObserver(ms=>{
 for(const m of ms){
  if(m.type=='characterData')trText(m.target);
  else if(m.type=='attributes')trAttr(m.target,m.attributeName);
  else m.addedNodes.forEach(trTree);
 }
 if(!indRaf)indRaf=requestAnimationFrame(()=>{indRaf=0;moveInd()});          // as abas mudam de largura
}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:TR_ATTRS});

function paintLang(swap){
 const i=$('#lngi'),t=$('#lngt'),b=$('#lng');if(!i)return;
 i.src=LANG=='pt'?'portugal-icon.png':'us-icon.png';
 t.textContent=LANG.toUpperCase();
 b.title=b.ariaLabel=LANG=='pt'?'Switch to English':'Mudar para português';
 if(swap&&!still){i.classList.remove('swap');void i.offsetWidth;i.classList.add('swap')}
}
function setLang(l){
 if(l==LANG)return;
 LANG=l;lsSet('lang',l);document.documentElement.lang=l;
  setUnit(l=='pt'?'c':'f',true,true);   // o idioma define as unidades (o botão °C/°F continua a poder mudá-las)
 trTree(document.body);paintLang(true);
 if(data)render();else if(!place&&$('#hero')&&$('#hero').classList.contains('land'))landing();
}
$('#lng').onclick=()=>setLang(LANG=='pt'?'en':'pt');
paintLang();trTree(document.body);
