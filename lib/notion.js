import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const pick = (props, list) => list.find(k => props?.[k]) ? props[list.find(k => props?.[k])] : null;
const clean = s => (s || "").trim();

function isVideoUrl(u="") {
  return /\.(mp4|m4v|mov|webm|ogg)(\?|$)/i.test(u);
}
function isImageUrl(u="") {
  return /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(u);
}

// URL extractor pour rich_text
function extractUrlsFromRichText(rt = []) {
  const txt = rt.map(t => [t.href, t.plain_text].filter(Boolean).join(" ")).join(" ");
  const urls = [];
  const rx = /\bhttps?:\/\/[^\s)'"<>]+/gi;
  let m;
  while ((m = rx.exec(txt))) urls.push(m[0]);
  return [...new Set(urls.map(clean))];
}

// Proxy unique pour images/vidéos (gère aussi Canva, og:image/og:video)
function viaProxy(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    const permissive = /(images\.unsplash\.com|cloudfront|imgur|githubusercontent|googleusercontent|cdn)/.test(host);
    if ((isImageUrl(u) || isVideoUrl(u)) && permissive) return u;
  } catch {}
  return `/api/media?url=${encodeURIComponent(u)}`;
}

export async function fetchPosts({ databaseId, pageSize = 60 }) {
  const resp = await notion.databases.query({
    database_id: databaseId,
    page_size: pageSize,
    sorts: [
      { property: "Pinned", direction: "descending" },
      { property: "Date",   direction: "descending" }
    ]
  });

  const items = [];
  for (const page of resp.results || []) {
    const props = page.properties || {};

    const pTitle = pick(props, ["Name", "Titre du post", "Titre"]);
    const name = pTitle?.title?.[0]?.plain_text ?? "Untitled";

    const pDesc = pick(props, ["Description", "Caption", "Texte"]);
    const description =
      pDesc?.type === "rich_text"
        ? (pDesc.rich_text || []).map(t => t.plain_text || "").join("")
        : (pDesc?.[pDesc?.type] ?? "") || "";

    // ---- Médias : agrège toutes les sources (files, url, rich_text)
    const sources = [];
    const pImg = pick(props, ["Images", "Image", "Visuel", "Galerie", "Image URL", "Media"]);
    if (pImg?.type === "files" && Array.isArray(pImg.files) && pImg.files.length) {
      for (const f of pImg.files) {
        const raw = f.type === "external" ? clean(f.external.url) : clean(f.file.url);
        if (raw) sources.push(raw);
      }
    } else if (pImg?.type === "url" && pImg.url) {
      sources.push(...clean(pImg.url).split(/[,\n\r]+/).map(clean).filter(Boolean));
    } else if (pImg?.type === "rich_text" && pImg.rich_text?.length) {
      sources.push(...extractUrlsFromRichText(pImg.rich_text));
    }
    // fallback éventuel
    if (!sources.length) {
      const pAlt = pick(props, ["Carousel", "Photos", "URL"]);
      if (pAlt?.type === "rich_text") sources.push(...extractUrlsFromRichText(pAlt.rich_text));
      else if (pAlt?.type === "url" && pAlt.url) sources.push(...clean(pAlt.url).split(/[,\n\r]+/).map(clean).filter(Boolean));
    }

    // typage
    const media = sources
      .map(src => {
        const type = isVideoUrl(src) ? "video" : (isImageUrl(src) ? "image" : "unknown");
        return { type: type === "unknown" ? "image" : type, url: viaProxy(src) };
      })
      .filter(m => m.url);

    const status  = pick(props, ["Status", "Statut"])?.select?.name ?? null;
    const pinned  = pick(props, ["Pinned", "Épingler", "Epingler"])?.checkbox ?? false;
    const date    = pick(props, ["Date"])?.date?.start ?? null;
    const ms      = props?.Social?.multi_select;
    const platforms = Array.isArray(ms) ? ms.map(s => s?.name).filter(Boolean) : [];

    if (media.length) items.push({ id: page.id, name, description, media, status, pinned, date, platforms });
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    if (a.date && b.date)      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    return 0;
  });

  return items;
}
