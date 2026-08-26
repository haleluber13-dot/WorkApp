/* GlobeWatch — seed dataset of PUBLIC live cameras.
 *
 * These are publicly published, embeddable live streams / public webcam pages.
 * Feeds on the open web rotate over time — every entry is editable in-app, and
 * you can add your own or load thousands more via the Windy Webcams API in Settings.
 *
 * source.type:
 *   "youtube"  -> source.id is a YouTube video id (live stream)
 *   "ytchannel"-> source.id is a YouTube channelId (embeds whatever is live now)
 *   "hls"      -> source.url is an .m3u8 stream (played with hls.js)
 *   "image"    -> source.url is a refreshing JPEG snapshot (public traffic cams)
 *   "iframe"   -> source.url is an embeddable public page
 * Every entry also has `page` = the original public source page.
 */
window.CATEGORIES = [
  { id: "street",  label: "Streets & Cities", icon: "🏙️", color: "#38bdf8" },
  { id: "road",    label: "Roads & Traffic",  icon: "🚦", color: "#f59e0b" },
  { id: "air",     label: "Air & Skyline",    icon: "✈️", color: "#a78bfa" },
  { id: "sea",     label: "Sea & Harbors",    icon: "⚓", color: "#2dd4bf" },
  { id: "mall",    label: "Malls & Plazas",   icon: "🛍️", color: "#f472b6" },
  { id: "airport", label: "Airports",         icon: "🛫", color: "#60a5fa" },
  { id: "nature",  label: "Nature & Wild",    icon: "🌿", color: "#34d399" },
  { id: "space",   label: "Space & Earth",    icon: "🛰️", color: "#c084fc" }
];

