import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// util: 1re propriété existante parmi la liste
function pick(props, names) { for (const n of names) if (props && props[n]) return props[n]; return null; }

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

    // Description (optionnelle)
    const pDesc = pick(props, ["Description", "Caption", "Texte"]);
    let description = "";
    if (pDesc?.type === "rich_text") {
      description = (pDesc.rich_text || []).map(t => t.plain_text || "").join("");
    } else if (pDesc?.type && typeof pDesc[pDesc.type] === "string") {
      description = pDesc[pDesc.type] || "";
    }

    // Image
    let imageUrl = null;
    const pImg = pick(props, ["Image", "Visuel", "Image URL"]);
    if (pImg?.type === "files" && Array.isArray(pImg.files) && pImg.files.length) {
      const f = pImg.files[0];
      imageUrl = f.type === "external" ? f.external.url : f.file.url;
    } else if (pImg?.type === "url" && pImg.url) {
      imageUrl = pImg.url;
    } else if (pImg?.type === "rich_text" && pImg.rich_text?.[0]?.href) {
      imageUrl = pImg.rich_text[0].href;
    } else if (pImg?.type === "rich_text" && pImg.rich_text?.[0]?.plain_text) {
      imageUrl = pImg.rich_text[0].plain_text;
    }

    // Status / Pinned / Date
    const status = pick(props, ["Status", "Statut"])?.select?.name ?? null;
    const pinned = pick(props, ["Pinned", "Épingler", "Epingler"])?.checkbox ?? false;
    const date = pick(props, ["Date"])?.date?.start ?? null;

    // Social (optionnel, multi-select)
    const ms = props?.Social?.multi_select;
    const platforms = Array.isArray(ms) ? ms.map(s => s?.name).filter(Boolean) : [];

    if (imageUrl) items.push({ id: page.id, name, description, imageUrl, status, pinned, date, platforms });
  }

  // tri final
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    if (a.date && b.date) return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    return 0;
  });

  return items;
}
