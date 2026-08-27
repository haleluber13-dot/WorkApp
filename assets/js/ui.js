/* GlobeWatch — UI: live wall, focus player, editor & settings modals. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function attr(s){return esc(s).replace(/'/g,"&#39;");}
  const hlsPool = [];

  function catOf(id){ return (window.CATEGORIES||[]).find((c)=>c.id===id) || {icon:"📷",label:id,color:"#38bdf8"}; }
  const PLATFORMS = {youtube:"YouTube",ytchannel:"YouTube Live",twitch:"Twitch",twitchvideo:"Twitch",
    kick:"Kick",vimeo:"Vimeo",hls:"Live stream",dash:"Live stream",video:"Video",image:"Snapshot",iframe:"Web"};
  function platformName(cam){ return PLATFORMS[(cam.source&&cam.source.type)] || "Live"; }

  function poster(cam){
    if (cam.thumb) return cam.thumb;
    if (cam.source && cam.source.type === "youtube" && cam.source.id)
      return "https://i.ytimg.com/vi/" + cam.source.id + "/hqdefault.jpg";
    return null;
  }

  const ID_TYPES = ["youtube","ytchannel","twitch","twitchvideo","kick","vimeo"];

  /* Build a live player into `mount` (a DIV). Returns a cleanup fn.
     Supports YouTube, Twitch, Kick, Vimeo, HLS (.m3u8), MP4 video, refreshing
     image snapshots, and any embeddable page — i.e. most live platforms. */
  function mountPlayer(mount, cam, { muted = true } = {}) {
    mount.innerHTML = "";
    const s = cam.source || {};
    const m = muted ? 1 : 0, mb = muted ? "true" : "false";
    const parent = (location.hostname || "localhost");
    const frame = (src, allow) =>
      mount.innerHTML = '<iframe allow="' + (allow || "autoplay; encrypted-media; picture-in-picture; fullscreen") +
        '" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="' + attr(src) + '"></iframe>';
    const need = (msg) => { mount.innerHTML = fallbackLink(cam, msg); };

    switch (s.type) {
      case "youtube":
        if (!s.id) { need("No video id set."); return noop(); }
        frame("https://www.youtube.com/embed/"+s.id+"?autoplay=1&mute="+m+"&playsinline=1&rel=0"); return noop();
      case "ytchannel":
        if (!s.id) { need("No channel id set."); return noop(); }
        frame("https://www.youtube.com/embed/live_stream?channel="+s.id+"&autoplay=1&mute="+m+"&playsinline=1&rel=0"); return noop();
      case "twitch":
        if (!s.id) { need("No Twitch channel set."); return noop(); }
        frame("https://player.twitch.tv/?channel="+encodeURIComponent(s.id)+"&parent="+parent+"&muted="+mb+"&autoplay=true"); return noop();
      case "twitchvideo":
        if (!s.id) { need("No Twitch video id set."); return noop(); }
        frame("https://player.twitch.tv/?video="+encodeURIComponent(s.id)+"&parent="+parent+"&muted="+mb+"&autoplay=true"); return noop();
      case "kick":
        if (!s.id) { need("No Kick channel set."); return noop(); }
        frame("https://player.kick.com/"+encodeURIComponent(s.id)+"?autoplay=true&muted="+mb); return noop();
      case "vimeo":
        if (!s.id) { need("No Vimeo id set."); return noop(); }
        frame("https://player.vimeo.com/video/"+encodeURIComponent(s.id)+"?autoplay=1&muted="+m); return noop();
      case "hls":
        if (!s.url) { need("No stream URL set."); return noop(); }
        return mountHls(mount, cam, muted);
      case "dash":
        if (!s.url) { need("No DASH URL set."); return noop(); }
        return mountDash(mount, cam, muted);
      case "video":
        if (!s.url) { need("No video URL set."); return noop(); }
        { const v = document.createElement("video");
          v.src = s.url; v.autoplay = true; v.loop = true; v.muted = muted; v.controls = true; v.playsInline = true;
          mount.appendChild(v); return noop(); }
      case "image":
        if (!s.url) { need("No image URL set."); return noop(); }
        return mountImage(mount, s);
      case "iframe":
        if (!s.url) { need("No URL set."); return noop(); }
        mount.innerHTML = '<iframe allow="autoplay; fullscreen" allowfullscreen loading="lazy" ' +
          'referrerpolicy="no-referrer" src="' + attr(s.url) + '"></iframe>' +
          '<div class="iframe-guard">' + fallbackLink(cam, "If nothing loads, the source blocks embedding.") + '</div>';
        return noop();
      default:
        need("No stream configured yet."); return noop();
    }
  }
  function noop(){ return () => {}; }

  function mountHls(mount, cam, muted) {
    const v = document.createElement("video");
    v.controls = true; v.muted = muted; v.autoplay = true; v.playsInline = true;
    mount.appendChild(v);
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new Hls({ liveDurationInfinity: true });
      hls.loadSource(cam.source.url); hls.attachMedia(v); hlsPool.push(hls);
      hls.on(window.Hls.Events.ERROR, (_e, d) => { if (d && d.fatal) mount.innerHTML = fallbackLink(cam, "Stream unavailable."); });
      return () => { try { hls.destroy(); } catch (_) {} };
    }
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = cam.source.url; return noop(); }
    mount.innerHTML = fallbackLink(cam, "This stream needs HLS support.");
    return noop();
  }

  function mountDash(mount, cam, muted) {
    const v = document.createElement("video");
    v.controls = true; v.muted = muted; v.autoplay = true; v.playsInline = true;
    mount.appendChild(v);
    if (window.dashjs && window.dashjs.MediaPlayer) {
      const player = window.dashjs.MediaPlayer().create();
      player.initialize(v, cam.source.url, true);
      player.on(window.dashjs.MediaPlayer.events.ERROR, () => { mount.innerHTML = fallbackLink(cam, "Stream unavailable."); });
      return () => { try { player.reset(); } catch (_) {} };
    }
    mount.innerHTML = fallbackLink(cam, "This stream needs MPEG-DASH support.");
    return noop();
  }

  function mountImage(mount, s) {
    const img = document.createElement("img"); img.className = "player-img"; img.alt = "";
    const refresh = () => { img.src = s.url + (s.url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(); };
    refresh(); const t = setInterval(refresh, 4000); mount.appendChild(img);
    return () => clearInterval(t);
  }

  function fallbackLink(cam, why){
    const url = (cam.source&&cam.source.url) || cam.page || "";
    return '<div class="nostream"><p>'+esc(why)+'</p>'+
      (url?'<a class="btn" target="_blank" rel="noopener" href="'+attr(url)+'">Open source ↗</a>':'')+'</div>';
  }

  /* -------- Live wall (self-refreshing mosaic) -------- */
  // tiles rendered at once; the dense grid view fits many more on screen.
  function wallLimit(){ return document.body.dataset.view === "grid" ? 320 : 140; }
  let liveTimer = null, liveObserver = null;
  const liveVisible = new Set();
  function isLiveTile(cam){ return cam.source && cam.source.type === "image" && cam.source.url; }
  function bust(url){ return url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(); }

  function tile(cam){
    const c = catOf(cam.category); const fav = Store.favorites.has(cam.id);
    const live = isLiveTile(cam); const p = poster(cam);
    const media = live
      ? '<img class="tile__img live" data-live="'+attr(cam.source.url)+'" loading="lazy" alt="'+attr(cam.name)+'">'
      : (p ? '<img class="tile__img" loading="lazy" src="'+attr(p)+'" alt="'+attr(cam.name)+'">' : '');
    return '<article class="tile'+(live?" is-live":"")+'" data-id="'+attr(cam.id)+'" tabindex="0" style="--cat:'+c.color+'">'+
      '<div class="tile__media">'+ media +
        '<span class="tile__spin" aria-hidden="true"></span>'+
        '<span class="tile__live">LIVE</span>'+
        '<button class="tile__fav'+(fav?" on":"")+'" data-fav="'+attr(cam.id)+'" title="Favorite" aria-label="Favorite">'+(fav?"★":"☆")+'</button>'+
        '<span class="tile__cat">'+c.icon+'</span>'+
      '</div>'+
      '<div class="tile__meta"><b>'+esc(cam.name)+'</b>'+
        '<span>'+esc([cam.city,cam.country].filter(Boolean).join(", ")||c.label)+'</span></div>'+
    '</article>';
  }

  function renderWall(cams){
    const wall = $("#wall");
    const total = cams.length, WALL_LIMIT = wallLimit();
    $("#wallCount").textContent = total > WALL_LIMIT ? (WALL_LIMIT.toLocaleString() + " / " + total.toLocaleString()) : (total.toLocaleString() + " live");
    if (!total){ teardownLive(); wall.innerHTML = '<p class="empty">No live cameras yet. Try clearing filters, or open ⚙ Settings to load a provider.</p>'; return; }
    // Show self-refreshing live feeds first, then favorites, so working cameras lead
    const ordered = cams.slice().sort((a, b) => {
      const la = isLiveTile(a) ? 1 : 0, lb = isLiveTile(b) ? 1 : 0;
      if (la !== lb) return lb - la;
      return (Store.favorites.has(b.id) ? 1 : 0) - (Store.favorites.has(a.id) ? 1 : 0);
    });
    const shown = ordered.slice(0, WALL_LIMIT);
    wall.innerHTML = shown.map(tile).join("") +
      (total > WALL_LIMIT ? '<p class="wallmore">Showing '+WALL_LIMIT.toLocaleString()+' of '+total.toLocaleString()+
        ' live feeds — search, pick a country, or tap the globe to reach the rest.</p>' : '');
    setupLive(wall);
  }

  function setupLive(wall){
    teardownLive();
    const imgs = $$(".tile__img", wall);
    imgs.forEach((im) => {
      const t = im.closest(".tile");
      im.addEventListener("load", () => {
        t.classList.remove("is-offline"); t.classList.add("is-loaded");
      });
      im.addEventListener("error", () => {
        t.classList.add("is-offline"); t.classList.remove("is-loaded");
      });
      if (im.classList.contains("live")) im.src = bust(im.dataset.live);   // first frame now
    });
    const live = imgs.filter((im) => im.classList.contains("live"));
    liveObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) liveVisible.add(e.target); else liveVisible.delete(e.target); });
    }, { root: wall, rootMargin: "150px" });
    live.forEach((im) => liveObserver.observe(im));
    liveTimer = setInterval(() => {
      if (document.hidden) return;                                   // don't burn data in the background
      liveVisible.forEach((im) => { if (im.isConnected) im.src = bust(im.dataset.live); });
    }, 5000);                                                        // refresh only what's on screen
  }
  function teardownLive(){
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    if (liveObserver) { liveObserver.disconnect(); liveObserver = null; }
    liveVisible.clear();
  }

  /* -------- Focus overlay -------- */
  let focusCleanup = () => {};
  function openFocus(id){
    const cam = Store.get(id); if (!cam) return;
    const c = catOf(cam.category);
    const ov = $("#focus"); const near = nearby(cam, 8);
    ov.innerHTML =
      '<div class="focus__scrim" data-close></div>'+
      '<div class="focus__panel" style="--cat:'+c.color+'">'+
        '<header class="focus__bar">'+
          '<div><span class="focus__cat">'+c.icon+' '+esc(c.label)+'</span>'+
            '<span class="focus__plat">'+esc(platformName(cam))+'</span>'+
            '<h2>'+esc(cam.name)+'</h2>'+
            '<p>'+esc([cam.city,cam.country].filter(Boolean).join(", "))+
              (cam.lat!=null?' · '+cam.lat.toFixed(3)+', '+cam.lng.toFixed(3):'')+'</p></div>'+
          '<div class="focus__actions">'+
            '<button class="btn" data-fav="'+attr(cam.id)+'">'+(Store.favorites.has(cam.id)?"★ Saved":"☆ Save")+'</button>'+
            '<button class="btn" data-edit="'+attr(cam.id)+'">✎ Edit</button>'+
            (cam.page?'<a class="btn" target="_blank" rel="noopener" href="'+attr(cam.page)+'">Source ↗</a>':'')+
            '<button class="btn btn--x" data-close>✕</button>'+
          '</div>'+
        '</header>'+
        '<div class="focus__stage"><div class="player" id="focusPlayer"></div></div>'+
        (cam.tags&&cam.tags.length?'<div class="chips">'+cam.tags.map((t)=>'<span class="chip">#'+esc(t)+'</span>').join("")+'</div>':'')+
        (near.length?'<div class="focus__near"><h3>Nearby cameras</h3><div class="near__row">'+
          near.map((n)=>'<button class="near__item" data-goto="'+attr(n.id)+'">'+
            (poster(n)?'<img loading="lazy" src="'+attr(poster(n))+'" alt="">':'<span class="near__ph">'+catOf(n.category).icon+'</span>')+
            '<span>'+esc(n.name)+'</span></button>').join("")+'</div></div>':'')+
      '</div>';
    ov.classList.add("open");
    // If the camera also has a short video clip (e.g. TfL JamCams), play it looping for motion
    const fcam = cam.clip ? Object.assign({}, cam, { source: { type: "video", url: cam.clip } }) : cam;
    focusCleanup = mountPlayer($("#focusPlayer"), fcam, { muted:true });
    if (window.GlobeView) GlobeView.focus(cam);
  }
  function closeFocus(){
    try{focusCleanup();}catch(_){}
    const ov=$("#focus"); ov.classList.remove("open"); ov.innerHTML="";
  }

  function nearby(cam, n){
    if (cam.lat==null) return [];
    return Store.all().filter((c)=>c.id!==cam.id && c.lat!=null)
      .map((c)=>({c, d: dist(cam,c)})).sort((a,b)=>a.d-b.d)
      .slice(0, n).map((x)=>x.c);
  }
  function dist(a,b){ const dx=a.lat-b.lat, dy=(a.lng-b.lng); return dx*dx+dy*dy; }

  /* -------- Editor modal -------- */
  function openEditor(id){
    const cam = id ? Store.get(id) : null;
    const cats = (window.CATEGORIES||[]).map((c)=>'<option value="'+c.id+'"'+(cam&&cam.category===c.id?" selected":"")+'>'+c.icon+" "+esc(c.label)+'</option>').join("");
    const s = (cam&&cam.source)||{type:"youtube"};
    const types=[["youtube","YouTube — video id"],["ytchannel","YouTube — channel id (auto-live)"],
      ["twitch","Twitch — channel"],["twitchvideo","Twitch — video id"],["kick","Kick — channel"],
      ["vimeo","Vimeo — video id"],["hls","HLS .m3u8 URL"],["dash","MPEG-DASH .mpd URL"],
      ["video","MP4 video URL"],["image","Refreshing image URL"],["iframe","Embeddable page URL"]];
    const typeOpts = types.map((t)=>'<option value="'+t[0]+'"'+(s.type===t[0]?" selected":"")+'>'+t[1]+'</option>').join("");
    const val = (v)=> v==null?"":attr(v);
    modal(
      '<h2>'+(cam?"Edit camera":"Add a location")+'</h2>'+
      '<form id="editForm" class="form">'+
        '<label>Name<input name="name" required value="'+val(cam&&cam.name)+'"></label>'+
        '<label class="autolink">Paste any live link — auto-detects the platform'+
          '<input name="autolink" placeholder="YouTube · Twitch · Kick · Vimeo · .m3u8 · image URL · any page"></label>'+
        '<div class="row"><label>City<input name="city" value="'+val(cam&&cam.city)+'"></label>'+
          '<label>Country<input name="country" value="'+val(cam&&cam.country)+'"></label></div>'+
        '<div class="row"><label>Latitude<input name="lat" type="number" step="any" value="'+val(cam&&cam.lat)+'"></label>'+
          '<label>Longitude<input name="lng" type="number" step="any" value="'+val(cam&&cam.lng)+'"></label></div>'+
        '<label>Category<select name="category">'+cats+'</select></label>'+
        '<div class="row"><label>Source type<select name="stype">'+typeOpts+'</select></label>'+
          '<label>Stream id / URL<input name="sval" value="'+val(s.id||s.url)+'" placeholder="video id, channel id, or URL"></label></div>'+
        '<label>Source page (optional)<input name="page" value="'+val(cam&&cam.page)+'"></label>'+
        '<label>Tags (comma separated)<input name="tags" value="'+val(cam&&(cam.tags||[]).join(", "))+'"></label>'+
        '<div class="form__actions">'+
          (cam?'<button type="button" class="btn btn--danger" data-del="'+attr(cam.id)+'">Delete</button>':'<span></span>')+
          '<div><button type="button" class="btn" data-close>Cancel</button>'+
          '<button type="submit" class="btn btn--primary">'+(cam?"Save":"Add")+'</button></div>'+
        '</div>'+
      '</form>');
    // Auto-detect platform from a pasted link and fill type + value
    const form = $("#editForm");
    const applyDetect = () => {
      const raw = form.elements.autolink.value.trim();
      if (!raw) return;
      const d = Store.detectSource(raw);
      if (d) {
        form.elements.stype.value = d.type;
        form.elements.sval.value = d.id || d.url || "";
        toast("Detected: " + d.type);
      } else if (/^https?:\/\//i.test(raw)) {
        form.elements.stype.value = "iframe"; form.elements.sval.value = raw;
      }
    };
    form.elements.autolink.addEventListener("input", applyDetect);
    form.elements.autolink.addEventListener("paste", () => setTimeout(applyDetect, 0));

    form.addEventListener("submit",(e)=>{
      e.preventDefault();
      const f=e.target; const g=(n)=>f.elements[n].value.trim();
      const stype=g("stype"), sval=g("sval");
      const src = ID_TYPES.indexOf(stype)>=0 ? {type:stype,id:sval} : {type:stype,url:sval};
      const out={ id: cam?cam.id:undefined, name:g("name"), city:g("city"), country:g("country"),
        lat: g("lat")===""?null:parseFloat(g("lat")), lng: g("lng")===""?null:parseFloat(g("lng")),
        category:g("category"), source:src, page:g("page")||undefined,
        tags: g("tags")?g("tags").split(",").map((t)=>t.trim()).filter(Boolean):[] };
      const newId = Store.addOrUpdate(out);
      closeModal(); toast(cam?"Camera updated":"Location added");
      if ($("#focus").classList.contains("open")) openFocus(newId);
    });
  }

  /* -------- Settings modal -------- */
  function openSettings(){
    const s = Store.settings;
    modal(
      '<h2>Settings & data</h2>'+
      '<div class="form">'+
        '<label class="check"><input type="checkbox" id="setRotate"'+(s.autoRotate?" checked":"")+'> Auto-rotate globe</label>'+
        '<hr>'+
        '<h3>Load live cameras from providers</h3>'+
        '<p class="muted">These load automatically when the app opens — tap to reload. No key needed.</p>'+
        '<div class="row2"><button class="btn btn--primary" id="btnTfl">🚦 London traffic (890)</button>'+
        '<button class="btn btn--primary" id="btnNyc">🗽 New York traffic (970)</button></div>'+
        '<p class="muted" style="margin-top:10px">A free key from <a href="https://api.windy.com/keys" target="_blank" rel="noopener">api.windy.com/keys</a> pulls thousands of public webcams worldwide onto the globe.</p>'+
        '<label>Windy Webcams API key<input id="setWindy" value="'+attr(s.windyKey)+'" placeholder="paste key"></label>'+
        '<div class="row2"><button class="btn btn--primary" id="btnWindy">🌍 Load Windy webcams</button>'+
        '<button class="btn btn--primary" id="btnWindyHere">📍 Load near current globe view</button></div>'+
        '<hr>'+
        '<h3>Backup</h3>'+
        '<div class="row2"><button class="btn" id="btnExport">⬇ Export JSON</button>'+
          '<button class="btn" id="btnImport">⬆ Import JSON</button>'+
          '<button class="btn btn--danger" id="btnReset">Reset all</button></div>'+
        '<input type="file" id="fileImport" accept="application/json" hidden>'+
      '</div>');
    $("#setRotate").addEventListener("change",(e)=>{ Store.setSetting("autoRotate",e.target.checked); if(window.GlobeView)GlobeView.setAutoRotate(e.target.checked); });
    $("#setWindy").addEventListener("change",(e)=>Store.setSetting("windyKey",e.target.value.trim()));
    $("#btnWindy").addEventListener("click", async ()=>{
      Store.setSetting("windyKey", $("#setWindy").value.trim());
      try{ toast("Loading webcams…"); const n=await Store.loadWindy(); toast("Loaded "+n+" public webcams"); }
      catch(err){ toast(err.message, true); }
    });
    $("#btnWindyHere").addEventListener("click", async (e)=>{
      Store.setSetting("windyKey", $("#setWindy").value.trim());
      const btn=e.currentTarget; btn.disabled=true; const old=btn.textContent; btn.textContent="Loading…";
      try{
        const pov = window.GlobeView && GlobeView.getPOV ? GlobeView.getPOV() : null;
        let nearby = null;
        if (pov && pov.lat!=null){
          const radiusKm = Math.min(250, Math.max(25, Math.round(pov.altitude*110)));
          nearby = pov.lat.toFixed(3)+","+pov.lng.toFixed(3)+","+radiusKm;
        }
        const n = await Store.loadWindy(nearby);
        toast(nearby ? ("Loaded "+n+" webcams near the current view") : ("Globe not ready — loaded "+n+" webcams"));
      } catch(err){ toast(err.message, true); }
      finally{ btn.disabled=false; btn.textContent=old; }
    });
    $("#btnTfl").addEventListener("click", async (e)=>{
      const btn=e.currentTarget; btn.disabled=true; const old=btn.textContent; btn.textContent="Loading…";
      try{ const n=await Store.loadTfL(); toast("Loaded "+n+" London traffic cams"); }
      catch(err){ toast(err.message, true); }
      finally{ btn.disabled=false; btn.textContent=old; }
    });
    $("#btnNyc").addEventListener("click", async (e)=>{
      const btn=e.currentTarget; btn.disabled=true; const old=btn.textContent; btn.textContent="Loading…";
      try{ const n=await Store.loadNYC(); toast("Loaded "+n+" New York traffic cams"); }
      catch(err){ toast(err.message, true); }
      finally{ btn.disabled=false; btn.textContent=old; }
    });
    $("#btnExport").addEventListener("click",()=>{
      const blob=new Blob([Store.exportJSON()],{type:"application/json"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download="globewatch-backup.json"; a.click(); URL.revokeObjectURL(a.href);
    });
    $("#btnImport").addEventListener("click",()=>$("#fileImport").click());
    $("#fileImport").addEventListener("change",(e)=>{
      const file=e.target.files[0]; if(!file)return; const r=new FileReader();
      r.onload=()=>{ try{ Store.importJSON(r.result); closeModal(); toast("Import complete"); }catch(err){ toast("Bad file: "+err.message,true);} };
      r.readAsText(file);
    });
    $("#btnReset").addEventListener("click",()=>{
      if(!confirm("Remove all your added cameras, edits, favorites and settings?"))return;
      ["gw:userCams","gw:removedIds","gw:edits","gw:favorites","gw:settings"].forEach((k)=>localStorage.removeItem(k));
      location.reload();
    });
  }

  /* -------- primitives -------- */
  function modal(html){
    let m=$("#modal");
    m.innerHTML='<div class="modal__scrim" data-close></div><div class="modal__card">'+
      '<button class="modal__x" data-close aria-label="Close">✕</button>'+html+'</div>';
    m.classList.add("open");
  }
  function closeModal(){ const m=$("#modal"); m.classList.remove("open"); m.innerHTML=""; }

  let toastT;
  function toast(msg, bad){
    let t=$("#toast"); t.textContent=msg; t.className="toast show"+(bad?" bad":"");
    clearTimeout(toastT); toastT=setTimeout(()=>t.className="toast",3200);
  }

  window.UI = { renderWall, openFocus, closeFocus, openEditor, openSettings, closeModal, toast, catOf };
})();
