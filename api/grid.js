import { fetchPosts } from "../lib/notion.js";

export default async function handler(req, res) {
  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    if (!process.env.NOTION_TOKEN || !databaseId) {
      res.status(500)
        .setHeader("Content-Type","text/plain; charset=utf-8")
        .end("Internal Error: Server not configured: NOTION_TOKEN / NOTION_DATABASE_ID");
      return;
    }

    const size        = Math.min(Number(req.query.size || 60), 100);
    const gap         = Number(req.query.gap || 12);
    const cols        = Number(req.query.cols || 3);
    const radius      = Number(req.query.radius || 16);
    const showCaptions= String(req.query.captions || "false") === "true";
    const autoRefresh = Math.max(0, Number(req.query.autorefresh || 0));

    const items = await fetchPosts({ databaseId, pageSize: size });
    const html  = renderHTML({ items, cols, gap, radius, showCaptions, autoRefresh });

    res.setHeader("Content-Security-Policy",
      "frame-ancestors https://www.notion.so https://notion.so https://*.notion.site;");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    console.error("ERROR /api/grid:", err);
    res.status(500)
      .setHeader("Content-Type","text/plain; charset=utf-8")
      .end("Internal Error: " + (err?.message || String(err)));
  }
}

function esc(s=""){return String(s).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function renderHTML({ items, cols, gap, radius, showCaptions, autoRefresh }) {
  const statusColor = (s) => {
    if (!s) return "#111827";
    const n = s.toLowerCase();
    if (n.includes("publish"))  return "#16a34a";
    if (n.includes("approve"))  return "#2563eb";
    if (n.includes("draft"))    return "#6b7280";
    return "#111827";
  };

  const allPlatforms = [...new Set(items.flatMap(i => i.platforms || []))].sort();
  const allStatuses  = [...new Set(items.map(i => i.status).filter(Boolean))].sort();

  // placeholders 3x3
  const placeholders = Array.from({length: 9}).map(() => `
    <div class="ph">
      <div class="ph-dot"></div>
      <div class="ph-text">No Content</div>
    </div>
  `).join("");

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Grid</title>
<style>
:root{--gap:${gap}px;--radius:${radius}px}
*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111827}
.wrap{padding:var(--gap)}

/* Topbar */
.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:var(--gap);border-bottom:1px solid #eee;padding-bottom:8px}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #111827;background:#111827;color:#fff;padding:6px 12px;border-radius:12px;cursor:pointer;font-size:13px}
.btn svg{width:14px;height:14px}
.btn:hover{filter:brightness(1.05)}
.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.group{display:flex;gap:6px;align-items:center}
.label{font-size:13px;color:#6b7280}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-flex;gap:6px;align-items:center;background:#f3f4f6;border:1px solid #e5e7eb;padding:4px 8px;border-radius:999px;font-size:12px}
.chip .x{cursor:pointer;border:none;background:transparent;font-weight:700}

/* Grid */
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:var(--gap)}
.item{position:relative;aspect-ratio:1/1;overflow:hidden;border-radius:var(--radius);background:#f2f2f2;cursor:pointer}
.item img{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:8px;left:8px;padding:4px 10px;font-size:12px;border-radius:999px;color:#fff}
.caption{font-size:12px;color:#444;line-height:1.3;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}

/* Placeholders */
.empty{display:none}
.ph{aspect-ratio:1/1;border-radius:var(--radius);background:linear-gradient(#e5e7eb,#e5e7eb) padding-box,linear-gradient(#fff,#fff) border-box;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;position:relative}
.ph-dot{position:absolute;top:8px;left:8px;width:10px;height:10px;border-radius:999px;background:#d1d5db}
.ph-text{color:#9ca3af;font-size:12px}

/* Badge footer */
.footer-badge{position:sticky;bottom:8px;display:flex;justify-content:center;margin-top:var(--gap)}
.footer-pill{display:inline-flex;gap:6px;align-items:center;background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;box-shadow:0 6px 30px rgba(0,0,0,.08);font-size:12px;color:#6b7280}
.footer-pill a{color:#ef4444;text-decoration:none}
.footer-pill a:hover{text-decoration:underline}

/* Modal */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999}
.modal{width:min(1040px,96vw);max-height:92vh;background:#fff;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.modal-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid #eee}
.title{font-weight:600;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{padding:4px 10px;border-radius:999px;color:#fff;font-size:12px}
.modal-body{display:grid;grid-template-columns:1fr 380px}
.modal-media{background:#000;display:flex;align-items:center;justify-content:center}
.modal-media img{max-width:100%;max-height:82vh;width:auto;height:auto;object-fit:contain}
.meta{padding:14px;display:grid;gap:10px;overflow:auto}
.meta dt{font-size:12px;font-weight:600;color:#555}
.meta dd{margin:0;font-size:14px;color:#111;word-break:break-word}
.row{display:grid;grid-template-columns:100px 1fr;gap:8px;align-items:center}
.chips-sm{display:flex;gap:6px;flex-wrap:wrap}
.chip-sm{padding:3px 8px;border-radius:999px;font-size:12px;border:1px solid #e5e7eb;background:#fff}
.close{border:none;background:#ef4444;color:#fff;padding:6px 10px;border-radius:10px;cursor:pointer}
@media(max-width:920px){.modal-body{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <button class="btn" id="btn-refresh" title="Refresh">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2" d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>
      Refresh
    </button>

    <div class="controls">
      <div class="group">
        <span class="label">Social</span>
        <div class="chips" id="plat-chips"></div>
        <select id="plat-select">
          <option value="">+ Ajouter</option>
          ${allPlatforms.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join("")}
        </select>
      </div>
      <div class="group">
        <span class="label">Statut</span>
        <div class="chips" id="stat-chips"></div>
        <select id="stat-select">
          <option value="">+ Ajouter</option>
          ${allStatuses.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")}
        </select>
      </div>
    </div>
  </div>

  <!-- GRID -->
  <div class="grid" id="grid">
    ${items.map((it,idx)=>`
      <figure class="item"
        data-idx="${idx}"
        data-name="${esc(it.name)}"
        data-desc="${esc(it.description || "")}"
        data-image="${esc(it.imageUrl)}"
        data-status="${esc(it.status || "")}"
        data-date="${esc(it.date || "")}"
        data-pinned="${it.pinned ? "true" : "false"}"
        data-platforms="${esc((it.platforms || []).join(","))}">
        <img src="${esc(it.imageUrl)}" alt="${esc(it.name)}" loading="lazy" />
        ${it.status ? `<figcaption class="badge" style="background:${statusColor(it.status)}">${esc(it.status)}</figcaption>` : ""}
      </figure>
    `).join("")}
  </div>

  <!-- PLACEHOLDERS -->
  <div class="grid empty" id="empty">${placeholders}</div>

  ${showCaptions ? `<div style="margin-top:var(--gap);display:grid;gap:var(--gap);grid-template-columns:repeat(${cols},1fr);">${items.map(it => `<div class="caption">${esc(it.name)}</div>`).join("")}</div>` : ""}

  <div class="footer-badge">
    <div class="footer-pill">
      Powered by <a href="https://graceandgrow.fr" target="_blank" rel="noreferrer">Grace and Grow</a>
    </div>
  </div>
</div>

<!-- MODAL -->
<div class="modal-backdrop" id="backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <div class="title" id="m-title">Détail</div>
      <div>
        <span id="m-status" class="pill">Status</span>
        <button class="close" id="m-close" aria-label="Fermer">Fermer</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="modal-media"><img id="m-image" alt="" /></div>
      <dl class="meta">
        <div class="row"><dt>Nom</dt><dd id="m-name">—</dd></div>
        <div class="row"><dt>Date</dt><dd id="m-date">—</dd></div>
        <div class="row"><dt>Pinned</dt><dd id="m-pinned">—</dd></div>
        <div class="row"><dt>Plateformes</dt><dd><div id="m-platforms" class="chips-sm"></div></dd></div>
        <div class="row"><dt>Source</dt><dd id="m-src">—</dd></div>
        <div class="row" style="grid-template-columns:100px 1fr;"><dt>Description</dt><dd id="m-desc">—</dd></div>
      </dl>
    </div>
  </div>
</div>

<script>
  // init from URL
  const url = new URL(location.href);
  const initPlat = (url.searchParams.get('platforms')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const initStat = (url.searchParams.get('status')||'').split(',').map(s=>s.trim()).filter(Boolean);

  const grid = document.getElementById('grid');
  const items = Array.from(grid.querySelectorAll('.item'));
  const emptyGrid = document.getElementById('empty');

  // helpers
  function fmtDate(s){ if(!s) return "—"; try{ return new Date(s).toLocaleString(); }catch(e){ return s; } }
  function statusColor(s){
    if(!s) return "#111827"; s=s.toLowerCase();
    if (s.includes("publish"))  return "#16a34a";
    if (s.includes("approve"))  return "#2563eb";
    if (s.includes("draft"))    return "#6b7280";
    return "#111827";
  }
  function visibleCount(){
    return items.reduce((n,el)=> n + (el.style.display !== "none" ? 1 : 0), 0);
  }
  function toggleEmpty(){
    const v = visibleCount();
    emptyGrid.style.display = v === 0 ? "" : "none";
    grid.style.opacity = v === 0 ? 0.25 : 1;
  }

  // filters
  const platSelect = document.getElementById('plat-select');
  const statSelect = document.getElementById('stat-select');
  const platChips  = document.getElementById('plat-chips');
  const statChips  = document.getElementById('stat-chips');
  const P = new Set(initPlat);
  const S = new Set(initStat);

  function renderChips(container, set, key){
    container.innerHTML = [...set].map(v =>
      '<span class="chip">'+v+'<button class="x" data-key="'+key+'" data-val="'+v+'">×</button></span>'
    ).join("");
  }
  function applyFilters(){
    const wantsPlat = [...P]; const wantsStat = [...S];
    items.forEach(fig=>{
      const plats = (fig.dataset.platforms||"").split(',').filter(Boolean);
      const status= (fig.dataset.status||"");
      const okPlat  = !wantsPlat.length || wantsPlat.some(p=>plats.includes(p));
      const okStat  = !wantsStat.length || wantsStat.includes(status);
      fig.style.display = (okPlat && okStat) ? "" : "none";
    });
    const u = new URL(location.href);
    wantsPlat.length ? u.searchParams.set('platforms', wantsPlat.join(',')) : u.searchParams.delete('platforms');
    wantsStat.length ? u.searchParams.set('status', wantsStat.join(','))     : u.searchParams.delete('status');
    history.replaceState(null,'',u.toString());
    toggleEmpty();
  }
  renderChips(platChips,P,'plat'); renderChips(statChips,S,'stat'); applyFilters();

  platSelect.addEventListener('change', e=>{ const v=e.target.value; if(v) P.add(v); e.target.value=""; renderChips(platChips,P,'plat'); applyFilters(); });
  statSelect.addEventListener('change', e=>{ const v=e.target.value; if(v) S.add(v); e.target.value=""; renderChips(statChips,S,'stat'); applyFilters(); });
  document.addEventListener('click', e=>{
    const b=e.target.closest('.x'); if(!b) return;
    (b.dataset.key==='plat'?P:S).delete(b.dataset.val);
    (b.dataset.key==='plat'?renderChips(platChips,P,'plat'):renderChips(statChips,S,'stat'));
    applyFilters();
  });

  // modal
  const backdrop=document.getElementById('backdrop');
  const mClose=document.getElementById('m-close');
  const mTitle=document.getElementById('m-title');
  const mImage=document.getElementById('m-image');
  const mName =document.getElementById('m-name');
  const mDate =document.getElementById('m-date');
  const mPinned=document.getElementById('m-pinned');
  const mSrc  =document.getElementById('m-src');
  const mStatus=document.getElementById('m-status');
  const mDesc =document.getElementById('m-desc');
  const mPlatforms=document.getElementById('m-platforms');

  grid.addEventListener('click', e=>{
    const fig=e.target.closest('.item'); if(!fig || fig.style.display==='none') return;
    const name=fig.dataset.name||"", image=fig.dataset.image||"", status=fig.dataset.status||"", date=fig.dataset.date||"", pinned=fig.dataset.pinned==="true", desc=fig.dataset.desc||"";
    const platforms=(fig.dataset.platforms||"").split(',').filter(Boolean);

    mTitle.textContent=name||"Détail"; mImage.src=image; mImage.alt=name;
    mName.textContent=name||"—"; mDate.textContent=fmtDate(date); mPinned.textContent=pinned?"Oui":"Non";
    mSrc.textContent=image||"—"; mDesc.textContent=desc||"—";
    mStatus.textContent=status||"—"; mStatus.style.background=statusColor(status);
    mPlatforms.innerHTML=platforms.length?platforms.map(p=>'<span class="chip-sm">'+p+'</span>').join(''):"—";

    backdrop.style.display='flex'; document.body.style.overflow='hidden';
  });
  function closeModal(){ backdrop.style.display='none'; document.body.style.overflow=''; }
  mClose.addEventListener('click', closeModal);
  backdrop.addEventListener('click', e=>{ if(e.target===backdrop) closeModal(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

  // refresh
  document.getElementById('btn-refresh')?.addEventListener('click', ()=>location.reload());
  ${autoRefresh ? `setInterval(()=>location.reload(), ${autoRefresh*1000});` : ""}

  // À l'init, si tout est filtré, montre les placeholders
  toggleEmpty();
</script>
</body></html>`;
}