window.SEED_CAMERAS = [
  // --- Iconic city / street ---
  { id:"s-times-square", name:"Times Square", category:"street", city:"New York", country:"USA",
    lat:40.7580, lng:-73.9855, tags:["nyc","street","24/7"],
    source:{type:"youtube", id:"eJ7ZkQ5TC08"}, page:"https://www.earthcam.com/usa/newyork/timessquare/" },
  { id:"s-shibuya", name:"Shibuya Crossing", category:"street", city:"Tokyo", country:"Japan",
    lat:35.6595, lng:139.7004, tags:["tokyo","crossing"],
    source:{type:"youtube", id:"Bp-x8gFAQR8"}, page:"https://www.youtube.com/results?search_query=shibuya+crossing+live" },
  { id:"s-abbeyroad", name:"Abbey Road Crossing", category:"street", city:"London", country:"UK",
    lat:51.5320, lng:-0.1779, tags:["london","beatles"],
    source:{type:"iframe", url:"https://www.abbeyroad.com/crossing"}, page:"https://www.abbeyroad.com/crossing" },
  { id:"s-venice", name:"Rialto / Grand Canal", category:"street", city:"Venice", country:"Italy",
    lat:45.4380, lng:12.3358, tags:["venice","canal"],
    source:{type:"youtube", id:"7_2fnyPmk-o"}, page:"https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia.html" },

  // --- Roads & traffic ---
  { id:"r-tower-bridge", name:"Tower Bridge Traffic", category:"road", city:"London", country:"UK",
    lat:51.5055, lng:-0.0754, tags:["bridge","traffic"],
    source:{type:"youtube", id:"Nyw3wThZ2Kk"}, page:"https://www.youtube.com/results?search_query=london+traffic+live" },
  { id:"r-la-101", name:"US-101 Los Angeles", category:"road", city:"Los Angeles", country:"USA",
    lat:34.0928, lng:-118.3287, tags:["freeway","caltrans"],
    source:{type:"iframe", url:"https://cwwp2.dot.ca.gov/vm/loc/d7/vids.htm"}, page:"https://cwwp2.dot.ca.gov/vm/streamlist.htm" },
  { id:"r-gothard", name:"Gotthard Tunnel Approach", category:"road", city:"Göschenen", country:"Switzerland",
    lat:46.6680, lng:8.5890, tags:["tunnel","alps"],
    source:{type:"iframe", url:"https://www.tcs.ch/en/testing-rating/traffic-info/webcams.php"}, page:"https://www.tcs.ch/" },

  // --- Airports ---
  { id:"a-lax", name:"LAX Approach", category:"airport", city:"Los Angeles", country:"USA",
    lat:33.9416, lng:-118.4085, tags:["aviation","spotting"],
    source:{type:"youtube", id:"j9U8bkL1D1o"}, page:"https://www.airport-webcams.net/" },
  { id:"a-sxm", name:"Princess Juliana (SXM)", category:"airport", city:"Maho Beach", country:"Sint Maarten",
    lat:18.0410, lng:-63.1090, tags:["beach","landing"],
    source:{type:"youtube", id:"1uucQd4dxAE"}, page:"https://www.sxmairport.com/" },
  { id:"a-innsbruck", name:"Innsbruck Airport", category:"airport", city:"Innsbruck", country:"Austria",
    lat:47.2602, lng:11.3440, tags:["alps","approach"],
    source:{type:"iframe", url:"https://www.foto-webcam.eu/webcam/innsbruck-flughafen/"}, page:"https://www.foto-webcam.eu/" },

  // --- Sea & harbors ---
  { id:"h-sydney", name:"Sydney Harbour", category:"sea", city:"Sydney", country:"Australia",
    lat:-33.8568, lng:151.2153, tags:["harbour","opera"],
    source:{type:"youtube", id:"3fbtQGoGkeM"}, page:"https://www.portauthoritynsw.com.au/" },
  { id:"h-rotterdam", name:"Port of Rotterdam", category:"sea", city:"Rotterdam", country:"Netherlands",
    lat:51.9490, lng:4.1400, tags:["cargo","shipping"],
    source:{type:"iframe", url:"https://www.portofrotterdam.com/en/experience-online"}, page:"https://www.portofrotterdam.com/" },
  { id:"h-monterey", name:"Monterey Bay (open ocean)", category:"sea", city:"Monterey", country:"USA",
    lat:36.6020, lng:-121.9010, tags:["ocean","mbari"],
    source:{type:"youtube", id:"5rL2klZukfw"}, page:"https://www.mbari.org/" },

  // --- Air & skyline ---
  { id:"sk-eiffel", name:"Eiffel Tower Skyline", category:"air", city:"Paris", country:"France",
    lat:48.8584, lng:2.2945, tags:["skyline","paris"],
    source:{type:"iframe", url:"https://www.skylinewebcams.com/en/webcam/france/ile-de-france/paris/tour-eiffel.html"}, page:"https://www.skylinewebcams.com/" },
  { id:"sk-vegas", name:"Las Vegas Strip Skyline", category:"air", city:"Las Vegas", country:"USA",
    lat:36.1147, lng:-115.1728, tags:["strip","skyline"],
    source:{type:"youtube", id:"Ck6Mg518HgQ"}, page:"https://www.earthcam.com/usa/nevada/lasvegas/" },

  // --- Malls & plazas ---
  { id:"m-dubai", name:"Dubai Fountain / Mall", category:"mall", city:"Dubai", country:"UAE",
    lat:25.1972, lng:55.2790, tags:["fountain","burj"],
    source:{type:"iframe", url:"https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/burj-khalifa.html"}, page:"https://www.skylinewebcams.com/" },
  { id:"m-stpeters", name:"St. Peter's Square", category:"mall", city:"Vatican City", country:"Vatican",
    lat:41.9022, lng:12.4539, tags:["plaza","vatican"],
    source:{type:"youtube", id:"1MFXjNViuP8"}, page:"https://www.skylinewebcams.com/" },

  // --- Nature & wild ---
  { id:"n-katmai", name:"Brooks Falls Bears", category:"nature", city:"Katmai NP", country:"USA",
    lat:58.5570, lng:-155.7790, tags:["bears","explore.org"],
    source:{type:"youtube", id:"5infjWzo6iw"}, page:"https://explore.org/livecams" },
  { id:"n-aurora", name:"Churchill Aurora", category:"nature", city:"Churchill", country:"Canada",
    lat:58.7684, lng:-94.1650, tags:["aurora","northern-lights"],
    source:{type:"youtube", id:"o5ANW4S1uJk"}, page:"https://explore.org/livecams" },
  { id:"n-namibia", name:"Namibia Waterhole", category:"nature", city:"Etosha", country:"Namibia",
    lat:-19.1833, lng:15.9167, tags:["safari","wildlife"],
    source:{type:"youtube", id:"ydYDqZQpim8"}, page:"https://www.namibiacam.com/" },

  // --- Space & earth ---
  { id:"sp-iss", name:"ISS Live Earth View", category:"space", city:"Low Earth Orbit", country:"—",
    lat:0, lng:0, tags:["nasa","iss","orbit"],
    source:{type:"youtube", id:"jPTD2gnZFUw"}, page:"https://www.nasa.gov/live/" }
];
