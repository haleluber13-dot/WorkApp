/* MotorLab — world motorsport atlas.
 * Circuits and events across every discipline, with approximate coordinates so
 * they can be plotted on the world map. Calendars move every year — this is a
 * reference atlas of where the racing happens, not a ticketing schedule, and
 * it can be extended or replaced from the Updates channel.
 */

export const DISCIPLINES = [
  { id:'f1',       name:'Formula 1 & open-wheel', colour:'#e10600', icon:'🏎' },
  { id:'endur',    name:'Endurance & sports car', colour:'#22d3ee', icon:'🕛' },
  { id:'stock',    name:'Stock car & touring',    colour:'#ffc53d', icon:'🅿' },
  { id:'rally',    name:'Rally & off-road',       colour:'#8b6f3f', icon:'🌲' },
  { id:'moto',     name:'Motorcycle road racing', colour:'#3ddc84', icon:'🏍' },
  { id:'motocross',name:'Motocross & supercross', colour:'#c86bd6', icon:'⛰' },
  { id:'kart',     name:'Karting',                colour:'#ff7a1a', icon:'🛞' },
  { id:'drift',    name:'Drifting',               colour:'#ff5a5a', icon:'💨' },
  { id:'drag',     name:'Drag racing',            colour:'#f2f2f2', icon:'⏱' },
  { id:'hill',     name:'Hillclimb & time attack',colour:'#7ea6ff', icon:'⛰' },
  { id:'ev',       name:'Electric & alternative', colour:'#4fd9a0', icon:'⚡' },
];
export const DISCIPLINE_BY_ID = Object.fromEntries(DISCIPLINES.map(d => [d.id, d]));

const R = (o) => Object.assign({ discipline:'f1', month:6, surface:'asphalt' }, o);

