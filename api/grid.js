import { fetchPosts } from "../lib/notion.js";

export default async function handler(req, res) {
  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    if (!process.env.NOTION_TOKEN || !databaseId) {
      res.status(500).setHeader("Content-Type","text/plain; charset=utf-8")
        .end("Internal Error: NOTION_TOKEN / NOTION_DATABASE_ID manquant");
      return;
    }

    const size        = Math.min(Number(req.query.size || 60), 100);
    const gap         = Number(req.query.gap || 1);   // 1px style Instagram
    const radius      = Number(req.query.radius || 0);
    const autoRefresh = Math.max(0, Number(req.query.autorefresh || 0));

    const items = await fetchPosts({ databaseId, pageSize: size });
    const html  = renderHTML({ items, gap, radius, autoRefresh });

    res.setHeader("Content-Security-Policy",
      "frame-ancestors https://www.notion.so https://notion.so https://*.notion.site;");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    console.error("ERROR /api/grid:", err);
    res.status(500).setHeader("Content-Type","text/plain; charset=utf-8")
      .end("Internal Error: " + (err?.message || String(err)));
  }
}

const esc = s => String(s||"").replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function renderHTML({ items, gap, radius, autoRefresh }) {
  const stats = { platforms:new Map(), status:new Map(), total:items.length };
  for (const it of items) {
    (it.platforms||[]).forEach(p=>stats.platforms.set(p,(stats.platforms.get(p)||0)+1));
    if (it.status) stats.status.set(it.status,(stats.status.get(it.status)||0)+1);
  }

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Grid</title>
<style>
:root{--gap:${gap}px;--r:${radius}px}

/* ===== Header (classe fournie) ===== */
.header.jsx-af86871aeff69634{
  width:100%;background:#fff;border-bottom:1px solid #efefef;
  padding:4px 0 12px 0;overflow:visible;position:relative;z-index:100;
}
.header-inner{max-width:750px;margin:0 auto;padding:0 4px;display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #111827;background:#111827;color:#fff;padding:6px 12px;border-radius:12px;cursor:pointer;font-size:13px}
.btn svg{width:14px;height:14px}
.btn-ghost{display:inline-flex;align-items:center;gap:6px;border:1px solid #e5e7eb;background:#fff;color:#111827;padding:6px 10px;border-radius:12px;cursor:pointer}

/* ===== Feuille de filtres ===== */
.sheet{position:relative}
.sheet-panel{
  position:absolute;top:calc(100% + 8px);left:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;
  box-shadow:0 10px 30px rgba(0,0,0,.08);min-width:260px;z-index:60;display:none;padding:10px
}
.sheet.open .sheet-panel{display:block}
.opt-group{padding:6px 6px 8px;border-radius:10px}
.opt-title{font-weight:600;font-size:12px;margin:6px 6px 8px;color:#6b7280;text-transform:uppercase;letter-spacing:.02em}
.opt-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border-radius:10px;cursor:pointer}
.opt-item:hover{background:#f9fafb}
.opt-left{display:flex;align-items:center;gap:10px}
.opt-radio{width:11px;height:11px;border-radius:999px;border:2px solid #111827;display:inline-block}
.opt-item.active .opt-radio{background:#111827}
.opt-count{font-size:12px;color:#6b7280}
.opt-item.disabled{opacity:.45;pointer-events:none;cursor:not-allowed}

/* ===== Container + Grid (style Insta) ===== */
.image-grid-container{position:relative;width:100%;max-width:750px;margin:0 auto;padding:0 4px}
.image-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--gap);width:100%}

/* ===== Cards ===== */
.card{
  position:relative;margin:0 !important;aspect-ratio:4/5;
  width:100%;height:auto;border-radius:var(--r);overflow:hidden;background:#f3f4f6;cursor:pointer
}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block}
.card video{background:#000}

/* Overlays (pin prioritaire, sinon carousel) */
.icn{position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:8px;background:rgba(17,24,39,.85);
     color:#fff;display:grid;place-items:center}
.icn svg{width:14px;height:14px}
.play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:999px;background:rgba(17,24,39,.7);display:grid;place-items:center;color:#fff;font-size:20px}

/* Hoverbar — cachée par défaut, visible au survol */
.hoverbar{
  position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent, rgba(0,0,0,.85));color:#fff;
  padding:10px 12px;display:grid;gap:6px;transform:translateY(100%);opacity:0;pointer-events:none;
  transition:transform .18s ease, opacity .18s ease;
}
.card:hover .hoverbar{transform:translateY(0);opacity:1;pointer-events:auto}
.h-title{font-weight:700;font-size:15px;line-height:1.2;text-shadow:0 1px 0 rgba(0,0,0,.2)}
.h-desc{font-size:12px;opacity:.95;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* ===== Lightbox ===== */
.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999}
.lightbox{
  background:#111;border-radius:16px;max-width:min(95vw,1200px);max-height:92vh;overflow:hidden;
  display:grid;grid-template-columns: minmax(0,1fr) 360px; /* media | info */
}
.lb-media{position:relative;background:#000;display:grid;grid-template-rows:auto 1fr}
.lb-top{display:flex;justify-content:flex-end;padding:8px}
.lb-count{background:rgba(17,24,39,.85);color:#fff;border-radius:999px;padding:4px 10px;font-size:12px}
.stage{position:relative;display:grid;place-items:center}
.stage img,.stage video{max-width:100%;max-height:84vh;width:auto;height:auto;display:block}
.arrow{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:999px;border:none;background:rgba(17,24,39,.85);color:#fff;display:grid;place-items:center;font-size:18px;cursor:pointer}
.arrow.left{left:12px}.arrow.right{right:12px}

/* Panneau d'infos */
.lb-info{background:#fff;color:#111827;display:flex;flex-direction:column;padding:18px 16px 16px}
.info-title{font-weight:700;font-size:18px;line-height:1.2;margin-bottom:4px}
.info-row{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:8px 0}
.badge{font-size:12px;border-radius:999px;padding:4px 8px;border:1px solid #e5e7eb;background:#f9fafb}
.badge.green{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
.badge.yellow{background:#fffbeb;border-color:#fde68a;color:#92400e}
.info-date{font-size:12px;color:#6b7280}
.info-desc{font-size:14px;line-height:1.5;margin-top:8px;white-space:pre-wrap}

@media (max-width: 960px){
  .lightbox{grid-template-columns: 1fr;}
  .lb-info{max-height:45vh;overflow:auto}
}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header jsx-af86871aeff69634">
  <div class="header-inner">
    <button class="btn" id="refresh" title="Refresh">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2" d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>
      Refresh
    </button>

    <div class="sheet" id="filters">
      <button class="btn-ghost" type="button" aria-haspopup="true" aria-expanded="false" id="filtersBtn">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path stroke-width="2" d="M3 4h18M6 12h12M10 20h4"/></svg>
        Filtres
      </button>
      <div class="sheet-panel" role="dialog" aria-label="Filtres">
        <div class="opt-group" id="grp-platforms">
          <div class="opt-title">Platforms</div>
          <div class="opt-item active" data-value=""><div class="opt-left"><span class="opt-radio"></span>All Platforms</div><span class="opt-count">(${stats.total})</span></div>
          ${[...stats.platforms.keys()].sort().map(p=>`
            <div class="opt-item" data-value="${esc(p)}"><div class="opt-left"><span class="opt-radio"></span>${esc(p)}</div><span class="opt-count">(${stats.platforms.get(p)||0})</span></div>
          `).join("")}
        </div>
        <div class="opt-group" id="grp-status">
          <div class="opt-title">Status</div>
          <div class="opt-item active" data-value=""><div class="opt-left"><span class="opt-radio"></span>All Status</div><span class="opt-count">(${stats.total})</span></div>
          ${[...stats.status.keys()].sort().map(s=>`
            <div class="opt-item" data-value="${esc(s)}"><div class="opt-left"><span class="opt-radio"></span>${esc(s)}</div><span class="opt-count">(${stats.status.get(s)||0})</span></div>
          `).join("")}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- GRID -->
<div class="image-grid-container">
  <div class="image-grid" id="grid">
    ${items.map(it => {
      const mediaAttr = encodeURIComponent(JSON.stringify(it.media || [])); // << FIX: JSON complet
      const first = (it.media && it.media[0]) || {type:'image', url:''};
      const hasCarousel = (it.media && it.media.length>1) || false;
      const showPin = !!it.pinned;
      const showCarousel = hasCarousel && !showPin; // pin > carousel

      return `
      <figure class="card"
        data-platforms="${esc((it.platforms||[]).join(','))}"
        data-status="${esc(it.status||'')}"
        data-name="${esc(it.name)}"
        data-desc="${esc(it.description||'')}"
        data-date="${esc(it.date||'')}"
        data-pinned="${showPin ? "true":"false"}"
        data-media="${mediaAttr}">
        ${first.type === 'video'
          ? `<video muted playsinline preload="metadata" src="${esc(first.url)}"></video><div class="play">▶</div>`
          : `<img src="${esc(first.url)}" alt="${esc(it.name)}" loading="lazy"/>`
        }
        ${showPin ? `
          <div class="icn" title="Pinned">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 3l7 7-3 1-3 7-2-2-2-2 7-3 1-3-7-7zM5 21l6-6 2 2-6 6H5v-2z"/></svg>
          </div>` : ``}
        ${showCarousel ? `
          <div class="icn" title="Carousel">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v10H7z"/><path d="M3 3h10v10H3z"/></svg>
          </div>` : ``}
        <figcaption class="hoverbar">
          <div class="h-title">${esc(it.name)}</div>
          <div class="h-desc">${esc((it.description||"").slice(0,180))}</div>
        </figcaption>
      </figure>`;
    }).join("")}
  </div>
</div>

<!-- LIGHTBOX -->
<div class="backdrop" id="backdrop" aria-hidden="true">
  <div class="lightbox">
    <section class="lb-media">
      <div class="lb-top"><div class="lb-count" id="lb-count">1/1</div></div>
      <div class="stage" id="stage">
        <button class="arrow left" id="prev">‹</button>
        <img id="lb-img" alt="" style="display:none"/>
        <video id="lb-vid" controls playsinline style="display:none; background:#000"></video>
        <button class="arrow right" id="next">›</button>
      </div>
    </section>
    <aside class="lb-info" id="info">
      <div class="info-title" id="info-title"></div>
      <div class="info-row">
        <span class="badge" id="info-status" style="display:none"></span>
        <span class="badge yellow" id="info-pinned" style="display:none">Pinned</span>
        <span class="info-date" id="info-date"></span>
      </div>
      <div class="info-row" id="info-platforms"></div>
      <div class="info-desc" id="info-desc"></div>
    </aside>
  </div>
</div>

<script>
  // URL init
  const url = new URL(location.href);
  let curPlat = (url.searchParams.get('platform')||'').trim();
  let curStat = (url.searchParams.get('status')||'').trim();

  const grid = document.getElementById('grid');
  const cards = Array.from(grid.querySelectorAll('.card'));

  // tri (Pinned, date desc)
  cards.sort((a,b)=>{
    const pa=a.dataset.pinned==="true", pb=b.dataset.pinned==="true";
    if (pa!==pb) return pa ? -1 : 1;
    const da=a.dataset.date||"", db=b.dataset.date||"";
    return da<db ? 1 : da>db ? -1 : 0;
  }).forEach(c=>grid.appendChild(c));

  // Helpers match & count
  function matchCard(card, platform, status){
    const plats=(card.dataset.platforms||"").split(',').filter(Boolean);
    const st=card.dataset.status||"";
    const okP = !platform || plats.includes(platform);
    const okS = !status   || st === status;
    return okP && okS;
  }
  function countMatching({platform=null, status=null}){
    let n=0; for(const c of cards) if(matchCard(c, platform, status)) n++; return n;
  }

  function applyFilters(){
    cards.forEach(c=>{
      c.style.display = matchCard(c, curPlat||null, curStat||null) ? "" : "none";
    });
  }

  function recalcCounts(){
    const grpPlat = document.getElementById('grp-platforms');
    const grpStat = document.getElementById('grp-status');

    grpPlat.querySelectorAll('.opt-item').forEach(opt=>{
      const plat = (opt.dataset.value||'') || null;
      const cnt  = countMatching({platform: plat, status: curStat||null});
      const span = opt.querySelector('.opt-count'); if(span) span.textContent = '('+cnt+')';
      const isActive = opt.classList.contains('active');
      opt.classList.toggle('disabled', cnt===0 && !isActive);
      opt.setAttribute('aria-disabled', cnt===0 && !isActive ? 'true':'false');
    });

    grpStat.querySelectorAll('.opt-item').forEach(opt=>{
      const st   = (opt.dataset.value||'') || null;
      const cnt  = countMatching({platform: curPlat||null, status: st});
      const span = opt.querySelector('.opt-count'); if(span) span.textContent = '('+cnt+')';
      const isActive = opt.classList.contains('active');
      opt.classList.toggle('disabled', cnt===0 && !isActive);
      opt.setAttribute('aria-disabled', cnt===0 && !isActive ? 'true':'false');
    });
  }

  applyFilters();
  recalcCounts();

  // Filtres UI
  const sheet = document.getElementById('filters');
  const btn   = document.getElementById('filtersBtn');
  btn.addEventListener('click', ()=>{
    sheet.classList.toggle('open');
    btn.setAttribute('aria-expanded', sheet.classList.contains('open') ? 'true' : 'false');
  });
  document.addEventListener('click', (e)=>{ if(!sheet.contains(e.target)) sheet.classList.remove('open'); });

  function selectLine(container, el){
    container.querySelectorAll('.opt-item').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
  }
  document.getElementById('grp-platforms').addEventListener('click', (e)=>{
    const it=e.target.closest('.opt-item'); if(!it) return;
    selectLine(document.getElementById('grp-platforms'), it);
    curPlat = it.dataset.value || '';
    const u=new URL(location.href); curPlat?u.searchParams.set('platform',curPlat):u.searchParams.delete('platform');
    history.replaceState(null,'',u);
    applyFilters(); recalcCounts();
  });
  document.getElementById('grp-status').addEventListener('click', (e)=>{
    const it=e.target.closest('.opt-item'); if(!it) return;
    selectLine(document.getElementById('grp-status'), it);
    curStat = it.dataset.value || '';
    const u=new URL(location.href); curStat?u.searchParams.set('status',curStat):u.searchParams.delete('status');
    history.replaceState(null,'',u);
    applyFilters(); recalcCounts();
  });

  // Refresh
  document.getElementById('refresh').addEventListener('click', ()=> location.reload());
  ${autoRefresh ? `setInterval(()=>location.reload(), ${autoRefresh*1000});` : ""}

  // LIGHTBOX
  const backdrop=document.getElementById('backdrop');
  const lbImg=document.getElementById('lb-img');
  const lbVid=document.getElementById('lb-vid');
  const lbCount=document.getElementById('lb-count');
  const prevBtn=document.getElementById('prev');
  const nextBtn=document.getElementById('next');
  const stage=document.getElementById('stage');

  // Info panneaux
  const infoTitle=document.getElementById('info-title');
  const infoStatus=document.getElementById('info-status');
  const infoPinned=document.getElementById('info-pinned');
  const infoDate=document.getElementById('info-date');
  const infoPlatforms=document.getElementById('info-platforms');
  const infoDesc=document.getElementById('info-desc');

  let curList=[], curTypes=[], idx=0;

  function showMedia(i){
    idx = i;
    const t = curTypes[i], src = curList[i];
    lbImg.style.display='none'; lbVid.style.display='none';
    if (t==='video'){
      lbVid.src = src; lbVid.currentTime = 0; lbVid.style.display='block'; lbImg.removeAttribute('src');
    }else{
      lbImg.src = src; lbImg.style.display='block'; lbVid.pause(); lbVid.removeAttribute('src');
    }
    lbCount.textContent = (i+1) + "/" + curList.length;
    const nav = curList.length>1;
    prevBtn.style.display = nav?"":"none";
    nextBtn.style.display = nav?"":"none";
  }

  function fillInfoFromCard(card){
    infoTitle.textContent = card.dataset.name || "";
    const st = card.dataset.status || "";
    if (st){
      infoStatus.style.display='inline-block';
      infoStatus.textContent = st;
      infoStatus.className='badge';
      const s = st.toLowerCase();
      if (/approved|published|ok|ready|valid/.test(s)) infoStatus.classList.add('green');
      else if (/draft|pending|planned|planifié|planning/.test(s)) infoStatus.classList.add('yellow');
    } else { infoStatus.style.display='none'; infoStatus.className='badge'; }
    infoPinned.style.display = card.dataset.pinned === "true" ? 'inline-block' : 'none';
    infoDate.textContent = card.dataset.date ? new Date(card.dataset.date).toLocaleString() : "";
    infoPlatforms.innerHTML = "";
    const plats=(card.dataset.platforms||"").split(',').filter(Boolean);
    plats.forEach(p=>{
      const span=document.createElement('span'); span.className='badge'; span.textContent=p; infoPlatforms.appendChild(span);
    });
    infoDesc.textContent = card.dataset.desc || "";
  }

  function openLB(card){
    // <<< FIX: on lit le JSON complet depuis data-media (fin des séparateurs fragiles)
    let media = [];
    try { media = JSON.parse(decodeURIComponent(card.dataset.media || "[]")); }
    catch { media = []; }

    // fallback rétro-compat si besoin
    if (!Array.isArray(media) || media.length === 0) {
      const types = (card.dataset.mtypes||"").split(',').map(s=>s.trim()).filter(Boolean);
      const srcs  = (card.dataset.msrcs ||"").split('|').map(s=>s.trim()).filter(Boolean);
      const L = Math.min(types.length, srcs.length);
      media = Array.from({length:L}, (_,i)=>({type:types[i], url:srcs[i]}));
    }

    curTypes = media.map(m=>m.type);
    curList  = media.map(m=>m.url);

    showMedia(0);
    fillInfoFromCard(card);
    backdrop.style.display='flex';
    document.body.style.overflow='hidden';
  }
  function closeLB(){
    backdrop.style.display='none';
    document.body.style.overflow='';
    lbVid.pause(); lbVid.removeAttribute('src');
    lbImg.removeAttribute('src');
  }
  function next(){ if(!curList.length) return; showMedia((idx+1) % curList.length); }
  function prev(){ if(!curList.length) return; showMedia((idx-1+curList.length) % curList.length); }

  grid.addEventListener('click', e=>{
    const card=e.target.closest('.card'); if(!card || card.style.display==='none') return;
    openLB(card);
  });
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  backdrop.addEventListener('click', e=>{ if(e.target===backdrop) closeLB(); });
  document.addEventListener('keydown', e=>{
    if(backdrop.style.display!=='flex') return;
    if(e.key==='Escape') closeLB();
    if(e.key==='ArrowRight') next();
    if(e.key==='ArrowLeft')  prev();
  });
  // swipe mobile
  let sx=0;
  stage.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;},{passive:true});
  stage.addEventListener('touchend',e=>{
    const dx=e.changedTouches[0].clientX - sx;
    if(Math.abs(dx)>40){ dx<0 ? next() : prev(); }
  },{passive:true});
</script>
</body></html>`;
}
