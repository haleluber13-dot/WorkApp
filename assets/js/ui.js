/* GlobeWatch — UI: live wall, focus player, editor & settings modals. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function attr(s){return esc(s).replace(/'/g,"&#39;");}
  const hlsPool = [];

  function catOf(id){ return (window.CATEGORIES||[]).find((c)=>c.id===id) || {icon:"📷",label:id,color:"#38bdf8"}; }

  function poster(cam){
    if (cam.thumb) return cam.thumb;
    if (cam.source && cam.source.type === "youtube" && cam.source.id)
      return "https://i.ytimg.com/vi/" + cam.source.id + "/hqdefault.jpg";
    return null;
  }

  /* Build a live player into `mount` (a DIV). Returns a cleanup fn. */
  function mountPlayer(mount, cam, { muted = true } = {}) {
    mount.innerHTML = "";
    const s = cam.source || {};
    let cleanup = () => {};
    const yt = (id, ch) => {
      const q = "autoplay=1&mute=" + (muted?1:0) + "&playsinline=1&rel=0";
      const src = ch ? "https://www.youtube.com/embed/live_stream?channel="+id+"&"+q
                     : "https://www.youtube.com/embed/"+id+"?"+q;
      mount.innerHTML = '<iframe allow="autoplay; encrypted-media; picture-in-picture" '+
        'allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="'+attr(src)+'"></iframe>';
    };
    if (s.type === "youtube" && s.id) yt(s.id, false);
    else if (s.type === "ytchannel" && s.id) yt(s.id, true);
    else if (s.type === "hls" && s.url) {
      const v = document.createElement("video");
      v.controls = true; v.muted = muted; v.autoplay = true; v.playsInline = true;
      mount.appendChild(v);
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new Hls({ liveDurationInfinity: true }); hls.loadSource(s.url); hls.attachMedia(v);
        hlsPool.push(hls); cleanup = () => { try{hls.destroy();}catch(_){} };
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = s.url; }
      else { mount.innerHTML = fallbackLink(cam, "This stream needs HLS support."); }
    }
    else if (s.type === "image" && s.url) {
      const img = document.createElement("img"); img.className = "player-img"; img.alt = cam.name;
      const refresh = () => { img.src = s.url + (s.url.indexOf("?")>=0?"&":"?") + "t=" + Date.now(); };
      refresh(); const t = setInterval(refresh, 4000); mount.appendChild(img);
      cleanup = () => clearInterval(t);
    }
    else if (s.type === "iframe" && s.url) {
      mount.innerHTML = '<iframe allow="autoplay; fullscreen" allowfullscreen loading="lazy" '+
        'referrerpolicy="no-referrer" src="'+attr(s.url)+'"></iframe>'+
        '<div class="iframe-guard">'+fallbackLink(cam,"If nothing loads, the source blocks embedding.")+'</div>';
    }
    else mount.innerHTML = fallbackLink(cam, "No stream configured yet.");
    return cleanup;
  }

  function fallbackLink(cam, why){
    const url = (cam.source&&cam.source.url) || cam.page || "";
    return '<div class="nostream"><p>'+esc(why)+'</p>'+
      (url?'<a class="btn" target="_blank" rel="noopener" href="'+attr(url)+'">Open source ↗</a>':'')+'</div>';
  }

  /* -------- Live wall -------- */
  function tile(cam){
    const c = catOf(cam.category); const p = poster(cam);
    const fav = Store.favorites.has(cam.id);
    return '<article class="tile" data-id="'+attr(cam.id)+'" tabindex="0" '+
        'style="--cat:'+c.color+'">'+
      '<div class="tile__media">'+
        (p ? '<img loading="lazy" src="'+attr(p)+'" alt="'+attr(cam.name)+'" '+
             'onerror="this.style.display=\'none\'">' : '') +
        '<span class="tile__live">● LIVE</span>'+
        '<button class="tile__fav'+(fav?" on":"")+'" data-fav="'+attr(cam.id)+'" '+
          'title="Favorite" aria-label="Favorite">'+(fav?"★":"☆")+'</button>'+
        '<span class="tile__cat">'+c.icon+'</span>'+
      '</div>'+
      '<div class="tile__meta"><b>'+esc(cam.name)+'</b>'+
        '<span>'+esc([cam.city,cam.country].filter(Boolean).join(", ")||c.label)+'</span></div>'+
    '</article>';
  }

  function renderWall(cams){
    const wall = $("#wall");
    $("#wallCount").textContent = cams.length + " live";
    if (!cams.length){ wall.innerHTML = '<p class="empty">No cameras match. Try clearing filters or add a location.</p>'; return; }
    wall.innerHTML = cams.map(tile).join("");
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
    focusCleanup = mountPlayer($("#focusPlayer"), cam, { muted:true });
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
    const types=[["youtube","YouTube video id"],["ytchannel","YouTube channel id (auto-live)"],["hls","HLS .m3u8 URL"],["image","Refreshing image URL"],["iframe","Embeddable page URL"]];
    const typeOpts = types.map((t)=>'<option value="'+t[0]+'"'+(s.type===t[0]?" selected":"")+'>'+t[1]+'</option>').join("");
    const val = (v)=> v==null?"":attr(v);
    modal(
      '<h2>'+(cam?"Edit camera":"Add a location")+'</h2>'+
      '<form id="editForm" class="form">'+
        '<label>Name<input name="name" required value="'+val(cam&&cam.name)+'"></label>'+
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
    $("#editForm").addEventListener("submit",(e)=>{
      e.preventDefault();
      const f=e.target; const g=(n)=>f.elements[n].value.trim();
      const stype=g("stype"), sval=g("sval");
      const src = (stype==="youtube"||stype==="ytchannel")?{type:stype,id:sval}:{type:stype,url:sval};
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
        '<h3>Load public webcams worldwide</h3>'+
        '<p class="muted">Free key from <a href="https://api.windy.com/keys" target="_blank" rel="noopener">api.windy.com/keys</a> pulls thousands of public webcams onto the globe.</p>'+
        '<label>Windy Webcams API key<input id="setWindy" value="'+attr(s.windyKey)+'" placeholder="paste key"></label>'+
        '<button class="btn btn--primary" id="btnWindy">Load webcams near current view</button>'+
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
