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

    // Options via query
    const size = Math.min(Number(req.query.size || 60), 100);
    const gap = req.query.gap || 6;
    const cols = req.query.cols || 3;
    const radius = req.query.radius || 12;
    const showCaptions = String(req.query.captions || "false") === "true";

    const items = await fetchPosts({ databaseId, pageSize: size });
    const html = renderHTML({ items, cols, gap, radius, showCaptions });

    // Autorise l’embed dans Notion
    res.setHeader("Content-Security-Policy",
      "frame-ancestors https://www.notion.so https://notion.so https://*.notion.site;");
    res.setHeader("Cache-Control", "public, max-age=120");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    console.error(err);
    res.status(500)
      .setHeader("Content-Type","text/plain; charset=utf-8")
      .end("Internal Error: " + (err?.message || String(err)) + "\n\n" + (err?.stack || ""));
  }
}

function esc(s = "") {
  return String(s).replace(/[&<>\"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function renderHTML({ items, cols, gap, radius, showCaptions }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Notion Instagram Grid</title>
<style>
  :root { --gap:${Number(gap)}px; --radius:${Number(radius)}px; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
  .wrap { padding: var(--gap); }
  .grid { display:grid; grid-template-columns: repeat(${Number(cols)}, 1fr); gap: var(--gap); }
  .item { position:relative; aspect-ratio:1/1; overflow:hidden; border-radius:var(--radius); background:#f2f2f2; }
  .item img { width:100%; height:100%; object-fit:cover; display:block; }
  .badge { position:absolute; top:8px; left:8px; padding:4px 8px; font-size:12px; border-radius:999px; background:rgba(0,0,0,.7); color:#fff; backdrop-filter:blur(4px); }
  .caption { font-size:12px; color:#444; line-height:1.3; margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  @media (max-width:640px){ .grid { grid-template-columns: repeat(2,1fr); } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="grid">
      ${items.map(it => `
        <figure class="item" title="${esc(it.name)}">
          <img src="${esc(it.imageUrl)}" alt="${esc(it.name)}" loading="lazy" />
          ${it.status ? `<figcaption class="badge">${esc(it.status)}</figcaption>` : ""}
        </figure>
      `).join("\n")}
    </div>
    ${showCaptions ? `<div style="margin-top:var(--gap);display:grid;gap:var(--gap);grid-template-columns:repeat(${Number(cols)},1fr);">
      ${items.map(it => `<div class="caption">${esc(it.name)}</div>`).join("")}
    </div>` : ""}
  </div>
</body>
</html>`;
}