export const RACES = [
  /* ---------------- Formula 1 & open-wheel ---------------- */
  R({ id:'monaco', name:'Monaco Grand Prix', series:'Formula 1', circuit:'Circuit de Monaco', country:'Monaco', city:'Monte Carlo', lat:43.7347, lon:7.4206, lengthKm:3.337, turns:19, month:5, notes:'The slowest, tightest and most famous street circuit in the world. Downforce and mechanical grip matter; top speed barely does.' }),
  R({ id:'monza', name:'Italian Grand Prix', series:'Formula 1', circuit:'Autodromo Nazionale di Monza', country:'Italy', city:'Monza', lat:45.6156, lon:9.2811, lengthKm:5.793, turns:11, month:9, notes:'The Temple of Speed — lowest-downforce setup of the year, over 78% of the lap at full throttle.' }),
  R({ id:'spa', name:'Belgian Grand Prix', series:'Formula 1', circuit:'Spa-Francorchamps', country:'Belgium', city:'Stavelot', lat:50.4372, lon:5.9714, lengthKm:7.004, turns:19, month:7, notes:'Eau Rouge/Raidillon is a 40 m elevation change taken flat. Weather differs at opposite ends of the lap.' }),
  R({ id:'silverstone', name:'British Grand Prix', series:'Formula 1', circuit:'Silverstone', country:'United Kingdom', city:'Silverstone', lat:52.0733, lon:-1.0147, lengthKm:5.891, turns:18, month:7, notes:'Fast, flowing and hard on front-left tyres. Copse and Maggotts–Becketts are among the fastest corners in racing.' }),
  R({ id:'suzuka', name:'Japanese Grand Prix', series:'Formula 1', circuit:'Suzuka', country:'Japan', city:'Suzuka', lat:34.8431, lon:136.5410, lengthKm:5.807, turns:18, month:4, notes:'The only figure-of-eight layout on the calendar and widely considered the best driver\'s circuit anywhere.' }),
  R({ id:'interlagos', name:'São Paulo Grand Prix', series:'Formula 1', circuit:'Interlagos', country:'Brazil', city:'São Paulo', lat:-23.7036, lon:-46.6997, lengthKm:4.309, turns:15, month:11, notes:'Anti-clockwise, bumpy, 800 m above sea level — thin air costs turbocharged engines noticeably less than it used to.' }),
  R({ id:'cota', name:'United States Grand Prix', series:'Formula 1', circuit:'Circuit of the Americas', country:'United States', city:'Austin', lat:30.1328, lon:-97.6411, lengthKm:5.513, turns:20, month:10, notes:'Turn 1 climbs 40 m to a blind apex; the esses are modelled on Silverstone\'s Maggotts sequence.' }),
  R({ id:'marina', name:'Abu Dhabi Grand Prix', series:'Formula 1', circuit:'Yas Marina', country:'United Arab Emirates', city:'Abu Dhabi', lat:24.4672, lon:54.6031, lengthKm:5.281, turns:16, month:12, notes:'Day-to-night race — track temperature drops through the event and grip climbs with it.' }),
  R({ id:'indy500', name:'Indianapolis 500', series:'IndyCar', circuit:'Indianapolis Motor Speedway', country:'United States', city:'Speedway, Indiana', lat:39.7950, lon:-86.2347, lengthKm:4.023, turns:4, month:5, notes:'200 laps of a 2.5-mile rectangular oval. Qualifying is four laps flat out with the car trimmed to almost no downforce.' }),
  R({ id:'longbeach', name:'Grand Prix of Long Beach', series:'IndyCar', circuit:'Long Beach street course', country:'United States', city:'Long Beach', lat:33.7650, lon:-118.1890, lengthKm:3.167, turns:11, month:4, notes:'The longest-running street race in North America, run on closed public roads by the harbour.' }),
  R({ id:'macau', name:'Macau Grand Prix', series:'Formula Regional / GT', circuit:'Guia Circuit', country:'Macau', city:'Macau', lat:22.1969, lon:113.5470, lengthKm:6.120, turns:22, month:11, notes:'A street circuit with a 2 km straight and a section barely wider than a car. Legendary and unforgiving.' }),
  R({ id:'pau', name:'Pau Grand Prix', series:'Formula Regional', circuit:'Circuit de Pau-Ville', country:'France', city:'Pau', lat:43.2951, lon:-0.3707, lengthKm:2.760, turns:15, month:5, notes:'Street racing in the Pyrenees since 1933 — one of the oldest continuously used road circuits in the world.' }),

  /* ---------------- Endurance & sports car ---------------- */
  R({ discipline:'endur', id:'lemans', name:'24 Hours of Le Mans', series:'FIA WEC', circuit:'Circuit de la Sarthe', country:'France', city:'Le Mans', lat:47.9560, lon:0.2074, lengthKm:13.626, turns:38, month:6, notes:'The oldest active endurance race. Mulsanne straight runs on public road; hybrid prototypes cover over 5,000 km in a day.' }),
  R({ discipline:'endur', id:'daytona24', name:'Rolex 24 at Daytona', series:'IMSA', circuit:'Daytona International Speedway', country:'United States', city:'Daytona Beach', lat:29.1852, lon:-81.0698, lengthKm:5.729, turns:12, month:1, notes:'31° banking joined to an infield road course. Opens the sports-car season in January.' }),
  R({ discipline:'endur', id:'nur24', name:'Nürburgring 24 Hours', series:'NLS / N24', circuit:'Nürburgring Nordschleife', country:'Germany', city:'Nürburg', lat:50.3356, lon:6.9475, lengthKm:25.378, turns:154, month:5, notes:'The Green Hell. 25 km, 300 m of elevation change, up to 170 cars of wildly different speed on track at once.' }),
  R({ discipline:'endur', id:'spa24', name:'Spa 24 Hours', series:'GT World Challenge', circuit:'Spa-Francorchamps', country:'Belgium', city:'Stavelot', lat:50.4372, lon:5.9714, lengthKm:7.004, turns:19, month:7, notes:'The blue-riband GT3 endurance race — usually run in at least three different weather conditions.' }),
  R({ discipline:'endur', id:'bathurst', name:'Bathurst 1000', series:'Supercars', circuit:'Mount Panorama', country:'Australia', city:'Bathurst', lat:-33.4479, lon:149.5556, lengthKm:6.213, turns:23, month:10, notes:'174 m of elevation change over a public-road mountain circuit. The Esses across the top are barely car-width.' }),
  R({ discipline:'endur', id:'sebring', name:'12 Hours of Sebring', series:'IMSA', circuit:'Sebring International Raceway', country:'United States', city:'Sebring', lat:27.4547, lon:-81.3483, lengthKm:6.019, turns:17, month:3, notes:'Run partly on old WWII airfield concrete. The bumps destroy cars that survive everything else.' }),
  R({ discipline:'endur', id:'petit', name:'Petit Le Mans', series:'IMSA', circuit:'Road Atlanta', country:'United States', city:'Braselton', lat:34.1481, lon:-83.8161, lengthKm:4.088, turns:12, month:10, notes:'Ten hours or 1,000 miles. The blind downhill esses are among the fastest corners in North America.' }),
  R({ discipline:'endur', id:'fuji', name:'6 Hours of Fuji', series:'FIA WEC', circuit:'Fuji Speedway', country:'Japan', city:'Oyama', lat:35.3717, lon:138.9267, lengthKm:4.563, turns:16, month:9, notes:'A 1.5 km straight under Mount Fuji, and weather that changes on the mountain without warning.' }),

  /* ---------------- Stock car & touring ---------------- */
  R({ discipline:'stock', id:'daytona500', name:'Daytona 500', series:'NASCAR Cup', circuit:'Daytona International Speedway', country:'United States', city:'Daytona Beach', lat:29.1852, lon:-81.0698, lengthKm:4.023, turns:4, month:2, notes:'Restrictor-plate style superspeedway racing — 40 cars inches apart at 320 km/h, drafting decides everything.' }),
  R({ discipline:'stock', id:'talladega', name:'Talladega Superspeedway', series:'NASCAR Cup', circuit:'Talladega', country:'United States', city:'Lincoln, Alabama', lat:33.5686, lon:-86.0661, lengthKm:4.281, turns:4, month:4, notes:'The longest and fastest oval in NASCAR, with 33° banking.' }),
  R({ discipline:'stock', id:'bristol', name:'Bristol Night Race', series:'NASCAR Cup', circuit:'Bristol Motor Speedway', country:'United States', city:'Bristol, Tennessee', lat:36.5156, lon:-82.2569, lengthKm:0.858, turns:4, month:9, notes:'A half-mile concrete bowl with 28° banking — a lap takes about 15 seconds and contact is constant.' }),
  R({ discipline:'stock', id:'nordschleife-nls', name:'Nürburgring Langstrecken Serie', series:'NLS', circuit:'Nordschleife', country:'Germany', city:'Nürburg', lat:50.3356, lon:6.9475, lengthKm:24.358, turns:154, month:4, notes:'Nine rounds a year on the Nordschleife, from production classes to full GT3.' }),
  R({ discipline:'stock', id:'wtcr-hungaroring', name:'TCR World Tour Hungary', series:'TCR', circuit:'Hungaroring', country:'Hungary', city:'Mogyoród', lat:47.5789, lon:19.2486, lengthKm:4.381, turns:14, month:5, notes:'Front-drive touring cars on a tight, twisty, dusty circuit — brake and tyre management is the whole race.' }),
  R({ discipline:'stock', id:'supergt-fuji', name:'Super GT Fuji 500', series:'Super GT', circuit:'Fuji Speedway', country:'Japan', city:'Oyama', lat:35.3717, lon:138.9267, lengthKm:4.563, turns:16, month:5, notes:'GT500 hybrids and GT300 cars sharing a track with an enormous performance gap — traffic is the art form.' }),
  R({ discipline:'stock', id:'dtm-norisring', name:'DTM Norisring', series:'DTM', circuit:'Norisring', country:'Germany', city:'Nuremberg', lat:49.4269, lon:11.1236, lengthKm:2.300, turns:6, month:7, notes:'A street circuit around a grandstand, essentially two straights and three corners. Brutal on brakes.' }),

  /* ---------------- Rally & off-road ---------------- */
  R({ discipline:'rally', id:'montecarlo', name:'Rallye Monte-Carlo', series:'WRC', circuit:'Alpine tarmac & ice stages', country:'Monaco / France', city:'Gap', lat:44.5594, lon:6.0794, lengthKm:300, turns:0, month:1, surface:'tarmac/ice', notes:'The season opener. Ice, snow and dry tarmac can occur inside a single stage — tyre choice wins or loses it.' }),
  R({ discipline:'rally', id:'safari', name:'Safari Rally Kenya', series:'WRC', circuit:'Naivasha gravel stages', country:'Kenya', city:'Naivasha', lat:-0.7167, lon:36.4333, lengthKm:350, turns:0, month:3, surface:'gravel', notes:'Rough, rocky and hot. Cars are raised, strengthened and driven to survive rather than to be fastest.' }),
  R({ discipline:'rally', id:'finland', name:'Rally Finland', series:'WRC', circuit:'Jyväskylä gravel stages', country:'Finland', city:'Jyväskylä', lat:62.2426, lon:25.7473, lengthKm:320, turns:0, month:8, surface:'gravel', notes:'The fastest rally in the world — smooth gravel roads with crests that launch cars 40 m through the air.' }),
  R({ discipline:'rally', id:'wales', name:'Rally GB / Wales', series:'WRC', circuit:'Welsh forest stages', country:'United Kingdom', city:'Llandudno', lat:53.3241, lon:-3.8276, lengthKm:300, turns:0, month:10, surface:'gravel', notes:'Wet forest gravel with deep ruts. Traditionally the muddiest event of the year.' }),
  R({ discipline:'rally', id:'dakar', name:'Dakar Rally', series:'FIA/FIM Cross-Country', circuit:'Desert marathon', country:'Saudi Arabia', city:'Riyadh', lat:24.7136, lon:46.6753, lengthKm:8000, turns:0, month:1, surface:'desert', notes:'Two weeks and 8,000 km through dunes and rock, for cars, trucks, bikes and quads together.' }),
  R({ discipline:'rally', id:'baja1000', name:'Baja 1000', series:'SCORE', circuit:'Baja California peninsula', country:'Mexico', city:'Ensenada', lat:31.8667, lon:-116.5964, lengthKm:1300, turns:0, month:11, surface:'desert', notes:'A single continuous run down the peninsula, often over 1,000 miles without a stage break.' }),
  R({ discipline:'rally', id:'rallycross-holjes', name:'World RX of Sweden', series:'World Rallycross', circuit:'Höljes', country:'Sweden', city:'Höljes', lat:60.9000, lon:12.6167, lengthKm:1.207, turns:11, month:7, surface:'mixed', notes:'Mixed gravel and tarmac, five cars side by side, 0–100 km/h in under two seconds.' }),
  R({ id:'pikespeak', name:'Pikes Peak International Hill Climb', series:'PPIHC', circuit:'Pikes Peak Highway', country:'United States', city:'Colorado Springs', lat:38.8409, lon:-105.0442, lengthKm:19.99, turns:156, month:6, surface:'tarmac', discipline:'hill', notes:'156 corners climbing to 4,302 m. Naturally aspirated engines lose a third of their power by the summit.' }),

  /* ---------------- Motorcycle road racing ---------------- */
  R({ id:'mugello', name:'Italian Motorcycle Grand Prix', series:'MotoGP', circuit:'Mugello', country:'Italy', city:'Scarperia', lat:43.9975, lon:11.3719, lengthKm:5.245, turns:15, month:6, discipline:'moto', notes:'A 1.14 km downhill straight where MotoGP bikes exceed 360 km/h, into a first-gear corner.' }),
  R({ id:'assen', name:'Dutch TT', series:'MotoGP', circuit:'TT Circuit Assen', country:'Netherlands', city:'Assen', lat:52.9622, lon:6.5236, lengthKm:4.542, turns:18, month:6, discipline:'moto', notes:'The Cathedral — the only circuit to have hosted a grand prix every year since the championship began in 1949.' }),
  R({ id:'phillipisland', name:'Australian Motorcycle Grand Prix', series:'MotoGP', circuit:'Phillip Island', country:'Australia', city:'Phillip Island', lat:-38.4990, lon:145.2317, lengthKm:4.448, turns:12, month:10, discipline:'moto', notes:'Fast, flowing, coastal and cold. Left-hand tyre temperature is a genuine safety problem here.' }),
  R({ id:'jerez', name:'Spanish Motorcycle Grand Prix', series:'MotoGP', circuit:'Circuito de Jerez', country:'Spain', city:'Jerez de la Frontera', lat:36.7083, lon:-6.0342, lengthKm:4.423, turns:13, month:4, discipline:'moto', notes:'Stop-and-go, hard on the rear tyre, and traditionally the biggest crowd of the season.' }),
  R({ id:'sachsenring', name:'German Motorcycle Grand Prix', series:'MotoGP', circuit:'Sachsenring', country:'Germany', city:'Hohenstein-Ernstthal', lat:50.7917, lon:12.6889, lengthKm:3.671, turns:13, month:7, discipline:'moto', notes:'Ten left-handers and three rights — the right side of the tyre never gets warm.' }),
  R({ id:'iomtt', name:'Isle of Man TT', series:'Road racing', circuit:'Snaefell Mountain Course', country:'Isle of Man', city:'Douglas', lat:54.1509, lon:-4.4813, lengthKm:60.725, turns:219, month:6, discipline:'moto', notes:'60 km of public road, stone walls and houses, at an average over 220 km/h. The most dangerous motorsport event still run.' }),
  R({ id:'suzuka8', name:'Suzuka 8 Hours', series:'FIM EWC', circuit:'Suzuka', country:'Japan', city:'Suzuka', lat:34.8431, lon:136.5410, lengthKm:5.807, turns:18, month:7, discipline:'moto', notes:'Endurance superbike racing in Japanese summer heat, ending after dark. The biggest race of the year for Japanese manufacturers.' }),
  R({ id:'wsbk-portimao', name:'WorldSBK Portimão', series:'WorldSBK', circuit:'Autódromo do Algarve', country:'Portugal', city:'Portimão', lat:37.2317, lon:-8.6289, lengthKm:4.592, turns:15, month:3, discipline:'moto', notes:'Blind crests and severe elevation change — riders describe it as a rollercoaster.' }),
  R({ id:'daytona200', name:'Daytona 200', series:'MotoAmerica', circuit:'Daytona road course', country:'United States', city:'Daytona Beach', lat:29.1852, lon:-81.0698, lengthKm:4.827, turns:12, month:3, discipline:'moto', notes:'Banking plus infield, run since 1937. Tyre wear on the banking sets the whole race strategy.' }),

  /* ---------------- Motocross & supercross ---------------- */
  R({ id:'mxgp-matterley', name:'MXGP of Great Britain', series:'MXGP', circuit:'Matterley Basin', country:'United Kingdom', city:'Winchester', lat:51.0700, lon:-1.2400, lengthKm:1.7, turns:0, month:2, surface:'dirt', discipline:'motocross', notes:'A natural amphitheatre with huge elevation change — one of the best spectator venues in motocross.' }),
  R({ id:'mxgp-lommel', name:'MXGP of Flanders', series:'MXGP', circuit:'Lommel', country:'Belgium', city:'Lommel', lat:51.2306, lon:5.3139, lengthKm:1.8, turns:0, month:7, surface:'deep sand', discipline:'motocross', notes:'Deep sand that develops metre-deep ruts. Physically the hardest race of the year.' }),
  R({ id:'anaheim1', name:'Anaheim 1 Supercross', series:'AMA Supercross', circuit:'Angel Stadium', country:'United States', city:'Anaheim', lat:33.8003, lon:-117.8827, lengthKm:0.5, turns:0, month:1, surface:'dirt', discipline:'motocross', notes:'The season opener, built inside a baseball stadium in a week and removed just as fast.' }),
  R({ id:'motocrossofnations', name:'Motocross of Nations', series:'FIM MXoN', circuit:'Varies annually', country:'Rotating', city:'—', lat:46.5, lon:8.0, lengthKm:1.8, turns:0, month:9, surface:'dirt', discipline:'motocross', notes:'Three riders per country, three classes, one weekend. The Olympics of motocross.' }),
  R({ id:'erzberg', name:'Erzbergrodeo Red Bull Hare Scramble', series:'Hard enduro', circuit:'Erzberg iron mine', country:'Austria', city:'Eisenerz', lat:47.5333, lon:14.8833, lengthKm:35, turns:0, month:6, surface:'rock', discipline:'motocross', notes:'500 riders start, often fewer than ten finish inside the four-hour limit.' }),

  /* ---------------- Karting ---------------- */
  R({ id:'wsk-lonato', name:'WSK Super Master Series', series:'WSK', circuit:'South Garda Karting, Lonato', country:'Italy', city:'Lonato del Garda', lat:45.4581, lon:10.4842, lengthKm:1.200, turns:12, month:2, discipline:'kart', notes:'The centre of European karting. Where most modern Formula 1 drivers first raced against each other.' }),
  R({ id:'cik-lemans', name:'FIA Karting World Championship', series:'FIA Karting', circuit:'Le Mans Karting International', country:'France', city:'Le Mans', lat:47.9450, lon:0.2200, lengthKm:1.384, turns:14, month:9, discipline:'kart', notes:'OK and OK-Junior world titles — direct-drive 125 cc engines, no gearbox, 60 hp per 150 kg.' }),
  R({ id:'skusa-supernats', name:'SKUSA SuperNationals', series:'SKUSA', circuit:'Las Vegas temporary circuit', country:'United States', city:'Las Vegas', lat:36.0950, lon:-115.1760, lengthKm:1.100, turns:13, month:11, discipline:'kart', notes:'A temporary circuit built in a casino car park — the biggest karting event in North America.' }),
  R({ id:'rotax-grandfinals', name:'Rotax MAX Challenge Grand Finals', series:'Rotax MAX', circuit:'Rotating venue', country:'Rotating', city:'—', lat:38.0, lon:15.0, lengthKm:1.2, turns:12, month:11, discipline:'kart', notes:'Every competitor draws identical equipment from a pool — the purest driver-versus-driver format in motorsport.' }),
  R({ id:'kartcity-genk', name:'Karting Genk', series:'European Championship', circuit:'Home of Champions, Genk', country:'Belgium', city:'Genk', lat:50.9667, lon:5.5000, lengthKm:1.360, turns:14, month:5, discipline:'kart', notes:'Fast and flowing, notorious for wet races that reshuffle the whole grid.' }),

  /* ---------------- Drifting ---------------- */
  R({ id:'fd-longbeach', name:'Formula Drift Long Beach', series:'Formula Drift', circuit:'Long Beach street course', country:'United States', city:'Long Beach', lat:33.7650, lon:-118.1890, lengthKm:0.6, turns:5, month:4, discipline:'drift', notes:'The season opener, run on part of the IndyCar street course. Concrete walls within centimetres of the door.' }),
  R({ id:'fd-irwindale', name:'Formula Drift Irwindale', series:'Formula Drift', circuit:'Irwindale Speedway', country:'United States', city:'Irwindale', lat:34.1108, lon:-117.9967, lengthKm:0.8, turns:4, month:10, discipline:'drift', notes:'"The House of Drift" — a half-mile banked oval used as a high-speed drift course. Traditionally the title decider.' }),
  R({ id:'d1gp-odaiba', name:'D1 Grand Prix Odaiba', series:'D1GP', circuit:'Tokyo Odaiba', country:'Japan', city:'Tokyo', lat:35.6300, lon:139.7800, lengthKm:0.5, turns:5, month:5, discipline:'drift', notes:'The original professional drifting series, run in the middle of Tokyo.' }),
  R({ id:'driftmasters-riga', name:'Drift Masters European Championship', series:'DMEC', circuit:'Bikernieki, Riga', country:'Latvia', city:'Riga', lat:56.9500, lon:24.2333, lengthKm:0.9, turns:6, month:7, discipline:'drift', notes:'Europe\'s premier drift series — 1,000+ hp entries running door-to-door at over 200 km/h entry speed.' }),
  R({ id:'ebisu', name:'Ebisu Drift Matsuri', series:'Grassroots', circuit:'Ebisu Circuit', country:'Japan', city:'Nihonmatsu', lat:37.6300, lon:140.4900, lengthKm:1.0, turns:8, month:5, discipline:'drift', notes:'Seven interlinked courses on a mountainside, including the Minami course carved into the hill. The spiritual home of drifting.' }),

  /* ---------------- Drag racing ---------------- */
  R({ id:'nhra-pomona', name:'NHRA Winternationals', series:'NHRA', circuit:'In-N-Out Burger Pomona Dragstrip', country:'United States', city:'Pomona', lat:34.0917, lon:-117.7517, lengthKm:0.402, turns:0, month:2, discipline:'drag', notes:'Quarter-mile racing since 1961. Top Fuel cars cover 300 m in under 3.7 seconds.' }),
  R({ id:'nhra-indy', name:'NHRA U.S. Nationals', series:'NHRA', circuit:'Lucas Oil Indianapolis Raceway Park', country:'United States', city:'Brownsburg', lat:39.7950, lon:-86.4100, lengthKm:0.402, turns:0, month:9, discipline:'drag', notes:'The biggest drag race in the world, run over Labor Day weekend since 1955.' }),
  R({ id:'santapod', name:'FIA European Finals', series:'FIA Drag Racing', circuit:'Santa Pod Raceway', country:'United Kingdom', city:'Podington', lat:52.2453, lon:-0.5931, lengthKm:0.402, turns:0, month:9, discipline:'drag', notes:'Europe\'s home of drag racing, built on a former WWII bomber base runway.' }),
  R({ id:'sydney-dragway', name:'Nitro Champs', series:'ANDRA', circuit:'Sydney Dragway', country:'Australia', city:'Sydney', lat:-33.8300, lon:150.8500, lengthKm:0.402, turns:0, month:4, discipline:'drag', notes:'Australia\'s premier nitro event, run under lights at Eastern Creek.' }),

  /* ---------------- Hillclimb & time attack ---------------- */
  R({ id:'goodwood', name:'Goodwood Festival of Speed', series:'Hillclimb', circuit:'Goodwood Hill', country:'United Kingdom', city:'Chichester', lat:50.8594, lon:-0.7583, lengthKm:1.86, turns:6, month:7, discipline:'hill', notes:'1.16 miles of narrow estate driveway lined with hay bales, run by everything from pre-war grand prix cars to modern F1.' }),
  R({ id:'tsukuba', name:'Tsukuba Time Attack', series:'Attack / Rev Speed', circuit:'Tsukuba Circuit', country:'Japan', city:'Shimotsuma', lat:36.1533, lon:139.9033, lengthKm:2.045, turns:14, month:1, discipline:'hill', notes:'The benchmark lap for tuned street cars worldwide. A "sub-50" lap is the number every Japanese tuner chases.' }),
  R({ id:'wtac', name:'World Time Attack Challenge', series:'WTAC', circuit:'Sydney Motorsport Park', country:'Australia', city:'Sydney', lat:-33.8030, lon:150.8710, lengthKm:3.930, turns:12, month:10, discipline:'hill', notes:'Unlimited-class time attack cars make more downforce than a GT3 racer and lap faster than most prototypes.' }),
  R({ id:'racetothesky', name:'Race to the Sky', series:'Hillclimb', circuit:'Cardrona Valley', country:'New Zealand', city:'Wanaka', lat:-44.8700, lon:168.9500, lengthKm:14.5, turns:0, month:1, surface:'gravel', discipline:'hill', notes:'14.5 km of gravel road climbing a mountain in the Southern Alps.' }),

  /* ---------------- Electric & alternative ---------------- */
  R({ id:'fe-diriyah', name:'Diriyah E-Prix', series:'Formula E', circuit:'Riyadh Street Circuit', country:'Saudi Arabia', city:'Diriyah', lat:24.7333, lon:46.5750, lengthKm:2.495, turns:21, month:1, discipline:'ev', notes:'Run at night under floodlights. Energy management, not outright pace, decides Formula E races.' }),
  R({ id:'fe-monaco', name:'Monaco E-Prix', series:'Formula E', circuit:'Circuit de Monaco', country:'Monaco', city:'Monte Carlo', lat:43.7347, lon:7.4206, lengthKm:3.337, turns:19, month:4, discipline:'ev', notes:'The only series other than Formula 1 to use the full Monaco layout.' }),
  R({ id:'extreme-e', name:'Extreme E / Extreme H', series:'Extreme E', circuit:'Remote environmental venues', country:'Rotating', city:'—', lat:20.0, lon:0.0, lengthKm:8, turns:0, month:3, surface:'mixed', discipline:'ev', notes:'Electric and hydrogen off-road SUVs racing in deserts, glaciers and rainforests to highlight climate damage.' }),
  R({ id:'ttzero', name:'Isle of Man TT Zero heritage', series:'Electric road racing', circuit:'Snaefell Mountain Course', country:'Isle of Man', city:'Douglas', lat:54.1509, lon:-4.4813, lengthKm:60.725, turns:219, month:6, discipline:'ev', notes:'Electric superbikes lapped the Mountain Course at over 190 km/h average before the class was retired.' }),
  R({ id:'pikespeak-ev', name:'Pikes Peak Unlimited (electric)', series:'PPIHC', circuit:'Pikes Peak Highway', country:'United States', city:'Colorado Springs', lat:38.8409, lon:-105.0442, lengthKm:19.99, turns:156, month:6, discipline:'ev', notes:'Electric cars have an enormous advantage here — motor output does not fall with altitude the way an engine\'s does.' }),
];

export const RACE_BY_ID = Object.fromEntries(RACES.map(r => [r.id, r]));

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function racesByDiscipline(){
  const g = {};
  for (const d of DISCIPLINES) g[d.id] = [];
  for (const r of RACES) (g[r.discipline] ||= []).push(r);
  return g;
}
export function racesByMonth(){
  const g = Array.from({ length:12 }, () => []);
  for (const r of RACES) g[(r.month || 1) - 1].push(r);
  return g;
}
export function countries(){
  return [...new Set(RACES.map(r => r.country))].sort();
}
