import { fetchPosts } from "../lib/notion.js";

export default async function handler(req, res) {
  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    if (!process.env.NOTION_TOKEN || !databaseId) {
      res.status(500).setHeader("Content-Type","text/plain; charset=utf-8")
        .end("Internal Error: Server not configured: NOTION_TOKEN / NOTION_DATABASE_ID");
      return;
    }

    const size        = Math.min(Number(req.query.size || 60), 100);
    const gap         = Number(req.query.gap || 12);
    const cols        = Number(req.query.cols || 3);
    const radius      = Number(req.query.radius || 16);
    const autoRefresh = Math.max(0, Number(req.query.autorefresh || 0));

    const items = await fetchPosts({ databaseId, pageSize: size });
    const html  = renderHTML({ items, cols, gap, radius, autoRefresh });

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

function esc(s=""){return String(s).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function renderHTML({ items, cols, gap, radius, autoRefresh }) {
  // comptages pour menus
  const total = items.length;
  const byPlatform = new Map();
  const byStatus   = new Map();
  for (const it of items) {
    (it.platforms || []).forEach(p => byPlatform.set(p, (byPlatform.get(p)||0)+1));
    if (it.status) byStatus.set(it.status, (byStatus.get(it.status)||0)+1);
  }
  const platforms = [...byPlatform.keys()].sort();
  const statuses  = [...byStatus.keys()].sort();

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Grid</title>
<style>
:root{--gap:${gap}px;--radius:${radius}px}
*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111827}
.wrap{padding:var(--gap)}
/* top bar */
.top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:var(--gap);border-bottom:1px solid #eee;padding-bottom:8px}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #111827;background:#111827;color:#fff;padding:6px 12px;border-radius:12px;cursor:pointer;font-size:13px}
.btn svg{width:14px;height:14px}
/* dropdowns */
.dd{position:relative}
.dd-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid #e5e7eb;background:#fff;padding:6px 12px;border-radius:12px;cursor:pointer;font-size:13px;min-width:160px;justify-content:space-between}
.dd-menu{position:absolute;top:calc(100% + 6px);left:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.08);min-width:220px;z-index:50;display:none}
.dd.open .dd-menu{display:block}
.dd-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;cursor:pointer}
.dd-item:hover{background:#f9fafb}
.dd-radio{width:10px;height:10px;border-radius:999px;border:2px solid #111827;display:inline-block;margin-right:8px;position:relative}
.dd-item.active .dd-radio{background:#111827}
/* grid */
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:var(--gap)}
.card{position:relative;aspect-ratio:1/1;border-radius:var(--radius);overflow:hidden;background:#f3f4f6;cursor:pointer}
.card img{width:100%;height:100%;object-fit:cover;display:block}
.pin{position:absolute;top:8px;right:8px;width:18px;height:18px;border-radius:50%;background:rgba(17,24,39,.8);color:#fff;display:grid;place-items:center;font-size:12px}
.hoverbar{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent, rgba(0,0,0,.75));color:#fff;padding:10px 10px 8px 10px;transform:translateY(100%);transition:.18s ease;display:grid;gap:6px}
.card:hover .hoverbar{transform:translateY(0)}
.h-title{font-weight:600;font-size:14px;line-height:1.2}
.h-meta{display:flex;gap:10px;align-items:center;font-size:12px;opacity:.9}
.h-desc{font-size:12px;opacity:.9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
/* empty state */
.empty{display:none;margin-top:var(--gap)}
.ph{aspect-ratio:1/1;border-radius:var(--radius);background:#e5e7eb;display:grid;place-items:center;color:#9ca3af;font-size:12px}
@media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <button class="btn" id="refresh" title="Refresh">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="2" d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>
      Refresh
    </button>

    <div class="dd" id="dd-platform">
      <button class="dd-btn" type="button"><span id="lb-platform">All Platforms</span><span>▾</span></button>
      <div class="dd-menu">
        <div class="dd-item active" data-value=""><span><span class="dd-radio"></span>All Platforms</span><span>(${total})</span></div>
        ${platforms.map(p => `
          <div class="dd-item" data-value="${esc(p)}"><span><span class="dd-radio"></span>${esc(p)}</span><span>(${byPlatform.get(p)||0})</span></div>
        `).join("")}
      </div>
    </div>

    <div class="dd" id="dd-status">
      <button class="dd-btn" type="button"><span id="lb-status">All Status</span><span>▾</span></button>
      <div class="dd-menu">
        <div class="dd-item active" data-value=""><span><span class="dd-radio"></span>All Status</span><span>(${total})</span></div>
        ${statuses.map(s => `
          <div class="dd-item" data-value="${esc(s)}"><span><span class="dd-radio"></span>${esc(s)}</span><span>(${byStatus.get(s)||0})</span></div>
        `).join("")}
      </div>
    </div>
  </div>

  <div class="grid" id="grid">
    ${items.map(it => `
      <figure class="card"
        data-platforms="${esc((it.platforms||[]).join(','))}"
        data-status="${esc(it.status||'')}"
        data-name="${esc(it.name)}"
        data-desc="${esc(it.description||'')}"
        data-date="${esc(it.date||'')}"
        data-pinned="${it.pinned ? "true":"false"}">
        <img src="${esc(it.imageUrl)}" alt="${esc(it.name)}" loading="lazy"/>
        ${it.pinned ? `<div class="pin">★</div>` : ``}
        <div class="hoverbar">
          <div class="h-title">${esc(it.name)}</div>
          <div class="h-desc">${esc((it.description||"").slice(0,180))}</div>
          <div class="h-meta">
            <span>${it.date ? new Date(it.date).toLocaleDateString() : ""}</span>
          </div>
        </div>
      </figure>
    `).join("")}
  </div>

  <!-- empty placeholders 3x3 -->
  <div class="grid empty" id="empty">
    ${Array.from({length:9}).map(()=>`<div class="ph">No Content</div>`).join("")}
  </div>
</div>

<script>
  // init from URL (single-select)
  const url = new URL(location.href);
  let curPlat = (url.searchParams.get('platform')||'').trim();   // '' = All
  let curStat = (url.searchParams.get('status')||'').trim();

  const grid = document.getElementById('grid');
  const cards = Array.from(grid.querySelectorAll('.card'));
  const empty = document.getElementById('empty');

  // tri: pinned d'abord puis date desc (conservé au cas où)
  cards.sort((a,b)=>{
    const pa = a.dataset.pinned==="true", pb = b.dataset.pinned==="true";
    if (pa!==pb) return pa ? -1 : 1;
    const da = a.dataset.date || "", db = b.dataset.date || "";
    return da<db ? 1 : da>db ? -1 : 0;
  }).forEach(c => grid.appendChild(c));

  function applyFilters(){
    let shown = 0;
    cards.forEach(card=>{
      const plats = (card.dataset.platforms||"").split(',').filter(Boolean);
      const st = card.dataset.status||"";
      const okPlat = !curPlat || plats.includes(curPlat);
      const okStat = !curStat || st===curStat;
      const show = okPlat && okStat;
      card.style.display = show ? "" : "none";
      if (show) shown++;
    });
    empty.style.display = shown ? "none" : "";
  }
  applyFilters();

  // dropdowns
  function setupDropdown(rootId, labelId, onChange){
    const root = document.getElementById(rootId);
    const btn  = root.querySelector(".dd-btn");
    const menu = root.querySelector(".dd-menu");
    const lab  = document.getElementById(labelId);
    btn.addEventListener("click", ()=> root.classList.toggle("open"));
    menu.addEventListener("click", e=>{
      const it = e.target.closest(".dd-item"); if(!it) return;
      menu.querySelectorAll(".dd-item").forEach(n=>n.classList.remove("active"));
      it.classList.add("active");
      const val = it.getAttribute("data-value") || "";
      lab.textContent = val ? it.textContent.replace(/\\(.*\\)$/,'').trim() : (rootId==="dd-platform"?"All Platforms":"All Status");
      onChange(val);
      root.classList.remove("open");
    });
    document.addEventListener("click", e=>{ if(!root.contains(e.target)) root.classList.remove("open"); });
  }

  setupDropdown("dd-platform","lb-platform",(val)=>{
    curPlat = val;
    const u=new URL(location.href); val ? u.searchParams.set('platform',val) : u.searchParams.delete('platform');
    history.replaceState(null,'',u.toString());
    applyFilters();
  });
  setupDropdown("dd-status","lb-status",(val)=>{
    curStat = val;
    const u=new URL(location.href); val ? u.searchParams.set('status',val) : u.searchParams.delete('status');
    history.replaceState(null,'',u.toString());
    applyFilters();
  });

  // refresh
  document.getElementById('refresh').addEventListener('click', ()=> location.reload());
  ${autoRefresh ? `setInterval(()=>location.reload(), ${autoRefresh*1000});` : ""}

</script>
</body></html>`;
}
