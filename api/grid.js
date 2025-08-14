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

    const size   = Math.min(Number(req.query.size || 60), 100);
    const gap    = req.query.gap || 8;
    const cols   = req.query.cols || 3;
    const radius = req.query.radius || 12;
    const showCaptions = String(req.query.captions || "false") === "true";
    const autoRefresh  = Math.max(0, Number(req.query.autorefresh || 0)); // secondes (0 = off)

    const items = await fetchPosts({ databaseId, pageSize: size });
    const html  = renderHTML({ items, cols, gap, radius, showCaptions, autoRefresh });

    res.setHeader("Content-Security-Policy",
      "frame-ancestors https://www.notion.so https://notion.so https://*.notion.site;");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    console.error("ERROR in /api/grid:", err);
    res.status(500)
      .setHeader("Content-Type","text/plain; charset=utf-8")
      .end("Internal Error: " + (err?.message || String(err)));
  }
}

function esc(s = "") {
  return String(s).replace(/[&<>\"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]).slice(0, 5000);
}

function renderHTML({ items, cols, gap, radius, showCaptions, autoRefresh }) {
  const statusStyle = (s) => {
    if (!s) return "";
    const n = s.toLowerCase();
    if (n.includes("publish") || n.includes("live")) return "background:#16a34a;";
    if (n.includes("approve")) return "background:#2563eb;";
    if (n.includes("draft")) return "background:#6b7280;";
    return "background:rgba(0,0,0,.7);"; // planned/others
  };

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Notion Grid</title>
<style>
:root{--gap:${Number(gap)}px;--radius:${Number(radius)}px}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}

.wrap{padding:var(--gap)}
.topbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:var(--gap)}
.btn{border:1px solid #e5e7eb;background:#fff;padding:6px 10px;border-radius:10px;cursor:pointer;font-size:13px}
.btn:hover{background:#f3f4f6}

.grid{display:grid;grid-template-columns:repeat(${Number(cols)},1fr);gap:var(--gap)}
.item{position:relative;aspect-ratio:1/1;overflow:hidden;border-radius:var(--radius);background:#f2f2f2;cursor:pointer}
.item img{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:8px;left:8px;padding:4px 8px;font-size:12px;border-radius:999px;color:#fff;backdrop-filter:blur(4px)}
.caption{font-size:12px;color:#444;line-height:1.3;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}

/* Modal */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999}
.modal{width:min(980px,96vw);max-height:92vh;background:#fff;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.modal-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-bottom:1px solid #eee}
.title{font-weight:600;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{padding:4px 10px;border-radius:999px;color:#fff;font-size:12px}
.modal-body{display:grid;grid-template-columns:1fr 360px;gap:0}
.modal-media{background:#000;display:flex;align-items:center;justify-content:center}
.modal-media img{max-width:100%;max-height:80vh;width:auto;height:auto;display:block;object-fit:contain}
.meta{padding:12px 16px;display:grid;gap:10px;overflow:auto}
.meta dt{font-size:12px;font-weight:600;color:#555}
.meta dd{margin:0;font-size:14px;color:#111;word-break:break-word}
.row{display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center}
.chips-sm{display:flex;gap:6px;flex-wrap:wrap}
.chip-sm{padding:3px 8px;border-radius:999px;font-size:12px;border:1px solid #e5e7eb;background:#fff}
.close{border:none;background:#ef4444;color:#fff;padding:6px 10px;border-radius:10px;cursor:pointer}
@media(max-width:900px){.modal-body{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <button class="btn" id="btn-refresh" title="Rafraîchir">Rafraîchir</button>
    </div>

    <div class="grid" id="grid">
      ${items.map(it => `
        <figure class="item"
          data-name="${esc(it.name)}"
          data-desc="${esc(it.description || "")}"
          data-image="${esc(it.imageUrl)}"
          data-status="${esc(it.status || "")}"
          data-date="${esc(it.date || "")}"
          data-pinned="${it.pinned ? "true" : "false"}"
          data-platforms="${esc((it.platforms || []).join(","))}"
          title="${esc(it.name)}">
          <img src="${esc(it.imageUrl)}" alt="${esc(it.name)}" loading="lazy" />
          ${it.status ? `<figcaption class="badge" style="${statusStyle(it.status)}">${esc(it.status)}</figcaption>` : ""}
        </figure>
      `).join("\n")}
    </div>
    ${showCaptions ? `<div style="margin-top:var(--gap);display:grid;gap:var(--gap);grid-template-columns:repeat(${Number(cols)},1fr);">${items.map(it => `<div class="caption">${esc(it.name)}</div>`).join("")}</div>` : ""}
  </div>

  <!-- Modal -->
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
          <div class="row" style="grid-template-columns:90px 1fr;"><dt>Description</dt><dd id="m-desc">—</dd></div>
        </dl>
      </div>
    </div>
  </div>

<script>
  // Utils
  function fmtDate(s){ if(!s) return "—"; try{ return new Date(s).toLocaleString(); }catch(e){ return s; } }
  function statusStyle(s){
    if(!s) return "background:rgba(0,0,0,.7);";
    s = s.toLowerCase();
    if (s.includes("publish") || s.includes("live")) return "background:#16a34a;";
    if (s.includes("approve")) return "background:#2563eb;";
    if (s.includes("draft")) return "background:#6b7280;";
    return "background:rgba(0,0,0,.7);";
  }

  const grid = document.getElementById('grid');
  const backdrop = document.getElementById('backdrop');
  const mClose = document.getElementById('m-close');
  const mTitle = document.getElementById('m-title');
  const mImage = document.getElementById('m-image');
  const mName  = document.getElementById('m-name');
  const mDate  = document.getElementById('m-date');
  const mPinned= document.getElementById('m-pinned');
  const mSrc   = document.getElementById('m-src');
  const mStatus= document.getElementById('m-status');
  const mDesc  = document.getElementById('m-desc');
  const mPlatforms = document.getElementById('m-platforms');

  // Fix "click bug" : on ne réagit qu'au vrai click sur .item
  grid?.addEventListener('click', (e)=>{
    const fig = e.target.closest('.item');
    if(!fig || !grid.contains(fig)) return;

    const name = fig.dataset.name || "";
    const image = fig.dataset.image || "";
    const status = fig.dataset.status || "";
    const date = fig.dataset.date || "";
    const pinned = fig.dataset.pinned === "true";
    const desc = fig.dataset.desc || "";
    const platforms = (fig.dataset.platforms || "").split(",").filter(Boolean);

    mTitle.textContent = name || "Détail";
    mImage.src = image; mImage.alt = name;
    mName.textContent = name || "—";
    mDate.textContent = fmtDate(date);
    mPinned.textContent = pinned ? "Oui" : "Non";
    mSrc.textContent = image || "—";
    mDesc.textContent = desc || "—";
    mStatus.textContent = status || "—";
    mStatus.style = statusStyle(status);
    mPlatforms.innerHTML = platforms.length ? platforms.map(p => '<span class="chip-sm">'+p+'</span>').join('') : "—";

    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // bloque le scroll derrière
  }, { passive:true });

  function closeModal(){ backdrop.style.display='none'; document.body.style.overflow=''; }
  mClose.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) closeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });

  // Bouton rafraîchir (utile dans l'embed Notion)
  document.getElementById('btn-refresh')?.addEventListener('click', ()=> location.reload());

  // Auto-refresh si ?autorefresh=XX
  ${autoRefresh ? `setInterval(()=>location.reload(), ${autoRefresh*1000});` : ""}
</script>
</body></html>`;
}
