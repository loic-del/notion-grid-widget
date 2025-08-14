import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_TOKEN });

function pick(props, names) { for (const n of names) if (props && props[n]) return props[n]; return null; }
function cleanUrl(u) { return (u || "").trim(); }

export async function fetchPosts({ databaseId, pageSize = 60 }) {
  const resp = await notion.databases.query({
    database_id: databaseId,
    page_size: pageSize,
    sorts: [
      { property: "Pinned", direction: "descending" },
      { property: "Date", direction: "descending" }
    ]
  });

  const items = [];
  for (const page of resp.results || []) {
    const props = page.properties || {};

    // Titre
    const pTitle = pick(props, ["Name", "Titre du post", "Titre"]);
    const name = pTitle?.title?.[0]?.plain_text ?? "Untitled";

    // Description
    const pDesc = pick(props, ["Description", "Caption", "Texte"]);
    const description =
      pDesc?.type === "rich_text"
        ? (pDesc.rich_text || []).map(t => t.plain_text || "").join("")
        : (pDesc?.[pDesc?.type] ?? "") || "";

    // IMAGES (plusieurs)
    const pImg = pick(props, ["Image", "Visuel", "Images", "Galerie", "Image URL"]);
    let images = [];

    if (pImg?.type === "files" && Array.isArray(pImg.files) && pImg.files.length) {
      images = pImg.files.map(f => f.type === "external" ? cleanUrl(f.external.url) : cleanUrl(f.file.url)).filter(Boolean);
    } else if (pImg?.type === "url" && pImg.url) {
      images = [cleanUrl(pImg.url)];
    } else if (pImg?.type === "rich_text" && pImg.rich_text?.length) {
      // accepte 1) href 2) texte simple (séparé par virgules)
      const hrefs = pImg.rich_text.map(t => t.href || t.plain_text || "").filter(Boolean);
      images = hrefs.join(",").split(",").map(s => cleanUrl(s)).filter(Boolean);
    }

    // Proxy pour liens "capricieux" (ex: Canva / S3 signés externes)
    images = images.map(u => {
      try {
        const host = new URL(u).hostname.toLowerCase();
        const direct = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u);
        const permissive = /(images\.unsplash\.com|cdn|cloudfront|imgur|githubusercontent|googleusercontent)/.test(host);
        return (direct && permissive) ? u : `/api/img?url=${encodeURIComponent(u)}`;
      } catch { return `/api/img?url=${encodeURIComponent(u)}`; }
    });

    // Statut, Pinned, Date, Social
    const status = pick(props, ["Status", "Statut"])?.select?.name ?? null;
    const pinned = pick(props, ["Pinned", "Épingler", "Epingler"])?.checkbox ?? false;
    const date = pick(props, ["Date"])?.date?.start ?? null;
    const ms = props?.Social?.multi_select;
    const platforms = Array.isArray(ms) ? ms.map(s => s?.name).filter(Boolean) : [];

    if (images.length) items.push({ id: page.id, name, description, images, status, pinned, date, platforms });
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    if (a.date && b.date) return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    return 0;
  });

  return items;
}
